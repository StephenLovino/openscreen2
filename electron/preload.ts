import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    hudOverlayHide: () => {
      ipcRenderer.send('hud-overlay-hide');
    },
    hudOverlayClose: () => {
      ipcRenderer.send('hud-overlay-close');
    },
  getAssetBasePath: async () => {
    // ask main process for the correct base path (production vs dev)
    return await ipcRenderer.invoke('get-asset-base-path')
  },
  getSources: async (opts: Electron.SourcesOptions) => {
    return await ipcRenderer.invoke('get-sources', opts)
  },
  switchToEditor: () => {
    return ipcRenderer.invoke('switch-to-editor')
  },
  openSourceSelector: (mode?: 'screen' | 'camera') => {
    return ipcRenderer.invoke('open-source-selector', mode)
  },
  openSettings: () => {
    return ipcRenderer.invoke('open-settings')
  },
  selectSource: (source: any) => {
    return ipcRenderer.invoke('select-source', source)
  },
  selectSources: (sources: any[]) => {
    return ipcRenderer.invoke('select-sources', sources)
  },
  getSelectedSource: () => {
    return ipcRenderer.invoke('get-selected-source')
  },
  getSelectedSources: () => {
    return ipcRenderer.invoke('get-selected-sources')
  },

  storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => {
    return ipcRenderer.invoke('store-recorded-video', videoData, fileName)
  },

  getRecordedVideoPath: () => {
    return ipcRenderer.invoke('get-recorded-video-path')
  },
  storeRecordedCameraVideo: (videoData: ArrayBuffer, fileName: string) => {
    return ipcRenderer.invoke('store-recorded-camera-video', videoData, fileName)
  },
  setRecordingState: (recording: boolean, autoZoomEnabled?: boolean) => {
    return ipcRenderer.invoke('set-recording-state', recording, autoZoomEnabled)
  },
  on: (channel: string, callback: (event: any, ...args: any[]) => void) => {
    ipcRenderer.on(channel, callback)
  },
  off: (channel: string, callback: (event: any, ...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  },
  onStopRecordingFromTray: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('stop-recording-from-tray', listener)
    return () => ipcRenderer.removeListener('stop-recording-from-tray', listener)
  },
  openExternalUrl: (url: string) => {
    return ipcRenderer.invoke('open-external-url', url)
  },
  saveExportedVideo: (videoData: ArrayBuffer, fileName: string) => {
    return ipcRenderer.invoke('save-exported-video', videoData, fileName)
  },
  openVideoFilePicker: () => {
    return ipcRenderer.invoke('open-video-file-picker')
  },
  setCurrentVideoPath: (path: string, cameraPath?: string | null) => {
    return ipcRenderer.invoke('set-current-video-path', path, cameraPath)
  },
  getCurrentVideoPath: () => {
    return ipcRenderer.invoke('get-current-video-path')
  },
  getCurrentCameraPath: () => {
    return ipcRenderer.invoke('get-current-camera-path')
  },
  clearCurrentVideoPath: () => {
    return ipcRenderer.invoke('clear-current-video-path')
  },
  openCameraPreview: () => {
    return ipcRenderer.invoke('open-camera-preview')
  },
  closeCameraPreview: () => {
    return ipcRenderer.invoke('close-camera-preview')
  },
  resizeWindow: (width: number, height: number) => {
    return ipcRenderer.invoke('resize-camera-preview', width, height)
  },
  stopCameraTrack: () => {
    return ipcRenderer.invoke('stop-camera-track')
  },
  stopMicTrack: () => {
    return ipcRenderer.invoke('stop-mic-track')
  },
  openCameraWarningDialog: () => {
    return ipcRenderer.invoke('open-camera-warning-dialog')
  },
  closeCameraWarningDialog: () => {
    return ipcRenderer.invoke('close-camera-warning-dialog')
  },
  waitForCameraWarningDialogResponse: () => {
    return ipcRenderer.invoke('wait-for-camera-warning-dialog-response')
  },
  send: (channel: string, data?: any) => {
    ipcRenderer.send(channel, data)
  },
  closeWindow: () => {
    if (window.electronAPI && (window.electronAPI as any).closeWindow) {
      // Window will be closed by main process
    }
  },
  saveProjectData: (projectData: any) => {
    return ipcRenderer.invoke('save-project-data', projectData)
  },
  openProject: () => {
    return ipcRenderer.send('menu-open-project')
  },
  // AHA Innovations API methods
  uploadToAha: (fileDataOrPath: ArrayBuffer | string, fileName: string) => {
    return ipcRenderer.invoke('upload-to-aha', fileDataOrPath, fileName)
  },
  getAhaMediaUrl: (mediaId: string) => {
    return ipcRenderer.invoke('get-aha-media-url', mediaId)
  },
  verifyAhaConfig: (apiKey?: string) => {
    return ipcRenderer.invoke('verify-aha-config', apiKey)
  },
  saveAhaConfig: (apiKey: string, subaccountId?: string) => {
    return ipcRenderer.invoke('save-aha-config', apiKey, subaccountId)
  },
  getAhaConfig: () => {
    return ipcRenderer.invoke('get-aha-config')
  },
  deleteAhaConfig: () => {
    return ipcRenderer.invoke('delete-aha-config')
  },
})