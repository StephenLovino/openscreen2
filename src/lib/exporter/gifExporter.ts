import type { ExportProgress, ExportResult } from './types';
import { VideoFileDecoder } from './videoDecoder';
import { FrameRenderer } from './frameRenderer';
import type { ZoomRegion, CropRegion, TrimRegion } from '@/components/video-editor/types';

interface GifExporterConfig {
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

        // Render frame
        const frame = await this.renderer.renderFrame(
          videoElement,
          sourceTimeSeconds * 1000,
          cameraVideoElement,
          this.config.cameraSize,
          this.config.cameraPosition,
          this.config.hideCamera
        );

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

      // Convert frames to GIF using a library or canvas-based approach
      // For now, we'll use a simple approach with canvas and a GIF encoder
      const gifBlob = await this.encodeGif(frames, frameInterval * 1000);

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
    
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: this.config.width,
      height: this.config.height,
      workerScript,
    });

    // Add frames to GIF
    for (const frame of frames) {
      const canvas = document.createElement('canvas');
      canvas.width = this.config.width;
      canvas.height = this.config.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      ctx.putImageData(frame, 0, 0);
      gif.addFrame(canvas, { delay });
    }

    return new Promise((resolve, reject) => {
      gif.on('finished', (blob: Blob) => {
        resolve(blob);
      });
      
      gif.on('error', (error: Error) => {
        reject(error);
      });
      
      gif.render();
    });
  }

  cancel(): void {
    this.cancelled = true;
  }

  private cleanup(): void {
    if (this.decoder) {
      this.decoder.cleanup();
      this.decoder = null;
    }
    if (this.cameraDecoder) {
      this.cameraDecoder.cleanup();
      this.cameraDecoder = null;
    }
    if (this.renderer) {
      this.renderer.cleanup();
      this.renderer = null;
    }
  }
}

