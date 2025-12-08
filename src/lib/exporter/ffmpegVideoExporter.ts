import type { ExportConfig, ExportProgress, ExportResult } from './types';
import { VideoFileDecoder } from './videoDecoder';
import { FrameRenderer } from './frameRenderer';
import { AudioExtractor } from './audioExtractor';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ZoomRegion, CropRegion, TrimRegion } from '@/components/video-editor/types';

interface FFmpegVideoExporterConfig extends ExportConfig {
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

/**
 * FFmpeg.wasm-based video exporter (fallback when GPU not available)
 * Uses software encoding but may be faster than WebCodecs software encoding
 */
export class FFmpegVideoExporter {
  private config: FFmpegVideoExporterConfig;
  private decoder: VideoFileDecoder | null = null;
  private cameraDecoder: VideoFileDecoder | null = null;
  private renderer: FrameRenderer | null = null;
  private ffmpeg: FFmpeg | null = null;
  private audioExtractor: AudioExtractor | null = null;
  private cancelled = false;
  private loaded = false;
  private hasAudio = false;

  constructor(config: FFmpegVideoExporterConfig) {
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
    const sortedTrims = [...trimRegions].sort((a, b) => a.startMs - b.startMs);
    
    let sourceTimeMs = effectiveTimeMs;
    
    for (const trim of sortedTrims) {
      if (sourceTimeMs < trim.startMs) {
        break;
      }
      const trimDuration = trim.endMs - trim.startMs;
      sourceTimeMs += trimDuration;
    }
    
    return sourceTimeMs;
  }

  async initializeFFmpeg(): Promise<void> {
    if (this.loaded) return;

    try {
      this.ffmpeg = new FFmpeg();
      
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      console.log('[FFmpegVideoExporter] Loading FFmpeg core from CDN...');
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.loaded = true;
      console.log('[FFmpegVideoExporter] FFmpeg loaded successfully');
    } catch (error) {
      console.error('[FFmpegVideoExporter] Failed to load FFmpeg:', error);
      throw new Error(`Failed to initialize FFmpeg: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Converts canvas to PNG image data
   */
  private async canvasToImageData(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to blob'));
          return;
        }
        blob.arrayBuffer().then(buffer => {
          resolve(new Uint8Array(buffer));
        }).catch(reject);
      }, 'image/png');
    });
  }

  async export(): Promise<ExportResult> {
    try {
      this.cleanup();
      this.cancelled = false;

      // Initialize FFmpeg first
      await this.initializeFFmpeg();
      if (!this.ffmpeg) {
        throw new Error('FFmpeg not initialized');
      }

      // Initialize decoder and load main video
      this.decoder = new VideoFileDecoder();
      const videoInfo = await this.decoder.loadVideo(this.config.videoUrl);
      
      // Check if video has audio
      this.hasAudio = this.config.videoUrl.includes('.webm') || this.config.videoUrl.includes('.mp4');
      console.log('[FFmpegVideoExporter] Will attempt audio extraction:', this.hasAudio);

      // Initialize audio extractor if audio is expected
      if (this.hasAudio) {
        try {
          this.audioExtractor = new AudioExtractor();
          await this.audioExtractor.initialize();
        } catch (error) {
          console.error('[FFmpegVideoExporter] Failed to initialize audio extractor:', error);
          this.hasAudio = false;
        }
      }

      // Optionally initialize camera decoder if camera video provided
      let cameraVideoElement: HTMLVideoElement | null = null;
      if (this.config.cameraVideoUrl) {
        try {
          this.cameraDecoder = new VideoFileDecoder();
          const cameraInfo = await this.cameraDecoder.loadVideo(this.config.cameraVideoUrl);
          console.log('[FFmpegVideoExporter] Camera video loaded:', cameraInfo);
          cameraVideoElement = this.cameraDecoder.getVideoElement();
        } catch (err) {
          console.warn('[FFmpegVideoExporter] Failed to load camera video:', err);
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
        hideCamera: false,
      });
      await this.renderer.initialize();

      // Get the video element for frame extraction
      const videoElement = this.decoder.getVideoElement();
      if (!videoElement) {
        throw new Error('Video element not available');
      }

      // Calculate effective duration and frame count (excluding trim regions)
      const effectiveDuration = this.getEffectiveDuration(videoInfo.duration);
      const totalFrames = Math.ceil(effectiveDuration * this.config.frameRate);
      
      console.log('[FFmpegVideoExporter] Original duration:', videoInfo.duration, 's');
      console.log('[FFmpegVideoExporter] Effective duration:', effectiveDuration, 's');
      console.log('[FFmpegVideoExporter] Total frames to export:', totalFrames);

      // Extract audio in parallel if available
      let audioData: Uint8Array | null = null;
      if (this.hasAudio && this.audioExtractor) {
        try {
          console.log('[FFmpegVideoExporter] Extracting audio...');
          audioData = await this.audioExtractor.extractAudio(this.config.videoUrl);
          if (!audioData) {
            console.warn('[FFmpegVideoExporter] No audio extracted');
            this.hasAudio = false;
          } else {
            console.log('[FFmpegVideoExporter] Audio extracted, size:', audioData.length);
          }
        } catch (error) {
          console.error('[FFmpegVideoExporter] Audio extraction failed:', error);
          this.hasAudio = false;
        }
      }

      // Process frames and convert to image sequence
      // Use batch processing to reduce memory pressure
      const frameDuration = 1_000_000 / this.config.frameRate; // in microseconds
      let frameIndex = 0;
      const timeStep = 1 / this.config.frameRate;
      const frameFiles: string[] = [];
      const BATCH_SIZE = 50; // Process frames in batches to reduce memory pressure

      console.log('[FFmpegVideoExporter] Rendering frames in batches (batch size:', BATCH_SIZE, ')...');
      
      // Warn if video is very large (likely to cause memory issues)
      const estimatedMemoryMB = (totalFrames * this.config.width * this.config.height * 4) / (1024 * 1024);
      if (estimatedMemoryMB > 500) {
        console.warn(`[FFmpegVideoExporter] ⚠️ Large video detected (~${Math.round(estimatedMemoryMB)}MB estimated memory). This may cause crashes.`);
        console.warn('[FFmpegVideoExporter] 💡 Consider using a system with GPU acceleration for better performance.');
      } else {
        console.warn('[FFmpegVideoExporter] ⚠️ FFmpeg.wasm is memory-intensive. Large videos may cause crashes.');
      }

      while (frameIndex < totalFrames && !this.cancelled) {
        const i = frameIndex;
        const timestamp = i * frameDuration;
        
        // Map effective time to source time (accounting for trim regions)
        const effectiveTimeMs = (i * timeStep) * 1000;
        const sourceTimeMs = this.mapEffectiveToSourceTime(effectiveTimeMs);
        const videoTime = sourceTimeMs / 1000;
          
        // Seek if needed
        const needsSeek = Math.abs(videoElement.currentTime - videoTime) > 0.001;
        
        if (needsSeek) {
          const seekedPromise = new Promise<void>(resolve => {
            videoElement.addEventListener('seeked', () => resolve(), { once: true });
          });
          videoElement.currentTime = videoTime;
          await seekedPromise;
        } else if (i === 0) {
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

        // Create a VideoFrame from the video element
        const videoFrame = new VideoFrame(videoElement, {
          timestamp,
        });

        // Render the frame with all effects
        const sourceTimestamp = sourceTimeMs * 1000; // Convert to microseconds
        await this.renderer!.renderFrame(videoFrame, sourceTimestamp);
        
        videoFrame.close();

        const canvas = this.renderer!.getCanvas();

        // Draw camera overlay as a separate layer if enabled
        if (this.config.cameraVideoUrl && !this.config.hideCamera && cameraVideoElement) {
          // Use GPU-optimized context (willReadFrequently: false for better GPU performance)
          const ctx = canvas.getContext('2d', { willReadFrequently: false });
          if (ctx && cameraVideoElement.videoWidth && cameraVideoElement.videoHeight) {
            const cw = canvas.width;
            const ch = canvas.height;
            
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
                console.warn('[FFmpegVideoExporter] Failed to parse camera metadata for shape:', e);
              }
            }
            
            const cameraSize = this.config.cameraSize || 150;
            const baseSize = Math.min(cw * (cameraSize / 1920), cameraSize);
            const overlayWidth = baseSize;
            const overlayHeight = baseSize;
            
            const cameraPos = this.config.cameraPosition || { x: 92, y: 92 };
            const x = (cameraPos.x / 100) * cw - overlayWidth / 2;
            const y = (cameraPos.y / 100) * ch - overlayHeight / 2;
            
            const clampedX = Math.max(0, Math.min(cw - overlayWidth, x));
            const clampedY = Math.max(0, Math.min(ch - overlayHeight, y));
            
            let borderRadius = 48;
            if (shape === 'circle') {
              borderRadius = overlayWidth / 2;
            } else if (shape === 'squircle') {
              borderRadius = 48;
            } else if (shape === 'square') {
              borderRadius = 16;
            }
            
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
            
            const sourceAspect = cameraVideoElement.videoWidth / cameraVideoElement.videoHeight;
            let drawWidth = overlayWidth;
            let drawHeight = overlayHeight;
            let drawX = clampedX;
            let drawY = clampedY;
            
            if (sourceAspect > 1) {
              drawHeight = overlayHeight;
              drawWidth = overlayHeight * sourceAspect;
              drawX = clampedX - (drawWidth - overlayWidth) / 2;
            } else {
              drawWidth = overlayWidth;
              drawHeight = overlayWidth / sourceAspect;
              drawY = clampedY - (drawHeight - overlayHeight) / 2;
            }
            
            ctx.drawImage(cameraVideoElement, drawX, drawY, drawWidth, drawHeight);
            ctx.restore();
          }
        }

        // Convert canvas to PNG and write to FFmpeg filesystem
        const frameFileName = `frame_${String(i).padStart(6, '0')}.png`;
        const imageData = await this.canvasToImageData(canvas);
        await this.ffmpeg!.writeFile(frameFileName, imageData);
        frameFiles.push(frameFileName);

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
        
        // Periodic memory cleanup and yield to prevent UI freezing
        if (frameIndex % BATCH_SIZE === 0) {
          // Force garbage collection hint (if available)
          if (globalThis.gc) {
            globalThis.gc();
          }
          // Yield to event loop to prevent UI freezing
          await new Promise(resolve => setTimeout(resolve, 0));
          console.log(`[FFmpegVideoExporter] Processed ${frameIndex}/${totalFrames} frames...`);
        }
      }

      if (this.cancelled) {
        return { success: false, error: 'Export cancelled' };
      }

      console.log('[FFmpegVideoExporter] All frames rendered, encoding video with FFmpeg...');

      // Write audio to FFmpeg filesystem if available
      if (this.hasAudio && audioData) {
        await this.ffmpeg!.writeFile('audio.opus', audioData);
      }

      // Build FFmpeg command to encode video from image sequence
      // Use libx264 for H.264 encoding (software, but optimized)
      const ffmpegArgs = [
        '-framerate', String(this.config.frameRate),
        '-i', 'frame_%06d.png',
        '-c:v', 'libx264',
        '-preset', 'medium', // Balance between speed and quality
        '-crf', '23', // Quality setting (lower = better quality, 18-28 is good range)
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ];

      // Add audio if available
      if (this.hasAudio && audioData) {
        ffmpegArgs.push(
          '-i', 'audio.opus',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest' // Match video duration
        );
      } else {
        ffmpegArgs.push('-an'); // No audio
      }

      // Output file
      ffmpegArgs.push('output.mp4');

      // Execute FFmpeg encoding with error handling
      console.log('[FFmpegVideoExporter] Running FFmpeg encoding...');
      try {
        await this.ffmpeg!.exec(ffmpegArgs);
      } catch (error) {
        console.error('[FFmpegVideoExporter] FFmpeg encoding failed:', error);
        throw new Error(`FFmpeg encoding failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Read the output video
      let outputVideo: Uint8Array | ArrayBuffer;
      try {
        outputVideo = await this.ffmpeg!.readFile('output.mp4');
      } catch (error) {
        console.error('[FFmpegVideoExporter] Failed to read output video:', error);
        throw new Error(`Failed to read output video: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Clean up frame files
      for (const frameFile of frameFiles) {
        await this.ffmpeg!.deleteFile(frameFile).catch(() => {});
      }
      if (this.hasAudio) {
        await this.ffmpeg!.deleteFile('audio.opus').catch(() => {});
      }
      await this.ffmpeg!.deleteFile('output.mp4').catch(() => {});

      if (outputVideo instanceof Uint8Array) {
        const blob = new Blob([outputVideo], { type: 'video/mp4' });
        return { success: true, blob };
      } else {
        throw new Error('FFmpeg output is not a Uint8Array');
      }
    } catch (error) {
      console.error('[FFmpegVideoExporter] Export error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.cleanup();
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.cleanup();
  }

  private cleanup(): void {
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

    if (this.audioExtractor) {
      this.audioExtractor.cleanup();
      this.audioExtractor = null;
    }

    this.ffmpeg = null;
    this.loaded = false;
  }
}
