import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { getAssetPath } from "@/lib/assetPath";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import Colorful from '@uiw/react-color-colorful';
import { hsvaToHex } from '@uiw/color-convert';
import { Trash2, Download, Crop, X, Upload, Circle, Square, RectangleHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { ZoomDepth, CropRegion } from "./types";
import { CropControl } from "./CropControl";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { apiBridge } from "@/lib/apiBridge";

const WALLPAPER_COUNT = 18;
const WALLPAPER_RELATIVE = Array.from({ length: WALLPAPER_COUNT }, (_, i) => `wallpapers/wallpaper${i + 1}.jpg`);
const GRADIENTS = [
  "linear-gradient( 111.6deg,  rgba(114,167,232,1) 9.4%, rgba(253,129,82,1) 43.9%, rgba(253,129,82,1) 54.8%, rgba(249,202,86,1) 86.3% )",
  "linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
  "radial-gradient( circle farthest-corner at 3.2% 49.6%,  rgba(80,12,139,0.87) 0%, rgba(161,10,144,0.72) 83.6% )",
  "linear-gradient( 111.6deg,  rgba(0,56,68,1) 0%, rgba(163,217,185,1) 51.5%, rgba(231, 148, 6, 1) 88.6% )",
  "linear-gradient( 107.7deg,  rgba(235,230,44,0.55) 8.4%, rgba(252,152,15,1) 90.3% )",
  "linear-gradient( 91deg,  rgba(72,154,78,1) 5.2%, rgba(251,206,70,1) 95.9% )",
  "radial-gradient( circle farthest-corner at 10% 20%,  rgba(2,37,78,1) 0%, rgba(4,56,126,1) 19.7%, rgba(85,245,221,1) 100.2% )",
  "linear-gradient( 109.6deg,  rgba(15,2,2,1) 11.2%, rgba(36,163,190,1) 91.1% )",
  "linear-gradient(135deg, #FBC8B4, #2447B1)",
  "linear-gradient(109.6deg, #F635A6, #36D860)",
  "linear-gradient(90deg, #FF0101, #4DFF01)",
  "linear-gradient(315deg, #EC0101, #5044A9)",
  "linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%, #fad0c4 100%)",
  "linear-gradient(to top, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%)",
  "linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
  "linear-gradient(to right, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(to top, #fcc5e4 0%, #fda34b 15%, #ff7882 35%, #c8699e 52%, #7046aa 71%, #0c1db8 87%, #020f75 100%)",
  "linear-gradient(to right, #fa709a 0%, #fee140 100%)",
  "linear-gradient(to top, #30cfd0 0%, #330867 100%)",
  "linear-gradient(to top, #c471f5 0%, #fa71cd 100%)",
  "linear-gradient(to right, #f78ca0 0%, #f9748f 19%, #fd868c 60%, #fe9a8b 100%)",
  "linear-gradient(to top, #48c6ef 0%, #6f86d6 100%)",
  "linear-gradient(to right, #0acffe 0%, #495aff 100%)",
];

interface SettingsPanelProps {
  selected: string;
  onWallpaperChange: (path: string) => void;
  selectedZoomDepth?: ZoomDepth | null;
  onZoomDepthChange?: (depth: ZoomDepth) => void;
  selectedZoomId?: string | null;
  onZoomDelete?: (id: string) => void;
  shadowIntensity?: number;
  onShadowChange?: (intensity: number) => void;
  showBlur?: boolean;
  onBlurChange?: (showBlur: boolean) => void;
  motionBlurEnabled?: boolean;
  onMotionBlurChange?: (enabled: boolean) => void;
  borderRadius?: number;
  onBorderRadiusChange?: (radius: number) => void;
  padding?: number;
  onPaddingChange?: (padding: number) => void;
  cropRegion?: CropRegion;
  onCropChange?: (region: CropRegion) => void;
  hideCamera?: boolean;
  onHideCameraChange?: (hide: boolean) => void;
  cameraShape?: 'circle' | 'squircle' | 'square';
  onCameraShapeChange?: (shape: 'circle' | 'squircle' | 'square') => void;
  cameraSize?: number;
  onCameraSizeChange?: (size: number) => void;
  videoElement?: HTMLVideoElement | null;
  onExport?: () => void;
  exportResolution?: '480p' | '720p' | '1080p' | '2k' | '4k';
  onExportResolutionChange?: (resolution: '480p' | '720p' | '1080p' | '2k' | '4k') => void;
  exportFormat?: 'mp4' | 'gif';
  onExportFormatChange?: (format: 'mp4' | 'gif') => void;
  exportBitrate?: number | null;
  onExportBitrateChange?: (bitrate: number | null) => void;
  exportFrameRate?: number | null;
  onExportFrameRateChange?: (frameRate: number | null) => void;
  hardwareAcceleration?: boolean | null;
  exportPlatform?: 'custom' | 'facebook' | 'helpscout';
  onExportPlatformChange?: (platform: 'custom' | 'facebook' | 'helpscout') => void;
  videoDuration?: number; // in seconds, for size estimation
  trimRegions?: Array<{ startMs: number; endMs: number }>; // for effective duration calculation
}

export default SettingsPanel;

const ZOOM_DEPTH_OPTIONS: Array<{ depth: ZoomDepth; label: string }> = [
  { depth: 1, label: "1.25×" },
  { depth: 2, label: "1.5×" },
  { depth: 3, label: "1.8×" },
  { depth: 4, label: "2.2×" },
  { depth: 5, label: "3.5×" },
  { depth: 6, label: "5×" },
];

export function SettingsPanel({ selected, onWallpaperChange, selectedZoomDepth, onZoomDepthChange, selectedZoomId, onZoomDelete, shadowIntensity = 0, onShadowChange, showBlur, onBlurChange, motionBlurEnabled = true, onMotionBlurChange, borderRadius = 0, onBorderRadiusChange, padding = 50, onPaddingChange, cropRegion, onCropChange, hideCamera = false, onHideCameraChange, cameraShape = 'squircle', onCameraShapeChange, cameraSize = 150, onCameraSizeChange, videoElement, onExport, exportResolution = '1080p', onExportResolutionChange, exportFormat = 'mp4', onExportFormatChange, exportBitrate = null, onExportBitrateChange, exportFrameRate = null, onExportFrameRateChange, hardwareAcceleration = null, exportPlatform = 'custom', onExportPlatformChange, videoDuration = 0, trimRegions = [] }: SettingsPanelProps) {
  const [wallpaperPaths, setWallpaperPaths] = useState<string[]>([]);
  const [customImages, setCustomImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate effective duration (excluding trim regions)
  const getEffectiveDuration = (): number => {
    if (!videoDuration) return 0;
    const totalTrimDuration = trimRegions.reduce((sum, region) => {
      return sum + (region.endMs - region.startMs) / 1000;
    }, 0);
    return videoDuration - totalTrimDuration;
  };

  // Get resolution dimensions
  const getResolutionDimensions = (resolution: '480p' | '720p' | '1080p' | '2k' | '4k'): { width: number; height: number } => {
    switch (resolution) {
      case '480p':
        return { width: 854, height: 480 };
      case '720p':
        return { width: 1280, height: 720 };
      case '1080p':
        return { width: 1920, height: 1080 };
      case '2k':
        return { width: 2560, height: 1440 };
      case '4k':
        return { width: 3840, height: 2160 };
    }
  };

  // Estimate file size in bytes
  const estimateFileSize = (): number => {
    const effectiveDuration = getEffectiveDuration();
    if (effectiveDuration <= 0) return 0;

    if (exportFormat === 'gif') {
      // GIF size estimation: roughly 1-5 KB per frame depending on complexity
      // Use a conservative estimate of 2 KB per frame
      const fps = exportFrameRate || 30;
      const totalFrames = Math.ceil(effectiveDuration * fps);
      const estimatedSizeBytes = totalFrames * 2 * 1024; // 2 KB per frame
      return estimatedSizeBytes;
    } else {
      // Video size estimation: bitrate * duration
      const res = getResolutionDimensions(exportResolution);
      const totalPixels = res.width * res.height;
      
      // Get bitrate (in bps)
      let bitrateBps = exportBitrate || 30_000_000;
      if (!exportBitrate) {
        // Auto-calculated bitrate
        if (totalPixels > 1920 * 1080 && totalPixels <= 2560 * 1440) {
          bitrateBps = 50_000_000;
        } else if (totalPixels > 2560 * 1440) {
          bitrateBps = 80_000_000;
        }
      }

      // Estimate: bitrate (bits/sec) * duration (sec) / 8 = bytes
      // Add 10% overhead for container/audio
      const estimatedSizeBytes = (bitrateBps * effectiveDuration / 8) * 1.1;
      return estimatedSizeBytes;
    }
  };

  // Platform size limits (in bytes)
  const PLATFORM_LIMITS: Record<string, number> = {
    facebook: 25 * 1024 * 1024, // 25 MB
    helpscout: 10 * 1024 * 1024, // 10 MB
  };

  // Auto-configure settings based on platform - maximize quality within limit
  useEffect(() => {
    if (exportPlatform === 'custom' || !onExportResolutionChange || !onExportBitrateChange || !onExportFrameRateChange) {
      return;
    }

    const limit = PLATFORM_LIMITS[exportPlatform];
    if (!limit) return;

    const effectiveDuration = getEffectiveDuration();
    if (effectiveDuration <= 0) return;

    // Target 98% of limit to maximize quality while staying safely under
    const targetSizeBytes = limit * 0.98;

    // Try resolutions from highest to lowest quality
    const resolutions: Array<'1080p' | '720p' | '480p'> = ['1080p', '720p', '480p'];
    const fpsOptions = [60, 30, 25]; // Try higher FPS first for better quality

    // Find the best configuration that maximizes quality
    for (const resolution of resolutions) {
      for (const fps of fpsOptions) {
        // Calculate required bitrate to hit target size
        // size = (bitrate * duration / 8) * 1.1
        // bitrate = (size * 8) / (duration * 1.1)
        const requiredBitrate = (targetSizeBytes * 8) / (effectiveDuration * 1.1);
        
        // Define reasonable bitrate ranges per resolution
        const bitrateRanges: Record<string, { min: number; max: number }> = {
          '1080p': { min: 5_000_000, max: 50_000_000 }, // 5-50 Mbps
          '720p': { min: 3_000_000, max: 25_000_000 },  // 3-25 Mbps
          '480p': { min: 2_000_000, max: 15_000_000 },  // 2-15 Mbps
        };

        const range = bitrateRanges[resolution];
        const optimalBitrate = Math.max(range.min, Math.min(range.max, requiredBitrate));

        // Test if this configuration fits
        const testSize = (optimalBitrate * effectiveDuration / 8) * 1.1;
        
        if (testSize <= limit) {
          // This configuration fits! Use it (highest quality that fits)
          onExportResolutionChange(resolution);
          onExportFrameRateChange(fps);
          onExportBitrateChange(Math.round(optimalBitrate));
          return;
        }
      }
    }

    // Fallback: if nothing fits, use the most conservative settings
    // This should rarely happen, but handle edge cases
    onExportResolutionChange('480p');
    onExportFrameRateChange(25);
    const fallbackBitrate = Math.max(2_000_000, (targetSizeBytes * 8) / (effectiveDuration * 1.1));
    onExportBitrateChange(Math.round(Math.min(15_000_000, fallbackBitrate)));
  }, [exportPlatform, videoDuration, trimRegions, exportFormat]);

  const estimatedSize = estimateFileSize();
  const platformLimit = exportPlatform !== 'custom' ? PLATFORM_LIMITS[exportPlatform] : null;
  const exceedsLimit = platformLimit && estimatedSize > platformLimit;
  const effectiveDuration = getEffectiveDuration();

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const resolved = await Promise.all(WALLPAPER_RELATIVE.map(p => getAssetPath(p)))
        if (mounted) setWallpaperPaths(resolved)
      } catch (err) {
        if (mounted) setWallpaperPaths(WALLPAPER_RELATIVE.map(p => `/${p}`))
      }
    })()
    return () => { mounted = false }
  }, [])
  const [hsva, setHsva] = useState({ h: 0, s: 0, v: 68, a: 1 });
  const [gradient, setGradient] = useState<string>(GRADIENTS[0]);
  const [showCropDropdown, setShowCropDropdown] = useState(false);

  const zoomEnabled = Boolean(selectedZoomDepth);
  
  const handleDeleteClick = () => {
    if (selectedZoomId && onZoomDelete) {
      onZoomDelete(selectedZoomId);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Validate file type - only allow JPG/JPEG
    const validTypes = ['image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type', {
        description: 'Please upload a JPG or JPEG image file.',
      });
      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setCustomImages(prev => [...prev, dataUrl]);
        onWallpaperChange(dataUrl);
        toast.success('Custom image uploaded successfully!');
      }
    };

    reader.onerror = () => {
      toast.error('Failed to upload image', {
        description: 'There was an error reading the file.',
      });
    };

    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    event.target.value = '';
  };

  const handleRemoveCustomImage = (imageUrl: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setCustomImages(prev => prev.filter(img => img !== imageUrl));
    // If the removed image was selected, clear selection
    if (selected === imageUrl) {
      onWallpaperChange(wallpaperPaths[0] || WALLPAPER_RELATIVE[0]);
    }
  };

  return (
    <div className="flex-[2] min-w-0 bg-[#09090b] border border-white/5 rounded-2xl p-4 flex flex-col shadow-xl h-full overflow-y-auto custom-scrollbar">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-slate-200">Zoom Level</span>
          <div className="flex items-center gap-3">
            {zoomEnabled && selectedZoomDepth && (
              <span className="text-[10px] uppercase tracking-wider font-medium text-[#DA1F26] bg-[#DA1F26]/10 px-2 py-1 rounded-full">
                {ZOOM_DEPTH_OPTIONS.find(o => o.depth === selectedZoomDepth)?.label} Active
              </span>
            )}
            <KeyboardShortcutsHelp />
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {ZOOM_DEPTH_OPTIONS.map((option) => {
            const isActive = selectedZoomDepth === option.depth;
            return (
              <Button
                key={option.depth}
                type="button"
                disabled={!zoomEnabled}
                onClick={() => onZoomDepthChange?.(option.depth)}
                className={cn(
                  "h-auto w-full rounded-xl border px-1 py-3 text-center shadow-sm transition-all flex flex-col items-center justify-center gap-1.5",
                  "duration-200 ease-out",
                  zoomEnabled ? "opacity-100 cursor-pointer" : "opacity-40 cursor-not-allowed",
                  isActive
                    ? "border-[#DA1F26] bg-[#DA1F26] text-white shadow-[#DA1F26]/20 scale-105 ring-2 ring-[#DA1F26]/20"
                    : "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200"
                )}
              >
                <span className={cn("text-sm font-semibold tracking-tight")}>{option.label}</span>
              </Button>
            );
          })}
        </div>
        {!zoomEnabled && (
          <p className="text-xs text-slate-500 mt-3 text-center">Select a zoom region in the timeline to adjust depth.</p>
        )}
        {zoomEnabled && (
          <Button
            onClick={handleDeleteClick}
            variant="destructive"
            size="sm"
            className="mt-4 w-full gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Delete Zoom Region
          </Button>
        )}
      </div>

      <div className="mb-6">
        <div className="grid grid-cols-2 gap-3">
          {/* Motion Blur Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="text-xs font-medium text-slate-200">Motion Blur</div>
            <Switch
              checked={motionBlurEnabled}
              onCheckedChange={onMotionBlurChange}
              className="data-[state=checked]:bg-[#DA1F26]"
            />
          </div>
          {/* Blur Background Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="text-xs font-medium text-slate-200">Blur</div>
            <Switch
              checked={showBlur}
              onCheckedChange={onBlurChange}
              className="data-[state=checked]:bg-[#DA1F26]"
            />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="grid grid-cols-2 gap-3">
          {/* Drop Shadow Slider */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-slate-200">Shadow</div>
              <span className="text-[10px] text-slate-400 font-mono">{Math.round(shadowIntensity * 100)}%</span>
            </div>
            <Slider
              value={[shadowIntensity]}
              onValueChange={(values) => onShadowChange?.(values[0])}
              min={0}
              max={1}
              step={0.01}
              className="w-full [&_[role=slider]]:bg-[#DA1F26] [&_[role=slider]]:border-[#DA1F26]"
            />
          </div>
          {/* Corner Roundness Slider */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-slate-200">Roundness</div>
              <span className="text-[10px] text-slate-400 font-mono">{borderRadius}px</span>
            </div>
            <Slider
              value={[borderRadius]}
              onValueChange={(values) => onBorderRadiusChange?.(values[0])}
              min={0}
              max={16}
              step={0.5}
              className="w-full [&_[role=slider]]:bg-[#DA1F26] [&_[role=slider]]:border-[#DA1F26]"
            />
          </div>
          {/* Padding Slider */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-slate-200">Padding</div>
              <span className="text-[10px] text-slate-400 font-mono">{padding}%</span>
            </div>
            <Slider
              value={[padding]}
              onValueChange={(values) => onPaddingChange?.(values[0])}
              min={0}
              max={100}
              step={1}
              className="w-full [&_[role=slider]]:bg-[#DA1F26] [&_[role=slider]]:border-[#DA1F26]"
            />
          </div>
        </div>
      </div>

      {onHideCameraChange && (
        <div className="mb-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="text-xs font-medium text-slate-200">Hide Camera</div>
            <Switch
              checked={hideCamera}
              onCheckedChange={onHideCameraChange}
              className="data-[state=checked]:bg-[#DA1F26]"
            />
          </div>
          {hideCamera && (
            <p className="text-[10px] text-slate-500 text-center mt-2 px-4 leading-relaxed">
              Camera feed will be cropped out from the bottom of the video
            </p>
          )}
        </div>
      )}

      {onCameraShapeChange && !hideCamera && (
        <div className="mb-4">
          <div className="text-xs font-medium text-slate-200 mb-3">Camera Shape</div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              onClick={() => {
                onCameraShapeChange('circle');
                try {
                  const existingMetadata = sessionStorage.getItem('cameraMetadata');
                  const metadata = existingMetadata ? JSON.parse(existingMetadata) : {};
                  metadata.shape = 'circle';
                  sessionStorage.setItem('cameraMetadata', JSON.stringify(metadata));
                } catch (e) {
                  console.warn('Failed to store camera shape:', e);
                }
              }}
              className={cn(
                "h-auto w-full rounded-xl border px-3 py-3 text-center shadow-sm transition-all flex flex-col items-center justify-center gap-1.5",
                cameraShape === 'circle'
                  ? "border-[#DA1F26] bg-[#DA1F26] text-white shadow-[#DA1F26]/20 scale-105 ring-2 ring-[#DA1F26]/20"
                  : "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200"
              )}
            >
              <Circle className="w-4 h-4" />
              <span className="text-xs font-medium">Circle</span>
            </Button>
            <Button
              type="button"
              onClick={() => {
                onCameraShapeChange('squircle');
                try {
                  const existingMetadata = sessionStorage.getItem('cameraMetadata');
                  const metadata = existingMetadata ? JSON.parse(existingMetadata) : {};
                  metadata.shape = 'squircle';
                  sessionStorage.setItem('cameraMetadata', JSON.stringify(metadata));
                } catch (e) {
                  console.warn('Failed to store camera shape:', e);
                }
              }}
              className={cn(
                "h-auto w-full rounded-xl border px-3 py-3 text-center shadow-sm transition-all flex flex-col items-center justify-center gap-1.5",
                cameraShape === 'squircle'
                  ? "border-[#DA1F26] bg-[#DA1F26] text-white shadow-[#DA1F26]/20 scale-105 ring-2 ring-[#DA1F26]/20"
                  : "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200"
              )}
            >
              <Square className="w-4 h-4" />
              <span className="text-xs font-medium">Squircle</span>
            </Button>
            <Button
              type="button"
              onClick={() => {
                onCameraShapeChange('square');
                try {
                  const existingMetadata = sessionStorage.getItem('cameraMetadata');
                  const metadata = existingMetadata ? JSON.parse(existingMetadata) : {};
                  metadata.shape = 'square';
                  sessionStorage.setItem('cameraMetadata', JSON.stringify(metadata));
                } catch (e) {
                  console.warn('Failed to store camera shape:', e);
                }
              }}
              className={cn(
                "h-auto w-full rounded-xl border px-3 py-3 text-center shadow-sm transition-all flex flex-col items-center justify-center gap-1.5",
                cameraShape === 'square'
                  ? "border-[#DA1F26] bg-[#DA1F26] text-white shadow-[#DA1F26]/20 scale-105 ring-2 ring-[#DA1F26]/20"
                  : "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200"
              )}
            >
              <RectangleHorizontal className="w-4 h-4" />
              <span className="text-xs font-medium">Square</span>
            </Button>
          </div>
        </div>
      )}

      {onCameraSizeChange && !hideCamera && (
        <div className="mb-4">
          <div className="text-xs font-medium text-slate-200 mb-3 flex items-center justify-between">
            <span>Camera Size</span>
            <span className="text-slate-400 font-mono">{cameraSize}px</span>
          </div>
          <Slider
            value={[cameraSize]}
            onValueChange={(value) => onCameraSizeChange(value[0])}
            min={100}
            max={350}
            step={10}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>100px</span>
            <span>350px</span>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Button
          onClick={() => setShowCropDropdown(!showCropDropdown)}
          variant="outline"
          className="w-full gap-2 bg-white/5 text-slate-200 border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-white h-11 transition-all"
        >
          <Crop className="w-4 h-4" />
          Crop Video
        </Button>
        <p className="text-[10px] text-slate-500 text-center mt-3 px-4 leading-relaxed">
          If the preview looks weirdly positioned or doesn't load, try force reloading the app a few times till it works.
        </p>
      </div>
      
      {showCropDropdown && cropRegion && onCropChange && (
        <>
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 animate-in fade-in duration-200"
            onClick={() => setShowCropDropdown(false)}
          />
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60] bg-[#09090b] rounded-2xl shadow-2xl border border-white/10 p-8 w-[90vw] max-w-5xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-xl font-bold text-slate-200">Crop Video</span>
                <p className="text-sm text-slate-400 mt-2">Drag on each side to adjust the crop area</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCropDropdown(false)}
                className="hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <CropControl
              videoElement={videoElement || null}
              cropRegion={cropRegion}
              onCropChange={onCropChange}
            />
            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => setShowCropDropdown(false)}
                size="lg"
                className="bg-[#DA1F26] hover:bg-[#DA1F26]/90 text-white"
              >
                Done
              </Button>
            </div>
          </div>
        </>
      )}

      <Tabs defaultValue="image" className="flex flex-col">
        <TabsList className="mb-4 bg-white/5 border border-white/5 p-1 w-full grid grid-cols-3 h-auto rounded-xl">
          <TabsTrigger value="image" className="data-[state=active]:bg-[#DA1F26] data-[state=active]:text-white text-slate-400 py-2 rounded-lg transition-all">Image</TabsTrigger>
          <TabsTrigger value="color" className="data-[state=active]:bg-[#DA1F26] data-[state=active]:text-white text-slate-400 py-2 rounded-lg transition-all">Color</TabsTrigger>
          <TabsTrigger value="gradient" className="data-[state=active]:bg-[#DA1F26] data-[state=active]:text-white text-slate-400 py-2 rounded-lg transition-all">Gradient</TabsTrigger>
        </TabsList>
        
        <div className="overflow-y-auto custom-scrollbar pr-2 max-h-[200px]">
          <TabsContent value="image" className="mt-0 space-y-3">
            {/* Upload Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept=".jpg,.jpeg,image/jpeg"
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="w-full gap-2 bg-white/5 text-slate-200 border-white/10 hover:bg-[#DA1F26] hover:text-white hover:border-[#DA1F26] transition-all"
            >
              <Upload className="w-4 h-4" />
              Upload Custom Image
            </Button>

            <div className="grid grid-cols-6 gap-2.5">
              {/* Custom Images */}
              {customImages.map((imageUrl, idx) => {
                const isSelected = selected === imageUrl;
                return (
                  <div
                    key={`custom-${idx}`}
                    className={cn(
                      "aspect-square w-12 h-12 rounded-md border-2 overflow-hidden cursor-pointer transition-all duration-200 relative group shadow-sm",
                      isSelected
                        ? "border-[#DA1F26] ring-2 ring-[#DA1F26]/30 scale-105 shadow-lg shadow-[#DA1F26]/10"
                        : "border-white/10 hover:border-[#DA1F26]/40 hover:scale-105 opacity-80 hover:opacity-100 bg-white/5"
                    )}
                    style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
                    aria-label={`Custom Image ${idx + 1}`}
                    onClick={() => onWallpaperChange(imageUrl)}
                    role="button"
                  >
                    <button
                      onClick={(e) => handleRemoveCustomImage(imageUrl, e)}
                      className="absolute top-1 right-1 w-4 h-4 bg-red-500/90 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      aria-label="Remove custom image"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                );
              })}

              {/* Preset Wallpapers */}
              {(wallpaperPaths.length > 0 ? wallpaperPaths : WALLPAPER_RELATIVE.map(p => `/${p}`)).map((path, idx) => {
                const isSelected = (() => {
                  if (!selected) return false;
                  if (selected === path) return true;
                  try {
                    const clean = (s: string) => s.replace(/^file:\/\//, '').replace(/^\//, '')
                    if (clean(selected).endsWith(clean(path))) return true;
                    if (clean(path).endsWith(clean(selected))) return true;
                  } catch {}
                  return false;
                })();
                return (
                  <div
                    key={path}
                    className={cn(
                      "aspect-square w-12 h-12 rounded-md border-2 overflow-hidden cursor-pointer transition-all duration-200 shadow-sm",
                      isSelected
                        ? "border-[#DA1F26] ring-2 ring-[#DA1F26]/30 scale-105 shadow-lg shadow-[#DA1F26]/10"
                        : "border-white/10 hover:border-[#DA1F26]/40 hover:scale-105 opacity-80 hover:opacity-100 bg-white/5"
                    )}
                    style={{ backgroundImage: `url(${path})`, backgroundSize: "cover", backgroundPosition: "center" }}
                    aria-label={`Wallpaper ${idx + 1}`}
                    onClick={() => onWallpaperChange(path)}
                    role="button"
                  />
                )
              })}
            </div>
          </TabsContent>
          
          <TabsContent value="color" className="mt-0">
            <div className="p-1">
              <Colorful
                color={hsva}
                disableAlpha={true}
                onChange={(color) => {
                  setHsva(color.hsva);
                  onWallpaperChange(hsvaToHex(color.hsva));
                }}
                style={{ width: '100%', borderRadius: '12px' }}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="gradient" className="mt-0">
            <div className="grid grid-cols-6 gap-2.5">
              {GRADIENTS.map((g, idx) => (
                <div
                  key={g}
                  className={cn(
                    "aspect-square w-12 h-12 rounded-md border-2 overflow-hidden cursor-pointer transition-all duration-200 shadow-sm",
                    gradient === g 
                      ? "border-[#DA1F26] ring-2 ring-[#DA1F26]/30 scale-105 shadow-lg shadow-[#DA1F26]/10" 
                      : "border-white/10 hover:border-[#DA1F26]/40 hover:scale-105 opacity-80 hover:opacity-100 bg-white/5"
                  )}
                  style={{ background: g }}
                  aria-label={`Gradient ${idx + 1}`}
                  onClick={() => { setGradient(g); onWallpaperChange(g); }}
                  role="button"
                />
              ))}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
        {/* Platform Preset */}
        {onExportPlatformChange && (
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-200 mb-3">Platform Preset</div>
            <div className="grid grid-cols-3 gap-2">
              {(['custom', 'facebook', 'helpscout'] as const).map((platform) => (
                <Button
                  key={platform}
                  variant="outline"
                  size="sm"
                  onClick={() => onExportPlatformChange(platform)}
                  className={`flex-1 text-xs ${
                    exportPlatform === platform
                      ? "border-[#DA1F26] bg-[#DA1F26] text-white shadow-[#DA1F26]/20 scale-105 ring-2 ring-[#DA1F26]/20"
                      : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {platform === 'custom' ? 'Custom' : platform === 'facebook' ? 'Facebook' : 'HelpScout'}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Export Resolution */}
        {onExportResolutionChange && (
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-200 mb-3">Export Resolution</div>
            <div className="grid grid-cols-5 gap-2">
              {(['480p', '720p', '1080p', '2k', '4k'] as const).map((res) => (
                <Button
                  key={res}
                  variant="outline"
                  size="sm"
                  onClick={() => onExportResolutionChange(res)}
                  className={`flex-1 text-xs ${
                    exportResolution === res
                      ? "border-[#DA1F26] bg-[#DA1F26] text-white shadow-[#DA1F26]/20 scale-105 ring-2 ring-[#DA1F26]/20"
                      : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {res}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Export Format */}
        {onExportFormatChange && (
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-200 mb-3">Export Format</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExportFormatChange('mp4')}
                className={`flex-1 ${
                  exportFormat === 'mp4'
                    ? "border-[#DA1F26] bg-[#DA1F26] text-white shadow-[#DA1F26]/20 scale-105 ring-2 ring-[#DA1F26]/20"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                MP4
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExportFormatChange('gif')}
                className={`flex-1 ${
                  exportFormat === 'gif'
                    ? "border-[#DA1F26] bg-[#DA1F26] text-white shadow-[#DA1F26]/20 scale-105 ring-2 ring-[#DA1F26]/20"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                GIF
              </Button>
            </div>
          </div>
        )}

        {/* Bitrate Control (only for video) */}
        {exportFormat === 'mp4' && onExportBitrateChange && (
          <div className="mb-4">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-200">Bitrate</div>
                <div className="flex items-center gap-2">
                  {exportBitrate === null ? (
                    <span className="text-[10px] text-slate-400">Auto</span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono">{(exportBitrate / 1_000_000).toFixed(1)} Mbps</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onExportBitrateChange(null)}
                    className="h-5 px-2 text-[10px] text-slate-400 hover:text-slate-200"
                  >
                    Reset
                  </Button>
                </div>
              </div>
              <Slider
                value={[exportBitrate ? exportBitrate / 1_000_000 : 30]}
                onValueChange={(values) => onExportBitrateChange(values[0] * 1_000_000)}
                min={5}
                max={100}
                step={1}
                className="w-full [&_[role=slider]]:bg-[#DA1F26] [&_[role=slider]]:border-[#DA1F26]"
              />
              <div className="text-[10px] text-slate-500 text-center">5-100 Mbps (Auto recommended)</div>
            </div>
          </div>
        )}

        {/* Frame Rate Control */}
        {onExportFrameRateChange && (
          <div className="mb-4">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-200">Frame Rate (FPS)</div>
                <div className="flex items-center gap-2">
                  {exportFrameRate === null ? (
                    <span className="text-[10px] text-slate-400">Auto</span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono">{exportFrameRate} fps</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onExportFrameRateChange(null)}
                    className="h-5 px-2 text-[10px] text-slate-400 hover:text-slate-200"
                  >
                    Reset
                  </Button>
                </div>
              </div>
              <Slider
                value={[exportFrameRate || (exportFormat === 'gif' ? 30 : 60)]}
                onValueChange={(values) => onExportFrameRateChange(values[0])}
                min={15}
                max={60}
                step={1}
                className="w-full [&_[role=slider]]:bg-[#DA1F26] [&_[role=slider]]:border-[#DA1F26]"
              />
              <div className="text-[10px] text-slate-500 text-center">
                {exportFormat === 'gif' ? '15-30 fps (30 recommended for GIF)' : '15-60 fps (60 recommended for video)'}
              </div>
            </div>
          </div>
        )}

        {/* Hardware Acceleration Status */}
        {exportFormat === 'mp4' && hardwareAcceleration !== null && (
          <div className="mb-4">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-200">Hardware Acceleration</div>
                <div className="flex items-center gap-2">
                  {hardwareAcceleration ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      <span className="text-[10px] text-green-400 font-medium">GPU</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                      <span className="text-[10px] text-yellow-400 font-medium">CPU</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {hardwareAcceleration 
                  ? 'Using GPU encoding for faster export' 
                  : 'Using CPU encoding (GPU not available)'}
              </div>
            </div>
          </div>
        )}

        {/* Estimated File Size */}
        {videoDuration > 0 && (
          <div className="mb-4">
            <div className={`p-3 rounded-xl border ${
              exceedsLimit 
                ? 'bg-yellow-500/10 border-yellow-500/30' 
                : 'bg-white/5 border-white/5'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-slate-200">Estimated File Size</div>
                <div className={`text-[10px] font-mono ${
                  exceedsLimit ? 'text-yellow-400' : 'text-slate-400'
                }`}>
                  {(estimatedSize / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
              {platformLimit && (
                <div className="text-[10px] text-slate-500 mb-2">
                  {exportPlatform === 'facebook' ? 'Facebook' : 'HelpScout'} limit: {(platformLimit / (1024 * 1024)).toFixed(0)} MB
                </div>
              )}
              {exceedsLimit && (
                <div className="mt-2 p-2 rounded bg-yellow-500/20 border border-yellow-500/30">
                  <div className="text-[10px] text-yellow-400 font-medium mb-1">
                    ⚠️ File size exceeds platform limit
                  </div>
                  <div className="text-[10px] text-yellow-300/80">
                    Consider trimming the video to reduce duration, or lower the resolution/bitrate further.
                  </div>
                </div>
              )}
              {!exceedsLimit && platformLimit && (
                <div className="text-[10px] text-green-400">
                  ✓ File size is within platform limit
                </div>
              )}
            </div>
          </div>
        )}

        <Button
          type="button"
          size="lg"
          onClick={onExport}
          className="w-full py-6 text-lg font-semibold flex items-center justify-center gap-3 bg-[#DA1F26] text-white rounded-xl shadow-lg shadow-[#DA1F26]/20 hover:bg-[#DA1F26]/90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <Download className="w-5 h-5" />
          <span>Export {exportFormat === 'gif' ? 'GIF' : 'Video'}</span>
        </Button>
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              apiBridge.openExternalUrl('https://www.stephenlovino.com/');
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Made with 💙 by Stephen Lovino
          </button>
        </div>
      </div>
    </div>
  );
}
