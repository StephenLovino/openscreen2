import { useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { MdCheck } from "react-icons/md";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Card } from "../ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Switch } from "../ui/switch";
import { MdVideocam, MdMic, MdVolumeUp } from "react-icons/md";
import styles from "./SourceSelector.module.css";
import { apiBridge } from "../../lib/apiBridge";

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string | null;
  display_id: string;
  appIcon: string | null;
  type?: 'screen' | 'window' | 'camera';
}

interface AudioConfig {
  micEnabled: boolean;
  micDeviceId?: string;
  mediaEnabled: boolean;
  mediaDeviceId?: string;
}

export function SourceSelector() {
  // Initialize mode from URL immediately
  const getInitialMode = (): 'screen' | 'camera' => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode') as 'screen' | 'camera' | null;
      console.log('SourceSelector initial mode from URL:', urlMode, 'Full URL:', window.location.href);
      return urlMode === 'camera' ? 'camera' : 'screen';
    }
    return 'screen';
  };
  
  const [mode, setMode] = useState<'screen' | 'camera'>(getInitialMode());
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [cameraSources, setCameraSources] = useState<DesktopSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<DesktopSource | null>(null);
  const [selectedScreenSource, setSelectedScreenSource] = useState<DesktopSource | null>(null);
  const [selectedCameraSource, setSelectedCameraSource] = useState<DesktopSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [cameraPreview, setCameraPreview] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [audioConfig, setAudioConfig] = useState<AudioConfig>({
    micEnabled: false,
    mediaEnabled: false,
  });
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [mediaDevices, setMediaDevices] = useState<MediaDeviceInfo[]>([]);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Detect mode from URL - check on mount and when URL changes
  useEffect(() => {
    const checkMode = () => {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode') as 'screen' | 'camera' | null;
      console.log('SourceSelector checking mode from URL:', urlMode, 'Full URL:', window.location.href, 'Current mode state:', mode);
      if (urlMode === 'camera' || urlMode === 'screen') {
        if (mode !== urlMode) {
          console.log('SourceSelector updating mode from', mode, 'to', urlMode);
          setMode(urlMode);
        }
      } else if (!urlMode && mode !== 'screen') {
        // Default to screen if no mode specified
        console.log('SourceSelector defaulting to screen mode');
        setMode('screen');
      }
    };
    
    checkMode();
    // Also check when location changes (for Electron window reuse)
    const interval = setInterval(checkMode, 200);
    return () => clearInterval(interval);
  }, [mode]);

  // Fetch screen/window sources
  useEffect(() => {
    if (mode === 'screen') {
      async function fetchSources() {
        setLoading(true);
        try {
          const rawSources = await apiBridge.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: true
          });
          setSources(
            rawSources.map(source => ({
              id: source.id,
              name:
                source.id.startsWith('window:') && source.name.includes(' — ')
                  ? source.name.split(' — ')[1] || source.name
                  : source.name,
              thumbnail: source.thumbnail,
              display_id: source.display_id || '',
              appIcon: source.appIcon,
              type: source.type
            }))
          );
        } catch (error) {
          console.error('Error loading sources:', error);
        } finally {
          setLoading(false);
        }
      }
      fetchSources();
    }
  }, [mode]);

  // Fetch camera sources and audio devices
  useEffect(() => {
    if (mode === 'camera') {
      async function fetchCamerasAndAudio() {
        setLoading(true);
        try {
          // Get cameras
          const cameras = await apiBridge.getCameras();
          console.log('Fetched cameras:', cameras);
          const cameraSourcesList = cameras.map(camera => ({
            id: `camera:${camera.deviceId}`,
            name: camera.label || `Camera ${cameras.indexOf(camera) + 1}`,
            thumbnail: null,
            display_id: '',
            appIcon: null,
            type: 'camera' as const
          }));
          setCameraSources(cameraSourcesList);

          // Get audio devices
          try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput');
            const media = devices.filter(d => d.kind === 'audiooutput');
            setMicDevices(mics);
            setMediaDevices(media);
          } catch (error) {
            console.error('Error getting audio devices:', error);
          }
        } catch (error) {
          console.error('Error loading cameras:', error);
        } finally {
          setLoading(false);
        }
      }
      fetchCamerasAndAudio();
    }
  }, [mode]);

  // Camera preview effect
  useEffect(() => {
    let video: HTMLVideoElement | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let animationFrame: number | null = null;

    if (selectedCameraId) {
      navigator.mediaDevices.getUserMedia({ 
        video: { deviceId: { exact: selectedCameraId } } 
      }).then(mediaStream => {
        cameraStreamRef.current = mediaStream;
        video = document.createElement('video');
        video.srcObject = mediaStream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        
        video.onloadedmetadata = () => {
          video?.play();
          canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext('2d');
          
          const draw = () => {
            if (video && ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
              ctx.drawImage(video, 0, 0, canvas!.width, canvas!.height);
              setCameraPreview(canvas!.toDataURL());
            }
            if (cameraStreamRef.current) {
              animationFrame = requestAnimationFrame(draw);
            }
          };
          draw();
        };
      }).catch(error => {
        console.error('Error accessing camera:', error);
        setCameraPreview(null);
      });
    } else {
      setCameraPreview(null);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      if (video) {
        video.srcObject = null;
      }
    };
  }, [selectedCameraId]);

  // Auto-select first camera when cameras are loaded
  useEffect(() => {
    if (mode === 'camera' && cameraSources.length > 0 && !selectedSource && !selectedCameraSource) {
      const firstCamera = cameraSources[0];
      setSelectedSource(firstCamera);
      setSelectedCameraSource(firstCamera); // Also set selectedCameraSource
      const deviceId = firstCamera.id.replace('camera:', '');
      setSelectedCameraId(deviceId);
    }
  }, [mode, cameraSources.length]); // Only depend on length to avoid infinite loops

  const screenSources = sources.filter(s => s.id.startsWith('screen:'));
  const windowSources = sources.filter(s => s.id.startsWith('window:'));

  const handleSourceSelect = (source: DesktopSource) => {
    if (mode === 'camera') {
      // In camera mode, toggle camera selection
      if (selectedCameraSource?.id === source.id) {
        setSelectedCameraSource(null);
        setSelectedCameraId(null);
        setSelectedSource(null);
      } else {
        setSelectedCameraSource(source);
        setSelectedSource(source); // Keep for backward compatibility
        const deviceId = source.id.replace('camera:', '');
        setSelectedCameraId(deviceId);
      }
    } else {
      // In screen mode, toggle screen selection
      if (selectedScreenSource?.id === source.id) {
        setSelectedScreenSource(null);
        setSelectedSource(null);
      } else {
        setSelectedScreenSource(source);
        setSelectedSource(source); // Keep for backward compatibility
      }
    }
  };

  const handleShare = async () => {
    console.log('🔵 SourceSelector: handleShare called');
    console.log('🔵 SourceSelector: selectedScreenSource:', selectedScreenSource);
    console.log('🔵 SourceSelector: selectedCameraSource:', selectedCameraSource);
    console.log('🔵 SourceSelector: selectedSource:', selectedSource);
    console.log('🔵 SourceSelector: mode:', mode);
    
    const sourcesToShare: any[] = [];
    
    // Add screen source if selected
    if (selectedScreenSource) {
      console.log('🔵 SourceSelector: Adding screen source:', selectedScreenSource);
      sourcesToShare.push(selectedScreenSource);
    }
    
    // Add camera source if selected
    if (selectedCameraSource) {
      console.log('🔵 SourceSelector: Adding camera source:', selectedCameraSource);
      const cameraWithAudio = {
        ...selectedCameraSource,
        audioConfig: audioConfig
      };
      sourcesToShare.push(cameraWithAudio);
    }
    
    // Fallback: if no sources selected but we have selectedSource (backward compatibility)
    // This handles the case where camera was auto-selected but selectedCameraSource wasn't set
    if (sourcesToShare.length === 0 && selectedSource) {
      console.log('🔵 SourceSelector: Using fallback selectedSource:', selectedSource);
      const sourceWithAudio = {
        ...selectedSource,
        audioConfig: mode === 'camera' ? audioConfig : undefined
      };
      // If it's a camera source, make sure it has the type
      if (sourceWithAudio.id?.startsWith('camera:') && !sourceWithAudio.type) {
        sourceWithAudio.type = 'camera';
      }
      sourcesToShare.push(sourceWithAudio);
    }
    
    // Additional fallback: if in camera mode and selectedSource is a camera but selectedCameraSource is null
    if (mode === 'camera' && selectedSource && selectedSource.id?.startsWith('camera:') && !selectedCameraSource) {
      console.log('🔵 SourceSelector: Camera mode - using selectedSource as camera source:', selectedSource);
      const cameraWithAudio = {
        ...selectedSource,
        type: 'camera' as const,
        audioConfig: audioConfig
      };
      // Only add if not already in sourcesToShare
      if (!sourcesToShare.find(s => s.id === selectedSource.id)) {
        sourcesToShare.push(cameraWithAudio);
      }
    }
    
    console.log('🔵 SourceSelector: sourcesToShare:', sourcesToShare);
    
    if (sourcesToShare.length > 0) {
      // Check for camera source BEFORE storing sources (which closes the window)
      const hasCameraSource = sourcesToShare.some(s => {
        const isCamera = s.type === 'camera' || s.id?.startsWith('camera:');
        return isCamera;
      });
      
      // Store multiple sources if available, otherwise fallback to single source
      if (apiBridge.selectSources) {
        console.log('🔵 SourceSelector: Calling apiBridge.selectSources with:', sourcesToShare);
        await apiBridge.selectSources(sourcesToShare);
      } else {
        // Fallback: use single source API
        console.log('🔵 SourceSelector: Using fallback selectSource API');
        await apiBridge.selectSource(sourcesToShare[0]);
      }
      
      // If a camera source was selected, open the camera preview window
      // Do this immediately after storing sources, before closing window
      if (hasCameraSource) {
        console.log('🔵 SourceSelector: Camera source detected, opening preview...');
        try {
          // Small delay to ensure sources are fully stored
          await new Promise(resolve => setTimeout(resolve, 100));
          const previewResult = await apiBridge.openCameraPreview();
          console.log('🔵 SourceSelector: Camera preview result:', previewResult);
          if (!previewResult.success) {
            console.error('🔵 SourceSelector: Failed to open camera preview:', previewResult.error);
          } else {
            console.log('🔵 SourceSelector: Camera preview opened successfully!');
            // Give the window time to render
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          console.error('🔵 SourceSelector: Error opening camera preview:', error);
        }
      }
      
      // Close the source selector window AFTER opening camera preview
      if (window.electronAPI) {
        // Electron: close window
        window.close();
      } else {
        // Web: navigate back
        window.location.href = '/?windowType=hud-overlay';
      }
    } else {
      console.warn('🔵 SourceSelector: No sources to share!');
    }
  };

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${styles.glassContainer}`} style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-600 mx-auto mb-2" />
          <p className="text-xs text-zinc-300">Loading sources...</p>
        </div>
      </div>
    );
  }

  // Debug: Log current mode and render state
  console.log('=== SourceSelector Render ===');
  console.log('Mode:', mode);
  console.log('URL:', window.location.href);
  console.log('URL Params:', new URLSearchParams(window.location.search).toString());
  console.log('Camera Sources:', cameraSources.length);
  console.log('Loading:', loading);
  console.log('Will render camera UI?', mode === 'camera');
  console.log('============================');

  if (mode === 'camera') {
    console.log('✅ Rendering CAMERA UI');
    const selectedCameraName = selectedSource 
      ? cameraSources.find(c => c.id === selectedSource.id)?.name || 'No Camera'
      : 'No Camera';
    const selectedMicName = audioConfig.micDeviceId
      ? micDevices.find(d => d.deviceId === audioConfig.micDeviceId)?.label || 'default'
      : micDevices.length > 0 ? micDevices[0].label || 'default' : 'default';

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${styles.glassContainer}`}>
        <div className="flex-1 flex flex-col w-full max-w-lg px-8 py-6">
          {/* Camera Selection Section - Cap style */}
          <div className="mb-4">
            <div className="flex items-center justify-between bg-zinc-900/60 rounded-lg p-4 border border-zinc-800/50">
              <div className="flex items-center gap-3 flex-1">
                <MdVideocam size={18} className="text-zinc-400" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="text-zinc-200 hover:text-white hover:bg-transparent p-0 h-auto font-normal text-sm"
                    >
                      <span>{selectedCameraName}</span>
                      <svg className="ml-2 h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-700 w-56">
                    <DropdownMenuLabel className="text-zinc-200 text-xs">Camera</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    {cameraSources.length === 0 && !loading && (
                      <div className="px-2 py-3 text-center text-zinc-400 text-xs">
                        No cameras found
                      </div>
                    )}
                    {cameraSources.map(source => (
                      <DropdownMenuItem
                        key={source.id}
                        className="text-zinc-200 hover:bg-zinc-800 cursor-pointer text-sm"
                        onClick={() => handleSourceSelect(source)}
                      >
                        <div className="flex items-center gap-2 w-full">
                          {selectedSource?.id === source.id && (
                            <MdCheck className="h-3.5 w-3.5 text-[#34B27B]" />
                          )}
                          <span className={selectedSource?.id === source.id ? 'text-[#34B27B]' : ''}>
                            {source.name}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Switch
                checked={selectedSource !== null}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    setSelectedSource(null);
                    setSelectedCameraId(null);
                  } else if (cameraSources.length > 0) {
                    handleSourceSelect(cameraSources[0]);
                  }
                }}
              />
            </div>
          </div>

          {/* Microphone Section - Cap style */}
          <div className="mb-4">
            <div className="flex items-center justify-between bg-zinc-900/60 rounded-lg p-4 border border-zinc-800/50">
              <div className="flex items-center gap-3 flex-1">
                <MdMic size={18} className="text-zinc-400" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="text-zinc-200 hover:text-white hover:bg-transparent p-0 h-auto font-normal text-sm"
                      disabled={micDevices.length === 0}
                    >
                      <span>{selectedMicName}</span>
                      {micDevices.length > 0 && (
                        <svg className="ml-2 h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-700 w-56">
                    <DropdownMenuLabel className="text-zinc-200 text-xs">Microphone</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    {micDevices.length === 0 && (
                      <div className="px-2 py-3 text-center text-zinc-400 text-xs">
                        No microphones found
                      </div>
                    )}
                    {micDevices.map(device => (
                      <DropdownMenuItem
                        key={device.deviceId}
                        className="text-zinc-200 hover:bg-zinc-800 cursor-pointer text-sm"
                        onClick={() => setAudioConfig(prev => ({ 
                          ...prev, 
                          micDeviceId: device.deviceId, 
                          micEnabled: true 
                        }))}
                      >
                        <div className="flex items-center gap-2 w-full">
                          {audioConfig.micDeviceId === device.deviceId && (
                            <MdCheck className="h-3.5 w-3.5 text-[#34B27B]" />
                          )}
                          <span className={audioConfig.micDeviceId === device.deviceId ? 'text-[#34B27B]' : ''}>
                            {device.label || `Microphone ${micDevices.indexOf(device) + 1}`}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Switch
                checked={audioConfig.micEnabled}
                onCheckedChange={(checked) => {
                  setAudioConfig(prev => ({ 
                    ...prev, 
                    micEnabled: checked,
                    micDeviceId: checked && !prev.micDeviceId && micDevices.length > 0
                      ? micDevices[0].deviceId
                      : prev.micDeviceId
                  }));
                }}
              />
            </div>
          </div>

          {/* System Audio Section - Cap style */}
          <div className="mb-4">
            <div className="flex items-center justify-between bg-zinc-900/60 rounded-lg p-4 border border-zinc-800/50">
              <div className="flex items-center gap-3">
                <MdVolumeUp size={18} className="text-zinc-400" />
                <span className="text-sm text-zinc-200">Record System Audio</span>
              </div>
              <Switch
                checked={audioConfig.mediaEnabled}
                onCheckedChange={(checked) => {
                  setAudioConfig(prev => ({ ...prev, mediaEnabled: checked }));
                }}
              />
            </div>
          </div>
        </div>
        
        <div className="border-t border-zinc-800/50 p-4 w-full max-w-lg">
          <div className="flex justify-center gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                if (window.electronAPI) {
                  window.close();
                } else {
                  window.location.href = '/?windowType=hud-overlay';
                }
              }} 
              className="px-8 py-2 text-sm bg-zinc-800/80 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleShare} 
              disabled={mode === 'camera' ? !selectedCameraSource && !selectedSource : !selectedSource} 
              className="px-8 py-2 text-sm bg-[#34B27B] text-white hover:bg-[#34B27B]/80 disabled:opacity-50 disabled:bg-zinc-700"
            >
              Share
            </Button>
          </div>
        </div>
      </div>
    );
  }

  console.log('⚠️ Rendering SCREEN/WINDOW UI (mode is:', mode, ')');
  
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center ${styles.glassContainer}`}>
      <div className="flex-1 flex flex-col w-full max-w-xl" style={{ padding: 0 }}>
        <Tabs defaultValue="screens">
          <TabsList className="grid grid-cols-2 mb-3 bg-zinc-900/40 rounded-full">
            <TabsTrigger value="screens" className="data-[state=active]:bg-[#34B27B] data-[state=active]:text-white text-zinc-200 rounded-full text-xs py-1">Screens</TabsTrigger>
            <TabsTrigger value="windows" className="data-[state=active]:bg-[#34B27B] data-[state=active]:text-white text-zinc-200 rounded-full text-xs py-1">Windows</TabsTrigger>
          </TabsList>
            <div className="h-60 flex flex-col justify-stretch">
            <TabsContent value="screens" className="h-full">
              <div className="grid grid-cols-2 gap-2 h-full overflow-y-auto pr-1 relative">
                {screenSources.map(source => (
                  <Card
                    key={source.id}
                    className={`${styles.sourceCard} ${selectedSource?.id === source.id ? styles.selected : ''} cursor-pointer h-fit p-2 scale-95`}
                    style={{ margin: 8, width: '90%', maxWidth: 220 }}
                    onClick={() => handleSourceSelect(source)}
                  >
                    <div className="p-1">
                      <div className="relative mb-1">
                        {source.thumbnail ? (
                          <img
                            src={source.thumbnail}
                            alt={source.name}
                            className="w-full aspect-video object-cover rounded border border-zinc-800"
                          />
                        ) : (
                          <div className="w-full aspect-video bg-zinc-800 rounded border border-zinc-800 flex items-center justify-center">
                            <MdMonitor size={32} className="text-zinc-600" />
                          </div>
                        )}
                        {selectedSource?.id === source.id && (
                          <div className="absolute -top-1 -right-1">
                            <div className="w-4 h-4 bg-[#34B27B] rounded-full flex items-center justify-center shadow-md">
                              <MdCheck className={styles.icon} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className={styles.name + " truncate"}>{source.name}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="windows" className="h-full">
              <div className="grid grid-cols-2 gap-2 h-full overflow-y-auto pr-1 relative">
                {windowSources.length === 0 ? (
                  <div className="col-span-2 text-center text-zinc-400 text-sm py-8">
                    {typeof window !== 'undefined' && !window.electronAPI ? (
                      <p>Window recording is only available in the Electron app.</p>
                    ) : (
                      <p>No windows available</p>
                    )}
                  </div>
                ) : (
                  windowSources.map(source => (
                  <Card
                    key={source.id}
                    className={`${styles.sourceCard} ${selectedSource?.id === source.id ? styles.selected : ''} cursor-pointer h-fit p-2 scale-95`}
                    style={{ margin: 8, width: '90%', maxWidth: 220 }}
                    onClick={() => handleSourceSelect(source)}
                  >
                    <div className="p-1">
                      <div className="relative mb-1">
                        <img
                          src={source.thumbnail || ''}
                          alt={source.name}
                          className="w-full aspect-video object-cover rounded border border-gray-700"
                        />
                        {selectedSource?.id === source.id && (
                          <div className="absolute -top-1 -right-1">
                            <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center shadow-md">
                              <MdCheck className={styles.icon} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {source.appIcon && (
                          <img
                            src={source.appIcon}
                            alt="App icon"
                            className={styles.icon + " flex-shrink-0"}
                          />
                        )}
                        <div className={styles.name + " truncate"}>{source.name}</div>
                      </div>
                    </div>
                  </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
      <div className="border-t border-zinc-800 p-2 w-full max-w-xl">
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => {
            if (window.electronAPI) {
              window.close();
            } else {
              window.location.href = '/?windowType=hud-overlay';
            }
          }} className="px-4 py-1 text-xs bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700">Cancel</Button>
          <Button onClick={handleShare} disabled={!selectedSource} className="px-4 py-1 text-xs bg-[#34B27B] text-white hover:bg-[#34B27B]/80 disabled:opacity-50 disabled:bg-zinc-700">Share</Button>
        </div>
      </div>
    </div>
  );
}
