/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  electronAPI: {
    getSources: (opts: Electron.SourcesOptions) => Promise<ProcessedDesktopSource[]>
    switchToEditor: () => Promise<void>
    openSourceSelector: (mode?: 'screen' | 'camera') => Promise<void>
    openSettings: () => Promise<void>
    selectSource: (source: any) => Promise<any>
    getSelectedSource: () => Promise<any>
    storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{ success: boolean; path?: string; message?: string }>
    getRecordedVideoPath: () => Promise<{ success: boolean; path?: string; message?: string }>
    storeRecordedCameraVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{ success: boolean; path?: string; message?: string }>
    setRecordingState: (recording: boolean) => Promise<void>
    onStopRecordingFromTray: (callback: () => void) => () => void
    openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>
    saveExportedVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{ success: boolean; path?: string; message?: string; cancelled?: boolean }>
    openVideoFilePicker: () => Promise<{ success: boolean; path?: string; cancelled?: boolean }>
    setCurrentVideoPath: (path: string, cameraPath?: string | null) => Promise<{ success: boolean }>
    getCurrentVideoPath: () => Promise<{ success: boolean; path?: string }>
    getCurrentCameraPath: () => Promise<{ success: boolean; path?: string }>
    clearCurrentVideoPath: () => Promise<{ success: boolean }>
    hudOverlayHide: () => void;
    hudOverlayClose: () => void;
    openCameraPreview: () => Promise<{ success: boolean; error?: string }>
    closeCameraPreview: () => Promise<{ success: boolean }>
    resizeWindow?: (width: number, height: number) => Promise<{ success: boolean }>
    selectSources?: (sources: any[]) => Promise<any[]>
    getSelectedSources?: () => Promise<any[]>
    openCameraWarningDialog?: () => Promise<{ success: boolean; error?: string }>
    closeCameraWarningDialog?: () => Promise<{ success: boolean }>
    waitForCameraWarningDialogResponse?: () => Promise<'continue' | 'cancel'>
    send?: (channel: string, data?: any) => void
    closeWindow?: () => void
    saveProjectData?: (projectData: any) => Promise<{ success: boolean; path?: string; error?: string }>
    openProject?: () => void
    // AHA Innovations API methods
    uploadToAha?: (fileDataOrPath: ArrayBuffer | string, fileName: string) => Promise<{ success: boolean; mediaId?: string; url?: string; error?: string }>
    getAhaMediaUrl?: (mediaId: string) => Promise<{ success: boolean; url?: string; error?: string }>
    verifyAhaConfig?: (apiKey?: string) => Promise<{ valid: boolean; error?: string }>
    saveAhaConfig?: (apiKey: string, subaccountId?: string) => Promise<{ success: boolean; error?: string }>
    getAhaConfig?: () => Promise<{ hasConfig: boolean; subaccountId?: string }>
    deleteAhaConfig?: () => Promise<{ success: boolean; error?: string }>
  }
}

interface ProcessedDesktopSource {
  id: string
  name: string
  display_id: string
  thumbnail: string | null
  appIcon: string | null
}
