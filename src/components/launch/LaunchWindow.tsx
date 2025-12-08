import { useState, useEffect } from "react";
import styles from "./LaunchWindow.module.css";
import { useScreenRecorder, stopCameraTrack, stopMicTrack } from "../../hooks/useScreenRecorder";
import { Button } from "../ui/button";
import { BsRecordCircle } from "react-icons/bs";
import { FaRegStopCircle } from "react-icons/fa";
import { MdMonitor } from "react-icons/md";
import { MdVideocam } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import { FaFolderMinus } from "react-icons/fa6";
import { FiMinus, FiX } from "react-icons/fi";
import { VideoOff, MicOff, Settings } from "lucide-react";
import { apiBridge } from "../../lib/apiBridge";

export function LaunchWindow() {
  const { recording, toggleRecording } = useScreenRecorder();
  const [recordingStart, setRecordingStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (recording) {
      if (!recordingStart) setRecordingStart(Date.now());
      timer = setInterval(() => {
        if (recordingStart) {
          setElapsed(Math.floor((Date.now() - recordingStart) / 1000));
        }
      }, 1000);
    } else {
      setRecordingStart(null);
      setElapsed(0);
      if (timer) clearInterval(timer);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [recording, recordingStart]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  const [selectedSource, setSelectedSource] = useState("Screen");
  const [hasSelectedSource, setHasSelectedSource] = useState(false);
  const [hasScreen, setHasScreen] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  // Listen for stop camera/mic track requests from IPC
  useEffect(() => {
    if (window.electronAPI) {
      const stopCameraHandler = () => {
        stopCameraTrack();
        setCameraEnabled(false);
        // Close camera preview window when camera is stopped
        apiBridge.closeCameraPreview();
      };
      const stopMicHandler = () => {
        stopMicTrack();
        setMicEnabled(false);
      };
      
      // Listen for IPC messages
      if (window.electronAPI.on) {
        window.electronAPI.on('stop-camera-track-request', stopCameraHandler);
        window.electronAPI.on('stop-mic-track-request', stopMicHandler);
      }
      
      return () => {
        if (window.electronAPI?.off) {
          window.electronAPI.off('stop-camera-track-request', stopCameraHandler);
          window.electronAPI.off('stop-mic-track-request', stopMicHandler);
        }
      };
    }
  }, []);

  // Reset camera/mic enabled state when camera is selected/deselected
  useEffect(() => {
    if (hasCamera) {
      setCameraEnabled(true);
      setMicEnabled(true);
    }
  }, [hasCamera]);

  useEffect(() => {
    const checkSelectedSource = async () => {
      try {
        // Try to get multiple sources first
        if (apiBridge.getSelectedSources) {
          const sources = await apiBridge.getSelectedSources();
          if (sources && sources.length > 0) {
            setHasSelectedSource(true);
            
            // Check what types of sources are selected
            const hasScreenSource = sources.some(s => 
              s.type === 'screen' || s.id?.startsWith('screen:') || s.id?.startsWith('window:')
            );
            const hasCameraSource = sources.some(s => 
              s.type === 'camera' || s.id?.startsWith('camera:')
            );
            
            setHasScreen(hasScreenSource);
            setHasCamera(hasCameraSource);
            
            // Build display name
            const names = sources.map(s => s.name || 'Unknown');
            if (names.length === 1) {
              setSelectedSource(names[0]);
            } else {
              setSelectedSource(`${names.length} sources`);
            }
            return;
          }
        }
      } catch (error) {
        console.error('Error getting selected sources:', error);
      }
      
      // Fallback to single source for backward compatibility
      try {
        const source = await apiBridge.getSelectedSource();
        if (source) {
          setSelectedSource(source.name || "Screen");
          setHasSelectedSource(true);
          setHasScreen(source.type === 'screen' || source.id?.startsWith('screen:') || source.id?.startsWith('window:'));
          setHasCamera(source.type === 'camera' || source.id?.startsWith('camera:'));
        } else {
          setSelectedSource("Screen");
          setHasSelectedSource(false);
          setHasScreen(false);
          setHasCamera(false);
        }
      } catch (error) {
        console.error('Error getting selected source:', error);
        setSelectedSource("Screen");
        setHasSelectedSource(false);
        setHasScreen(false);
        setHasCamera(false);
      }
    };

    checkSelectedSource();
    
    const interval = setInterval(checkSelectedSource, 500);
    return () => clearInterval(interval);
  }, []);

  const truncateText = (text: string, maxLength: number = 6) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const openSourceSelector = () => {
    apiBridge.openSourceSelector('screen');
  };

  const openCameraSelector = () => {
    console.log('LaunchWindow: openCameraSelector called');
    apiBridge.openSourceSelector('camera');
  };

  const openVideoFile = async () => {
    const result = await apiBridge.openVideoFilePicker();
    
    if (result.cancelled) {
      return;
    }
    
    if (result.success) {
      if (result.path) {
        await apiBridge.setCurrentVideoPath(result.path);
      } else if (result.file) {
        await apiBridge.setCurrentVideoPath(result.file);
      }
      await apiBridge.switchToEditor();
    }
  };

  // IPC events for hide/close
  const sendHudOverlayHide = () => {
    if (window.electronAPI && window.electronAPI.hudOverlayHide) {
      window.electronAPI.hudOverlayHide();
    }
  };
  const sendHudOverlayClose = () => {
    if (window.electronAPI && window.electronAPI.hudOverlayClose) {
      window.electronAPI.hudOverlayClose();
    }
  };

  const handleRecordClick = async () => {
    if (recording) {
      toggleRecording();
    } else {
      // Check if both screen and camera are selected
      if (hasScreen && hasCamera) {
        // Show warning dialog in separate window
        const result = await apiBridge.openCameraWarningDialog();
        if (result.success) {
          // Wait for user response
          const response = await apiBridge.waitForCameraWarningDialogResponse();
          if (response === 'continue') {
            toggleRecording();
          }
          // If cancel, do nothing
        }
      } else {
        // Start recording directly
        toggleRecording();
      }
    }
  };

  return (
    <div className="w-full h-full flex items-stretch bg-transparent">
      <div
        className={`w-full max-w-[500px] mx-auto flex items-center justify-between px-4 py-0 ${styles.electronDrag} ${styles.hudWidget}`}
        style={{
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(30,30,40,0.92) 0%, rgba(20,20,30,0.85) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          // Remove heavy outer glow so HUD fits more tightly over content
          boxShadow: '0 0 0 0 rgba(0,0,0,0)',
          border: '1px solid rgba(80,80,120,0.22)',
          minHeight: 44,
        }}
      >
        <div className={`flex items-center gap-1 ${styles.electronDrag}`}> <RxDragHandleDots2 size={18} className="text-white/40" /> </div>

        <Button
          variant="link"
          size="sm"
          className={`gap-1 bg-transparent hover:bg-transparent px-0 flex-1 text-left text-xs ${styles.electronNoDrag} ${
            hasScreen ? 'text-[#DA1F26]' : 'text-white'
          }`}
          onClick={openSourceSelector}
        >
          <MdMonitor size={14} className={hasScreen ? "text-[#DA1F26]" : "text-white"} />
          {hasScreen ? truncateText(selectedSource, 6) : "Screen"}
        </Button>

        <div className="w-px h-6 bg-white/30" />

        <div className="flex flex-col gap-0.5 flex-1">
          <Button
            variant="link"
            size="sm"
            className={`gap-1 bg-transparent hover:bg-transparent px-0 flex-1 text-left text-xs ${styles.electronNoDrag} ${
              hasCamera ? 'text-[#DA1F26]' : 'text-white'
            }`}
            onClick={openCameraSelector}
          >
            <MdVideocam size={14} className={hasCamera ? "text-[#DA1F26]" : "text-white"} />
            Devices
          </Button>
          {hasCamera && recording && (
            <div className="flex items-center gap-1.5 px-0.5">
              <Button
                variant="ghost"
                size="icon"
                className={`h-4 w-4 p-0 ${styles.electronNoDrag} ${
                  cameraEnabled 
                    ? 'text-white hover:text-red-400 hover:bg-red-500/20' 
                    : 'text-red-400/50 hover:text-red-400'
                }`}
                onClick={async () => {
                  if (cameraEnabled) {
                    stopCameraTrack();
                    setCameraEnabled(false);
                    await apiBridge.closeCameraPreview();
                  } else {
                    // Re-enable camera - reopen preview
                    setCameraEnabled(true);
                    await apiBridge.openCameraPreview();
                  }
                }}
                title={cameraEnabled ? "Stop camera" : "Enable camera"}
              >
                <VideoOff className="h-2.5 w-2.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-4 w-4 p-0 ${styles.electronNoDrag} ${
                  micEnabled 
                    ? 'text-white hover:text-red-400 hover:bg-red-500/20' 
                    : 'text-red-400/50 hover:text-red-400'
                }`}
                onClick={() => {
                  if (micEnabled) {
                    stopMicTrack();
                    setMicEnabled(false);
                  } else {
                    // Re-enable mic - would need to restart recording with mic
                    setMicEnabled(true);
                    // Note: Re-enabling mic during recording would require restarting the stream
                  }
                }}
                title={micEnabled ? "Stop microphone" : "Enable microphone"}
              >
                <MicOff className="h-2.5 w-2.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-white/30" />

        <Button
          variant="link"
          size="sm"
          onClick={hasSelectedSource ? handleRecordClick : openSourceSelector}
          disabled={!hasSelectedSource && !recording}
          className={`gap-1 bg-transparent hover:bg-transparent px-0 flex-1 text-center text-xs ${styles.electronNoDrag}`}
        >
          {recording ? (
            <>
              <FaRegStopCircle size={14} className="text-red-400" />
              <span className="text-red-400">{formatTime(elapsed)}</span>
            </>
          ) : (
            <>
              <BsRecordCircle size={14} className={hasSelectedSource ? "text-white" : "text-white/50"} />
              <span className={hasSelectedSource ? "text-white" : "text-white/50"}>Record</span>
            </>
          )}
        </Button>
        

        <div className="w-px h-6 bg-white/30" />


        <Button
          variant="link"
          size="sm"
          onClick={openVideoFile}
          className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 flex-1 text-right text-xs ${styles.electronNoDrag} ${styles.folderButton}`}
        >
          <FaFolderMinus size={14} className="text-white" />
          <span className={styles.folderText}>Open</span>
        </Button>

        <div className="w-px h-6 bg-white/30" />

        <Button
          variant="link"
          size="sm"
          onClick={() => apiBridge.openSettings()}
          className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 flex-1 text-right text-xs ${styles.electronNoDrag}`}
          title="Settings"
        >
          <Settings size={14} className="text-white" />
          <span>Settings</span>
        </Button>

         {/* Separator before hide/close buttons */}
        <div className="w-px h-6 bg-white/30 mx-2" />
        <Button
          variant="link"
          size="icon"
          className={`ml-2 ${styles.electronNoDrag} hudOverlayButton`}
          title="Hide HUD"
          onClick={sendHudOverlayHide}
        >
          <FiMinus size={18} style={{ color: '#fff', opacity: 0.7 }} />
          
        </Button>

        <Button
          variant="link"
          size="icon"
          className={`ml-1 ${styles.electronNoDrag} hudOverlayButton`}
          title="Close App"
          onClick={sendHudOverlayClose}
        >
          <FiX size={18} style={{ color: '#fff', opacity: 0.7 }} />
        </Button>
      </div>
    </div>
  );
}
