import type { ExportConfig, ExportProgress, ExportResult } from './types';
import { VideoFileDecoder } from './videoDecoder';
import { FrameRenderer } from './frameRenderer';
import { VideoMuxer } from './muxer';
import { AudioExtractor } from './audioExtractor';
import type { ZoomRegion, CropRegion, TrimRegion } from '@/components/video-editor/types';

interface VideoExporterConfig extends ExportConfig {
  videoUrl: string;
  cameraVideoUrl?: string;
  cameraSize?: number;
  cameraPosition?: { x: number; y: number };
  cameraShape?: 'circle' | 'squircle' | 'square';
  wallpaper: string;
  zoomRegions: ZoomRegion[];
  trimRegions?: TrimRegion[];
  showShadow: boolean;
  shadowIntensity: number;
  showBlur: boolean;
  motionBlurEnabled?: boolean;
  borderRadius?: number;
  padding?: number;
  videoPadding?: number;
  cropRegion: CropRegion;
  hideCamera?: boolean;
  onProgress?: (progress: ExportProgress) => void;
}

export class VideoExporter {
  private config: VideoExporterConfig;
  private decoder: VideoFileDecoder | null = null;
  private cameraDecoder: VideoFileDecoder | null = null;
  private renderer: FrameRenderer | null = null;
  private encoder: VideoEncoder | null = null;
  private audioDecoder: AudioDecoder | null = null;
  private audioEncoder: AudioEncoder | null = null;
  private audioExtractor: AudioExtractor | null = null;
  private muxer: VideoMuxer | null = null;
  private cancelled = false;
  private encodeQueue = 0;
  // Increased queue size for better throughput with hardware encoding
  private readonly MAX_ENCODE_QUEUE = 120;
  private videoDescription: Uint8Array | undefined;
  private videoColorSpace: VideoColorSpaceInit | undefined;
  // Track muxing promises for parallel processing
  private muxingPromises: Promise<void>[] = [];
  private chunkCount = 0;
  private hasAudio = false;
  private audioChunks: EncodedAudioChunk[] = [];
  private audioProcessingPromise: Promise<void> | null = null;

  constructor(config: VideoExporterConfig) {
    this.config = config;
  }

  // Calculate the total duration excluding trim regions (in seconds)
  private getEffectiveDuration(totalDuration: number): number {
    const trimRegions = this.config.trimRegions || [];
    const totalTrimDuration = trimRegions.reduce((sum, region) => {
      return sum + (region.endMs - region.startMs) / 1000;
    }, 0);
    return totalDuration - totalTrimDuration;
  }

  private mapEffectiveToSourceTime(effectiveTimeMs: number): number {
    const trimRegions = this.config.trimRegions || [];
    // Sort trim regions by start time
    const sortedTrims = [...trimRegions].sort((a, b) => a.startMs - b.startMs);
    
    let sourceTimeMs = effectiveTimeMs;
    
    for (const trim of sortedTrims) {
      // If the source time hasn't reached this trim region yet, we're done
      if (sourceTimeMs < trim.startMs) {
        break;
      }
      
      // Add the duration of this trim region to the source time
      const trimDuration = trim.endMs - trim.startMs;
      sourceTimeMs += trimDuration;
    }
    
    return sourceTimeMs;
  }

  async export(): Promise<ExportResult> {
    try {
      this.cleanup();
      this.cancelled = false;

      // Initialize decoder and load main video
      this.decoder = new VideoFileDecoder();
      const videoInfo = await this.decoder.loadVideo(this.config.videoUrl);
      
      // Check if video has audio - we'll extract it using FFmpeg
      // Assume audio exists if it's a webm/mp4 file (MediaRecorder typically includes audio)
      // FFmpeg will tell us if there's no audio during extraction
      this.hasAudio = this.config.videoUrl.includes('.webm') || this.config.videoUrl.includes('.mp4');
      console.log('[VideoExporter] Will attempt audio extraction:', this.hasAudio, 'for video:', this.config.videoUrl);
      
      // Initialize audio extractor if audio is expected
      if (this.hasAudio) {
        try {
          console.log('[VideoExporter] Initializing audio extractor...');
          this.audioExtractor = new AudioExtractor();
          await this.audioExtractor.initialize();
          console.log('[VideoExporter] Audio extractor initialized successfully');
        } catch (error) {
          console.error('[VideoExporter] Failed to initialize audio extractor:', error);
          console.error('[VideoExporter] Error details:', error instanceof Error ? error.stack : String(error));
          this.hasAudio = false;
        }
      }

      // Optionally initialize camera decoder if camera video provided
      let cameraVideoElement: HTMLVideoElement | null = null;
      if (this.config.cameraVideoUrl) {
        try {
          this.cameraDecoder = new VideoFileDecoder();
          const cameraInfo = await this.cameraDecoder.loadVideo(this.config.cameraVideoUrl);
          console.log('[VideoExporter] Camera video loaded:', cameraInfo);
          cameraVideoElement = this.cameraDecoder.getVideoElement();
        } catch (err) {
          console.warn('[VideoExporter] Failed to load camera video:', err);
          this.cameraDecoder = null;
        }
      }

      // Initialize frame renderer
      this.renderer = new FrameRenderer({
        width: this.config.width,
        height: this.config.height,
        wallpaper: this.config.wallpaper,
        zoomRegions: this.config.zoomRegions,
        showShadow: this.config.showShadow,
        shadowIntensity: this.config.shadowIntensity,
        showBlur: this.config.showBlur,
        motionBlurEnabled: this.config.motionBlurEnabled,
        borderRadius: this.config.borderRadius,
        padding: this.config.padding,
        cropRegion: this.config.cropRegion,
        videoWidth: videoInfo.width,
        videoHeight: videoInfo.height,
        hideCamera: false, // masking now handled as true separate camera overlay
      });
      await this.renderer.initialize();

      // Initialize video encoder
      await this.initializeEncoder();

      // Initialize muxer first (needed for audio encoder)
      console.log('[VideoExporter] Initializing muxer with hasAudio:', this.hasAudio);
      this.muxer = new VideoMuxer(this.config, this.hasAudio);
      await this.muxer.initialize();
      console.log('[VideoExporter] Muxer initialized');

      // Initialize audio decoder and encoder if video has audio (after muxer is ready)
      if (this.hasAudio) {
        console.log('[VideoExporter] Initializing audio processing...');
        await this.initializeAudioProcessing();
        console.log('[VideoExporter] Audio processing initialized, hasAudio:', this.hasAudio, 'encoder:', !!this.audioEncoder);
      }

      // Get the video element for frame extraction
      const videoElement = this.decoder.getVideoElement();
      if (!videoElement) {
        throw new Error('Video element not available');
      }

      // Calculate effective duration and frame count (excluding trim regions)
      const effectiveDuration = this.getEffectiveDuration(videoInfo.duration);
      const totalFrames = Math.ceil(effectiveDuration * this.config.frameRate);
      
      console.log('[VideoExporter] Original duration:', videoInfo.duration, 's');
      console.log('[VideoExporter] Effective duration:', effectiveDuration, 's');
      console.log('[VideoExporter] Total frames to export:', totalFrames);

      // Start audio processing in parallel with video encoding
      if (this.hasAudio) {
        this.audioProcessingPromise = this.processAudio(this.config.videoUrl, videoInfo.duration);
      }

      // Process frames continuously without batching delays
      const frameDuration = 1_000_000 / this.config.frameRate; // in microseconds
      let frameIndex = 0;
      const timeStep = 1 / this.config.frameRate;

      while (frameIndex < totalFrames && !this.cancelled) {
        const i = frameIndex;
        const timestamp = i * frameDuration;
        
        // Map effective time to source time (accounting for trim regions)
        const effectiveTimeMs = (i * timeStep) * 1000;
        const sourceTimeMs = this.mapEffectiveToSourceTime(effectiveTimeMs);
        const videoTime = sourceTimeMs / 1000;
          
        // Seek if needed or wait for first frame to be ready
        const needsSeek = Math.abs(videoElement.currentTime - videoTime) > 0.001;
        
        if (needsSeek) {
          // Attach listener BEFORE setting currentTime to avoid race condition
          const seekedPromise = new Promise<void>(resolve => {
            videoElement.addEventListener('seeked', () => resolve(), { once: true });
          });
          
          videoElement.currentTime = videoTime;
          await seekedPromise;
        } else if (i === 0) {
          // Only for the very first frame, wait for it to be ready
          await new Promise<void>(resolve => {
            videoElement.requestVideoFrameCallback(() => resolve());
          });
        }

        // Keep camera video in sync if available
        if (cameraVideoElement) {
          const needsCameraSeek = Math.abs(cameraVideoElement.currentTime - videoTime) > 0.001;
          if (needsCameraSeek) {
            const cameraSeeked = new Promise<void>(resolve => {
              cameraVideoElement!.addEventListener('seeked', () => resolve(), { once: true });
            });
            cameraVideoElement.currentTime = videoTime;
            await cameraSeeked;
          }
        }

        // Create a VideoFrame from the video element (on GPU!)
        const videoFrame = new VideoFrame(videoElement, {
          timestamp,
        });

        // Render the frame with all effects using source timestamp
        const sourceTimestamp = sourceTimeMs * 1000; // Convert to microseconds
        await this.renderer!.renderFrame(videoFrame, sourceTimestamp);
        
        videoFrame.close();

        const canvas = this.renderer!.getCanvas();

        // Draw camera overlay as a separate layer if enabled
        if (this.config.cameraVideoUrl && !this.config.hideCamera && cameraVideoElement) {
          const ctx = canvas.getContext('2d');
          if (ctx && cameraVideoElement.videoWidth && cameraVideoElement.videoHeight) {
            const cw = canvas.width;
            const ch = canvas.height;
            
            // Get camera shape from config (preferred) or fallback to localStorage
            let shape: 'circle' | 'squircle' | 'square' = this.config.cameraShape || 'squircle';
            if (!shape) {
              try {
                const metadataStr = localStorage.getItem('cameraMetadata');
                if (metadataStr) {
                  const metadata = JSON.parse(metadataStr);
                  if (metadata.shape && ['circle', 'squircle', 'square'].includes(metadata.shape)) {
                    shape = metadata.shape;
                  }
                }
              } catch (e) {
                console.warn('[VideoExporter] Failed to parse camera metadata for shape:', e);
              }
            }
            
            // All shapes should be square to maintain consistent appearance
            // Use cameraSize from config (default 150px) to match editor
            const cameraSize = this.config.cameraSize || 150;
            const baseSize = Math.min(cw * (cameraSize / 1920), cameraSize); // Scale based on canvas width, but cap at cameraSize
            const overlayWidth = baseSize;
            const overlayHeight = baseSize; // Always square for all shapes
            
            // Get camera position from config (default bottom-right: 92%, 92% to keep camera fully visible)
            const cameraPos = this.config.cameraPosition || { x: 92, y: 92 };
            // Convert percentage to pixel position (x: 0-100%, y: 0-100%)
            // Position is centered on the point, so adjust by half the overlay size
            const x = (cameraPos.x / 100) * cw - overlayWidth / 2;
            const y = (cameraPos.y / 100) * ch - overlayHeight / 2;
            
            // Clamp to keep overlay within canvas bounds
            const clampedX = Math.max(0, Math.min(cw - overlayWidth, x));
            const clampedY = Math.max(0, Math.min(ch - overlayHeight, y));
            
            // Calculate border radius based on shape
            let borderRadius = 48; // Default to squircle (3rem = 48px)
            if (shape === 'circle') {
              borderRadius = overlayWidth / 2; // Perfect circle
            } else if (shape === 'squircle') {
              borderRadius = 48; // 3rem - rounded rectangle
            } else if (shape === 'square') {
              borderRadius = 16; // 1rem - slightly rounded square
            }
            
            // Draw camera with rounded corners using clipping path
            ctx.save();
            ctx.beginPath();
            if (borderRadius > 0) {
              const r = Math.min(borderRadius, overlayWidth / 2, overlayHeight / 2);
              ctx.moveTo(clampedX + r, clampedY);
              ctx.lineTo(clampedX + overlayWidth - r, clampedY);
              ctx.quadraticCurveTo(clampedX + overlayWidth, clampedY, clampedX + overlayWidth, clampedY + r);
              ctx.lineTo(clampedX + overlayWidth, clampedY + overlayHeight - r);
              ctx.quadraticCurveTo(clampedX + overlayWidth, clampedY + overlayHeight, clampedX + overlayWidth - r, clampedY + overlayHeight);
              ctx.lineTo(clampedX + r, clampedY + overlayHeight);
              ctx.quadraticCurveTo(clampedX, clampedY + overlayHeight, clampedX, clampedY + overlayHeight - r);
              ctx.lineTo(clampedX, clampedY + r);
              ctx.quadraticCurveTo(clampedX, clampedY, clampedX + r, clampedY);
              ctx.closePath();
              ctx.clip();
            }
            
            // Draw video centered and cropped to square for all shapes
            const sourceAspect = cameraVideoElement.videoWidth / cameraVideoElement.videoHeight;
            let drawWidth = overlayWidth;
            let drawHeight = overlayHeight;
            let drawX = clampedX;
            let drawY = clampedY;
            
            if (sourceAspect > 1) {
              // Video is wider - fit to height and crop width
              drawHeight = overlayHeight;
              drawWidth = overlayHeight * sourceAspect;
              drawX = clampedX - (drawWidth - overlayWidth) / 2;
            } else {
              // Video is taller - fit to width and crop height
              drawWidth = overlayWidth;
              drawHeight = overlayWidth / sourceAspect;
              drawY = clampedY - (drawHeight - overlayHeight) / 2;
            }
            
            ctx.drawImage(cameraVideoElement, drawX, drawY, drawWidth, drawHeight);
            ctx.restore();
          }
        }

        // Create VideoFrame from canvas on GPU without reading pixels
        // @ts-ignore - colorSpace not in TypeScript definitions but works at runtime
        const exportFrame = new VideoFrame(canvas, {
          timestamp,
          duration: frameDuration,
          colorSpace: {
            primaries: 'bt709',
            transfer: 'iec61966-2-1',
            matrix: 'rgb',
            fullRange: true,
          },
        });

        // Check encoder queue before encoding to keep it full
        while (this.encodeQueue >= this.MAX_ENCODE_QUEUE && !this.cancelled) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        if (this.encoder && this.encoder.state === 'configured') {
          this.encodeQueue++;
          this.encoder.encode(exportFrame, { keyFrame: i % 150 === 0 });
        } else {
          console.warn(`[Frame ${i}] Encoder not ready! State: ${this.encoder?.state}`);
        }
        exportFrame.close();

        frameIndex++;
        
        // Update progress
        if (this.config.onProgress) {
          this.config.onProgress({
            currentFrame: frameIndex,
            totalFrames,
            percentage: (frameIndex / totalFrames) * 100,
            estimatedTimeRemaining: 0,
          });
        }
      }

      if (this.cancelled) {
        return { success: false, error: 'Export cancelled' };
      }

      // Finalize encoding
      if (this.encoder && this.encoder.state === 'configured') {
        await this.encoder.flush();
      }

      // Process audio if available (runs in parallel with video encoding)
      if (this.hasAudio && this.audioProcessingPromise) {
        console.log('[VideoExporter] Waiting for audio processing to complete...');
        try {
          await this.audioProcessingPromise;
          console.log('[VideoExporter] Audio processing completed successfully');
        } catch (error) {
          console.error('[VideoExporter] Audio processing failed:', error);
          this.hasAudio = false;
        }
      } else {
        console.log('[VideoExporter] No audio processing promise - audio will not be included');
      }

      // Wait for all muxing operations to complete
      await Promise.all(this.muxingPromises);

      // Finalize muxer and get output blob
      const blob = await this.muxer!.finalize();

      return { success: true, blob };
    } catch (error) {
      console.error('Export error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.cleanup();
    }
  }

  private async initializeEncoder(): Promise<void> {
    this.encodeQueue = 0;
    this.muxingPromises = [];
    this.chunkCount = 0;
    let videoDescription: Uint8Array | undefined;

    this.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        // Capture decoder config metadata from encoder output
        if (meta?.decoderConfig?.description && !videoDescription) {
          const desc = meta.decoderConfig.description;
          videoDescription = new Uint8Array(desc instanceof ArrayBuffer ? desc : (desc as any));
          this.videoDescription = videoDescription;
        }
        // Capture colorSpace from encoder metadata if provided
        if (meta?.decoderConfig?.colorSpace && !this.videoColorSpace) {
          this.videoColorSpace = meta.decoderConfig.colorSpace;
        }
        
        // Stream chunk to muxer immediately (parallel processing)
        const isFirstChunk = this.chunkCount === 0;
        this.chunkCount++;
        
        const muxingPromise = (async () => {
          try {
            if (isFirstChunk && this.videoDescription) {
              // Add decoder config for the first chunk
              const colorSpace = this.videoColorSpace || {
                primaries: 'bt709',
                transfer: 'iec61966-2-1',
                matrix: 'rgb',
                fullRange: true,
              };
              
              const metadata: EncodedVideoChunkMetadata = {
                decoderConfig: {
                  codec: this.config.codec || 'avc1.640033',
                  codedWidth: this.config.width,
                  codedHeight: this.config.height,
                  description: this.videoDescription,
                  colorSpace,
                },
              };
              
              await this.muxer!.addVideoChunk(chunk, metadata);
            } else {
              await this.muxer!.addVideoChunk(chunk, meta);
            }
          } catch (error) {
            console.error('Muxing error:', error);
          }
        })();
        
        this.muxingPromises.push(muxingPromise);
        this.encodeQueue--;
      },
      error: (error) => {
        console.error('[VideoExporter] Encoder error:', error);
        // Stop export encoding failed
        this.cancelled = true;
      },
    });

    const codec = this.config.codec || 'avc1.640033';
    
    const encoderConfig: VideoEncoderConfig = {
      codec,
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.frameRate,
      latencyMode: 'realtime',
      bitrateMode: 'variable',
      hardwareAcceleration: 'prefer-hardware',
    };

    // Check hardware support first
    const hardwareSupport = await VideoEncoder.isConfigSupported(encoderConfig);
    
    if (hardwareSupport.supported) {
      // Use hardware encoding
      console.log('[VideoExporter] Using hardware acceleration');
      this.encoder.configure(encoderConfig);
    } else {
      // Fall back to software encoding
      console.log('[VideoExporter] Hardware not supported, using software encoding');
      encoderConfig.hardwareAcceleration = 'prefer-software';
      
      const softwareSupport = await VideoEncoder.isConfigSupported(encoderConfig);
      if (!softwareSupport.supported) {
        throw new Error('Video encoding not supported on this system');
      }
      
      this.encoder.configure(encoderConfig);
    }
  }

  private async initializeAudioProcessing(): Promise<void> {
    if (!this.hasAudio || !this.audioExtractor) {
      console.warn('[VideoExporter] Cannot initialize audio processing - missing requirements', {
        hasAudio: this.hasAudio,
        hasExtractor: !!this.audioExtractor
      });
      return;
    }

    if (!this.muxer) {
      console.error('[VideoExporter] Muxer not initialized yet - this should not happen');
      return;
    }

    try {
      // Initialize audio encoder for Opus codec
      let audioChunkCount = 0;
      let audioDescription: Uint8Array | undefined;
      
      this.audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          audioChunkCount++;
          
          // Capture decoder config metadata from encoder output (needed for muxer)
          if (meta?.decoderConfig?.description && !audioDescription) {
            const desc = meta.decoderConfig.description;
            audioDescription = new Uint8Array(desc instanceof ArrayBuffer ? desc : (desc as any));
            console.log('[VideoExporter] Captured audio decoder config, size:', audioDescription.length);
          }
          
          // Add encoded audio chunk to muxer with metadata
          // mediabunny requires metadata, especially for the first chunk
          if (this.muxer) {
            const isFirstChunk = audioChunkCount === 1;
            
            // Create metadata - mediabunny needs decoderConfig for audio
            const audioMeta: EncodedAudioChunkMetadata = {
              decoderConfig: {
                codec: 'opus',
                sampleRate: 48000,
                numberOfChannels: 2,
                // Include description if available from encoder, otherwise mediabunny will generate it
                ...(audioDescription ? { description: audioDescription } : {}),
              },
            };
            
            this.muxer.addAudioChunk(chunk, audioMeta).catch(err => {
              console.error('[VideoExporter] Error adding audio chunk to muxer:', err);
            });
            
            if (audioChunkCount % 10 === 0 || audioChunkCount === 1) {
              console.log('[VideoExporter] Added audio chunk', audioChunkCount, 'timestamp:', chunk.timestamp, 'duration:', chunk.duration, 'hasMeta:', !!audioMeta);
            }
          } else {
            console.warn('[VideoExporter] Cannot add audio chunk - muxer not available');
          }
        },
        error: (error) => {
          console.error('[VideoExporter] Audio encoder error:', error);
        },
      });

      const audioConfig: AudioEncoderConfig = {
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 128000,
      };

      const support = await AudioEncoder.isConfigSupported(audioConfig);
      if (support.supported) {
        this.audioEncoder.configure(audioConfig);
        console.log('[VideoExporter] Audio encoder initialized');
      } else {
        console.warn('[VideoExporter] Opus audio encoder not supported');
        this.hasAudio = false;
      }
    } catch (error) {
      console.error('[VideoExporter] Error initializing audio processing:', error);
      this.hasAudio = false;
    }
  }

  /**
   * Extracts and processes audio from the source video
   * This runs in parallel with video encoding
   */
  private async processAudio(videoUrl: string, duration: number): Promise<void> {
    if (!this.hasAudio || !this.audioExtractor || !this.audioEncoder || !this.muxer) {
      console.log('[VideoExporter] Skipping audio processing - conditions not met', {
        hasAudio: this.hasAudio,
        hasExtractor: !!this.audioExtractor,
        hasEncoder: !!this.audioEncoder,
        hasMuxer: !!this.muxer
      });
      return;
    }

    try {
      console.log('[VideoExporter] Starting audio extraction from video:', videoUrl);
      
      // Extract audio as PCM using FFmpeg
      const channelData = await this.audioExtractor.extractAudioAsPCM(videoUrl);
      
      if (!channelData || channelData.length === 0) {
        console.warn('[VideoExporter] No audio data extracted - video will be silent');
        this.hasAudio = false;
        return;
      }

      const sampleRate = 48000;
      const numberOfChannels = channelData.length;
      const samplesPerChannel = channelData[0].length;
      
      console.log('[VideoExporter] Audio extracted:', {
        channels: numberOfChannels,
        samples: samplesPerChannel,
        duration: samplesPerChannel / sampleRate
      });

      // Process audio in chunks to create AudioData and encode
      const chunkSize = 4800; // ~100ms at 48kHz (4800 samples)
      let processedSamples = 0;
      
      while (processedSamples < samplesPerChannel && !this.cancelled) {
        const chunkSamples = Math.min(chunkSize, samplesPerChannel - processedSamples);
        const timestamp = (processedSamples / sampleRate) * 1_000_000; // microseconds
        
        // Extract chunk from each channel and interleave for f32 format
        // f32 format requires interleaved data: [L0, R0, L1, R1, L2, R2, ...]
        const interleavedData = new Float32Array(chunkSamples * numberOfChannels);
        for (let i = 0; i < chunkSamples; i++) {
          for (let ch = 0; ch < numberOfChannels; ch++) {
            interleavedData[i * numberOfChannels + ch] = channelData[ch][processedSamples + i];
          }
        }

        // Verify the data format before creating AudioData
        if (processedSamples === 0) {
          console.log('[VideoExporter] First audio chunk - verifying data format:', {
            interleavedDataType: interleavedData.constructor?.name,
            isFloat32Array: interleavedData instanceof Float32Array,
            length: interleavedData.length,
            buffer: interleavedData.buffer instanceof ArrayBuffer,
            expectedLength: chunkSamples * numberOfChannels
          });
        }

        // Create AudioData using f32 format (interleaved) instead of f32-planar
        // f32 format uses a single Float32Array with interleaved channels
        let audioData: AudioData;
        try {
          audioData = new AudioData({
            format: 'f32', // Use interleaved format instead of planar
            sampleRate,
            numberOfFrames: chunkSamples,
            numberOfChannels,
            timestamp,
            data: interleavedData, // Single interleaved Float32Array
          });
        } catch (error) {
          console.error('[VideoExporter] AudioData construction failed:', error);
          console.error('[VideoExporter] Data details:', {
            format: 'f32',
            sampleRate,
            numberOfFrames: chunkSamples,
            numberOfChannels,
            timestamp,
            dataType: interleavedData.constructor?.name,
            dataLength: interleavedData.length,
            isFloat32Array: interleavedData instanceof Float32Array,
            buffer: interleavedData.buffer instanceof ArrayBuffer
          });
          throw error;
        }

        // Encode audio chunk
        if (this.audioEncoder && this.audioEncoder.state === 'configured') {
          this.audioEncoder.encode(audioData);
        }
        
        audioData.close();
        processedSamples += chunkSamples;
      }

      // Flush audio encoder
      if (this.audioEncoder && this.audioEncoder.state === 'configured') {
        console.log('[VideoExporter] Flushing audio encoder...');
        await this.audioEncoder.flush();
        console.log('[VideoExporter] Audio encoder flushed');
      } else {
        console.warn('[VideoExporter] Cannot flush audio encoder - state:', this.audioEncoder?.state);
      }

      console.log('[VideoExporter] Audio processing complete - processed', processedSamples, 'samples');
    } catch (error) {
      console.error('[VideoExporter] Error processing audio:', error);
      console.warn('[VideoExporter] Continuing export without audio');
      // Disable audio to prevent muxer errors
      this.hasAudio = false;
      // Don't fail the export if audio extraction fails - video will be silent
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.cleanup();
  }

  private cleanup(): void {
    if (this.encoder) {
      try {
        if (this.encoder.state === 'configured') {
          this.encoder.close();
        }
      } catch (e) {
        console.warn('Error closing encoder:', e);
      }
      this.encoder = null;
    }

    if (this.audioEncoder) {
      try {
        if (this.audioEncoder.state === 'configured') {
          this.audioEncoder.close();
        }
      } catch (e) {
        console.warn('Error closing audio encoder:', e);
      }
      this.audioEncoder = null;
    }

    if (this.audioDecoder) {
      try {
        if (this.audioDecoder.state === 'configured') {
          this.audioDecoder.close();
        }
      } catch (e) {
        console.warn('Error closing audio decoder:', e);
      }
      this.audioDecoder = null;
    }

    if (this.audioExtractor) {
      this.audioExtractor.cleanup();
      this.audioExtractor = null;
    }

    if (this.decoder) {
      try {
        this.decoder.destroy();
      } catch (e) {
        console.warn('Error destroying decoder:', e);
      }
      this.decoder = null;
    }

    if (this.cameraDecoder) {
      try {
        this.cameraDecoder.destroy();
      } catch (e) {
        console.warn('Error destroying camera decoder:', e);
      }
      this.cameraDecoder = null;
    }

    if (this.renderer) {
      try {
        this.renderer.destroy();
      } catch (e) {
        console.warn('Error destroying renderer:', e);
      }
      this.renderer = null;
    }

    this.muxer = null;
    this.encodeQueue = 0;
    this.muxingPromises = [];
    this.chunkCount = 0;
    this.videoDescription = undefined;
    this.videoColorSpace = undefined;
  }
}
