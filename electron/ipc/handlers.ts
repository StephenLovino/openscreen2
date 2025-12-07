import { ipcMain, desktopCapturer, BrowserWindow, shell, app, dialog } from 'electron'

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RECORDINGS_DIR } from '../main'

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
  getCameraWarningDialogWindow?: () => BrowserWindow | null
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

  ipcMain.handle('set-recording-state', (_, recording: boolean) => {
    const source = selectedSource || { name: 'Screen' }
    if (onRecordingStateChange) {
      onRecordingStateChange(recording, source.name)
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
        return path.join(process.resourcesPath, 'assets')
      }
      return path.join(app.getAppPath(), 'public', 'assets')
    } catch (err) {
      console.error('Failed to resolve asset base path:', err)
      return null
    }
  })

  ipcMain.handle('save-exported-video', async (_, videoData: ArrayBuffer, fileName: string) => {
    try {
      const result = await dialog.showSaveDialog({
        title: 'Save Exported Video',
        defaultPath: path.join(app.getPath('downloads'), fileName),
        filters: [
          { name: 'MP4 Video', extensions: ['mp4'] }
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
}
