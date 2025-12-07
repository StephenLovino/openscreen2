/// <reference types="vite/client" />
/// <reference types="../electron/electron-env" />

interface ProcessedDesktopSource {
  id: string;
  name: string;
  display_id: string;
  thumbnail: string | null;
  appIcon: string | null;
}

interface Window {
  electronAPI?: {
    getSources: (opts: Electron.SourcesOptions) => Promise<ProcessedDesktopSource[]>
    switchToEditor: () => Promise<void>
    openSourceSelector: (mode?: 'screen' | 'camera') => Promise<void>
    selectSource: (source: any) => Promise<any>
    getSelectedSource: () => Promise<any>
    storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{
      success: boolean
      path?: string
      message: string
      error?: string
    }>
    storeRecordedCameraVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{
      success: boolean
      path?: string
      message: string
      error?: string
    }>
    getRecordedVideoPath: () => Promise<{
      success: boolean
      path?: string
      message?: string
      error?: string
    }>
    getAssetBasePath: () => Promise<string | null>
    setRecordingState: (recording: boolean, autoZoomEnabled?: boolean) => Promise<void>
    on?: (channel: string, callback: (event: any, ...args: any[]) => void) => void
    off?: (channel: string, callback: (event: any, ...args: any[]) => void) => void
    onStopRecordingFromTray: (callback: () => void) => () => void
    openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>
    saveExportedVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{
      success: boolean
      path?: string
      message?: string
      cancelled?: boolean
    }>
    openVideoFilePicker: () => Promise<{ success: boolean; path?: string; cancelled?: boolean }>
    setCurrentVideoPath: (path: string, cameraPath?: string | null) => Promise<{ success: boolean }>
    getCurrentVideoPath: () => Promise<{ success: boolean; path?: string }>
    getCurrentCameraPath: () => Promise<{ success: boolean; path?: string }>
    clearCurrentVideoPath: () => Promise<{ success: boolean }>
    openCameraPreview: () => Promise<{ success: boolean; error?: string }>
    closeCameraPreview: () => Promise<{ success: boolean }>
    resizeWindow?: (width: number, height: number) => Promise<{ success: boolean }>
    selectSources?: (sources: any[]) => Promise<any[]>
    getSelectedSources?: () => Promise<any[]>
    stopCameraTrack?: () => Promise<{ success: boolean; error?: string }>
    stopMicTrack?: () => Promise<{ success: boolean; error?: string }>
    openCameraWarningDialog?: () => Promise<{ success: boolean; error?: string }>
    closeCameraWarningDialog?: () => Promise<{ success: boolean }>
    waitForCameraWarningDialogResponse?: () => Promise<'continue' | 'cancel'>
    send?: (channel: string, data?: any) => void
    closeWindow?: () => void
    saveProjectData?: (projectData: any) => Promise<{ success: boolean; path?: string; error?: string }>
  }
}