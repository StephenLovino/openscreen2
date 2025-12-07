import type { ExportProgress, ExportResult } from './types';
import { VideoFileDecoder } from './videoDecoder';
import { FrameRenderer } from './frameRenderer';
import type { ZoomRegion, CropRegion, TrimRegion } from '@/components/video-editor/types';

interface GifExporterConfig {
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
  width: number;
  height: number;
  frameRate: number;
  cropRegion: CropRegion;
  hideCamera?: boolean;
  onProgress?: (progress: ExportProgress) => void;
}

export class GifExporter {
  private config: GifExporterConfig;
  private decoder: VideoFileDecoder | null = null;
  private cameraDecoder: VideoFileDecoder | null = null;
  private renderer: FrameRenderer | null = null;
  private cancelled = false;

  constructor(config: GifExporterConfig) {
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
          await this.cameraDecoder.loadVideo(this.config.cameraVideoUrl);
          cameraVideoElement = this.cameraDecoder.getVideoElement();
        } catch (err) {
          console.warn('[GifExporter] Failed to load camera video:', err);
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

      const videoElement = this.decoder.getVideoElement();
      if (!videoElement) {
        throw new Error('Video element not available');
      }

      const totalDuration = videoInfo.duration;
      const effectiveDuration = this.getEffectiveDuration(totalDuration);
      const frameInterval = 1 / this.config.frameRate; // seconds per frame
      const totalFrames = Math.ceil(effectiveDuration * this.config.frameRate);

      // Collect frames
      const frames: ImageData[] = [];
      let currentEffectiveTime = 0;
      let frameIndex = 0;

      while (currentEffectiveTime < effectiveDuration && !this.cancelled) {
        const sourceTimeMs = this.mapEffectiveToSourceTime(currentEffectiveTime * 1000);
        const sourceTimeSeconds = sourceTimeMs / 1000;

        // Seek video to the correct time
        videoElement.currentTime = sourceTimeSeconds;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            videoElement.removeEventListener('seeked', onSeeked);
            resolve();
          };
          videoElement.addEventListener('seeked', onSeeked);
        });

        // Create VideoFrame from video element
        const videoFrame = new VideoFrame(videoElement, {
          timestamp: sourceTimeSeconds * 1_000_000, // microseconds
        });

        // Render frame using FrameRenderer
        await this.renderer.renderFrame(videoFrame, sourceTimeSeconds * 1_000_000);
        
        // Get the canvas and draw camera overlay if needed
        const canvas = this.renderer.getCanvas();
        const ctx = canvas.getContext('2d');
        
        if (ctx && cameraVideoElement && !this.config.hideCamera && 
            cameraVideoElement.videoWidth && cameraVideoElement.videoHeight) {
          const cw = canvas.width;
          const ch = canvas.height;
          
          // Get camera shape from config
          const shape = this.config.cameraShape || 'squircle';
          const cameraSize = this.config.cameraSize || 150;
          const baseSize = Math.min(cw * (cameraSize / 1920), cameraSize);
          // All shapes should be square to maintain consistent appearance
          const overlayWidth = baseSize;
          const overlayHeight = baseSize; // Always square for all shapes
          
          // Get camera position
          const cameraPos = this.config.cameraPosition || { x: 92, y: 92 };
          const x = (cameraPos.x / 100) * cw - overlayWidth / 2;
          const y = (cameraPos.y / 100) * ch - overlayHeight / 2;
          
          // Clamp to canvas bounds
          const clampedX = Math.max(0, Math.min(cw - overlayWidth, x));
          const clampedY = Math.max(0, Math.min(ch - overlayHeight, y));
          
          // Calculate border radius based on shape
          let borderRadius = 48; // Default squircle (3rem = 48px)
          if (shape === 'circle') {
            borderRadius = overlayWidth / 2; // Perfect circle
          } else if (shape === 'squircle') {
            borderRadius = 48; // 3rem - rounded rectangle
          } else if (shape === 'square') {
            borderRadius = 16; // 1rem - slightly rounded square
          }
          
          // Draw camera overlay with rounded corners using clipping path
          ctx.save();
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(clampedX, clampedY, overlayWidth, overlayHeight, borderRadius);
          } else {
            // Fallback for browsers without roundRect
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
          }
          ctx.clip();
          
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
        
        // Get ImageData from canvas for GIF
        // Use willReadFrequently for better performance when reading multiple times
        const frame = ctx!.getImageData(0, 0, canvas.width, canvas.height);
        videoFrame.close();
        
        frames.push(frame);
        frameIndex++;

        // Update progress
        if (this.config.onProgress) {
          this.config.onProgress({
            currentFrame: frameIndex,
            totalFrames,
            percentage: (frameIndex / totalFrames) * 100,
            estimatedTimeRemaining: 0, // GIF export is typically fast
          });
        }

        currentEffectiveTime += frameInterval;
      }

      if (this.cancelled) {
        return { success: false, error: 'Export cancelled' };
      }

      // Update progress to indicate encoding is starting
      if (this.config.onProgress) {
        this.config.onProgress({
          currentFrame: totalFrames,
          totalFrames,
          percentage: 95, // Set to 95% to indicate encoding phase
          estimatedTimeRemaining: 0,
        });
      }

      // Convert frames to GIF using a library or canvas-based approach
      // For now, we'll use a simple approach with canvas and a GIF encoder
      console.log('[GifExporter] Starting GIF encoding with', frames.length, 'frames');
      const gifBlob = await this.encodeGif(frames, frameInterval * 1000);
      console.log('[GifExporter] GIF encoding complete, blob size:', gifBlob.size);

      // Update progress to 100%
      if (this.config.onProgress) {
        this.config.onProgress({
          currentFrame: totalFrames,
          totalFrames,
          percentage: 100,
          estimatedTimeRemaining: 0,
        });
      }

      return {
        success: true,
        blob: gifBlob,
      };
    } catch (error) {
      console.error('[GifExporter] Export error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      this.cleanup();
    }
  }

  private async encodeGif(frames: ImageData[], delay: number): Promise<Blob> {
    // Dynamic import of gif.js
    const GIF = (await import('gif.js')).default;
    
    // Get worker script URL - try different paths for Vite
    let workerScript: string;
    try {
      workerScript = new URL('gif.js/dist/gif.worker.js', import.meta.url).href;
    } catch {
      // Fallback for different module resolution
      workerScript = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js';
    }
    
    const onProgress = this.config.onProgress;
    const totalFrames = frames.length;
    
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: this.config.width,
      height: this.config.height,
      workerScript,
    });

    // Add frames to GIF
    console.log('[GifExporter] Adding', frames.length, 'frames to GIF encoder');
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const canvas = document.createElement('canvas');
      canvas.width = this.config.width;
      canvas.height = this.config.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      ctx.putImageData(frame, 0, 0);
      gif.addFrame(canvas, { delay });
      
      if ((i + 1) % 50 === 0) {
        console.log('[GifExporter] Added', i + 1, 'frames to GIF encoder');
      }
    }
    console.log('[GifExporter] All frames added, starting render...');

    return new Promise((resolve, reject) => {
      console.log('[GifExporter] Starting GIF encoding with', frames.length, 'frames');
      
      // Set a timeout to prevent hanging (5 minutes should be enough for most GIFs)
      const timeout = setTimeout(() => {
        console.error('[GifExporter] GIF encoding timeout after 5 minutes');
        reject(new Error('GIF encoding timed out'));
      }, 5 * 60 * 1000);
      
      gif.on('finished', (blob: Blob) => {
        clearTimeout(timeout);
        console.log('[GifExporter] GIF encoding finished, blob size:', blob.size, 'bytes');
        resolve(blob);
      });
      
      gif.on('progress', (p: number) => {
        console.log('[GifExporter] GIF encoding progress:', (p * 100).toFixed(1) + '%');
        // Update progress during encoding
        if (onProgress) {
          onProgress({
            currentFrame: Math.floor(totalFrames * p),
            totalFrames,
            percentage: 95 + (p * 5), // 95-100% during encoding
            estimatedTimeRemaining: 0,
          });
        }
      });
      
      gif.on('error', (error: Error) => {
        clearTimeout(timeout);
        console.error('[GifExporter] GIF encoding error:', error);
        reject(error);
      });
      
      console.log('[GifExporter] Starting GIF render...');
      gif.render();
    });
  }

  cancel(): void {
    this.cancelled = true;
  }

  private cleanup(): void {
    if (this.decoder) {
      this.decoder.destroy();
      this.decoder = null;
    }
    if (this.cameraDecoder) {
      this.cameraDecoder.destroy();
      this.cameraDecoder = null;
    }
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
  }
}

