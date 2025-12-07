

import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import VideoPlayback, { VideoPlaybackRef } from "./VideoPlayback";
import PlaybackControls from "./PlaybackControls";
import TimelineEditor from "./timeline/TimelineEditor";
import { SettingsPanel } from "./SettingsPanel";
import { ExportDialog } from "./ExportDialog";

import type { Span } from "dnd-timeline";
import {
  DEFAULT_ZOOM_DEPTH,
  clampFocusToDepth,
  DEFAULT_CROP_REGION,
  type ZoomDepth,
  type ZoomFocus,
  type ZoomRegion,
  type TrimRegion,
  type CropRegion,
} from "./types";
import { VideoExporter, type ExportProgress, type ExportResult } from "@/lib/exporter";
import { apiBridge } from "@/lib/apiBridge";

const WALLPAPER_COUNT = 18;
const WALLPAPER_PATHS = Array.from({ length: WALLPAPER_COUNT }, (_, i) => `/wallpapers/wallpaper${i + 1}.jpg`);

export default function VideoEditor() {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [cameraVideoPath, setCameraVideoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [wallpaper, setWallpaper] = useState<string>(WALLPAPER_PATHS[0]);
  const [shadowIntensity, setShadowIntensity] = useState(0);
  const [showBlur, setShowBlur] = useState(false);
  const [motionBlurEnabled, setMotionBlurEnabled] = useState(true);
  const [borderRadius, setBorderRadius] = useState(0);
  const [padding, setPadding] = useState(50);
  const [cropRegion, setCropRegion] = useState<CropRegion>(DEFAULT_CROP_REGION);
  const [hideCamera, setHideCamera] = useState(false);
  const [cameraShape, setCameraShape] = useState<'circle' | 'squircle' | 'square'>('squircle');
  const [cameraSize, setCameraSize] = useState(150); // Default 150px, range 100-350px
  // Default position: bottom-right with padding (92%, 92% keeps camera fully visible with translate(-50%, -50%))
  const [cameraPosition, setCameraPosition] = useState<{ x: number; y: number }>({ x: 92, y: 92 });
  const [zoomRegions, setZoomRegions] = useState<ZoomRegion[]>([]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [trimRegions, setTrimRegions] = useState<TrimRegion[]>([]);
  const [selectedTrimId, setSelectedTrimId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportResolution, setExportResolution] = useState<'480p' | '720p' | '1080p' | '2k' | '4k'>('1080p');
  const [exportFormat, setExportFormat] = useState<'mp4' | 'gif'>('mp4');

  const videoPlaybackRef = useRef<VideoPlaybackRef>(null);
  const nextZoomIdRef = useRef(1);
  const nextTrimIdRef = useRef(1);
  const exporterRef = useRef<VideoExporter | null>(null);

  // Helper to convert file path to proper file:// URL
  const toFileUrl = (filePath: string): string => {
    // Normalize path separators to forward slashes
    const normalized = filePath.replace(/\\/g, '/');
    
    // Check if it's a Windows absolute path (e.g., C:/Users/...)
    if (normalized.match(/^[a-zA-Z]:/)) {
      const fileUrl = `file:///${normalized}`;
      return fileUrl;
    }
    
    // Unix-style absolute path
    const fileUrl = `file://${normalized}`;
    return fileUrl;
  };

  useEffect(() => {
    // Load camera shape from sessionStorage
    try {
      const metadataStr = sessionStorage.getItem('cameraMetadata');
      if (metadataStr) {
        const metadata = JSON.parse(metadataStr);
        if (metadata.shape && ['circle', 'squircle', 'square'].includes(metadata.shape)) {
          setCameraShape(metadata.shape);
        }
      }
    } catch (e) {
      console.warn('Failed to load camera shape from sessionStorage:', e);
    }
  }, []);
  
  // Load auto-zoom events after video is loaded (so we know the duration)
  useEffect(() => {
    console.log('🔵 VideoEditor: Checking for auto-zoom events, duration:', duration);
    
    if (!duration || duration === 0) {
      console.log('🔵 VideoEditor: Duration not available yet, skipping auto-zoom load');
      return; // Wait for video to load
    }
    
    try {
      const eventsStr = localStorage.getItem('autoZoomEvents');
      console.log('🔵 VideoEditor: Found autoZoomEvents in localStorage:', eventsStr ? 'yes' : 'no');
      
      if (eventsStr) {
        const events = JSON.parse(eventsStr);
        console.log('🔵 VideoEditor: Parsed events:', events);
        
        if (Array.isArray(events) && events.length > 0) {
          console.log('🔵 VideoEditor: Loading auto-zoom events:', events.length, 'Video duration:', duration);
          
          const videoDurationMs = Math.round(duration * 1000);
          const DEFAULT_ZOOM_DURATION = 2000; // 2 seconds
          
          // Sort events by timestamp to ensure proper ordering
          const sortedEvents = [...events].sort((a: any, b: any) => a.timestamp - b.timestamp);
          console.log('🔵 VideoEditor: Sorted events by timestamp:', sortedEvents);
          
          // Minimum gap between zoom regions to prevent overlap (in milliseconds)
          const MIN_ZOOM_GAP_MS = 500; // 0.5 seconds minimum gap
          
          // Convert events to zoom regions, filtering out invalid ones and preventing overlaps
          const autoZoomRegions: ZoomRegion[] = [];
          let lastZoomEndMs = -MIN_ZOOM_GAP_MS;
          
          sortedEvents.forEach((event: any, index: number) => {
            // Validate timestamp is within video bounds
            const startMs = event.timestamp;
            const endMs = event.timestamp + DEFAULT_ZOOM_DURATION;
            
            // Skip if too close to previous zoom
            if (startMs < lastZoomEndMs + MIN_ZOOM_GAP_MS) {
              console.warn(`🔵 VideoEditor: Skipping auto-zoom event ${index + 1} - too close to previous zoom (${startMs}ms < ${lastZoomEndMs + MIN_ZOOM_GAP_MS}ms)`);
              return;
            }
            
            const isValid = startMs >= 0 && startMs < videoDurationMs && endMs <= videoDurationMs;
            if (!isValid) {
              console.warn('🔵 VideoEditor: Skipping invalid auto-zoom event:', event, 'videoDurationMs:', videoDurationMs);
              return;
            }
            
            // Use nextZoomIdRef to ensure unique IDs that don't conflict with manual zooms
            const id = `zoom-auto-${nextZoomIdRef.current++}`;
            const region: ZoomRegion = {
              id,
              startMs: event.timestamp,
              endMs: Math.min(event.timestamp + DEFAULT_ZOOM_DURATION, videoDurationMs),
              depth: 3 as const, // Default zoom depth
              focus: {
                cx: Math.max(0, Math.min(1, event.x)), // Clamp to 0-1
                cy: Math.max(0, Math.min(1, event.y)), // Clamp to 0-1
              },
            };
            console.log(`🔵 VideoEditor: Created zoom region ${autoZoomRegions.length + 1}/${sortedEvents.length} from event:`, region);
            autoZoomRegions.push(region);
            lastZoomEndMs = region.endMs;
          });
          
          console.log('🔵 VideoEditor: Created', autoZoomRegions.length, 'valid auto-zoom regions from', events.length, 'events');
          
          if (autoZoomRegions.length > 0) {
            console.log('🔵 VideoEditor: Adding', autoZoomRegions.length, 'auto-zoom regions to timeline');
            // Merge with existing zoom regions (if any)
            setZoomRegions(prev => {
              // Avoid duplicates by checking IDs
              const existingIds = new Set(prev.map(r => r.id));
              const newRegions = autoZoomRegions.filter(r => !existingIds.has(r.id));
              console.log('🔵 VideoEditor: Merging', newRegions.length, 'new regions with', prev.length, 'existing regions');
              return [...prev, ...newRegions];
            });
          } else {
            console.warn('🔵 VideoEditor: No valid auto-zoom regions created from events');
          }
          
          // Clear auto-zoom events after loading
          localStorage.removeItem('autoZoomEvents');
          console.log('🔵 VideoEditor: Cleared autoZoomEvents from localStorage');
        } else {
          console.log('🔵 VideoEditor: Events array is empty or not an array');
        }
      } else {
        console.log('🔵 VideoEditor: No autoZoomEvents found in localStorage');
      }
    } catch (e) {
      console.error('🔵 VideoEditor: Failed to load auto-zoom events from sessionStorage:', e);
    }
  }, [duration]); // Load when duration is available

  useEffect(() => {
    async function loadVideo() {
      try {
        const [mainResult, cameraResult] = await Promise.all([
          apiBridge.getCurrentVideoPath(),
          apiBridge.getCurrentCameraPath(),
        ]);
        
        if (mainResult.success) {
          if (mainResult.path) {
            const videoUrl = toFileUrl(mainResult.path);
            setVideoPath(videoUrl);
          } else if (mainResult.file) {
            // Web: create object URL from file
            const videoUrl = URL.createObjectURL(mainResult.file);
            setVideoPath(videoUrl);
          } else {
            setError('No video to load. Please record or select a video.');
          }
        } else {
          setError('No video to load. Please record or select a video.');
        }

        if (cameraResult.success) {
          if (cameraResult.path) {
            setCameraVideoPath(toFileUrl(cameraResult.path));
          } else if (cameraResult.file) {
            const cameraUrl = URL.createObjectURL(cameraResult.file);
            setCameraVideoPath(cameraUrl);
          }
        } else {
          setCameraVideoPath(null);
        }
      } catch (err) {
        setError('Error loading video: ' + String(err));
      } finally {
        setLoading(false);
      }
    }
    loadVideo();
  }, []);

  // Use refs to store current state values so handlers don't need to be recreated
  const stateRef = useRef({
    videoPath,
    cameraVideoPath,
    wallpaper,
    shadowIntensity,
    showBlur,
    motionBlurEnabled,
    borderRadius,
    padding,
    cropRegion,
    hideCamera,
    cameraShape,
    cameraSize,
    cameraPosition,
    zoomRegions,
    trimRegions,
    exportResolution,
    exportFormat,
  });

  // Update refs when state changes
  useEffect(() => {
    stateRef.current = {
      videoPath,
      cameraVideoPath,
      wallpaper,
      shadowIntensity,
      showBlur,
      motionBlurEnabled,
      borderRadius,
      padding,
      cropRegion,
      hideCamera,
      cameraShape,
      cameraSize,
      cameraPosition,
      zoomRegions,
      trimRegions,
      exportResolution,
      exportFormat,
    };
  }, [
    videoPath,
    cameraVideoPath,
    wallpaper,
    shadowIntensity,
    showBlur,
    motionBlurEnabled,
    borderRadius,
    padding,
    cropRegion,
    hideCamera,
    cameraShape,
    cameraSize,
    cameraPosition,
    zoomRegions,
    trimRegions,
    exportResolution,
    exportFormat,
  ]);

  // Handle menu actions - only set up once, handlers read from refs
  useEffect(() => {
    console.log('[VideoEditor] Setting up menu action listeners, electronAPI available:', !!window.electronAPI?.on);
    if (!window.electronAPI?.on) {
      console.warn('[VideoEditor] electronAPI.on not available, menu actions will not work');
      return;
    }

    // Listen for save project request from menu
    const handleSaveProject = async () => {
      console.log('[VideoEditor] Save project requested');
      try {
        const state = stateRef.current;
        const projectData = {
          videoPath: state.videoPath,
          cameraVideoPath: state.cameraVideoPath,
          wallpaper: state.wallpaper,
          shadowIntensity: state.shadowIntensity,
          showBlur: state.showBlur,
          motionBlurEnabled: state.motionBlurEnabled,
          borderRadius: state.borderRadius,
          padding: state.padding,
          cropRegion: state.cropRegion,
          hideCamera: state.hideCamera,
          cameraShape: state.cameraShape,
          cameraSize: state.cameraSize,
          cameraPosition: state.cameraPosition,
          zoomRegions: state.zoomRegions,
          trimRegions: state.trimRegions,
          exportResolution: state.exportResolution,
          exportFormat: state.exportFormat,
          timestamp: new Date().toISOString(),
        };

        console.log('[VideoEditor] Calling saveProjectData with project data:', projectData);
        const result = await apiBridge.saveProjectData(projectData);
        console.log('[VideoEditor] Save result:', result);
        if (result.success) {
          toast.success('Project saved successfully', {
            description: result.path ? `Saved to: ${result.path}` : 'Project saved',
          });
        } else {
          // Don't show error if user cancelled the save dialog
          if (result.error !== 'Save cancelled') {
            toast.error('Failed to save project', {
              description: result.error || 'Unknown error',
            });
          }
        }
      } catch (error) {
        console.error('Error saving project:', error);
        toast.error('Failed to save project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    // Listen for re-record action from menu
    const handleReRecord = async () => {
      await apiBridge.openSourceSelector('screen');
      // Close the editor window (main process will handle this)
      if (window.electronAPI?.send) {
        window.electronAPI.send('close-editor');
      }
    };

    // Listen for discard & exit action from menu
    const handleDiscardExit = () => {
      // Close the editor window (main process will handle this)
      if (window.electronAPI?.send) {
        window.electronAPI.send('close-editor');
      }
    };

    // Listen for open project request from menu
    const handleOpenProject = async (_event: any, data: { projectData: any; missingFiles: string[]; projectPath: string }) => {
      try {
        const { projectData, missingFiles, projectPath } = data;

        // Show warning if files are missing
        if (missingFiles.length > 0) {
          const missingList = missingFiles.join(', ');
          toast.warning('Some video files are missing', {
            description: `The following files could not be found: ${missingList}. The project will load but videos may not play.`,
            duration: 5000,
          });
        }

        // Restore project state
        if (projectData.videoPath) {
          setVideoPath(projectData.videoPath);
        }
        if (projectData.cameraVideoPath) {
          setCameraVideoPath(projectData.cameraVideoPath);
        }
        if (projectData.wallpaper !== undefined) {
          setWallpaper(projectData.wallpaper);
        }
        if (projectData.shadowIntensity !== undefined) {
          setShadowIntensity(projectData.shadowIntensity);
        }
        if (projectData.showBlur !== undefined) {
          setShowBlur(projectData.showBlur);
        }
        if (projectData.motionBlurEnabled !== undefined) {
          setMotionBlurEnabled(projectData.motionBlurEnabled);
        }
        if (projectData.borderRadius !== undefined) {
          setBorderRadius(projectData.borderRadius);
        }
        if (projectData.padding !== undefined) {
          setPadding(projectData.padding);
        }
        if (projectData.cropRegion) {
          setCropRegion(projectData.cropRegion);
        }
        if (projectData.hideCamera !== undefined) {
          setHideCamera(projectData.hideCamera);
        }
        if (projectData.cameraShape) {
          setCameraShape(projectData.cameraShape);
        }
        if (projectData.cameraSize !== undefined) {
          setCameraSize(projectData.cameraSize);
        }
        if (projectData.cameraPosition) {
          setCameraPosition(projectData.cameraPosition);
        }
        if (projectData.zoomRegions) {
          setZoomRegions(projectData.zoomRegions);
          // Update nextZoomIdRef to avoid ID conflicts
          if (projectData.zoomRegions.length > 0) {
            const maxId = Math.max(...projectData.zoomRegions.map((z: ZoomRegion) => {
              const match = z.id.match(/zoom-(\d+)/);
              return match ? parseInt(match[1], 10) : 0;
            }));
            nextZoomIdRef.current = maxId + 1;
          }
        }
        if (projectData.trimRegions) {
          setTrimRegions(projectData.trimRegions);
          // Update nextTrimIdRef to avoid ID conflicts
          if (projectData.trimRegions.length > 0) {
            const maxId = Math.max(...projectData.trimRegions.map((t: TrimRegion) => {
              const match = t.id.match(/trim-(\d+)/);
              return match ? parseInt(match[1], 10) : 0;
            }));
            nextTrimIdRef.current = maxId + 1;
          }
        }
        if (projectData.exportResolution) {
          setExportResolution(projectData.exportResolution);
        }
        if (projectData.exportFormat) {
          setExportFormat(projectData.exportFormat);
        }

        toast.success('Project loaded successfully', {
          description: `Loaded from: ${projectPath}`,
        });
      } catch (error) {
        console.error('Error loading project:', error);
        toast.error('Failed to load project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    // Listen for open project error
    const handleOpenProjectError = (_event: any, data: { error: string }) => {
      toast.error('Failed to open project', {
        description: data.error || 'Unknown error',
      });
    };

    console.log('[VideoEditor] Registering event listeners');
    // Listen for both 'save-project-request' (from IPC handler) and 'menu-save-project' (direct from menu)
    window.electronAPI.on('save-project-request', handleSaveProject);
    window.electronAPI.on('menu-save-project', handleSaveProject);
    window.electronAPI.on('menu-re-record', handleReRecord);
    window.electronAPI.on('menu-discard-exit', handleDiscardExit);
    window.electronAPI.on('open-project-data', handleOpenProject);
    window.electronAPI.on('open-project-error', handleOpenProjectError);
    console.log('[VideoEditor] Event listeners registered');

    return () => {
      console.log('[VideoEditor] Cleaning up event listeners');
      if (window.electronAPI?.off) {
        window.electronAPI.off('save-project-request', handleSaveProject);
        window.electronAPI.off('menu-save-project', handleSaveProject);
        window.electronAPI.off('menu-re-record', handleReRecord);
        window.electronAPI.off('menu-discard-exit', handleDiscardExit);
        window.electronAPI.off('open-project-data', handleOpenProject);
        window.electronAPI.off('open-project-error', handleOpenProjectError);
      }
    };
  }, []); // Empty deps - handlers read from refs, so they don't need to be recreated

  function togglePlayPause() {
    const playback = videoPlaybackRef.current;
  if (!playback || !playback.video) return;

    if (isPlaying) {
      playback.pause();
    } else {
      playback.play().catch(err => console.error('Video play failed:', err));
    }
  }

  function handleSeek(time: number) {
    const playback = videoPlaybackRef.current;
    if (!playback) return;
    playback.seek(time);
  }

  const handleSelectZoom = useCallback((id: string | null) => {
    setSelectedZoomId(id);
    if (id) setSelectedTrimId(null);
  }, []);

  const handleSelectTrim = useCallback((id: string | null) => {
    setSelectedTrimId(id);
    if (id) setSelectedZoomId(null);
  }, []);

  const handleZoomAdded = useCallback((span: Span) => {
    const id = `zoom-${nextZoomIdRef.current++}`;
    const newRegion: ZoomRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      depth: DEFAULT_ZOOM_DEPTH,
      focus: { cx: 0.5, cy: 0.5 },
    };
    console.log('Zoom region added:', newRegion);
    setZoomRegions((prev) => [...prev, newRegion]);
    setSelectedZoomId(id);
    setSelectedTrimId(null);
  }, []);

  const handleTrimAdded = useCallback((span: Span) => {
    const id = `trim-${nextTrimIdRef.current++}`;
    const newRegion: TrimRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
    };
    console.log('Trim region added:', newRegion);
    setTrimRegions((prev) => [...prev, newRegion]);
    setSelectedTrimId(id);
    setSelectedZoomId(null);
  }, []);

  const handleZoomSpanChange = useCallback((id: string, span: Span) => {
    console.log('Zoom span changed:', { id, start: Math.round(span.start), end: Math.round(span.end) });
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              startMs: Math.round(span.start),
              endMs: Math.round(span.end),
            }
          : region,
      ),
    );
  }, []);

  const handleTrimSpanChange = useCallback((id: string, span: Span) => {
    console.log('Trim span changed:', { id, start: Math.round(span.start), end: Math.round(span.end) });
    setTrimRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              startMs: Math.round(span.start),
              endMs: Math.round(span.end),
            }
          : region,
      ),
    );
  }, []);

  const handleZoomFocusChange = useCallback((id: string, focus: ZoomFocus) => {
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              focus: clampFocusToDepth(focus, region.depth),
            }
          : region,
      ),
    );
  }, []);

  const handleZoomDepthChange = useCallback((depth: ZoomDepth) => {
    if (!selectedZoomId) return;
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === selectedZoomId
          ? {
              ...region,
              depth,
              focus: clampFocusToDepth(region.focus, depth),
            }
          : region,
      ),
    );
  }, [selectedZoomId]);

  const handleZoomDelete = useCallback((id: string) => {
    console.log('Zoom region deleted:', id);
    setZoomRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedZoomId === id) {
      setSelectedZoomId(null);
    }
  }, [selectedZoomId]);

  const handleTrimDelete = useCallback((id: string) => {
    console.log('Trim region deleted:', id);
    setTrimRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedTrimId === id) {
      setSelectedTrimId(null);
    }
  }, [selectedTrimId]);

  useEffect(() => {
    if (selectedZoomId && !zoomRegions.some((region) => region.id === selectedZoomId)) {
      setSelectedZoomId(null);
    }
  }, [selectedZoomId, zoomRegions]);

  useEffect(() => {
    if (selectedTrimId && !trimRegions.some((region) => region.id === selectedTrimId)) {
      setSelectedTrimId(null);
    }
  }, [selectedTrimId, trimRegions]);

  // Helper function to get resolution dimensions
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
      default:
        return { width: 1920, height: 1080 };
    }
  };

  const handleExport = useCallback(async () => {
    if (!videoPath) {
      toast.error('No video loaded');
      return;
    }

    const video = videoPlaybackRef.current?.video;
    if (!video) {
      toast.error('Video not ready');
      return;
    }

    setShowExportDialog(true);
    setIsExporting(true);
    setExportProgress(null);
    setExportError(null);

    try {
      const wasPlaying = isPlaying;
      if (wasPlaying) {
        videoPlaybackRef.current?.pause();
      }

      // Get actual video dimensions to match recording resolution
      const video = videoPlaybackRef.current?.video;
      if (!video) {
        toast.error('Video not ready');
        return;
      }
      
      const sourceWidth = video.videoWidth || 1920;
      const sourceHeight = video.videoHeight || 1080;
      const sourceAspectRatio = sourceWidth / sourceHeight;
      
      // Get target resolution dimensions
      const targetRes = getResolutionDimensions(exportResolution);
      const targetAspectRatio = targetRes.width / targetRes.height;
      
      let exportWidth: number;
      let exportHeight: number;
      
      // Scale to target resolution while maintaining aspect ratio
      if (sourceAspectRatio > targetAspectRatio) {
        exportHeight = targetRes.height;
        exportWidth = Math.round(exportHeight * sourceAspectRatio);
      } else {
        exportWidth = targetRes.width;
        exportHeight = Math.round(exportWidth / sourceAspectRatio);
      }
      
      // Ensure even dimensions for video encoding
      exportWidth = Math.round(exportWidth / 2) * 2;
      exportHeight = Math.round(exportHeight / 2) * 2;

      // Calculate visually lossless bitrate matching screen recording optimization
      const totalPixels = exportWidth * exportHeight;
      let bitrate = 30_000_000;
      if (totalPixels > 1920 * 1080 && totalPixels <= 2560 * 1440) {
        bitrate = 50_000_000;
      } else if (totalPixels > 2560 * 1440) {
        bitrate = 80_000_000;
      }

      let result: ExportResult;
      let fileName: string;
      const timestamp = Date.now();

      if (exportFormat === 'gif') {
        // Use GIF exporter
        const { GifExporter } = await import('@/lib/exporter/gifExporter');
        const gifExporter = new GifExporter({
          hideCamera: hideCamera,
          videoUrl: videoPath,
          cameraVideoUrl: cameraVideoPath || undefined,
          cameraSize: cameraSize,
          cameraPosition: cameraPosition,
          cameraShape: cameraShape,
          width: exportWidth,
          height: exportHeight,
          frameRate: 30, // GIFs typically use lower frame rate
          wallpaper,
          zoomRegions,
          trimRegions,
          showShadow: shadowIntensity > 0,
          shadowIntensity,
          showBlur,
          motionBlurEnabled,
          borderRadius,
          padding,
          cropRegion,
          onProgress: (progress: ExportProgress) => {
            setExportProgress(progress);
          },
        });

        exporterRef.current = gifExporter as any;
        console.log('[VideoEditor] Starting GIF export...');
        result = await gifExporter.export();
        console.log('[VideoEditor] GIF export completed, result:', result);
        fileName = `export-${timestamp}.gif`;
      } else {
        // Use video exporter
        const exporter = new VideoExporter({
          hideCamera: hideCamera,
          videoUrl: videoPath,
          cameraVideoUrl: cameraVideoPath || undefined,
          cameraSize: cameraSize,
          cameraPosition: cameraPosition,
          cameraShape: cameraShape,
          width: exportWidth,
          height: exportHeight,
          frameRate: 60,
          bitrate,
          codec: 'avc1.640033',
          wallpaper,
          zoomRegions,
          trimRegions,
          showShadow: shadowIntensity > 0,
          shadowIntensity,
          showBlur,
          motionBlurEnabled,
          borderRadius,
          padding,
          cropRegion,
          onProgress: (progress: ExportProgress) => {
            setExportProgress(progress);
          },
        });

        exporterRef.current = exporter;
        result = await exporter.export();
        fileName = `export-${timestamp}.mp4`;
      }

      console.log('[VideoEditor] Export result:', result);
      if (result.success && result.blob) {
        console.log('[VideoEditor] Export successful, blob size:', result.blob.size, 'type:', result.blob.type);
        const arrayBuffer = await result.blob.arrayBuffer();
        console.log('[VideoEditor] ArrayBuffer created, size:', arrayBuffer.byteLength);
        console.log('[VideoEditor] Calling saveExportedVideo with fileName:', fileName);
        
        const saveResult = await apiBridge.saveExportedVideo(arrayBuffer, fileName);
        console.log('[VideoEditor] Save result:', saveResult);
        
        if (saveResult.cancelled) {
          toast.info('Export cancelled');
        } else if (saveResult.success) {
          toast.success(`${exportFormat === 'gif' ? 'GIF' : 'Video'} exported successfully to ${saveResult.path}`);
        } else {
          setExportError(`Failed to save ${exportFormat === 'gif' ? 'GIF' : 'video'}`);
          toast.error(`Failed to save ${exportFormat === 'gif' ? 'GIF' : 'video'}`);
        }
      } else {
        console.error('[VideoEditor] Export failed:', result.error);
        setExportError(result.error || 'Export failed');
        toast.error(result.error || 'Export failed');
      }

      if (wasPlaying) {
        videoPlaybackRef.current?.play();
      }
    } catch (error) {
      console.error('Export error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setExportError(errorMessage);
      toast.error(`Export failed: ${errorMessage}`);
    } finally {
      setIsExporting(false);
      exporterRef.current = null;
    }
  }, [videoPath, wallpaper, zoomRegions, trimRegions, shadowIntensity, showBlur, motionBlurEnabled, borderRadius, padding, cropRegion, isPlaying, exportResolution, exportFormat, hideCamera, cameraSize, cameraPosition, cameraShape]);

  const handleCancelExport = useCallback(() => {
    if (exporterRef.current) {
      exporterRef.current.cancel();
      toast.info('Export cancelled');
      setShowExportDialog(false);
      setIsExporting(false);
      setExportProgress(null);
      setExportError(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-foreground">Loading video...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-destructive">{error}</div>
      </div>
    );
  }


  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-slate-200 overflow-hidden selection:bg-[#DA1F26]/30">
      <div 
        className="h-10 flex-shrink-0 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex-1" />
      </div>

      <div className="flex-1 p-5 gap-4 flex min-h-0 relative">
        {/* Left Column - Video & Timeline */}
        <div className="flex-[7] flex flex-col gap-3 min-w-0 h-full">
          <PanelGroup direction="vertical" className="gap-3">
            {/* Top section: video preview and controls */}
            <Panel defaultSize={70} minSize={40}>
              <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
                {/* Video preview */}
                <div className="w-full flex justify-center items-center" style={{ flex: '1 1 auto', margin: '6px 0 0' }}>
                  <div className="relative" style={{ width: 'auto', height: '100%', aspectRatio: '16/9', maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                    <VideoPlayback
                      ref={videoPlaybackRef}
                      videoPath={videoPath || ''}
                      cameraVideoPath={cameraVideoPath}
                      onDurationChange={setDuration}
                      onTimeUpdate={setCurrentTime}
                      onPlayStateChange={setIsPlaying}
                      onError={setError}
                      wallpaper={wallpaper}
                      zoomRegions={zoomRegions}
                      selectedZoomId={selectedZoomId}
                      onSelectZoom={handleSelectZoom}
                      onZoomFocusChange={handleZoomFocusChange}
                      isPlaying={isPlaying}
                      showShadow={shadowIntensity > 0}
                      shadowIntensity={shadowIntensity}
                      showBlur={showBlur}
                      motionBlurEnabled={motionBlurEnabled}
                      borderRadius={borderRadius}
                      padding={padding}
                      cropRegion={cropRegion}
                      trimRegions={trimRegions}
                      hideCamera={hideCamera}
                      cameraSize={cameraSize}
                      cameraPosition={cameraPosition}
                      onCameraPositionChange={setCameraPosition}
                    />
                  </div>
                </div>
                {/* Playback controls */}
                <div className="w-full flex justify-center items-center" style={{ height: '48px', flexShrink: 0, padding: '6px 12px', margin: '6px 0 6px 0' }}>
                  <div style={{ width: '100%', maxWidth: '700px' }}>
                    <PlaybackControls
                      isPlaying={isPlaying}
                      currentTime={currentTime}
                      duration={duration}
                      onTogglePlayPause={togglePlayPause}
                      onSeek={handleSeek}
                    />
                  </div>
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="h-3 bg-[#09090b]/80 hover:bg-[#09090b] transition-colors rounded-full mx-4 flex items-center justify-center">
              <div className="w-8 h-1 bg-white/20 rounded-full"></div>
            </PanelResizeHandle>

            {/* Timeline section */}
            <Panel defaultSize={30} minSize={20}>
              <div className="h-full bg-[#09090b] rounded-2xl border border-white/5 shadow-lg overflow-hidden flex flex-col">
                <TimelineEditor
                  videoDuration={duration}
                  currentTime={currentTime}
                  onSeek={handleSeek}
                  zoomRegions={zoomRegions}
                  onZoomAdded={handleZoomAdded}
                  onZoomSpanChange={handleZoomSpanChange}
                  onZoomDelete={handleZoomDelete}
                  selectedZoomId={selectedZoomId}
                  onSelectZoom={handleSelectZoom}
                  trimRegions={trimRegions}
                  onTrimAdded={handleTrimAdded}
                  onTrimSpanChange={handleTrimSpanChange}
                  onTrimDelete={handleTrimDelete}
                  selectedTrimId={selectedTrimId}
                  onSelectTrim={handleSelectTrim}
                />
              </div>
            </Panel>
          </PanelGroup>
        </div>

          {/* Right section: settings panel */}
          <SettingsPanel
          selected={wallpaper}
          onWallpaperChange={setWallpaper}
          selectedZoomDepth={selectedZoomId ? zoomRegions.find(z => z.id === selectedZoomId)?.depth : null}
          onZoomDepthChange={(depth) => selectedZoomId && handleZoomDepthChange(depth)}
          selectedZoomId={selectedZoomId}
          onZoomDelete={handleZoomDelete}
          shadowIntensity={shadowIntensity}
          onShadowChange={setShadowIntensity}
          showBlur={showBlur}
          onBlurChange={setShowBlur}
          motionBlurEnabled={motionBlurEnabled}
          onMotionBlurChange={setMotionBlurEnabled}
          borderRadius={borderRadius}
          onBorderRadiusChange={setBorderRadius}
          padding={padding}
          onPaddingChange={setPadding}
                      cropRegion={cropRegion}
                      onCropChange={(region) => {
                        setCropRegion(region);
                      }}
                      hideCamera={hideCamera}
          onHideCameraChange={setHideCamera}
          cameraShape={cameraShape}
          onCameraShapeChange={(shape) => {
            setCameraShape(shape);
            // Trigger re-render of camera overlay
            if (videoPlaybackRef.current?.video) {
              const video = videoPlaybackRef.current.video;
              video.style.display = 'none';
              setTimeout(() => {
                video.style.display = '';
              }, 0);
            }
          }}
          cameraSize={cameraSize}
          onCameraSizeChange={setCameraSize}
          videoElement={videoPlaybackRef.current?.video || null}
          onExport={handleExport}
          exportResolution={exportResolution}
          onExportResolutionChange={setExportResolution}
          exportFormat={exportFormat}
          onExportFormatChange={setExportFormat}
        />
      </div>

      <Toaster theme="dark" className="pointer-events-auto" />
      
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        progress={exportProgress}
        isExporting={isExporting}
        error={exportError}
        exportFormat={exportFormat}
        onCancel={handleCancelExport}
      />
    </div>
  );
}