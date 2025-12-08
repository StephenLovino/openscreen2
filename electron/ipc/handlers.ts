import { ipcMain, desktopCapturer, BrowserWindow, shell, app, dialog } from 'electron'

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RECORDINGS_DIR } from '../main'
import { readAhaConfig, saveAhaConfig, deleteAhaConfig, hasAhaConfig } from '../config/ahaConfig'
import { uploadMedia, getMediaUrl, verifyApiKey } from '../api/highlevelApi'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let selectedSource: any = null
let selectedSources: any[] = [] // Support multiple sources
let lastGetSourcesLogTime = 0 // For throttling logs

export function registerIpcHandlers(
  createEditorWindow: () => void,
  createSourceSelectorWindow: (mode?: 'screen' | 'camera') => BrowserWindow,
  getMainWindow: () => BrowserWindow | null,
  getSourceSelectorWindow: () => BrowserWindow | null,
  onRecordingStateChange?: (recording: boolean, sourceName: string) => void,
  getCameraPreviewWindow?: () => BrowserWindow | null,
  createCameraPreviewWindow?: () => BrowserWindow,
  closeCameraPreviewWindow?: () => void,
  createCameraWarningDialogWindow?: () => BrowserWindow,
  closeCameraWarningDialogWindow?: () => void,
  getCameraWarningDialogWindow?: () => BrowserWindow | null,
  createSettingsWindow?: () => BrowserWindow
) {
  ipcMain.handle('get-sources', async (_, opts) => {
    const sources = await desktopCapturer.getSources(opts)
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }))
  })

  ipcMain.handle('select-source', (_, source) => {
    selectedSource = source
    const sourceSelectorWin = getSourceSelectorWindow()
    if (sourceSelectorWin) {
      sourceSelectorWin.close()
    }
    return selectedSource
  })

  ipcMain.handle('select-sources', (_, sources: any[]) => {
    console.log('🔵 IPC: select-sources called with sources:', JSON.stringify(sources, null, 2));

    // Merge new sources with any existing ones so that screen + camera
    // selections from separate flows are combined instead of overwriting.
    const merged: Record<string, any> = {};
    for (const s of selectedSources) {
      if (s?.id) merged[s.id] = s;
    }
    for (const s of sources) {
      if (s?.id) merged[s.id] = s;
    }
    selectedSources = Object.values(merged);

    // Keep first source for backward compatibility APIs
    selectedSource = selectedSources.length > 0 ? selectedSources[0] : null;

    console.log('🔵 IPC: Stored selectedSources:', selectedSources.length, 'sources');
    const hasCamera = selectedSources.some(s => s.type === 'camera' || s.id?.startsWith('camera:'));
    console.log('🔵 IPC: Camera source found?', hasCamera);
    
    // Don't close the window immediately - let the renderer process handle it
    // This allows async operations (like opening camera preview) to complete
    // The renderer will close the window after opening the preview
    // const sourceSelectorWin = getSourceSelectorWindow()
    // if (sourceSelectorWin) {
    //   sourceSelectorWin.close()
    // }
    
    return selectedSources
  })

  ipcMain.handle('get-selected-source', () => {
    return selectedSource
  })

  ipcMain.handle('get-selected-sources', () => {
    const result = selectedSources.length > 0 ? selectedSources : (selectedSource ? [selectedSource] : [])
    // Only log if there are sources and throttle to avoid spam
    if (result.length > 0 && Date.now() - lastGetSourcesLogTime > 5000) {
      const sourceSummary = result.map(s => `${s.type || 'unknown'}:${s.id?.substring(0, 20)}...`).join(', ');
      console.log('🔵 IPC: get-selected-sources returning:', result.length, 'sources:', sourceSummary);
      lastGetSourcesLogTime = Date.now();
    }
    return result
  })

  ipcMain.handle('open-source-selector', (_, mode?: 'screen' | 'camera') => {
    console.log('🔵 IPC: open-source-selector called with mode:', mode);
    const sourceSelectorWin = getSourceSelectorWindow()
    if (sourceSelectorWin && !sourceSelectorWin.isDestroyed()) {
      // Always reload with the new mode to ensure it's detected
      const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
      console.log('🔵 IPC: VITE_DEV_SERVER_URL:', VITE_DEV_SERVER_URL);
      
      if (VITE_DEV_SERVER_URL) {
        // Construct URL with mode parameter
        const baseUrl = VITE_DEV_SERVER_URL.endsWith('/') 
          ? VITE_DEV_SERVER_URL.slice(0, -1) 
          : VITE_DEV_SERVER_URL;
        const url = mode 
          ? `${baseUrl}?windowType=source-selector&mode=${mode}`
          : `${baseUrl}?windowType=source-selector`;
        console.log('🔵 IPC: Reloading window with URL:', url);
        sourceSelectorWin.webContents.loadURL(url);
      } else {
        const APP_ROOT = path.join(__dirname, '..')
        const RENDERER_DIST = path.join(APP_ROOT, 'dist')
        const query: any = { windowType: 'source-selector' };
        if (mode) {
          query.mode = mode;
        }
        console.log('🔵 IPC: Loading file with query:', query);
        sourceSelectorWin.webContents.loadFile(path.join(RENDERER_DIST, 'index.html'), { query })
      }
      sourceSelectorWin.focus()
      return
    }
    console.log('🔵 IPC: Creating new source selector window with mode:', mode);
    createSourceSelectorWindow(mode)
  })

  ipcMain.handle('switch-to-editor', () => {
    const mainWin = getMainWindow()
    if (mainWin) {
      mainWin.close()
    }
    createEditorWindow()
  })

  ipcMain.handle('open-settings', () => {
    if (createSettingsWindow) {
      createSettingsWindow()
    }
  })

  ipcMain.handle('store-recorded-video', async (_, videoData: ArrayBuffer, fileName: string) => {
    try {
      const videoPath = path.join(RECORDINGS_DIR, fileName)
      await fs.writeFile(videoPath, Buffer.from(videoData))
      currentVideoPath = videoPath;
      return {
        success: true,
        path: videoPath,
        message: 'Video stored successfully'
      }
    } catch (error) {
      console.error('Failed to store video:', error)
      return {
        success: false,
        message: 'Failed to store video',
        error: String(error)
      }
    }
  })



  ipcMain.handle('get-recorded-video-path', async () => {
    try {
      const files = await fs.readdir(RECORDINGS_DIR)
      const videoFiles = files.filter(file => file.endsWith('.webm'))
      
      if (videoFiles.length === 0) {
        return { success: false, message: 'No recorded video found' }
      }
      
      const latestVideo = videoFiles.sort().reverse()[0]
      const videoPath = path.join(RECORDINGS_DIR, latestVideo)
      
      return { success: true, path: videoPath }
    } catch (error) {
      console.error('Failed to get video path:', error)
      return { success: false, message: 'Failed to get video path', error: String(error) }
    }
  })

  // Auto-zoom click detection
  let clickDetectionProcess: any = null;
  let recordingStartTime = 0;
  let autoZoomEnabled = false;
  let screenBounds: { width: number; height: number } | null = null;
  let lastClickTime = 0;
  const CLICK_DEBOUNCE_MS = 100; // Prevent duplicate clicks

  // Function to handle mouse click detection
  const handleMouseClick = (x: number, y: number) => {
    if (!autoZoomEnabled) return;
    
    const now = Date.now();
    // Debounce: ignore clicks within 100ms of each other
    if (now - lastClickTime < CLICK_DEBOUNCE_MS) {
      return;
    }
    lastClickTime = now;
    
    const relativeTime = now - recordingStartTime;
    
    // Normalize coordinates relative to screen bounds
    // Note: This assumes the video source matches the screen dimensions
    // For window-specific sources, coordinates might need adjustment when video loads
    let normalizedX = 0.5;
    let normalizedY = 0.5;
    
    if (screenBounds && screenBounds.width > 0 && screenBounds.height > 0) {
      // Clamp coordinates to screen bounds and normalize to 0-1
      const clampedX = Math.max(0, Math.min(screenBounds.width, x));
      const clampedY = Math.max(0, Math.min(screenBounds.height, y));
      normalizedX = clampedX / screenBounds.width;
      normalizedY = clampedY / screenBounds.height;
    }
    
    console.log('🔵 Auto-zoom: Mouse click detected at:', { 
      normalized: { x: normalizedX, y: normalizedY }, 
      absolute: { x, y },
      screenBounds,
      time: relativeTime 
    });
    
    // Send click event to renderer (HUD overlay window)
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('auto-zoom-click-event', {
        x: normalizedX,
        y: normalizedY,
        timestamp: relativeTime
      });
      console.log('🔵 Auto-zoom: Click event sent successfully');
    } else {
      console.warn('🔵 Auto-zoom: Cannot send click event - main window is null or destroyed');
    }
  };

  /**
   * Cross-platform mouse click detection for auto-zoom feature
   * 
   * Platform-specific approaches:
   * 
   * LINUX (Current Implementation):
   *   - Uses `xinput` command-line tool to monitor mouse button events
   *   - Dynamically finds mouse device ID by scanning `xinput list` output
   *   - Works for all users regardless of their mouse device ID
   *   - No additional dependencies required
   * 
   * macOS (TODO):
   *   Option 1: CGEventTap API (Recommended)
   *     - Native macOS API for global event monitoring
   *     - Requires native module or Electron's native API access
   *     - Most reliable and performant
   *     - May require accessibility permissions
   * 
   *   Option 2: iohook npm package
   *     - Cross-platform native module: npm install iohook
   *     - Works on Linux, macOS, and Windows
   *     - Requires compilation of native bindings
   *     - Example: https://github.com/wilix-team/iohook
   * 
   *   Option 3: robotjs npm package
   *     - Cross-platform native module: npm install robotjs
   *     - Primarily for automation but can monitor events
   *     - Requires compilation of native bindings
   * 
   * WINDOWS (TODO):
   *   Option 1: SetWindowsHookEx API (Recommended)
   *     - Native Windows API for global hooks
   *     - Requires native module or Electron's native API access
   *     - Most reliable and performant
   *     - May require elevated permissions
   * 
   *   Option 2: iohook npm package
   *     - Same as macOS Option 2
   *     - Cross-platform solution
   * 
   *   Option 3: robotjs npm package
   *     - Same as macOS Option 3
   *     - Cross-platform solution
   */
  const startMouseClickDetection = async () => {
    const { screen } = await import('electron');
    const os = await import('os');
    const platform = os.platform();
    
    console.log('🔵 Auto-zoom: Starting mouse click detection on platform:', platform);
    
    // Platform-specific implementations
    if (platform === 'linux') {
      await startLinuxMouseClickDetection(screen);
    } else if (platform === 'darwin') {
      // macOS - TODO: Implement using CGEventTap or native module
      console.warn('🔵 Auto-zoom: macOS mouse click detection not yet implemented');
      console.log('🔵 Auto-zoom: For macOS, consider using:');
      console.log('   1. CGEventTap API (requires native module)');
      console.log('   2. iohook npm package (cross-platform native module)');
      console.log('   3. robotjs npm package (cross-platform native module)');
    } else if (platform === 'win32') {
      // Windows - TODO: Implement using Windows API hooks or native module
      console.warn('🔵 Auto-zoom: Windows mouse click detection not yet implemented');
      console.log('🔵 Auto-zoom: For Windows, consider using:');
      console.log('   1. SetWindowsHookEx API (requires native module)');
      console.log('   2. iohook npm package (cross-platform native module)');
      console.log('   3. robotjs npm package (cross-platform native module)');
    } else {
      console.warn('🔵 Auto-zoom: Unsupported platform:', platform);
    }
  };

  // Linux-specific mouse click detection using xinput
  const startLinuxMouseClickDetection = async (screen: typeof import('electron').screen) => {
    const { spawn, exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      // Find the mouse device ID by searching for slave pointer devices
      const { stdout: deviceList } = await execAsync('xinput list');
      const lines = deviceList.split('\n');
      
      let mouseDeviceId: string | null = null;
      // First, try to find a real physical mouse device (exclude XTEST and virtual devices)
      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        // Look for real mouse devices, exclude virtual/XTEST devices
        if ((lowerLine.includes('mouse') || lowerLine.includes('trackpad') || lowerLine.includes('touchpad'))
            && !lowerLine.includes('xtest')
            && !lowerLine.includes('virtual core')
            && !lowerLine.includes('master pointer')
            && lowerLine.includes('slave')) {
          const match = line.match(/id=(\d+)/);
          if (match) {
            mouseDeviceId = match[1];
            console.log('🔵 Auto-zoom: Found real mouse device:', line.trim(), 'ID:', mouseDeviceId);
            break;
          }
        }
      }
      
      // If no real device found, try any slave pointer device (excluding XTEST)
      if (!mouseDeviceId) {
        for (const line of lines) {
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('slave') 
              && lowerLine.includes('pointer')
              && !lowerLine.includes('xtest')
              && !lowerLine.includes('virtual core')
              && !lowerLine.includes('master')) {
            const match = line.match(/id=(\d+)/);
            if (match) {
              mouseDeviceId = match[1];
              console.log('🔵 Auto-zoom: Found pointer device (fallback):', line.trim(), 'ID:', mouseDeviceId);
              break;
            }
          }
        }
      }
      
      if (!mouseDeviceId) {
        console.warn('🔵 Auto-zoom: Could not find mouse device, click detection disabled');
        console.log('🔵 Auto-zoom: Available devices:', deviceList);
        return;
      }
      
      // Use device-specific test command (more reliable than test-xi2 --root)
      let xinputProcess: any = null;
      let useTestXi2 = false;
      
      try {
        // Use device-specific test command since we have a real mouse device
        xinputProcess = spawn('xinput', ['test', mouseDeviceId]);
        console.log('🔵 Auto-zoom: Using xinput test with device ID:', mouseDeviceId);
      } catch (error) {
        console.warn('🔵 Auto-zoom: test failed, trying test-xi2 --root:', error);
        useTestXi2 = true;
        try {
          xinputProcess = spawn('xinput', ['test-xi2', '--root']);
          console.log('🔵 Auto-zoom: Using xinput test-xi2 --root as fallback');
        } catch (xi2Error) {
          console.error('🔵 Auto-zoom: Both test methods failed:', xi2Error);
          return;
        }
      }
      
      let buttonPressed = false;
      let clickX = 0;
      let clickY = 0;
      
      xinputProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('🔵 Auto-zoom: Raw xinput output:', output.substring(0, 200)); // Log first 200 chars for debugging
        const lines = output.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          if (useTestXi2) {
            // xinput test-xi2 output format: structured events with type, detail, etc.
            // Example: "EVENT type 4 (ButtonPress) ..." or just look for button-related lines
            // The format can vary, so we check for button-related keywords
            const lowerLine = trimmedLine.toLowerCase();
            if (lowerLine.includes('button')) {
              // Check for press or release
              if (lowerLine.includes('press') || lowerLine.includes('down')) {
                buttonPressed = true;
                // Extract coordinates - test-xi2 might have root_x, root_y or x, y
                const xMatch = trimmedLine.match(/(?:root_)?x[=:]?\s*([\d.]+)/i);
                const yMatch = trimmedLine.match(/(?:root_)?y[=:]?\s*([\d.]+)/i);
                if (xMatch && yMatch) {
                  clickX = parseFloat(xMatch[1]);
                  clickY = parseFloat(yMatch[1]);
                } else {
                  // Fallback to cursor position
                  const cursorPoint = screen.getCursorScreenPoint();
                  clickX = cursorPoint.x;
                  clickY = cursorPoint.y;
                }
                console.log('🔵 Auto-zoom: Button pressed at:', { x: clickX, y: clickY, rawLine: trimmedLine });
              } else if ((lowerLine.includes('release') || lowerLine.includes('up')) && buttonPressed) {
                buttonPressed = false;
                console.log('🔵 Auto-zoom: Button released, handling click at:', { x: clickX, y: clickY });
                handleMouseClick(clickX, clickY);
              }
            }
          } else {
            // xinput test output format: "button press   1" or "button release   1"
            if (trimmedLine.includes('button press')) {
              buttonPressed = true;
              // Get cursor position when button is pressed
              const cursorPoint = screen.getCursorScreenPoint();
              clickX = cursorPoint.x;
              clickY = cursorPoint.y;
              console.log('🔵 Auto-zoom: Button pressed at:', { x: clickX, y: clickY });
            } else if (trimmedLine.includes('button release') && buttonPressed) {
              buttonPressed = false;
              // Handle the click
              console.log('🔵 Auto-zoom: Button released, handling click at:', { x: clickX, y: clickY });
              handleMouseClick(clickX, clickY);
            }
          }
        }
      });
      
      xinputProcess.stderr.on('data', (data: Buffer) => {
        const error = data.toString();
        // If test-xi2 fails, try falling back to test
        if (useTestXi2 && error.includes('Unable to find device') || error.includes('error')) {
          console.warn('🔵 Auto-zoom: test-xi2 failed, trying test with device ID:', mouseDeviceId);
          useTestXi2 = false;
          if (xinputProcess) {
            xinputProcess.kill();
          }
          try {
            xinputProcess = spawn('xinput', ['test', mouseDeviceId]);
            // Re-attach event handlers
            xinputProcess.stdout.on('data', (data: Buffer) => {
              const output = data.toString();
              const lines = output.split('\n');
              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;
                if (trimmedLine.includes('button press')) {
                  buttonPressed = true;
                  const cursorPoint = screen.getCursorScreenPoint();
                  clickX = cursorPoint.x;
                  clickY = cursorPoint.y;
                  console.log('🔵 Auto-zoom: Button pressed at:', { x: clickX, y: clickY });
                } else if (trimmedLine.includes('button release') && buttonPressed) {
                  buttonPressed = false;
                  handleMouseClick(clickX, clickY);
                }
              }
            });
            clickDetectionProcess = xinputProcess;
          } catch (fallbackError) {
            console.error('🔵 Auto-zoom: Fallback to test also failed:', fallbackError);
          }
        } else if (!error.includes('WARNING') && !error.includes('Unable to connect')) {
          console.error('🔵 Auto-zoom: xinput error:', error);
        }
      });
      
      xinputProcess.on('close', (code: number | null) => {
        console.log('🔵 Auto-zoom: xinput process closed with code:', code);
        if (code !== 0 && code !== null) {
          console.warn('🔵 Auto-zoom: xinput process exited unexpectedly');
        }
      });
      
      xinputProcess.on('error', (error: Error) => {
        console.error('🔵 Auto-zoom: xinput process error:', error);
      });
      
      clickDetectionProcess = xinputProcess;
      console.log('🔵 Auto-zoom: Linux mouse click detection started successfully');
      
    } catch (error) {
      console.error('🔵 Auto-zoom: Error starting Linux mouse click detection:', error);
    }
  };

  // Function to stop mouse click detection
  const stopMouseClickDetection = () => {
    if (clickDetectionProcess) {
      try {
        clickDetectionProcess.kill();
        clickDetectionProcess = null;
        console.log('🔵 Auto-zoom: Mouse click detection stopped');
      } catch (error) {
        console.error('🔵 Auto-zoom: Error stopping click detection:', error);
      }
    }
  };

  ipcMain.handle('set-recording-state', async (_, recording: boolean, autoZoom?: boolean) => {
    const source = selectedSource || { name: 'Screen' }
    if (onRecordingStateChange) {
      onRecordingStateChange(recording, source.name)
    }
    
    // Handle auto-zoom click detection
    autoZoomEnabled = autoZoom || false;
    
    if (recording && autoZoomEnabled) {
      // Start click detection
      recordingStartTime = Date.now();
      lastClickTime = 0;
      const { screen } = await import('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      screenBounds = {
        width: primaryDisplay.workAreaSize.width,
        height: primaryDisplay.workAreaSize.height
      };
      
      console.log('🔵 Auto-zoom: Starting mouse click detection');
      
      // Start mouse click detection
      await startMouseClickDetection();
    } else {
      // Stop click detection
      stopMouseClickDetection();
      console.log('🔵 Auto-zoom: Stopping click detection');
    }
  })

  // Handler to receive click events from renderer (when user clicks anywhere)
  ipcMain.on('auto-zoom-click', (_, data: { x: number; y: number, timestamp: number }) => {
    if (!autoZoomEnabled) return;
    
    const relativeTime = data.timestamp - recordingStartTime;
    const normalizedX = screenBounds ? data.x / screenBounds.width : 0.5;
    const normalizedY = screenBounds ? data.y / screenBounds.height : 0.5;
    
    // Store click event in sessionStorage (we'll do this from renderer)
    // For now, just log it
    console.log('🔵 Auto-zoom: Click detected at', { x: normalizedX, y: normalizedY, time: relativeTime });
    
    // Send to renderer to store in sessionStorage
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('auto-zoom-click-event', {
        x: normalizedX,
        y: normalizedY,
        timestamp: relativeTime
      });
    }
  })

  ipcMain.handle('open-camera-preview', () => {
    console.log('🔵 IPC: open-camera-preview called');
    console.log('🔵 IPC: createCameraPreviewWindow function exists?', !!createCameraPreviewWindow);
    if (createCameraPreviewWindow) {
      try {
        console.log('🔵 IPC: Calling createCameraPreviewWindow()...');
        const win = createCameraPreviewWindow();
        console.log('🔵 IPC: Camera preview window created with ID:', win?.id);
        console.log('🔵 IPC: Window is destroyed?', win?.isDestroyed());
        console.log('🔵 IPC: Window is visible?', win?.isVisible());
        
        // Force show the window after a short delay to ensure it's ready
        setTimeout(() => {
          if (win && !win.isDestroyed()) {
            console.log('🔵 IPC: Forcing window to show...');
            win.show();
            win.focus();
            win.setAlwaysOnTop(true, 'screen-saver');
            win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            console.log('🔵 IPC: Camera preview window forced to show. Is visible now?', win.isVisible());
          } else {
            console.error('🔵 IPC: Window is destroyed or null, cannot show');
          }
        }, 500);
        
        return { success: true };
      } catch (error) {
        console.error('🔵 IPC: Error creating camera preview window:', error);
        return { success: false, error: String(error) };
      }
    }
    console.error('🔵 IPC: createCameraPreviewWindow function not available');
    return { success: false, error: 'Camera preview not available' };
  });

  ipcMain.handle('close-camera-preview', () => {
    if (closeCameraPreviewWindow) {
      closeCameraPreviewWindow();
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('stop-camera-track', () => {
    // Import and call the stopCameraTrack function from useScreenRecorder
    // Note: This requires the recording to be active in the main window
    // We'll use IPC to communicate with the main window's renderer process
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('stop-camera-track-request');
      return { success: true };
    }
    return { success: false, error: 'Main window not available' };
  });

  ipcMain.handle('stop-mic-track', () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('stop-mic-track-request');
      return { success: true };
    }
    return { success: false, error: 'Main window not available' };
  });

  ipcMain.handle('resize-camera-preview', (_, width: number, height: number) => {
    const cameraPreviewWin = getCameraPreviewWindow?.();
    if (cameraPreviewWin && !cameraPreviewWin.isDestroyed()) {
      cameraPreviewWin.setSize(width, height, false);
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('open-external-url', async (_, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error('Failed to open URL:', error)
      return { success: false, error: String(error) }
    }
  })

  // Return base path for assets so renderer can resolve file:// paths in production
  ipcMain.handle('get-asset-base-path', () => {
    try {
      if (app.isPackaged) {
        // In packaged app, extraResources are in process.resourcesPath/assets/wallpapers
        return path.join(process.resourcesPath, 'assets')
      }
      // In development, wallpapers are in public/wallpapers
      return path.join(app.getAppPath(), 'public')
    } catch (err) {
      console.error('Failed to resolve asset base path:', err)
      return null
    }
  })

  ipcMain.handle('save-exported-video', async (_, videoData: ArrayBuffer, fileName: string) => {
    try {
      const isGif = fileName.endsWith('.gif');
      const result = await dialog.showSaveDialog({
        title: isGif ? 'Save Exported GIF' : 'Save Exported Video',
        defaultPath: path.join(app.getPath('downloads'), fileName),
        filters: [
          { name: isGif ? 'GIF Image' : 'MP4 Video', extensions: [isGif ? 'gif' : 'mp4'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['createDirectory', 'showOverwriteConfirmation']
      });

      if (result.canceled || !result.filePath) {
        return {
          success: false,
          cancelled: true,
          message: 'Export cancelled'
        };
      }
      await fs.writeFile(result.filePath, Buffer.from(videoData));
      
      return {
        success: true,
        path: result.filePath,
        message: 'Video exported successfully'
      };
    } catch (error) {
      console.error('Failed to save exported video:', error)
      return {
        success: false,
        message: 'Failed to save exported video',
        error: String(error)
      }
    }
  })

  ipcMain.handle('open-video-file-picker', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Video File',
        defaultPath: RECORDINGS_DIR,
        filters: [
          { name: 'Video Files', extensions: ['webm', 'mp4', 'mov', 'avi', 'mkv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      return {
        success: true,
        path: result.filePaths[0]
      };
    } catch (error) {
      console.error('Failed to open file picker:', error);
      return {
        success: false,
        message: 'Failed to open file picker',
        error: String(error)
      };
    }
  });

  // Track current recording paths for editor (screen + optional camera)
  let currentVideoPath: string | null = null;
  let currentCameraVideoPath: string | null = null;

  ipcMain.handle('store-recorded-camera-video', async (_, videoData: ArrayBuffer, fileName: string) => {
    try {
      const videoPath = path.join(RECORDINGS_DIR, fileName)
      await fs.writeFile(videoPath, Buffer.from(videoData))
      currentCameraVideoPath = videoPath;
      return {
        success: true,
        path: videoPath,
        message: 'Camera video stored successfully'
      }
    } catch (error) {
      console.error('Failed to store camera video:', error)
      return {
        success: false,
        message: 'Failed to store camera video',
        error: String(error)
      }
    }
  });

  ipcMain.handle('set-current-video-path', (_, path: string, cameraPath?: string | null) => {
    currentVideoPath = path;
    if (cameraPath !== undefined) {
      currentCameraVideoPath = cameraPath;
    }
    return { success: true };
  });

  ipcMain.handle('get-current-video-path', () => {
    return currentVideoPath ? { success: true, path: currentVideoPath } : { success: false };
  });

  ipcMain.handle('get-current-camera-path', () => {
    return currentCameraVideoPath ? { success: true, path: currentCameraVideoPath } : { success: false };
  });

  ipcMain.handle('clear-current-video-path', () => {
    currentVideoPath = null;
    currentCameraVideoPath = null;
    return { success: true };
  });

  // Camera warning dialog handlers
  // Store pending response callbacks
  const dialogResponseCallbacks: Array<((action: 'continue' | 'cancel') => void)> = [];
  
  ipcMain.handle('open-camera-warning-dialog', () => {
    if (createCameraWarningDialogWindow) {
      const win = createCameraWarningDialogWindow();
      return { success: true };
    }
    return { success: false, error: 'Dialog window not available' };
  });

  ipcMain.handle('close-camera-warning-dialog', () => {
    if (closeCameraWarningDialogWindow) {
      closeCameraWarningDialogWindow();
      return { success: true };
    }
    return { success: false };
  });

  // Listen for dialog response
  ipcMain.on('camera-warning-dialog-response', (_, data: { action: 'continue' | 'cancel' }) => {
    // Resolve all pending callbacks
    dialogResponseCallbacks.forEach(callback => {
      callback(data.action);
    });
    dialogResponseCallbacks.length = 0; // Clear array
    
    // Close the dialog window
    if (closeCameraWarningDialogWindow) {
      closeCameraWarningDialogWindow();
    }
  });

  // Expose a way to wait for dialog response
  ipcMain.handle('wait-for-camera-warning-dialog-response', (): Promise<'continue' | 'cancel'> => {
    return new Promise((resolve) => {
      dialogResponseCallbacks.push((action) => {
        resolve(action);
      });
    });
  });

  // Menu action handlers
  ipcMain.on('menu-open-project', async () => {
    const mainWin = getMainWindow();
    if (!mainWin || mainWin.isDestroyed()) {
      return;
    }

    try {
      // Show open dialog to select project file
      const result = await dialog.showOpenDialog(mainWin, {
        title: 'Open Project',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
      }

      const projectPath = result.filePaths[0];
      
      // Read and parse project file
      const projectDataStr = await fs.readFile(projectPath, 'utf-8');
      const projectData = JSON.parse(projectDataStr);

      // Validate video files exist
      const missingFiles: string[] = [];
      
      // Helper to convert file:// URL to file path
      const fileUrlToPath = (fileUrl: string): string => {
        // Remove file:// protocol
        let filePath = fileUrl.replace(/^file:\/\/+/, '');
        // Handle Windows paths: file:///C:/path -> C:/path
        if (filePath.match(/^\/[a-zA-Z]:/)) {
          filePath = filePath.substring(1);
        }
        // Handle Unix paths: file:///path -> /path (already correct)
        // Handle Windows paths with forward slashes: convert to backslashes on Windows
        if (process.platform === 'win32') {
          filePath = filePath.replace(/\//g, path.sep);
        }
        return filePath;
      };
      
      if (projectData.videoPath) {
        const videoFilePath = fileUrlToPath(projectData.videoPath);
        try {
          await fs.access(videoFilePath);
        } catch {
          missingFiles.push('Main video');
        }
      }

      if (projectData.cameraVideoPath) {
        const cameraFilePath = fileUrlToPath(projectData.cameraVideoPath);
        try {
          await fs.access(cameraFilePath);
        } catch {
          missingFiles.push('Camera video');
        }
      }

      // Send project data to renderer
      mainWin.webContents.send('open-project-data', {
        projectData,
        missingFiles,
        projectPath
      });
    } catch (error) {
      console.error('Failed to open project:', error);
      mainWin.webContents.send('open-project-error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  ipcMain.on('menu-save-project', async () => {
    console.log('[IPC] menu-save-project received');
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      console.log('[IPC] Sending save-project-request to renderer');
      // Request the editor to save project data
      mainWin.webContents.send('save-project-request');
    } else {
      console.warn('[IPC] Main window not available for save-project');
    }
  });

  ipcMain.on('menu-re-record', () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.close();
    }
    // Open source selector for re-recording
    createSourceSelectorWindow('screen');
  });

  ipcMain.on('menu-discard-exit', () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.close();
    }
    // On macOS, keep app running; on other platforms, quit if no windows
    if (process.platform !== 'darwin') {
      const allWindows = BrowserWindow.getAllWindows();
      if (allWindows.length === 0) {
        app.quit();
      }
    }
  });

  // Handle close editor request from renderer
  ipcMain.on('close-editor', () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.close();
    }
  });

  // Handle save project data from renderer
  ipcMain.handle('save-project-data', async (_, projectData: any) => {
    console.log('[IPC] save-project-data handler called');
    try {
      const mainWin = getMainWindow();
      if (!mainWin || mainWin.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
      }

      // Show save dialog to let user choose location
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFileName = `project-${timestamp}.json`;
      
      const result = await dialog.showSaveDialog(mainWin, {
        title: 'Save Project',
        defaultPath: defaultFileName,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['showOverwriteConfirmation']
      });

      // User cancelled the dialog
      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      const projectPath = result.filePath;
      
      // Ensure the directory exists
      const projectDir = path.dirname(projectPath);
      await fs.mkdir(projectDir, { recursive: true });
      
      // Write the project file
      await fs.writeFile(projectPath, JSON.stringify(projectData, null, 2), 'utf-8');
      
      return { success: true, path: projectPath };
    } catch (error) {
      console.error('Failed to save project:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // AHA Innovations API handlers
  ipcMain.handle('upload-to-aha', async (_, fileDataOrPath: ArrayBuffer | string, fileName: string) => {
    try {
      const config = await readAhaConfig();
      if (!config) {
        return {
          success: false,
          error: 'AHA account not configured. Please set up your account first.',
        };
      }

      let filePath: string;
      let shouldCleanup = false;
      let fileSize: number;

      // If ArrayBuffer, save to temp file first
      if (fileDataOrPath instanceof ArrayBuffer) {
        fileSize = fileDataOrPath.byteLength;
        const tempDir = app.getPath('temp');
        const tempFilePath = path.join(tempDir, `aha-upload-${Date.now()}-${fileName}`);
        await fs.writeFile(tempFilePath, Buffer.from(fileDataOrPath));
        filePath = tempFilePath;
        shouldCleanup = true;
      } else {
        filePath = fileDataOrPath;
        const stats = await fs.stat(filePath);
        fileSize = stats.size;
      }

      // Check file size before upload (AHA limit is 25 MB)
      const AHA_LIMIT = 25 * 1024 * 1024; // 25 MB
      if (fileSize > AHA_LIMIT) {
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
        return {
          success: false,
          error: `File size (${sizeMB} MB) exceeds AHA Innovations upload limit (25 MB). Please reduce resolution, frame rate, or trim the video and export again.`,
        };
      }

      try {
        const result = await uploadMedia(filePath, fileName, config.apiKey, config.subaccountId);
        return result;
      } finally {
        // Clean up temp file if we created it
        if (shouldCleanup) {
          try {
            await fs.unlink(filePath);
          } catch (error) {
            console.warn('[IPC] Failed to cleanup temp file:', error);
          }
        }
      }
    } catch (error) {
      console.error('[IPC] Error uploading to AHA:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  ipcMain.handle('get-aha-media-url', async (_, mediaId: string) => {
    try {
      const config = await readAhaConfig();
      if (!config) {
        return {
          success: false,
          error: 'AHA account not configured. Please set up your account first.',
        };
      }

      const result = await getMediaUrl(mediaId, config.apiKey);
      return result;
    } catch (error) {
      console.error('[IPC] Error getting AHA media URL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  ipcMain.handle('verify-aha-config', async (_, apiKey?: string) => {
    try {
      // If API key is provided, use it directly (for verification before saving)
      // Otherwise, load from config (for verification after saving)
      let keyToVerify = apiKey;
      if (!keyToVerify) {
        const config = await readAhaConfig();
        if (!config) {
          return {
            valid: false,
            error: 'AHA account not configured.',
          };
        }
        keyToVerify = config.apiKey;
      }

      const result = await verifyApiKey(keyToVerify);
      return result;
    } catch (error) {
      console.error('[IPC] Error verifying AHA config:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  ipcMain.handle('save-aha-config', async (_, apiKey: string, subaccountId?: string) => {
    try {
      const config = { apiKey, subaccountId };
      const success = await saveAhaConfig(config);
      
      if (success) {
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Failed to save configuration',
        };
      }
    } catch (error) {
      console.error('[IPC] Error saving AHA config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  ipcMain.handle('get-aha-config', async () => {
    try {
      const hasConfig = await hasAhaConfig();
      if (!hasConfig) {
        return { hasConfig: false };
      }

      const config = await readAhaConfig();
      if (!config) {
        return { hasConfig: false };
      }

      // Return config without API key for security
      return {
        hasConfig: true,
        subaccountId: config.subaccountId,
      };
    } catch (error) {
      console.error('[IPC] Error getting AHA config:', error);
      return { hasConfig: false };
    }
  });

  ipcMain.handle('delete-aha-config', async () => {
    try {
      const success = await deleteAhaConfig();
      return { success };
    } catch (error) {
      console.error('[IPC] Error deleting AHA config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });
}
