import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Circle, Square, RectangleHorizontal, X, Maximize2, Minimize2 } from "lucide-react";
import styles from "./LaunchWindow.module.css";
import { apiBridge } from "../../lib/apiBridge";

type PreviewShape = 'circle' | 'squircle' | 'square';

export function CameraPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState<PreviewShape>('squircle');
  const [size, setSize] = useState<'sm' | 'lg'>('sm');
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    // Initialize camera shape from sessionStorage if available
    try {
      const existingMetadata = sessionStorage.getItem('cameraMetadata');
      if (existingMetadata) {
        const metadata = JSON.parse(existingMetadata);
        if (metadata.shape && ['circle', 'squircle', 'square'].includes(metadata.shape)) {
          setShape(metadata.shape as PreviewShape);
        }
      }
    } catch (e) {
      console.warn('Failed to load camera shape from sessionStorage:', e);
    }
  }, []);

  useEffect(() => {
    async function setupCamera() {
      try {
        // Get the selected sources from the main process
        let cameraSource = null;
        
        // Try to get multiple sources first
        if (window.electronAPI?.getSelectedSources) {
          const sources = await window.electronAPI.getSelectedSources();
          console.log('🔵 CameraPreview: Got sources:', sources);
          cameraSource = sources.find(s => s.type === 'camera' || s.id?.startsWith('camera:'));
          console.log('🔵 CameraPreview: Found camera source:', cameraSource);
        }
        
        // Fallback to single source
        if (!cameraSource && window.electronAPI?.getSelectedSource) {
          const singleSource = await window.electronAPI.getSelectedSource();
          if (singleSource && (singleSource.type === 'camera' || singleSource.id?.startsWith('camera:'))) {
            cameraSource = singleSource;
          }
        }
        
        if (!cameraSource || !cameraSource.id.startsWith('camera:')) {
          console.error('🔵 CameraPreview: No camera source selected', cameraSource);
          return;
        }

        const deviceId = cameraSource.id.replace('camera:', '');
        const audioConfig = (cameraSource as any).audioConfig;
        
        // Build audio constraints
        let audioConstraints: boolean | MediaTrackConstraints = false;
        if (audioConfig?.micEnabled) {
          if (audioConfig.micDeviceId && audioConfig.micDeviceId !== 'default') {
            audioConstraints = {
              deviceId: { exact: audioConfig.micDeviceId }
            };
          } else {
            audioConstraints = true; // Use default device
          }
        }

        // Get the camera stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: audioConstraints
        });

        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err);
          });
        }
      } catch (error) {
        console.error('Error setting up camera preview:', error);
      }
    }

    setupCamera();

    return () => {
      // Cleanup: stop all tracks when component unmounts
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  // Calculate dimensions based on size
  // Match editor overlay size: 250px max (15% of typical screen width)
  const previewSize = size === 'sm' ? 250 : 400;
  
  // Calculate border radius based on shape
  const getBorderRadius = () => {
    switch (shape) {
      case 'circle':
        return '50%';
      case 'squircle':
        return size === 'sm' ? '3rem' : '4rem';
      case 'square':
        return '1rem';
      default:
        return '3rem';
    }
  };

  // Resize window when size changes
  useEffect(() => {
    if (window.electronAPI?.resizeWindow) {
      window.electronAPI.resizeWindow(previewSize, previewSize);
    }
  }, [previewSize]);

  const handleClose = async () => {
    if (window.electronAPI) {
      await window.electronAPI.closeCameraPreview();
    }
  };

  const cycleShape = () => {
    setShape(prev => {
      let next: PreviewShape;
      if (prev === 'circle') next = 'squircle';
      else if (prev === 'squircle') next = 'square';
      else next = 'circle';
      
      // Store camera shape in sessionStorage for use in editor/exporter
      try {
        const existingMetadata = sessionStorage.getItem('cameraMetadata');
        const metadata = existingMetadata ? JSON.parse(existingMetadata) : {};
        metadata.shape = next;
        sessionStorage.setItem('cameraMetadata', JSON.stringify(metadata));
      } catch (e) {
        console.warn('Failed to store camera shape:', e);
      }
      
      return next;
    });
  };

  return (
    <div 
      ref={containerRef}
      className="flex flex-col items-center justify-start relative group"
      style={{ 
        WebkitAppRegion: 'drag', // Make draggable in Electron
        userSelect: 'none',
        width: `${previewSize}px`,
        minWidth: `${previewSize}px`,
        maxWidth: `${previewSize}px`,
        background: 'transparent',
      }}
    >
      <div
        className="relative flex-shrink-0"
        style={{
          width: `${previewSize}px`,
          height: `${previewSize}px`,
          minWidth: `${previewSize}px`,
          minHeight: `${previewSize}px`,
          maxWidth: `${previewSize}px`,
          maxHeight: `${previewSize}px`,
          borderRadius: getBorderRadius(),
          overflow: 'hidden',
          // Remove heavy outer glow so the camera bubble feels more "cut out"
          boxShadow: '0 0 0 0 rgba(0,0,0,0)',
          transition: 'border-radius 0.2s ease',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="object-cover"
          style={{
            borderRadius: getBorderRadius(),
            width: `${previewSize}px`,
            height: `${previewSize}px`,
            minWidth: `${previewSize}px`,
            minHeight: `${previewSize}px`,
            maxWidth: `${previewSize}px`,
            maxHeight: `${previewSize}px`,
            objectFit: 'cover',
            aspectRatio: '1 / 1',
            display: 'block',
            flexShrink: 0,
          }}
        />
        
        {/* Controls overlay */}
        <div
          data-controls
          className={`absolute top-2 left-1/2 -translate-x-1/2 flex gap-1 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 transition-opacity ${
            showControls ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ WebkitAppRegion: 'no-drag' }} // Prevent dragging when clicking controls
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => setShowControls(false)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white hover:bg-white/20"
            onClick={handleClose}
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white hover:bg-white/20"
            onClick={() => setSize(prev => prev === 'sm' ? 'lg' : 'sm')}
            title="Toggle size"
          >
            {size === 'sm' ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white hover:bg-white/20"
            onClick={cycleShape}
            title="Change shape"
          >
            {shape === 'circle' && <Circle className="h-3.5 w-3.5" />}
            {shape === 'squircle' && <Square className="h-3.5 w-3.5" />}
            {shape === 'square' && <RectangleHorizontal className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

