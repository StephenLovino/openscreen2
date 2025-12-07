import type React from "react";
import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useMemo, useCallback } from "react";
import { getAssetPath } from "@/lib/assetPath";
import { Application, Container, Sprite, Graphics, BlurFilter, Texture, VideoSource } from 'pixi.js';
import { ZOOM_DEPTH_SCALES, type ZoomRegion, type ZoomFocus, type ZoomDepth, type TrimRegion } from "./types";
import { DEFAULT_FOCUS, SMOOTHING_FACTOR, MIN_DELTA } from "./videoPlayback/constants";
import { clamp01 } from "./videoPlayback/mathUtils";
import { findDominantRegion } from "./videoPlayback/zoomRegionUtils";
import { clampFocusToStage as clampFocusToStageUtil } from "./videoPlayback/focusUtils";
import { updateOverlayIndicator } from "./videoPlayback/overlayUtils";
import { layoutVideoContent as layoutVideoContentUtil } from "./videoPlayback/layoutUtils";
import { applyZoomTransform } from "./videoPlayback/zoomTransform";
import { createVideoEventHandlers } from "./videoPlayback/videoEventHandlers";

interface VideoPlaybackProps {
  videoPath: string;
  onDurationChange: (duration: number) => void;
  onTimeUpdate: (time: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  onError: (error: string) => void;
  wallpaper?: string;
  zoomRegions: ZoomRegion[];
  selectedZoomId: string | null;
  onSelectZoom: (id: string | null) => void;
  onZoomFocusChange: (id: string, focus: ZoomFocus) => void;
  isPlaying: boolean;
  showShadow?: boolean;
  shadowIntensity?: number;
  showBlur?: boolean;
  motionBlurEnabled?: boolean;
  borderRadius?: number;
  padding?: number;
  cropRegion?: import('./types').CropRegion;
  trimRegions?: TrimRegion[];
  hideCamera?: boolean;
  cameraVideoPath?: string | null;
  cameraSize?: number;
  cameraPosition?: { x: number; y: number };
  onCameraPositionChange?: (position: { x: number; y: number }) => void;
}

export interface VideoPlaybackRef {
  video: HTMLVideoElement | null;
  cameraVideo: HTMLVideoElement | null;
  app: Application | null;
  videoSprite: Sprite | null;
  videoContainer: Container | null;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
}

const VideoPlayback = forwardRef<VideoPlaybackRef, VideoPlaybackProps>(({
  videoPath,
  onDurationChange,
  onTimeUpdate,
  onPlayStateChange,
  onError,
  wallpaper,
  zoomRegions,
  selectedZoomId,
  onSelectZoom,
  onZoomFocusChange,
  isPlaying,
  showShadow,
  shadowIntensity = 0,
  showBlur,
  motionBlurEnabled = true,
  borderRadius = 0,
  padding = 50,
  cropRegion,
  trimRegions = [],
  hideCamera = false,
  cameraVideoPath = null,
  cameraSize = 250,
  cameraPosition = { x: 0, y: 0 },
  onCameraPositionChange,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraOverlayRef = useRef<HTMLDivElement | null>(null);
  const isDraggingCameraRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialPositionRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const videoSpriteRef = useRef<Sprite | null>(null);
  const videoContainerRef = useRef<Container | null>(null);
  const cameraContainerRef = useRef<Container | null>(null);
  const timeUpdateAnimationRef = useRef<number | null>(null);
  const [pixiReady, setPixiReady] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const focusIndicatorRef = useRef<HTMLDivElement | null>(null);
  const currentTimeRef = useRef(0);
  const zoomRegionsRef = useRef<ZoomRegion[]>([]);
  const selectedZoomIdRef = useRef<string | null>(null);
  const animationStateRef = useRef({ scale: 1, focusX: DEFAULT_FOCUS.cx, focusY: DEFAULT_FOCUS.cy });
  const blurFilterRef = useRef<BlurFilter | null>(null);
  const isDraggingFocusRef = useRef(false);
  const stageSizeRef = useRef({ width: 0, height: 0 });
  const videoSizeRef = useRef({ width: 0, height: 0 });
  const baseScaleRef = useRef(1);
  const baseOffsetRef = useRef({ x: 0, y: 0 });
  const baseMaskRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const cropBoundsRef = useRef({ startX: 0, endX: 0, startY: 0, endY: 0 });
  const maskGraphicsRef = useRef<Graphics | null>(null);
  const cameraMaskRef = useRef<Graphics | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const isSeekingRef = useRef(false);
  const allowPlaybackRef = useRef(false);
  const lockedVideoDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const layoutVideoContentRef = useRef<(() => void) | null>(null);
  const trimRegionsRef = useRef<TrimRegion[]>([]);
  const motionBlurEnabledRef = useRef(motionBlurEnabled);

  const clampFocusToStage = useCallback((focus: ZoomFocus, depth: ZoomDepth) => {
    return clampFocusToStageUtil(focus, depth, stageSizeRef.current);
  }, []);

  const updateOverlayForRegion = useCallback((region: ZoomRegion | null, focusOverride?: ZoomFocus) => {
    const overlayEl = overlayRef.current;
    const indicatorEl = focusIndicatorRef.current;
    
    if (!overlayEl || !indicatorEl) {
      return;
    }

    // Update stage size from overlay dimensions
    const stageWidth = overlayEl.clientWidth;
    const stageHeight = overlayEl.clientHeight;
    if (stageWidth && stageHeight) {
      stageSizeRef.current = { width: stageWidth, height: stageHeight };
    }

    updateOverlayIndicator({
      overlayEl,
      indicatorEl,
      region,
      focusOverride,
      videoSize: videoSizeRef.current,
      baseScale: baseScaleRef.current,
      isPlaying: isPlayingRef.current,
    });
  }, []);

  const layoutVideoContent = useCallback(() => {
    const container = containerRef.current;
    const app = appRef.current;
    const videoSprite = videoSpriteRef.current;
    const maskGraphics = maskGraphicsRef.current;
    const videoElement = videoRef.current;
    const cameraContainer = cameraContainerRef.current;

    if (!container || !app || !videoSprite || !maskGraphics || !videoElement || !cameraContainer) {
      return;
    }

    // Lock video dimensions on first layout to prevent resize issues
    if (!lockedVideoDimensionsRef.current && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
      lockedVideoDimensionsRef.current = {
        width: videoElement.videoWidth,
        height: videoElement.videoHeight,
      };
    }

    const result = layoutVideoContentUtil({
      container,
      app,
      videoSprite,
      maskGraphics,
      videoElement,
      cropRegion,
      lockedVideoDimensions: lockedVideoDimensionsRef.current,
      borderRadius,
      padding,
    });

    if (result) {
      stageSizeRef.current = result.stageSize;
      videoSizeRef.current = result.videoSize;
      baseScaleRef.current = result.baseScale;
      baseOffsetRef.current = result.baseOffset;
      baseMaskRef.current = result.maskRect;
      cropBoundsRef.current = result.cropBounds;

      // Reset camera container to identity
      cameraContainer.scale.set(1);
      cameraContainer.position.set(0, 0);

      const selectedId = selectedZoomIdRef.current;
      const activeRegion = selectedId
        ? zoomRegionsRef.current.find((region) => region.id === selectedId) ?? null
        : null;

      updateOverlayForRegion(activeRegion);
    }
  }, [updateOverlayForRegion, cropRegion, borderRadius, padding]);
  
  const updateCameraMask = useCallback(() => {
    const cameraMask = cameraMaskRef.current;
    const app = appRef.current;
    const videoSprite = videoSpriteRef.current;
    const cameraContainer = cameraContainerRef.current;
    if (!cameraMask || !app || !videoSprite || !cameraContainer) {
      console.log('🔴 updateCameraMask: Missing refs', { cameraMask: !!cameraMask, app: !!app, videoSprite: !!videoSprite, cameraContainer: !!cameraContainer });
      return;
    }

    // If we have a separate camera video path, we no longer need to draw a mask
    // over the baked-in camera area – the camera is rendered as its own layer.
    // In this case, ensure the mask is hidden and exit early.
    if (cameraVideoPath) {
      cameraMask.clear();
      cameraMask.visible = false;
      return;
    }
    
    cameraMask.clear();
    cameraMask.visible = hideCamera; // Show/hide the mask based on hideCamera
    
    if (hideCamera) {
      console.log('🟢 updateCameraMask: hideCamera is true, drawing mask');
      // Try to get camera metadata from sessionStorage (stored during recording)
      let cameraMetadata: any = null;
      try {
        const metadataStr = sessionStorage.getItem('cameraMetadata');
        if (metadataStr) {
          cameraMetadata = JSON.parse(metadataStr);
        }
      } catch (e) {
        console.warn('Failed to parse camera metadata:', e);
      }
      
      // Get the camera container's transform to account for zoom/pan
      const containerX = cameraContainer.x;
      const containerY = cameraContainer.y;
      const containerScale = cameraContainer.scale.x;
      
      // Get video sprite position relative to its container
      const spriteX = videoSprite.x;
      const spriteY = videoSprite.y;
      const spriteScale = videoSprite.scale.x;
      const videoWidth = videoSprite.texture.width;
      const videoHeight = videoSprite.texture.height;
      
      // Calculate absolute position on stage (accounting for all transforms)
      let maskX: number, maskY: number, maskWidth: number, maskHeight: number;
      
      if (cameraMetadata && cameraMetadata.absoluteX !== undefined) {
        // Use stored absolute positions (from recording time)
        // Account for container transform and sprite transform
        const totalScale = containerScale * spriteScale;
        maskX = containerX + spriteX + (cameraMetadata.absoluteX * totalScale);
        maskY = containerY + spriteY + (cameraMetadata.absoluteY * totalScale);
        maskWidth = cameraMetadata.absoluteWidth * totalScale;
        maskHeight = cameraMetadata.absoluteHeight * totalScale;
      } else if (cameraMetadata && cameraMetadata.x !== undefined) {
        // Use normalized positions (0-1)
        const totalScale = containerScale * spriteScale;
        maskX = containerX + spriteX + (cameraMetadata.x * videoWidth * totalScale);
        maskY = containerY + spriteY + (cameraMetadata.y * videoHeight * totalScale);
        maskWidth = cameraMetadata.width * videoWidth * totalScale;
        maskHeight = cameraMetadata.height * videoHeight * totalScale;
      } else {
        // Fallback: assume bottom-right corner (typical camera position)
        const cameraSizeInVideo = Math.min(videoWidth * 0.15, videoHeight * 0.15, 300);
        const totalScale = containerScale * spriteScale;
        const cameraSize = cameraSizeInVideo * totalScale;
        maskX = containerX + spriteX + (videoWidth * totalScale) - cameraSize - (20 * totalScale);
        maskY = containerY + spriteY + (videoHeight * totalScale) - cameraSize - (20 * totalScale);
        maskWidth = cameraSize;
        maskHeight = cameraSize;
      }
      
      // Draw a black rectangle to mask the camera area
      console.log('🟢 Drawing camera mask at:', { maskX, maskY, maskWidth, maskHeight, containerX, containerY, containerScale, spriteX, spriteY, spriteScale, videoWidth, videoHeight });
      cameraMask.rect(maskX, maskY, maskWidth, maskHeight);
      cameraMask.fill({ color: 0x000000, alpha: 1 });
      console.log('🟢 Camera mask drawn, visible:', cameraMask.visible);
    } else {
      console.log('🔴 updateCameraMask: hideCamera is false, clearing mask');
      cameraMask.visible = false;
    }
  }, [hideCamera, cameraVideoPath]);
  
  // Update camera mask when layout or hideCamera changes
  useEffect(() => {
    if (pixiReady && videoReady && videoSpriteRef.current && cameraMaskRef.current) {
      // Small delay to ensure video sprite is fully initialized
      const timer = setTimeout(() => {
        updateCameraMask();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [hideCamera, pixiReady, videoReady, updateCameraMask]);

  useEffect(() => {
    layoutVideoContentRef.current = layoutVideoContent;
  }, [layoutVideoContent]);

  const selectedZoom = useMemo(() => {
    if (!selectedZoomId) return null;
    return zoomRegions.find((region) => region.id === selectedZoomId) ?? null;
  }, [zoomRegions, selectedZoomId]);

  useImperativeHandle(ref, () => ({
    video: videoRef.current,
    cameraVideo: cameraVideoRef.current,
    app: appRef.current,
    videoSprite: videoSpriteRef.current,
    videoContainer: videoContainerRef.current,
    play: async () => {
      const video = videoRef.current;
      if (!video) {
        allowPlaybackRef.current = false;
        return;
      }
      allowPlaybackRef.current = true;
      try {
        await video.play();
      } catch (error) {
        allowPlaybackRef.current = false;
        throw error;
      }
    },
    pause: () => {
      const video = videoRef.current;
      allowPlaybackRef.current = false;
      if (!video) {
        return;
      }
      video.pause();
      if (cameraVideoRef.current) {
        cameraVideoRef.current.pause();
      }
    },
    seek: (time: number) => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = time;
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.currentTime = time;
      }
    },
  }));

  const updateFocusFromClientPoint = (clientX: number, clientY: number) => {
    const overlayEl = overlayRef.current;
    if (!overlayEl) return;

    const regionId = selectedZoomIdRef.current;
    if (!regionId) return;

    const region = zoomRegionsRef.current.find((r) => r.id === regionId);
    if (!region) return;

    const rect = overlayEl.getBoundingClientRect();
    const stageWidth = rect.width;
    const stageHeight = rect.height;

    if (!stageWidth || !stageHeight) {
      return;
    }

    stageSizeRef.current = { width: stageWidth, height: stageHeight };

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const unclampedFocus: ZoomFocus = {
      cx: clamp01(localX / stageWidth),
      cy: clamp01(localY / stageHeight),
    };
    const clampedFocus = clampFocusToStage(unclampedFocus, region.depth);

    onZoomFocusChange(region.id, clampedFocus);
    updateOverlayForRegion({ ...region, focus: clampedFocus }, clampedFocus);
  };

  const handleOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isPlayingRef.current) return;
    const regionId = selectedZoomIdRef.current;
    if (!regionId) return;
    const region = zoomRegionsRef.current.find((r) => r.id === regionId);
    if (!region) return;
    onSelectZoom(region.id);
    event.preventDefault();
    isDraggingFocusRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFocusFromClientPoint(event.clientX, event.clientY);
  };

  const handleOverlayPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingFocusRef.current) return;
    event.preventDefault();
    updateFocusFromClientPoint(event.clientX, event.clientY);
  };

  const endFocusDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingFocusRef.current) return;
    isDraggingFocusRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      
    }
  };

  const handleOverlayPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    endFocusDrag(event);
  };

  const handleOverlayPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    endFocusDrag(event);
  };

  useEffect(() => {
    zoomRegionsRef.current = zoomRegions;
  }, [zoomRegions]);

  useEffect(() => {
    selectedZoomIdRef.current = selectedZoomId;
  }, [selectedZoomId]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    trimRegionsRef.current = trimRegions;
  }, [trimRegions]);

  useEffect(() => {
    motionBlurEnabledRef.current = motionBlurEnabled;
  }, [motionBlurEnabled]);

  useEffect(() => {
    if (!pixiReady || !videoReady) return;

    const app = appRef.current;
    const cameraContainer = cameraContainerRef.current;
    const video = videoRef.current;

    if (!app || !cameraContainer || !video) return;

    const tickerWasStarted = app.ticker?.started || false;
    if (tickerWasStarted && app.ticker) {
      app.ticker.stop();
    }

    const wasPlaying = !video.paused;
    if (wasPlaying) {
      video.pause();
    }

    animationStateRef.current = {
      scale: 1,
      focusX: DEFAULT_FOCUS.cx,
      focusY: DEFAULT_FOCUS.cy,
    };

    if (blurFilterRef.current) {
      blurFilterRef.current.blur = 0;
    }

    requestAnimationFrame(() => {
      const container = cameraContainerRef.current;
      const videoStage = videoContainerRef.current;
      const sprite = videoSpriteRef.current;
      const currentApp = appRef.current;
      if (!container || !videoStage || !sprite || !currentApp) {
        return;
      }

      container.scale.set(1);
      container.position.set(0, 0);
      videoStage.scale.set(1);
      videoStage.position.set(0, 0);
      sprite.scale.set(1);
      sprite.position.set(0, 0);

      layoutVideoContent();

      applyZoomTransform({
        cameraContainer: container,
        blurFilter: blurFilterRef.current,
        stageSize: stageSizeRef.current,
        baseMask: baseMaskRef.current,
        zoomScale: 1,
        focusX: DEFAULT_FOCUS.cx,
        focusY: DEFAULT_FOCUS.cy,
        motionIntensity: 0,
        isPlaying: false,
        motionBlurEnabled: motionBlurEnabledRef.current,
      });

      requestAnimationFrame(() => {
        const finalApp = appRef.current;
        if (wasPlaying && video) {
          video.play().catch(() => {
          });
        }
        if (tickerWasStarted && finalApp?.ticker) {
          finalApp.ticker.start();
        }
      });
    });
  }, [pixiReady, videoReady, layoutVideoContent, cropRegion]);
  
  // Update camera mask when hideCamera changes
  useEffect(() => {
    if (!pixiReady || !videoReady) return;
    updateCameraMask();
  }, [hideCamera, pixiReady, videoReady, updateCameraMask]);

  useEffect(() => {
    if (!pixiReady || !videoReady) return;
    const container = containerRef.current;
    if (!container) return;

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      layoutVideoContent();
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [pixiReady, videoReady, layoutVideoContent]);

  useEffect(() => {
    if (!pixiReady || !videoReady) return;
    updateOverlayForRegion(selectedZoom);
  }, [selectedZoom, pixiReady, videoReady, updateOverlayForRegion]);

  useEffect(() => {
    const overlayEl = overlayRef.current;
    if (!overlayEl) return;
    if (!selectedZoom) {
      overlayEl.style.cursor = 'default';
      overlayEl.style.pointerEvents = 'none';
      return;
    }
    overlayEl.style.cursor = isPlaying ? 'not-allowed' : 'grab';
    overlayEl.style.pointerEvents = isPlaying ? 'none' : 'auto';
  }, [selectedZoom, isPlaying]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mounted = true;
    let app: Application | null = null;

    (async () => {
      app = new Application();
      
      await app.init({
        width: container.clientWidth,
        height: container.clientHeight,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      app.ticker.maxFPS = 60;

      if (!mounted) {
        app.destroy(true, { children: true, texture: true, textureSource: true });
        return;
      }

      appRef.current = app;
      container.appendChild(app.canvas);

      // Camera container - this will be scaled/positioned for zoom
      const cameraContainer = new Container();
      cameraContainerRef.current = cameraContainer;
      app.stage.addChild(cameraContainer);

      // Video container - holds the masked video sprite
      const videoContainer = new Container();
      videoContainerRef.current = videoContainer;
      cameraContainer.addChild(videoContainer);
      
      // Camera mask overlay - separate container always on top
      const cameraMaskOverlay = new Graphics();
      cameraMaskRef.current = cameraMaskOverlay;
      cameraMaskOverlay.zIndex = 10000; // Ensure it's always on top
      cameraMaskOverlay.visible = true; // Make sure it's visible
      app.stage.addChild(cameraMaskOverlay);
      console.log('🟢 Camera mask overlay created and added to stage');
      
      setPixiReady(true);
    })();

    return () => {
      mounted = false;
      setPixiReady(false);
      if (app && app.renderer) {
        app.destroy(true, { children: true, texture: true, textureSource: true });
      }
      appRef.current = null;
      cameraContainerRef.current = null;
      videoContainerRef.current = null;
      videoSpriteRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    allowPlaybackRef.current = false;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause();
      cameraVideoRef.current.currentTime = 0;
    }
  }, [videoPath]);



  useEffect(() => {
    if (!pixiReady || !videoReady) return;

    const video = videoRef.current;
    const app = appRef.current;
    const videoContainer = videoContainerRef.current;
    
    if (!video || !app || !videoContainer) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;
    
    const source = VideoSource.from(video);
    if ('autoPlay' in source) {
      (source as { autoPlay?: boolean }).autoPlay = false;
    }
    if ('autoUpdate' in source) {
      (source as { autoUpdate?: boolean }).autoUpdate = true;
    }
    const videoTexture = Texture.from(source);
    
    const videoSprite = new Sprite(videoTexture);
    videoSpriteRef.current = videoSprite;
    
    const maskGraphics = new Graphics();
    videoContainer.addChild(videoSprite);
    videoContainer.addChild(maskGraphics);
    videoContainer.mask = maskGraphics;
    maskGraphicsRef.current = maskGraphics;

    animationStateRef.current = {
      scale: 1,
      focusX: DEFAULT_FOCUS.cx,
      focusY: DEFAULT_FOCUS.cy,
    };

    const blurFilter = new BlurFilter();
    blurFilter.quality = 3;
    blurFilter.resolution = app.renderer.resolution;
    blurFilter.blur = 0;
    videoContainer.filters = [blurFilter];
    blurFilterRef.current = blurFilter;
    
    layoutVideoContent();
    video.pause();
    
    // Update camera mask after video sprite is created
    if (hideCamera) {
      setTimeout(() => {
        updateCameraMask();
      }, 200);
    }

    const { handlePlay, handlePause, handleSeeked, handleSeeking } = createVideoEventHandlers({
      video,
      isSeekingRef,
      isPlayingRef,
      allowPlaybackRef,
      currentTimeRef,
      timeUpdateAnimationRef,
      onPlayStateChange,
      onTimeUpdate,
      trimRegionsRef,
    });
    
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handlePause);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('seeking', handleSeeking);
    
    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handlePause);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('seeking', handleSeeking);
      
      if (timeUpdateAnimationRef.current) {
        cancelAnimationFrame(timeUpdateAnimationRef.current);
      }
      
      if (videoSprite) {
        videoContainer.removeChild(videoSprite);
        videoSprite.destroy();
      }
      if (maskGraphics) {
        videoContainer.removeChild(maskGraphics);
        maskGraphics.destroy();
      }
      videoContainer.mask = null;
      maskGraphicsRef.current = null;
      if (blurFilterRef.current) {
        videoContainer.filters = [];
        blurFilterRef.current.destroy();
        blurFilterRef.current = null;
      }
      videoTexture.destroy(true);
      
      videoSpriteRef.current = null;
    };
  }, [pixiReady, videoReady, onTimeUpdate, updateOverlayForRegion]);

  useEffect(() => {
    if (!pixiReady || !videoReady) return;

    const app = appRef.current;
    const videoSprite = videoSpriteRef.current;
    const videoContainer = videoContainerRef.current;
    if (!app || !videoSprite || !videoContainer) return;

    const applyTransform = (motionIntensity: number) => {
      const cameraContainer = cameraContainerRef.current;
      if (!cameraContainer) return;

      const state = animationStateRef.current;

      applyZoomTransform({
        cameraContainer,
        blurFilter: blurFilterRef.current,
        stageSize: stageSizeRef.current,
        baseMask: baseMaskRef.current,
        zoomScale: state.scale,
        focusX: state.focusX,
        focusY: state.focusY,
        motionIntensity,
        isPlaying: isPlayingRef.current,
        motionBlurEnabled: motionBlurEnabledRef.current,
      });
    };

    const ticker = () => {
      const { region, strength } = findDominantRegion(zoomRegionsRef.current, currentTimeRef.current);
      
      const defaultFocus = DEFAULT_FOCUS;
      let targetScaleFactor = 1;
      let targetFocus = defaultFocus;

      // If a zoom is selected but video is not playing, show default unzoomed view
      // (the overlay will show where the zoom will be)
      const selectedId = selectedZoomIdRef.current;
      const hasSelectedZoom = selectedId !== null;
      const shouldShowUnzoomedView = hasSelectedZoom && !isPlayingRef.current;

      if (region && strength > 0 && !shouldShowUnzoomedView) {
        const zoomScale = ZOOM_DEPTH_SCALES[region.depth];
        const regionFocus = clampFocusToStage(region.focus, region.depth);
        
        // Interpolate scale and focus based on region strength
        targetScaleFactor = 1 + (zoomScale - 1) * strength;
        targetFocus = {
          cx: defaultFocus.cx + (regionFocus.cx - defaultFocus.cx) * strength,
          cy: defaultFocus.cy + (regionFocus.cy - defaultFocus.cy) * strength,
        };
      }

      const state = animationStateRef.current;

      // Update camera mask on each frame if needed (for zoom/pan changes)
      if (hideCamera && videoSpriteRef.current && cameraMaskRef.current) {
        updateCameraMask();
      }

      const prevScale = state.scale;
      const prevFocusX = state.focusX;
      const prevFocusY = state.focusY;

      const scaleDelta = targetScaleFactor - state.scale;
      const focusXDelta = targetFocus.cx - state.focusX;
      const focusYDelta = targetFocus.cy - state.focusY;

      let nextScale = prevScale;
      let nextFocusX = prevFocusX;
      let nextFocusY = prevFocusY;

      if (Math.abs(scaleDelta) > MIN_DELTA) {
        nextScale = prevScale + scaleDelta * SMOOTHING_FACTOR;
      } else {
        nextScale = targetScaleFactor;
      }

      if (Math.abs(focusXDelta) > MIN_DELTA) {
        nextFocusX = prevFocusX + focusXDelta * SMOOTHING_FACTOR;
      } else {
        nextFocusX = targetFocus.cx;
      }

      if (Math.abs(focusYDelta) > MIN_DELTA) {
        nextFocusY = prevFocusY + focusYDelta * SMOOTHING_FACTOR;
      } else {
        nextFocusY = targetFocus.cy;
      }

      state.scale = nextScale;
      state.focusX = nextFocusX;
      state.focusY = nextFocusY;

      const motionIntensity = Math.max(
        Math.abs(nextScale - prevScale),
        Math.abs(nextFocusX - prevFocusX),
        Math.abs(nextFocusY - prevFocusY)
      );

      applyTransform(motionIntensity);
      
      // Update camera mask every frame if hideCamera is enabled
      if (hideCamera) {
        updateCameraMask();
      }
    };

    app.ticker.add(ticker);
    return () => {
      if (app && app.ticker) {
        app.ticker.remove(ticker);
      }
    };
  }, [pixiReady, videoReady, clampFocusToStage, hideCamera, updateCameraMask]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    onDurationChange(video.duration);
    video.currentTime = 0;
    video.pause();
    allowPlaybackRef.current = false;
    currentTimeRef.current = 0;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.currentTime = 0;
      cameraVideoRef.current.pause();
    }
    
    // hacky fix: To ensure video is fully ready for PixiJS
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVideoReady(true);
      });
    });
  };

  const [resolvedWallpaper, setResolvedWallpaper] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (!wallpaper) {
          const def = await getAssetPath('wallpapers/wallpaper1.jpg')
          if (mounted) setResolvedWallpaper(def)
          return
        }

        if (wallpaper.startsWith('#') || wallpaper.startsWith('linear-gradient') || wallpaper.startsWith('radial-gradient')) {
          if (mounted) setResolvedWallpaper(wallpaper)
          return
        }

        // If it's a data URL (custom uploaded image), use as-is
        if (wallpaper.startsWith('data:')) {
          if (mounted) setResolvedWallpaper(wallpaper)
          return
        }

        // If it's an absolute web/http or file path, use as-is
        if (wallpaper.startsWith('http') || wallpaper.startsWith('file://') || wallpaper.startsWith('/')) {
          // If it's an absolute server path (starts with '/'), resolve via getAssetPath as well
          if (wallpaper.startsWith('/')) {
            const rel = wallpaper.replace(/^\//, '')
            const p = await getAssetPath(rel)
            if (mounted) setResolvedWallpaper(p)
            return
          }
          if (mounted) setResolvedWallpaper(wallpaper)
          return
        }
        const p = await getAssetPath(wallpaper.replace(/^\//, ''))
        if (mounted) setResolvedWallpaper(p)
      } catch (err) {
        if (mounted) setResolvedWallpaper(wallpaper || '/wallpapers/wallpaper1.jpg')
      }
    })()
    return () => { mounted = false }
  }, [wallpaper])

  const isImageUrl = Boolean(resolvedWallpaper && (resolvedWallpaper.startsWith('file://') || resolvedWallpaper.startsWith('http') || resolvedWallpaper.startsWith('/') || resolvedWallpaper.startsWith('data:')))
  const backgroundStyle = isImageUrl
    ? { backgroundImage: `url(${resolvedWallpaper || ''})` }
    : { background: resolvedWallpaper || '' };

  // Keep camera preview playback roughly in sync with the main video
  useEffect(() => {
    const cameraVideo = cameraVideoRef.current;
    if (!cameraVideo) return;

    if (!cameraVideoPath || hideCamera) {
      cameraVideo.pause();
      return;
    }

    if (isPlaying) {
      cameraVideo.play().catch(() => {});
    } else {
      cameraVideo.pause();
    }
  }, [isPlaying, hideCamera, cameraVideoPath]);

  return (
    <div className="relative aspect-video rounded-sm overflow-hidden" style={{ width: '100%' }}>
      {/* Background layer - always render as DOM element with blur */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          ...backgroundStyle,
          filter: showBlur ? 'blur(2px)' : 'none',
        }}
      />
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{
          filter: (showShadow && shadowIntensity > 0)
            ? `drop-shadow(0 ${shadowIntensity * 12}px ${shadowIntensity * 48}px rgba(0,0,0,${shadowIntensity * 0.7})) drop-shadow(0 ${shadowIntensity * 4}px ${shadowIntensity * 16}px rgba(0,0,0,${shadowIntensity * 0.5})) drop-shadow(0 ${shadowIntensity * 2}px ${shadowIntensity * 8}px rgba(0,0,0,${shadowIntensity * 0.3}))`
            : 'none',
        }}
      />
      {/* Only render overlay after PIXI and video are fully initialized */}
      {pixiReady && videoReady && (
        <div
          ref={overlayRef}
          className="absolute inset-0 select-none"
          style={{ pointerEvents: 'none' }}
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerLeave={handleOverlayPointerLeave}
        >
          <div
            ref={focusIndicatorRef}
            className="absolute rounded-md border border-[#34B27B]/80 bg-[#34B27B]/20 shadow-[0_0_0_1px_rgba(52,178,123,0.35)]"
            style={{ display: 'none', pointerEvents: 'none' }}
          />
        </div>
      )}
      <video
        ref={videoRef}
        src={videoPath}
        className="hidden"
        preload="metadata"
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={e => {
          onDurationChange(e.currentTarget.duration);
        }}
        onError={() => onError('Failed to load video')}
      />
      {cameraVideoPath && (() => {
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
          console.warn('Failed to parse camera metadata for shape:', e);
        }

        const isCircle = shape === 'circle';
        const borderRadius = shape === 'circle' ? '50%' : shape === 'squircle' ? '3rem' : '1rem';
        // Use dynamic cameraSize prop (default 250px) to ensure square shape
        const fixedSize = `${cameraSize}px`;

        // Calculate position from percentage (0-100) to CSS positioning
        // x: 0 = left, 100 = right; y: 0 = top, 100 = bottom
        const positionX = cameraPosition.x;
        const positionY = cameraPosition.y;

        const handleCameraPointerDown = (e: React.PointerEvent) => {
          if (hideCamera) return;
          e.stopPropagation();
          e.preventDefault();
          isDraggingCameraRef.current = true;
          const container = cameraOverlayRef.current?.parentElement;
          if (container) {
            const rect = container.getBoundingClientRect();
            dragStartRef.current = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            };
            initialPositionRef.current = { ...cameraPosition };
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        };

        const handleCameraPointerMove = (e: React.PointerEvent) => {
          if (!isDraggingCameraRef.current || hideCamera) return;
          e.preventDefault();
          const container = cameraOverlayRef.current?.parentElement;
          if (container && onCameraPositionChange) {
            const rect = container.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            
            const deltaX = currentX - dragStartRef.current.x;
            const deltaY = currentY - dragStartRef.current.y;
            
            // Convert pixel delta to percentage
            const deltaXPercent = (deltaX / rect.width) * 100;
            const deltaYPercent = (deltaY / rect.height) * 100;
            
            // Calculate new position, clamping to keep camera within bounds
            const newX = Math.max(0, Math.min(100, initialPositionRef.current.x + deltaXPercent));
            const newY = Math.max(0, Math.min(100, initialPositionRef.current.y + deltaYPercent));
            
            onCameraPositionChange({ x: newX, y: newY });
          }
        };

        const handleCameraPointerUp = (e: React.PointerEvent) => {
          if (isDraggingCameraRef.current) {
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {}
            isDraggingCameraRef.current = false;
          }
        };

        return (
          <div
            ref={cameraOverlayRef}
            className="absolute border border-black/40 shadow-lg overflow-hidden cursor-move"
            style={{
              display: hideCamera ? 'none' : 'block',
              width: fixedSize,
              height: fixedSize,
              left: `${positionX}%`,
              top: `${positionY}%`,
              transform: 'translate(-50%, -50%)', // Center on position point
              borderRadius,
              userSelect: 'none',
              touchAction: 'none',
            }}
            onPointerDown={handleCameraPointerDown}
            onPointerMove={handleCameraPointerMove}
            onPointerUp={handleCameraPointerUp}
            onPointerCancel={handleCameraPointerUp}
          >
            <video
              ref={cameraVideoRef}
              src={cameraVideoPath}
              className="w-full h-full"
              muted
              playsInline
              style={{
                width: '100%',
                height: '100%',
                aspectRatio: '1 / 1',
                borderRadius,
                objectFit: 'cover',
                pointerEvents: 'none', // Let parent handle dragging
              }}
            />
          </div>
        );
      })()}
    </div>
  );
});

VideoPlayback.displayName = 'VideoPlayback';

export default VideoPlayback;
