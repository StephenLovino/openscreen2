import { useState, useRef, useEffect } from "react";
import { fixWebmDuration } from "@fix-webm-duration/fix";
import { apiBridge } from "../lib/apiBridge";

type UseScreenRecorderReturn = {
  recording: boolean;
  toggleRecording: () => void;
};

// Global reference to recording stream for stopping tracks during recording
let globalRecordingStream: MediaStream | null = null;
let globalCameraStream: MediaStream | null = null;
let globalAudioTracks: MediaStreamTrack[] = [];

export function useScreenRecorder(): UseScreenRecorderReturn {
  const [recording, setRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const cameraRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraRecordingStream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cameraChunks = useRef<Blob[]>([]);
  const startTime = useRef<number>(0);
  const cameraStreamRef = useRef<MediaStream | null>(null); // Track camera stream separately
  const audioTracksRef = useRef<MediaStreamTrack[]>([]); // Track audio tracks separately for stopping
  const audioContextRef = useRef<AudioContext | null>(null); // Track AudioContext for mixing audio
  const autoZoomCleanupRef = useRef<(() => void) | null>(null); // Track auto-zoom click detection cleanup

  const stopRecording = useRef(async () => {
    if (mediaRecorder.current?.state === "recording") {
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
      }
      mediaRecorder.current.stop();
    }
    if (cameraRecorder.current?.state === "recording") {
      if (cameraRecordingStream.current) {
        cameraRecordingStream.current.getTracks().forEach(track => track.stop());
      }
      cameraRecorder.current.stop();
    }
      setRecording(false);
    await apiBridge.setRecordingState(false, false); // Disable auto-zoom when stopping
    
    // Check if auto-zoom events were stored before cleaning up
    const storedEvents = localStorage.getItem('autoZoomEvents');
    console.log('🔵 useScreenRecorder: Recording stopped. Auto-zoom events in localStorage:', storedEvents);
    if (storedEvents) {
      try {
        const events = JSON.parse(storedEvents);
        console.log('🔵 useScreenRecorder: Found', events.length, 'auto-zoom events:', events);
      } catch (e) {
        console.error('🔵 useScreenRecorder: Failed to parse auto-zoom events:', e);
      }
    }
    
    // Clean up auto-zoom click detection
    if (autoZoomCleanupRef.current) {
      autoZoomCleanupRef.current();
      autoZoomCleanupRef.current = null;
    }
      
      // Stop camera stream and close preview when recording stops
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
    
    // Clean up AudioContext if it was used for mixing
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
        console.log('🔵 useScreenRecorder: AudioContext closed');
      } catch (error) {
        console.warn('🔵 useScreenRecorder: Error closing AudioContext:', error);
      }
      audioContextRef.current = null;
    }
    
      await apiBridge.closeCameraPreview();
  });

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    const cleanupFn = apiBridge.onStopRecordingFromTray(() => {
      stopRecording.current();
    });
    if (cleanupFn) {
      cleanup = cleanupFn;
    }

    return () => {
      if (cleanup) cleanup();
      
      if (mediaRecorder.current?.state === "recording") {
        mediaRecorder.current.stop();
      }
      if (cameraRecorder.current?.state === "recording") {
        cameraRecorder.current.stop();
      }
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
      if (cameraRecordingStream.current) {
        cameraRecordingStream.current.getTracks().forEach(track => track.stop());
        cameraRecordingStream.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      console.log('🔵 useScreenRecorder: startRecording called');
      
      // Get multiple sources (supports camera + screen)
      let selectedSources: any[] = [];
      try {
        if (apiBridge.getSelectedSources) {
          selectedSources = await apiBridge.getSelectedSources();
          console.log('🔵 useScreenRecorder: getSelectedSources returned:', selectedSources);
        }
      } catch (error) {
        console.error('🔵 useScreenRecorder: Error getting selected sources:', error);
      }
      
      if (!selectedSources || selectedSources.length === 0) {
        console.log('🔵 useScreenRecorder: No sources from getSelectedSources, trying single source...');
        // Fallback to single source for backward compatibility
        const singleSource = await apiBridge.getSelectedSource();
        console.log('🔵 useScreenRecorder: getSelectedSource returned:', singleSource);
        if (!singleSource) {
          alert("Please select a source to record");
          return;
        }
        // Convert to array format
        selectedSources = [singleSource];
      }
      
      console.log('🔵 useScreenRecorder: Starting recording with sources:', selectedSources);
      return await startRecordingWithSources(selectedSources);
    } catch (error) {
      console.error("🔵 useScreenRecorder: Error starting recording:", error);
      alert(`Failed to start recording: ${error}`);
    }
  };

  const startRecordingWithSources = async (sources: any[]) => {
    try {
      console.log('🔵 useScreenRecorder: Starting recording with sources:', sources);
      
      // Separate camera and screen sources
      const cameraSource = sources.find(s => {
        const isCamera = s.type === 'camera' || s.id?.startsWith('camera:');
        console.log('🔵 Checking source:', s.id, 'isCamera:', isCamera);
        return isCamera;
      });
      const foundScreenSource = sources.find(s => 
        s.type === 'screen' || s.id?.startsWith('screen:') || s.id?.startsWith('window:')
      );

      console.log('🔵 useScreenRecorder: cameraSource found?', !!cameraSource, cameraSource);
      console.log('🔵 useScreenRecorder: screenSource found?', !!foundScreenSource, foundScreenSource);

      // If a camera preview window is already open while also capturing the screen,
      // close it to avoid the camera UI being baked into the screen recording.
      if (cameraSource && foundScreenSource) {
        try {
          console.log('🔵 useScreenRecorder: Closing camera preview before screen+camera recording');
          await apiBridge.closeCameraPreview();
        } catch (error) {
          console.warn('🔵 useScreenRecorder: Failed to close camera preview before recording:', error);
        }
      }

      // Open camera preview only when recording camera without a separate screen source.
      // When recording both screen and camera, showing the preview window would cause
      // the camera UI to be baked into the screen recording itself.
      if (cameraSource && !foundScreenSource) {
        console.log('🔵 useScreenRecorder: Camera source detected! Opening camera preview...');
        console.log('🔵 useScreenRecorder: Camera source details:', {
          id: cameraSource.id,
          type: cameraSource.type,
          name: cameraSource.name
        });
        try {
          console.log('🔵 useScreenRecorder: Calling apiBridge.openCameraPreview()...');
          const previewResult = await apiBridge.openCameraPreview();
          console.log('🔵 useScreenRecorder: Camera preview result:', previewResult);
          if (!previewResult.success) {
            console.error('🔵 useScreenRecorder: Failed to open camera preview:', previewResult.error);
            alert(`Failed to open camera preview: ${previewResult.error}`);
          } else {
            console.log('🔵 useScreenRecorder: ✅ Camera preview opened successfully!');
            // Give the window a moment to render before continuing
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error) {
          console.error('🔵 useScreenRecorder: Error opening camera preview:', error);
          alert(`Error opening camera preview: ${error}`);
        }
      } else {
        console.log('🔵 useScreenRecorder: No camera source found, skipping preview');
      }

      let mediaStream: MediaStream;
      let screenStream: MediaStream | null = null;
      let cameraStream: MediaStream | null = null;
      
      // Get screen stream if screen source exists
        if (foundScreenSource) {
          const screenAudioConfig = (foundScreenSource as any).audioConfig;
        const shouldCaptureSystemAudio = screenAudioConfig?.mediaEnabled;
        
          if (foundScreenSource.id === 'screen:web' || (foundScreenSource.type === 'screen' && !window.electronAPI)) {
          // Web screen sharing using getDisplayMedia
          // Request system audio if enabled
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 60, max: 60 }
            },
            audio: shouldCaptureSystemAudio || false
          });
        } else {
          // Desktop recording (Electron only)
          if (!window.electronAPI) {
            throw new Error("Desktop recording is only available in Electron");
          }
          
          // Try to request audio directly with desktop capture first
          // Some Electron versions/platforms may support this
          if (shouldCaptureSystemAudio) {
            try {
              console.log('🔵 useScreenRecorder: Attempting to capture system audio with desktop source');
              screenStream = await (navigator.mediaDevices as any).getUserMedia({
                audio: {
                  mandatory: {
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: foundScreenSource.id
                  }
                },
                video: {
                  mandatory: {
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: foundScreenSource.id,
                    frameRate: { ideal: 60, max: 60 }
                  },
                },
              });
              if (screenStream) {
                console.log('🔵 useScreenRecorder: Desktop capture with audio succeeded, audio tracks:', screenStream.getAudioTracks().length);
              }
            } catch (audioError) {
              console.warn('🔵 useScreenRecorder: Desktop capture with audio failed, trying video only:', audioError);
              // Fallback: get video only, then try getDisplayMedia for audio
              screenStream = await (navigator.mediaDevices as any).getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: foundScreenSource.id,
                    frameRate: { ideal: 60, max: 60 }
                  },
                },
              });
              
              // Try getDisplayMedia for system audio as fallback
              if (screenStream && shouldCaptureSystemAudio) {
                const currentScreenStream = screenStream; // Capture for closure
                try {
                  console.log('🔵 useScreenRecorder: Attempting getDisplayMedia for system audio');
                  const systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
                    video: false,
                    audio: true
                  });
                  const systemAudioTracks = systemAudioStream.getAudioTracks();
                  console.log('🔵 useScreenRecorder: getDisplayMedia audio tracks:', systemAudioTracks.length);
                  if (systemAudioTracks.length > 0 && currentScreenStream) {
                    systemAudioTracks.forEach(track => {
                      currentScreenStream.addTrack(track);
                    });
                    audioTracksRef.current.push(...systemAudioTracks);
                    globalAudioTracks.push(...systemAudioTracks);
                    console.log('🔵 useScreenRecorder: Successfully added system audio tracks via getDisplayMedia');
                  }
                } catch (displayMediaError) {
                  console.error('🔵 useScreenRecorder: getDisplayMedia for audio also failed:', displayMediaError);
                  console.warn('🔵 useScreenRecorder: System audio capture not available. This may be a platform limitation.');
                }
              }
            }
          } else {
            // No system audio requested, just get video
          screenStream = await (navigator.mediaDevices as any).getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: "desktop",
                  chromeMediaSourceId: foundScreenSource.id,
                frameRate: { ideal: 60, max: 60 }
              },
            },
          });
          }
        }
        
        // Store audio tracks from screen stream if system audio was captured
        // (For web getDisplayMedia, audio tracks are already in the stream)
        if (screenStream && screenStream.getAudioTracks().length > 0) {
          // Only add tracks that aren't already tracked (avoid duplicates)
          const newTracks = screenStream.getAudioTracks().filter(track => 
            !audioTracksRef.current.some(existing => existing.id === track.id)
          );
          if (newTracks.length > 0) {
            audioTracksRef.current.push(...newTracks);
            globalAudioTracks.push(...newTracks);
            console.log('🔵 useScreenRecorder: Added system audio tracks from screen stream:', newTracks.length);
          }
        }
      }
      
      // Get camera stream if camera source exists
      if (cameraSource) {
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
            audioConstraints = true;
          }
        }
        
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60, max: 60 }
          },
          audio: audioConstraints
        });
        
        // Store camera stream reference for stopping during recording
        cameraStreamRef.current = cameraStream;
        globalCameraStream = cameraStream;
        
        // Store camera mic audio tracks (append, don't replace, to preserve system audio from screen)
        const cameraAudioTracks = cameraStream.getAudioTracks();
        // Only add camera audio tracks that aren't already tracked (avoid duplicates)
        const newCameraAudioTracks = cameraAudioTracks.filter(track => 
          !audioTracksRef.current.some(existing => existing.id === track.id)
        );
        if (newCameraAudioTracks.length > 0) {
          audioTracksRef.current.push(...newCameraAudioTracks);
          globalAudioTracks.push(...newCameraAudioTracks);
          console.log('🔵 useScreenRecorder: Added camera mic audio tracks:', newCameraAudioTracks.length);
        }
        
        // If system audio is enabled for camera (only if screen didn't already handle it)
        // This block is now only for system audio when camera is the primary source for audio
        if (audioConfig?.mediaEnabled && !foundScreenSource) {
          try {
            const systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
              video: false,
              audio: true
            });
            const systemAudioTracks = systemAudioStream.getAudioTracks();
            systemAudioTracks.forEach(track => {
              cameraStream!.addTrack(track);
            });
            // Only add system audio tracks that aren't already tracked
            const newSystemAudioTracks = systemAudioTracks.filter(track => 
              !audioTracksRef.current.some(existing => existing.id === track.id)
            );
            if (newSystemAudioTracks.length > 0) {
              audioTracksRef.current.push(...newSystemAudioTracks);
              globalAudioTracks.push(...newSystemAudioTracks);
              console.log('🔵 useScreenRecorder: Added system audio tracks from camera source:', newSystemAudioTracks.length);
            }
          } catch (error) {
            console.warn('🔵 useScreenRecorder: Could not capture system audio for camera:', error);
          }
        }
      }
      
      // Choose main recording stream (screen preferred), and attach audio tracks to it.
      if (screenStream && cameraStream) {
        mediaStream = screenStream;
        
        // Log all audio tracks before combining
        console.log('🔵 useScreenRecorder: Before combining - screenStream audio tracks:', screenStream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled, muted: t.muted })));
        console.log('🔵 useScreenRecorder: Before combining - cameraStream audio tracks:', cameraStream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled, muted: t.muted })));
        
        // Collect all audio tracks from both streams
        const allAudioTracks: MediaStreamTrack[] = [];
        
        // Add system audio tracks from screen stream
        screenStream.getAudioTracks().forEach(track => {
          allAudioTracks.push(track);
          console.log('🔵 useScreenRecorder: Adding system audio track from screen:', track.id, track.label);
        });
        
        // Add mic audio tracks from camera stream (avoid duplicates)
        cameraStream.getAudioTracks().forEach(track => {
          const isDuplicate = screenStream.getAudioTracks().some(screenTrack => screenTrack.id === track.id);
          if (!isDuplicate) {
            allAudioTracks.push(track);
            console.log('🔵 useScreenRecorder: Adding camera mic track:', track.id, track.label);
          } else {
            console.log('🔵 useScreenRecorder: Skipping duplicate track:', track.id);
          }
        });
        
        // If we have multiple audio tracks, we need to mix them using AudioContext
        // because MediaRecorder typically only records one audio track
        if (allAudioTracks.length > 1) {
          console.log('🔵 useScreenRecorder: Multiple audio tracks detected, creating mixed audio track');
          
          // Remove all existing audio tracks from mediaStream
          mediaStream.getAudioTracks().forEach(track => {
            mediaStream.removeTrack(track);
        });
        
          // Create AudioContext to mix audio tracks
          const audioContext = new AudioContext();
          audioContextRef.current = audioContext; // Store for cleanup
          
          // Resume AudioContext if suspended (required by some browsers)
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          
          const destination = audioContext.createMediaStreamDestination();
        
          // Connect all audio tracks to the destination (mixing them)
          allAudioTracks.forEach(track => {
            if (track.enabled && track.readyState === 'live') {
              try {
                const source = audioContext.createMediaStreamSource(new MediaStream([track]));
                source.connect(destination);
                console.log('🔵 useScreenRecorder: Connected audio track to mixer:', track.id, track.label);
              } catch (error) {
                console.error('🔵 useScreenRecorder: Failed to connect audio track:', track.id, error);
              }
            }
          });
        
          // Add the mixed audio track to the mediaStream
          const mixedAudioTrack = destination.stream.getAudioTracks()[0];
          if (mixedAudioTrack) {
            mediaStream.addTrack(mixedAudioTrack);
            console.log('🔵 useScreenRecorder: Added mixed audio track to stream:', mixedAudioTrack.id);
          } else {
            console.warn('🔵 useScreenRecorder: Failed to create mixed audio track, adding tracks individually');
            // Fallback: add tracks individually
            allAudioTracks.forEach(track => {
              track.enabled = true;
              mediaStream.addTrack(track);
            });
            // Clean up AudioContext if we're not using it
            if (audioContextRef.current) {
              await audioContextRef.current.close();
              audioContextRef.current = null;
            }
          }
        } else if (allAudioTracks.length === 1) {
          // Only one audio track, just ensure it's in the stream
          const existingTrack = mediaStream.getAudioTracks().find(t => t.id === allAudioTracks[0].id);
          if (!existingTrack) {
            allAudioTracks[0].enabled = true;
            mediaStream.addTrack(allAudioTracks[0]);
          }
        }
        
        // Ensure all existing tracks in mediaStream are enabled
        mediaStream.getAudioTracks().forEach(track => {
          track.enabled = true;
        });
        
        console.log('🔵 useScreenRecorder: After combining - total audio tracks:', mediaStream.getAudioTracks().length);
        console.log('🔵 useScreenRecorder: Final audio tracks:', mediaStream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled, muted: t.muted })));
      } else if (cameraSource && !foundScreenSource) {
        // Camera only - use camera stream directly
        mediaStream = cameraStream!;
      } else if (foundScreenSource && !cameraSource) {
        // Screen only - use screen stream directly (may already have system audio if mediaEnabled was true)
        mediaStream = screenStream!;
      } else {
        // Fallback: use first source (backward compatibility)
        const selectedSource = sources[0];
        if (selectedSource && (selectedSource.type === 'camera' || selectedSource.id.startsWith('camera:'))) {
          const deviceId = selectedSource.id.replace('camera:', '');
          const audioConfig = (selectedSource as any).audioConfig;
          let audioConstraints: boolean | MediaTrackConstraints = false;
          
          if (audioConfig?.micEnabled) {
            if (audioConfig.micDeviceId && audioConfig.micDeviceId !== 'default') {
              audioConstraints = { deviceId: { exact: audioConfig.micDeviceId } };
            } else {
              audioConstraints = true;
            }
          }
          
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { 
              deviceId: { exact: deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 60, max: 60 }
            },
            audio: audioConstraints
          });
        } else if (selectedSource.id === 'screen:web' || (selectedSource.type === 'screen' && !window.electronAPI)) {
          mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 60, max: 60 }
            },
            audio: false
          });
        } else {
          if (!window.electronAPI) {
            throw new Error("Desktop recording is only available in Electron");
          }
          mediaStream = await (navigator.mediaDevices as any).getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: selectedSource.id,
                frameRate: { ideal: 60, max: 60 }
              },
            },
          });
        }
      }
      stream.current = mediaStream;
      globalRecordingStream = mediaStream; // Store globally for stopping tracks
      if (!stream.current) {
        throw new Error("Media stream is not available.");
      }
      const videoTrack = stream.current.getVideoTracks()[0];
      let { width = 1920, height = 1080 } = videoTrack.getSettings();
      
      // Ensure dimensions are divisible by 2 for VP9/AV1 codec compatibility
      width = Math.floor(width / 2) * 2;
      height = Math.floor(height / 2) * 2;
      
      console.log(`Recording at ${width}x${height}`);
      
      const totalPixels = width * height;
      // Use visually lossless bitrates optimized for quality and file size balance
      let bitrate = 30_000_000;
      if (totalPixels > 1920 * 1080 && totalPixels <= 2560 * 1440) {
        bitrate = 50_000_000;
      } else if (totalPixels > 2560 * 1440) {
        bitrate = 80_000_000;
      }
      chunks.current = [];
      cameraChunks.current = [];
      
      // Ensure all audio tracks are enabled and active before recording
      stream.current.getAudioTracks().forEach(track => {
        if (!track.enabled) {
          console.log('🔵 useScreenRecorder: Enabling audio track:', track.id);
          track.enabled = true;
        }
        if (track.muted) {
          console.log('🔵 useScreenRecorder: Audio track is muted (read-only):', track.id);
        }
      });
      
      // Log all tracks in the final stream before creating MediaRecorder
      console.log('🔵 useScreenRecorder: Final stream before MediaRecorder - video tracks:', stream.current.getVideoTracks().length);
      console.log('🔵 useScreenRecorder: Final stream before MediaRecorder - audio tracks:', stream.current.getAudioTracks().length);
      stream.current.getAudioTracks().forEach((track, index) => {
        console.log(`🔵 useScreenRecorder: Audio track ${index}:`, {
          id: track.id,
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          kind: track.kind,
          settings: track.getSettings()
        });
      });
      
      // Check if stream has audio tracks
      const hasAudio = stream.current.getAudioTracks().length > 0;
      
      // Prefer AV1 codec for better compression, fallback to VP9 then VP8
      // Include audio codec if audio is present
      const supportedCodecs = hasAudio
        ? [
            'video/webm;codecs=av1,opus',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=av1',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8'
          ]
        : [
            'video/webm;codecs=av1',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8'
          ];
      const mimeType = supportedCodecs.find(codec => MediaRecorder.isTypeSupported(codec)) || (hasAudio ? 'video/webm;codecs=vp9,opus' : 'video/webm;codecs=vp9');
      const recorder = new MediaRecorder(stream.current, { 
        mimeType, 
        videoBitsPerSecond: bitrate,
        audioBitsPerSecond: hasAudio ? 128000 : undefined
      });
      mediaRecorder.current = recorder;
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.current = null;
        const duration = Date.now() - startTime.current;
        const timestamp = Date.now();
        const videoFileName = `recording-${timestamp}.webm`;
        const cameraFileName = `recording-${timestamp}-camera.webm`;

        try {
          if (chunks.current.length > 0) {
            const buggyBlob = new Blob(chunks.current, { type: mimeType });
            chunks.current = [];
          const videoBlob = await fixWebmDuration(buggyBlob, duration);
          const arrayBuffer = await videoBlob.arrayBuffer();
          const videoResult = await apiBridge.storeRecordedVideo(arrayBuffer, videoFileName);
          if (!videoResult.success) {
            console.error('Failed to store video:', videoResult.message);
            return;
            }
          }

          // Store camera-only recording if available
          if (cameraChunks.current.length > 0) {
            const cameraBlob = new Blob(cameraChunks.current, { type: mimeType });
            cameraChunks.current = [];
            const cameraArrayBuffer = await cameraBlob.arrayBuffer();
            const cameraResult = await apiBridge.storeRecordedCameraVideo(cameraArrayBuffer, cameraFileName);
            if (!cameraResult.success) {
              console.error('Failed to store camera video:', cameraResult.message);
            }
          }

          await apiBridge.switchToEditor();
        } catch (error) {
          console.error('Error saving recording:', error);
        }
      };
      recorder.onerror = () => setRecording(false);
      // Create separate recorder for camera video-only, if we have camera stream
      if (cameraStream) {
        const cameraVideoTrack = cameraStream.getVideoTracks()[0];
        if (cameraVideoTrack) {
          cameraRecordingStream.current = new MediaStream([cameraVideoTrack]);
          const cameraRec = new MediaRecorder(cameraRecordingStream.current, { mimeType });
          cameraRecorder.current = cameraRec;
          cameraRec.ondataavailable = e => {
            if (e.data && e.data.size > 0) cameraChunks.current.push(e.data);
          };
          cameraRec.onerror = () => {
            console.warn('Camera recorder error');
          };
          cameraRec.start(5000);
        }
      }

      // Use larger timeslice to reduce recording overhead and improve smoothness
      recorder.start(5000);
      startTime.current = Date.now();
      setRecording(true);
      
      // Check if auto-zoom is enabled for screen recording
      const foundScreenSourceForZoom = sources.find(s => 
        s.type === 'screen' || s.id?.startsWith('screen:') || s.id?.startsWith('window:')
      );
      const autoZoomEnabled = foundScreenSourceForZoom?.autoZoomEnabled || false;
      await apiBridge.setRecordingState(true, autoZoomEnabled);
      
      // Set up click detection if auto-zoom is enabled
      if (autoZoomEnabled && typeof window !== 'undefined' && window.electronAPI) {
        console.log('🔵 useScreenRecorder: Auto-zoom enabled, setting up click detection');
        const cleanup = setupAutoZoomClickDetection();
        autoZoomCleanupRef.current = cleanup;
        console.log('🔵 useScreenRecorder: Click detection setup complete');
      } else {
        console.log('🔵 useScreenRecorder: Auto-zoom not enabled or electronAPI not available', { autoZoomEnabled, hasElectronAPI: typeof window !== 'undefined' && !!window.electronAPI });
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      setRecording(false);
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
    }
  };

  const setupAutoZoomClickDetection = () => {
    console.log('🔵 useScreenRecorder: Setting up auto-zoom click detection');
    
    // Initialize auto-zoom events array in localStorage (shared across windows)
    localStorage.setItem('autoZoomEvents', JSON.stringify([]));
    console.log('🔵 useScreenRecorder: Initialized autoZoomEvents in localStorage');
    
    // Listen for click events from Electron main process
    const handleClickEvent = (_event: any, data: { x: number; y: number; timestamp: number }) => {
      console.log('🔵 useScreenRecorder: Received auto-zoom click event:', data);
      const recordingStartTime = startTime.current;
      // Use the timestamp from data (which is already relative to recording start from main process)
      // If not provided, calculate relative time
      const relativeTime = data.timestamp || (Date.now() - recordingStartTime);
      
      // Store zoom event in localStorage (shared across windows)
      const eventsStr = localStorage.getItem('autoZoomEvents') || '[]';
      const events = JSON.parse(eventsStr);
      events.push({
        x: data.x,
        y: data.y,
        timestamp: relativeTime, // Relative to recording start in milliseconds
      });
      localStorage.setItem('autoZoomEvents', JSON.stringify(events));
      
      console.log('🔵 useScreenRecorder: Auto-zoom click stored:', { x: data.x, y: data.y, time: relativeTime, totalEvents: events.length });
      console.log('🔵 useScreenRecorder: All events in localStorage:', JSON.stringify(events));
    };
    
    // Set up IPC listener if in Electron
    const electronAPI = window.electronAPI as any;
    if (typeof window !== 'undefined' && electronAPI?.on) {
      console.log('🔵 useScreenRecorder: Registering IPC listener for auto-zoom-click-event');
      console.log('🔵 useScreenRecorder: electronAPI.on exists?', !!electronAPI.on);
      console.log('🔵 useScreenRecorder: handleClickEvent function:', typeof handleClickEvent);
      
      try {
        // Register the listener
        electronAPI.on('auto-zoom-click-event', handleClickEvent);
        console.log('🔵 useScreenRecorder: IPC listener registered successfully');
        
        // Verify localStorage is initialized
        const testEvents = localStorage.getItem('autoZoomEvents');
        console.log('🔵 useScreenRecorder: Current autoZoomEvents in localStorage:', testEvents);
      } catch (error) {
        console.error('🔵 useScreenRecorder: Error registering IPC listener:', error);
      }
    } else {
      console.warn('🔵 useScreenRecorder: Cannot register IPC listener - window.electronAPI?.on not available', {
        hasWindow: typeof window !== 'undefined',
        hasElectronAPI: !!window.electronAPI,
        hasOn: !!(window.electronAPI as any)?.on
      });
    }
    
    // Return cleanup function
    return () => {
      if (typeof window !== 'undefined' && electronAPI?.off) {
        console.log('🔵 useScreenRecorder: Cleaning up auto-zoom click detection listener');
        try {
          electronAPI.off('auto-zoom-click-event', handleClickEvent);
        } catch (error) {
          console.error('🔵 useScreenRecorder: Error removing IPC listener:', error);
        }
      }
    };
  };

  const toggleRecording = async () => {
    if (recording) {
      await stopRecording.current();
    } else {
      await startRecording();
    }
  };

  return { recording, toggleRecording };
}

// Export functions to stop camera/mic tracks during recording
export function stopCameraTrack(): boolean {
  if (globalRecordingStream) {
    const videoTracks = globalRecordingStream.getVideoTracks().filter(t => 
      globalCameraStream?.getVideoTracks().some(ct => ct.id === t.id)
    );
    videoTracks.forEach(track => {
      track.stop();
      globalRecordingStream?.removeTrack(track);
    });
    if (globalCameraStream) {
      globalCameraStream.getVideoTracks().forEach(track => track.stop());
    }
    return videoTracks.length > 0;
  }
  return false;
}

export function stopMicTrack(): boolean {
  if (globalRecordingStream) {
    const audioTracks = globalRecordingStream.getAudioTracks();
    audioTracks.forEach(track => {
      track.stop();
      globalRecordingStream?.removeTrack(track);
    });
    globalAudioTracks.forEach(track => track.stop());
    globalAudioTracks = [];
    return audioTracks.length > 0;
  }
  return false;
}
