import type { ExportConfig, ExportProgress, ExportResult } from './types';
import { VideoFileDecoder } from './videoDecoder';
import { FrameRenderer } from './frameRenderer';
import { VideoMuxer } from './muxer';
import type { ZoomRegion, CropRegion, TrimRegion } from '@/components/video-editor/types';

interface VideoExporterConfig extends ExportConfig {
  videoUrl: string;
  cameraVideoUrl?: string;
  cameraSize?: number;
  cameraPosition?: { x: number; y: number };
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

      // Initialize muxer
      this.muxer = new VideoMuxer(this.config, false);
      await this.muxer.initialize();

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
            
            // Get camera shape from sessionStorage
            let shape: 'circle' | 'squircle' | 'square' = 'squircle';
            try {
              const metadataStr = sessionStorage.getItem('cameraMetadata');
              if (metadataStr) {
                const metadata = JSON.parse(metadataStr);
                if (metadata.shape && ['circle', 'squircle', 'square'].includes(metadata.shape)) {
                  shape = metadata.shape;
                }
              }
            } catch (e) {
              console.warn('[VideoExporter] Failed to parse camera metadata for shape:', e);
            }
            
            // For circle, make it square; for others, maintain aspect ratio
            // Use cameraSize from config (default 150px) to match editor
            const cameraSize = this.config.cameraSize || 150;
            const baseSize = Math.min(cw * (cameraSize / 1920), cameraSize); // Scale based on canvas width, but cap at cameraSize
            const isCircle = shape === 'circle';
            const overlayWidth = baseSize;
            const overlayHeight = isCircle ? baseSize : (cameraVideoElement.videoHeight / cameraVideoElement.videoWidth) * baseSize;
            
            // Get camera position from config (default bottom-right: 92%, 92% to keep camera fully visible)
            const cameraPos = this.config.cameraPosition || { x: 92, y: 92 };
            // Convert percentage to pixel position (x: 0-100%, y: 0-100%)
            // Position is centered on the point, so adjust by half the overlay size
            const x = (cameraPos.x / 100) * cw - overlayWidth / 2;
            const y = (cameraPos.y / 100) * ch - overlayHeight / 2;
            
            // Clamp to keep overlay within canvas bounds
            const clampedX = Math.max(0, Math.min(cw - overlayWidth, x));
            const clampedY = Math.max(0, Math.min(ch - overlayHeight, y));
            
            // Calculate border radius
            let borderRadius = 48; // Default to squircle (3rem = 48px)
            if (shape === 'circle') {
              borderRadius = Math.min(overlayWidth, overlayHeight) / 2;
            } else if (shape === 'squircle') {
              borderRadius = 48; // 3rem
            } else if (shape === 'square') {
              borderRadius = 16; // 1rem
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
            // For circle, draw centered and cropped; for others, fill the rect
            if (isCircle) {
              // Draw video centered and cropped to square
              const sourceAspect = cameraVideoElement.videoWidth / cameraVideoElement.videoHeight;
              let drawWidth = overlayWidth;
              let drawHeight = overlayHeight;
              let drawX = x;
              let drawY = y;
              
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
            } else {
              ctx.drawImage(cameraVideoElement, clampedX, clampedY, overlayWidth, overlayHeight);
            }
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
