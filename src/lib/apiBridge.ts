// API bridge that works in both Electron and Web environments

interface CameraDevice {
  deviceId: string;
  label: string;
  kind: 'videoinput';
}

interface Source {
  id: string;
  name: string;
  thumbnail?: string | null;
  display_id?: string;
  appIcon?: string | null;
  type: 'screen' | 'window' | 'camera';
}

const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

// Web storage using IndexedDB
class WebStorage {
  private dbName = 'openscreen-db';
  private storeName = 'recordings';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  async save(key: string, data: ArrayBuffer): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(data, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
}

const webStorage = new WebStorage();

export const apiBridge = {
  // Get sources (screens/windows only - cameras are handled separately)
  async getSources(opts?: { types?: string[]; thumbnailSize?: any; fetchWindowIcons?: boolean }): Promise<Source[]> {
    const sources: Source[] = [];

    // Get desktop sources (Electron only)
    if (isElectron()) {
      try {
        const electronSources = await window.electronAPI.getSources(opts || {});
        electronSources.forEach(s => {
          sources.push({
            ...s,
            type: s.id.startsWith('screen:') ? 'screen' : 'window' as const
          });
        });
      } catch (error) {
        console.error('Error getting Electron sources:', error);
      }
    } else {
      // Web: Add a placeholder screen source that will trigger getDisplayMedia
      // Note: Browsers don't allow enumerating screens, so we add a generic option
      sources.push({
        id: 'screen:web',
        name: 'Screen',
        type: 'screen',
        thumbnail: null,
      });
    }

    // Note: Cameras are no longer included here - use getCameras() instead

    return sources;
  },

  // Get cameras specifically
  async getCameras(): Promise<CameraDevice[]> {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || 'Camera',
          kind: 'videoinput' as const,
        }));
    } catch (error) {
      console.error('Error getting cameras:', error);
      return [];
    }
  },

  // Select source
  async selectSource(source: Source): Promise<void> {
    if (isElectron()) {
      await window.electronAPI.selectSource(source);
    } else {
      // Store in sessionStorage for web
      sessionStorage.setItem('selectedSource', JSON.stringify(source));
    }
  },

  // Select multiple sources (camera + screen)
  async selectSources(sources: Source[]): Promise<void> {
    if (isElectron() && window.electronAPI.selectSources) {
      await window.electronAPI.selectSources(sources);
    } else {
      // Store in sessionStorage for web
      sessionStorage.setItem('selectedSources', JSON.stringify(sources));
    }
  },

  // Get selected sources (supports multiple)
  async getSelectedSources(): Promise<Source[]> {
    console.log('🔵 apiBridge: getSelectedSources called');
    try {
      if (isElectron() && window.electronAPI?.getSelectedSources) {
        const sources = await window.electronAPI.getSelectedSources();
        console.log('🔵 apiBridge: getSelectedSources (Electron) returned:', sources);
        return sources || [];
      } else {
        // Get from sessionStorage for web
        const data = sessionStorage.getItem('selectedSources');
        if (data) {
          const sources = JSON.parse(data);
          console.log('🔵 apiBridge: getSelectedSources (Web) returned:', sources);
          return sources;
        }
        // Fallback to single source
        const singleSource = await this.getSelectedSource();
        const result = singleSource ? [singleSource] : [];
        console.log('🔵 apiBridge: getSelectedSources fallback returned:', result);
        return result;
      }
    } catch (error) {
      console.error('🔵 apiBridge: Error in getSelectedSources:', error);
      return [];
    }
  },

  // Get selected source
  async getSelectedSource(): Promise<Source | null> {
    if (isElectron()) {
      const source = await window.electronAPI.getSelectedSource();
      if (source) {
        // Determine type if not already set
        const type = source.id.startsWith('screen:') ? 'screen' 
          : source.id.startsWith('window:') ? 'window'
          : source.id.startsWith('camera:') ? 'camera'
          : 'screen';
        return { ...source, type };
      }
      return null;
    } else {
      const stored = sessionStorage.getItem('selectedSource');
      return stored ? JSON.parse(stored) : null;
    }
  },

  // Store recorded video
  async storeRecordedVideo(videoData: ArrayBuffer, fileName: string): Promise<{ success: boolean; path?: string; message: string }> {
    if (isElectron()) {
      return await window.electronAPI.storeRecordedVideo(videoData, fileName);
    } else {
      // Web: Save to IndexedDB and set as current video
      try {
        await webStorage.save(fileName, videoData);
        // Store file reference in sessionStorage so editor can load it
        const fileInfo = { name: fileName, size: videoData.byteLength };
        sessionStorage.setItem('currentVideoFile', JSON.stringify(fileInfo));
        return { success: true, message: 'Video saved' };
      } catch (error) {
        return { success: false, message: `Failed to save: ${error}` };
      }
    }
  },

  // Store recorded camera-only video
  async storeRecordedCameraVideo(videoData: ArrayBuffer, fileName: string): Promise<{ success: boolean; path?: string; message: string }> {
    if (isElectron()) {
      return await window.electronAPI.storeRecordedCameraVideo(videoData, fileName);
    } else {
      // Web: Save to IndexedDB with a different key
      try {
        await webStorage.save(`camera-${fileName}`, videoData);
        const fileInfo = { name: `camera-${fileName}`, size: videoData.byteLength };
        sessionStorage.setItem('currentCameraFile', JSON.stringify(fileInfo));
        return { success: true, message: 'Camera video saved' };
      } catch (error) {
        return { success: false, message: `Failed to save camera video: ${error}` };
      }
    }
  },

  // Switch to editor
  async switchToEditor(): Promise<void> {
    if (isElectron()) {
      await window.electronAPI.switchToEditor();
    } else {
      // Web: Navigate to editor
      window.location.href = '/?windowType=editor';
    }
  },

  // Open source selector
  async openSourceSelector(mode: 'screen' | 'camera' = 'screen'): Promise<void> {
    console.log('apiBridge.openSourceSelector called with mode:', mode);
    if (isElectron()) {
      console.log('apiBridge: Calling Electron IPC with mode:', mode);
      await window.electronAPI.openSourceSelector(mode);
    } else {
      // Web: Navigate to source selector with mode
      console.log('apiBridge: Navigating to URL with mode:', mode);
      window.location.href = `/?windowType=source-selector&mode=${mode}`;
    }
  },

  // Open video file picker
  async openVideoFilePicker(): Promise<{ success: boolean; path?: string; cancelled?: boolean; file?: File }> {
    if (isElectron()) {
      const result = await window.electronAPI.openVideoFilePicker();
      return result;
    } else {
      // Web: Use file input
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            resolve({ success: true, file });
          } else {
            resolve({ success: false, cancelled: true });
          }
        };
        input.oncancel = () => {
          resolve({ success: false, cancelled: true });
        };
        input.click();
      });
    }
  },

  // Set current video path
  async setCurrentVideoPath(path: string | File, cameraPath?: string | File | null): Promise<{ success: boolean }> {
    if (isElectron()) {
      return await window.electronAPI.setCurrentVideoPath(path as string, typeof cameraPath === 'string' ? cameraPath : null);
    } else {
      // Web: Store file reference
      if (path instanceof File) {
        sessionStorage.setItem('currentVideoFile', JSON.stringify({ name: path.name, size: path.size }));
        // Store file in IndexedDB
        const arrayBuffer = await path.arrayBuffer();
        await webStorage.save(path.name, arrayBuffer);
      }
      if (cameraPath instanceof File) {
        sessionStorage.setItem('currentCameraFile', JSON.stringify({ name: cameraPath.name, size: cameraPath.size }));
        const arrayBuffer = await cameraPath.arrayBuffer();
        await webStorage.save(cameraPath.name, arrayBuffer);
      }
      return { success: true };
    }
  },

  // Get current video path
  async getCurrentVideoPath(): Promise<{ success: boolean; path?: string; file?: File }> {
    if (isElectron()) {
      return await window.electronAPI.getCurrentVideoPath();
    } else {
      const stored = sessionStorage.getItem('currentVideoFile');
      if (stored) {
        const fileInfo = JSON.parse(stored);
        const data = await webStorage.get(fileInfo.name);
        if (data) {
          const blob = new Blob([data], { type: 'video/webm' });
          const file = new File([blob], fileInfo.name, { type: 'video/webm' });
          return { success: true, file };
        }
      }
      return { success: false };
    }
  },

  // Get current camera video path
  async getCurrentCameraPath(): Promise<{ success: boolean; path?: string; file?: File }> {
    if (isElectron()) {
      return await window.electronAPI.getCurrentCameraPath();
    } else {
      const stored = sessionStorage.getItem('currentCameraFile');
      if (stored) {
        const fileInfo = JSON.parse(stored);
        const data = await webStorage.get(fileInfo.name);
        if (data) {
          const blob = new Blob([data], { type: 'video/webm' });
          const file = new File([blob], fileInfo.name, { type: 'video/webm' });
          return { success: true, file };
        }
      }
      return { success: false };
    }
  },

  // Save exported video
  async saveExportedVideo(videoData: ArrayBuffer, fileName: string): Promise<{ success: boolean; path?: string; cancelled?: boolean }> {
    if (isElectron()) {
      return await window.electronAPI.saveExportedVideo(videoData, fileName);
    } else {
      // Web: Trigger download
      const blob = new Blob([videoData], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true };
    }
  },

  // Set recording state
  async setRecordingState(recording: boolean): Promise<void> {
    if (isElectron()) {
      await window.electronAPI.setRecordingState(recording);
    }
    // Web: No-op (no tray)
  },

  // On stop recording from tray (Electron only)
  onStopRecordingFromTray(callback: () => void): (() => void) | undefined {
    if (isElectron() && window.electronAPI.onStopRecordingFromTray) {
      return window.electronAPI.onStopRecordingFromTray(callback);
    }
    return undefined;
  },

  // Open external URL
  async openExternalUrl(url: string): Promise<{ success: boolean; error?: string }> {
    if (isElectron()) {
      return await window.electronAPI.openExternalUrl(url);
    } else {
      window.open(url, '_blank');
      return { success: true };
    }
  },

  // Get asset base path
  async getAssetBasePath(): Promise<string | null> {
    if (isElectron()) {
      return await window.electronAPI.getAssetBasePath();
    } else {
      return '/public/assets';
    }
  },

  // Open camera preview window
  async openCameraPreview(): Promise<{ success: boolean; error?: string }> {
    console.log('🔵 apiBridge: openCameraPreview called');
    if (isElectron()) {
      if (!window.electronAPI?.openCameraPreview) {
        const error = 'openCameraPreview not available in electronAPI';
        console.error('🔵 apiBridge:', error);
        alert(error); // Show alert since console logs aren't visible
        return { success: false, error };
      }
      try {
        console.log('🔵 apiBridge: Calling window.electronAPI.openCameraPreview()');
        const result = await window.electronAPI.openCameraPreview();
        console.log('🔵 apiBridge: openCameraPreview result:', result);
        if (!result.success) {
          alert(`Failed to open camera preview: ${result.error || 'Unknown error'}`);
        }
        return result;
      } catch (error) {
        const errorMsg = String(error);
        console.error('🔵 apiBridge: Error opening camera preview:', errorMsg);
        alert(`Error opening camera preview: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    }
    const error = 'Camera preview only available in Electron';
    alert(error);
    return { success: false, error };
  },

  // Close camera preview window
  async closeCameraPreview(): Promise<{ success: boolean }> {
    if (isElectron()) {
      return await window.electronAPI.closeCameraPreview();
    }
    return { success: false };
  },

  // Stop camera track during recording
  async stopCameraTrack(): Promise<{ success: boolean }> {
    // This will be handled by exposing the stream reference
    // For now, we'll use a global event or IPC
    if (isElectron() && window.electronAPI?.stopCameraTrack) {
      return await window.electronAPI.stopCameraTrack();
    }
    return { success: false, error: 'Not available' };
  },

  // Stop microphone track during recording
  async stopMicTrack(): Promise<{ success: boolean }> {
    if (isElectron() && window.electronAPI?.stopMicTrack) {
      return await window.electronAPI.stopMicTrack();
    }
    return { success: false, error: 'Not available' };
  },
};

