"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  hudOverlayHide: () => {
    electron.ipcRenderer.send("hud-overlay-hide");
  },
  hudOverlayClose: () => {
    electron.ipcRenderer.send("hud-overlay-close");
  },
  getAssetBasePath: async () => {
    return await electron.ipcRenderer.invoke("get-asset-base-path");
  },
  getSources: async (opts) => {
    return await electron.ipcRenderer.invoke("get-sources", opts);
  },
  switchToEditor: () => {
    return electron.ipcRenderer.invoke("switch-to-editor");
  },
  openSourceSelector: (mode) => {
    return electron.ipcRenderer.invoke("open-source-selector", mode);
  },
  selectSource: (source) => {
    return electron.ipcRenderer.invoke("select-source", source);
  },
  selectSources: (sources) => {
    return electron.ipcRenderer.invoke("select-sources", sources);
  },
  getSelectedSource: () => {
    return electron.ipcRenderer.invoke("get-selected-source");
  },
  getSelectedSources: () => {
    return electron.ipcRenderer.invoke("get-selected-sources");
  },
  storeRecordedVideo: (videoData, fileName) => {
    return electron.ipcRenderer.invoke("store-recorded-video", videoData, fileName);
  },
  getRecordedVideoPath: () => {
    return electron.ipcRenderer.invoke("get-recorded-video-path");
  },
  storeRecordedCameraVideo: (videoData, fileName) => {
    return electron.ipcRenderer.invoke("store-recorded-camera-video", videoData, fileName);
  },
  setRecordingState: (recording) => {
    return electron.ipcRenderer.invoke("set-recording-state", recording);
  },
  onStopRecordingFromTray: (callback) => {
    const listener = () => callback();
    electron.ipcRenderer.on("stop-recording-from-tray", listener);
    return () => electron.ipcRenderer.removeListener("stop-recording-from-tray", listener);
  },
  openExternalUrl: (url) => {
    return electron.ipcRenderer.invoke("open-external-url", url);
  },
  saveExportedVideo: (videoData, fileName) => {
    return electron.ipcRenderer.invoke("save-exported-video", videoData, fileName);
  },
  openVideoFilePicker: () => {
    return electron.ipcRenderer.invoke("open-video-file-picker");
  },
  setCurrentVideoPath: (path, cameraPath) => {
    return electron.ipcRenderer.invoke("set-current-video-path", path, cameraPath);
  },
  getCurrentVideoPath: () => {
    return electron.ipcRenderer.invoke("get-current-video-path");
  },
  getCurrentCameraPath: () => {
    return electron.ipcRenderer.invoke("get-current-camera-path");
  },
  clearCurrentVideoPath: () => {
    return electron.ipcRenderer.invoke("clear-current-video-path");
  },
  openCameraPreview: () => {
    return electron.ipcRenderer.invoke("open-camera-preview");
  },
  closeCameraPreview: () => {
    return electron.ipcRenderer.invoke("close-camera-preview");
  },
  resizeWindow: (width, height) => {
    return electron.ipcRenderer.invoke("resize-camera-preview", width, height);
  },
  stopCameraTrack: () => {
    return electron.ipcRenderer.invoke("stop-camera-track");
  },
  stopMicTrack: () => {
    return electron.ipcRenderer.invoke("stop-mic-track");
  },
  openCameraWarningDialog: () => {
    return electron.ipcRenderer.invoke("open-camera-warning-dialog");
  },
  closeCameraWarningDialog: () => {
    return electron.ipcRenderer.invoke("close-camera-warning-dialog");
  },
  waitForCameraWarningDialogResponse: () => {
    return electron.ipcRenderer.invoke("wait-for-camera-warning-dialog-response");
  },
  send: (channel, data) => {
    electron.ipcRenderer.send(channel, data);
  },
  closeWindow: () => {
    if (window.electronAPI && window.electronAPI.closeWindow) ;
  }
});
