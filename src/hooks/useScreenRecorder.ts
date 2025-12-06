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
    await apiBridge.setRecordingState(false);
    
    // Stop camera stream and close preview when recording stops
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
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
      const screenSource = sources.find(s => 
        s.type === 'screen' || s.id?.startsWith('screen:') || s.id?.startsWith('window:')
      );

      console.log('🔵 useScreenRecorder: cameraSource found?', !!cameraSource, cameraSource);
      console.log('🔵 useScreenRecorder: screenSource found?', !!screenSource, screenSource);

      // If a camera preview window is already open while also capturing the screen,
      // close it to avoid the camera UI being baked into the screen recording.
      if (cameraSource && screenSource) {
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
      if (cameraSource && !screenSource) {
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
      let compositedStream: MediaStream | null = null;
      
      // Get screen stream if screen source exists
      if (screenSource) {
        if (screenSource.id === 'screen:web' || (screenSource.type === 'screen' && !window.electronAPI)) {
          // Web screen sharing using getDisplayMedia
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 60, max: 60 }
            },
            audio: false
          });
        } else {
          // Desktop recording (Electron only)
          if (!window.electronAPI) {
            throw new Error("Desktop recording is only available in Electron");
          }
          screenStream = await (navigator.mediaDevices as any).getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: screenSource.id,
                frameRate: { ideal: 60, max: 60 }
              },
            },
          });
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
        
        // Store audio tracks for stopping during recording
        audioTracksRef.current = cameraStream.getAudioTracks();
        globalAudioTracks = [...cameraStream.getAudioTracks()];
        
        // If system audio is enabled, try to get it via getDisplayMedia
        if (audioConfig?.mediaEnabled) {
          try {
            const systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
              video: false,
              audio: true
            });
            const systemAudioTracks = systemAudioStream.getAudioTracks();
            systemAudioTracks.forEach(track => {
              cameraStream!.addTrack(track);
            });
            audioTracksRef.current.push(...systemAudioTracks);
            globalAudioTracks.push(...systemAudioTracks);
          } catch (error) {
            console.warn('Could not capture system audio:', error);
          }
        }
      }
      
      // Choose main recording stream (screen preferred), and attach audio tracks to it.
      if (screenStream && cameraStream) {
        mediaStream = screenStream;
        // Attach all audio tracks (mic + system) from camera stream to main screen stream
        cameraStream.getAudioTracks().forEach(track => {
          mediaStream.addTrack(track);
        });
      } else if (cameraSource && !screenSource) {
        // Camera only - use camera stream directly
        mediaStream = cameraStream!;
      } else if (screenSource && !cameraSource) {
        // Screen only - use screen stream directly
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
      await apiBridge.setRecordingState(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setRecording(false);
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
    }
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
