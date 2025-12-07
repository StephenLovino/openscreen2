import { ipcMain, screen, BrowserWindow, desktopCapturer, shell, app, dialog, nativeImage, Tray, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
const __dirname$3 = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname$3, "..");
const VITE_DEV_SERVER_URL$1 = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST$1 = path.join(APP_ROOT, "dist");
let hudOverlayWindow = null;
ipcMain.on("hud-overlay-hide", () => {
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.minimize();
  }
});
function createHudOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const windowWidth = 500;
  const windowHeight = 48;
  const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
  const y = Math.floor(workArea.y + workArea.height - windowHeight - 5);
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 500,
    maxWidth: 500,
    minHeight: windowHeight,
    maxHeight: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname$3, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  hudOverlayWindow = win;
  win.on("closed", () => {
    if (hudOverlayWindow === win) {
      hudOverlayWindow = null;
    }
  });
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=hud-overlay");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "hud-overlay" }
    });
  }
  return win;
}
function createEditorWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: "AHA Clips",
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname$3, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false
    }
  });
  win.maximize();
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=editor");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "editor" }
    });
  }
  return win;
}
function createSourceSelectorWindow(mode) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: 620,
    height: 420,
    minHeight: 350,
    maxHeight: 500,
    x: Math.round((width - 620) / 2),
    y: Math.round((height - 420) / 2),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname$3, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  if (VITE_DEV_SERVER_URL$1) {
    const baseUrl = VITE_DEV_SERVER_URL$1.endsWith("/") ? VITE_DEV_SERVER_URL$1.slice(0, -1) : VITE_DEV_SERVER_URL$1;
    const url = mode ? `${baseUrl}?windowType=source-selector&mode=${mode}` : `${baseUrl}?windowType=source-selector`;
    console.log("🔵 windows.ts: Loading URL:", url);
    win.loadURL(url);
  } else {
    const query = { windowType: "source-selector" };
    if (mode) {
      query.mode = mode;
    }
    console.log("🔵 windows.ts: Loading file with query:", query);
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), { query });
  }
  return win;
}
function createCameraPreviewWindow() {
  console.log("🔵 windows.ts: createCameraPreviewWindow called");
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 250;
  const winHeight = 250;
  const x = Math.round(width - winWidth - 20);
  const y = 20;
  console.log("🔵 windows.ts: Creating camera preview window at", x, y, "size", winWidth, "x", winHeight);
  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 250,
    minHeight: 250,
    maxWidth: 640,
    maxHeight: 640,
    x,
    y,
    frame: false,
    resizable: false,
    // Don't allow resizing - size is controlled by UI
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: "#00000000",
    skipTaskbar: true,
    show: true,
    // Show immediately - we'll ensure it stays visible
    movable: true,
    // Allow window to be moved
    webPreferences: {
      preload: path.join(__dirname$3, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.on("did-finish-load", () => {
    console.log("🔵 windows.ts: Camera preview window loaded, showing...");
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
    win.show();
    win.focus();
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    console.log("🔵 windows.ts: Camera preview window shown and focused. Is visible?", win.isVisible());
  });
  win.webContents.once("dom-ready", () => {
    console.log("🔵 windows.ts: Camera preview DOM ready, forcing show...");
    win.show();
    win.focus();
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    console.log("🔵 windows.ts: Camera preview window forced to show. Is visible?", win.isVisible());
  });
  win.once("ready-to-show", () => {
    console.log("🔵 windows.ts: Camera preview ready-to-show event");
    win.show();
    win.focus();
  });
  win.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error("🔵 windows.ts: Camera preview window failed to load:", errorCode, errorDescription);
  });
  if (VITE_DEV_SERVER_URL$1) {
    const baseUrl = VITE_DEV_SERVER_URL$1.endsWith("/") ? VITE_DEV_SERVER_URL$1.slice(0, -1) : VITE_DEV_SERVER_URL$1;
    const url = baseUrl + "?windowType=camera-preview";
    console.log("🔵 windows.ts: Loading camera preview URL:", url);
    win.loadURL(url);
  } else {
    const query = { windowType: "camera-preview" };
    console.log("🔵 windows.ts: Loading camera preview file with query:", query);
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), { query });
  }
  console.log("🔵 windows.ts: Camera preview window created with ID:", win.id);
  return win;
}
function createCameraWarningDialogWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: 480,
    height: 280,
    minWidth: 400,
    minHeight: 240,
    maxWidth: 600,
    maxHeight: 400,
    x: Math.round((width - 480) / 2),
    y: Math.round((height - 280) / 2),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname$3, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  if (VITE_DEV_SERVER_URL$1) {
    const baseUrl = VITE_DEV_SERVER_URL$1.endsWith("/") ? VITE_DEV_SERVER_URL$1.slice(0, -1) : VITE_DEV_SERVER_URL$1;
    const url = `${baseUrl}?windowType=camera-warning-dialog`;
    win.loadURL(url);
  } else {
    const query = { windowType: "camera-warning-dialog" };
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), { query });
  }
  return win;
}
const __dirname$2 = path.dirname(fileURLToPath(import.meta.url));
let selectedSource = null;
let selectedSources = [];
let lastGetSourcesLogTime = 0;
function registerIpcHandlers(createEditorWindow2, createSourceSelectorWindow2, getMainWindow, getSourceSelectorWindow, onRecordingStateChange, getCameraPreviewWindow, createCameraPreviewWindow2, closeCameraPreviewWindow, createCameraWarningDialogWindow2, closeCameraWarningDialogWindow, getCameraWarningDialogWindow) {
  ipcMain.handle("get-sources", async (_, opts) => {
    const sources = await desktopCapturer.getSources(opts);
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }));
  });
  ipcMain.handle("select-source", (_, source) => {
    selectedSource = source;
    const sourceSelectorWin = getSourceSelectorWindow();
    if (sourceSelectorWin) {
      sourceSelectorWin.close();
    }
    return selectedSource;
  });
  ipcMain.handle("select-sources", (_, sources) => {
    console.log("🔵 IPC: select-sources called with sources:", JSON.stringify(sources, null, 2));
    const merged = {};
    for (const s of selectedSources) {
      if (s == null ? void 0 : s.id) merged[s.id] = s;
    }
    for (const s of sources) {
      if (s == null ? void 0 : s.id) merged[s.id] = s;
    }
    selectedSources = Object.values(merged);
    selectedSource = selectedSources.length > 0 ? selectedSources[0] : null;
    console.log("🔵 IPC: Stored selectedSources:", selectedSources.length, "sources");
    const hasCamera = selectedSources.some((s) => {
      var _a;
      return s.type === "camera" || ((_a = s.id) == null ? void 0 : _a.startsWith("camera:"));
    });
    console.log("🔵 IPC: Camera source found?", hasCamera);
    return selectedSources;
  });
  ipcMain.handle("get-selected-source", () => {
    return selectedSource;
  });
  ipcMain.handle("get-selected-sources", () => {
    const result = selectedSources.length > 0 ? selectedSources : selectedSource ? [selectedSource] : [];
    if (result.length > 0 && Date.now() - lastGetSourcesLogTime > 5e3) {
      const sourceSummary = result.map((s) => {
        var _a;
        return `${s.type || "unknown"}:${(_a = s.id) == null ? void 0 : _a.substring(0, 20)}...`;
      }).join(", ");
      console.log("🔵 IPC: get-selected-sources returning:", result.length, "sources:", sourceSummary);
      lastGetSourcesLogTime = Date.now();
    }
    return result;
  });
  ipcMain.handle("open-source-selector", (_, mode) => {
    console.log("🔵 IPC: open-source-selector called with mode:", mode);
    const sourceSelectorWin = getSourceSelectorWindow();
    if (sourceSelectorWin && !sourceSelectorWin.isDestroyed()) {
      const VITE_DEV_SERVER_URL2 = process.env["VITE_DEV_SERVER_URL"];
      console.log("🔵 IPC: VITE_DEV_SERVER_URL:", VITE_DEV_SERVER_URL2);
      if (VITE_DEV_SERVER_URL2) {
        const baseUrl = VITE_DEV_SERVER_URL2.endsWith("/") ? VITE_DEV_SERVER_URL2.slice(0, -1) : VITE_DEV_SERVER_URL2;
        const url = mode ? `${baseUrl}?windowType=source-selector&mode=${mode}` : `${baseUrl}?windowType=source-selector`;
        console.log("🔵 IPC: Reloading window with URL:", url);
        sourceSelectorWin.webContents.loadURL(url);
      } else {
        const APP_ROOT2 = path.join(__dirname$2, "..");
        const RENDERER_DIST2 = path.join(APP_ROOT2, "dist");
        const query = { windowType: "source-selector" };
        if (mode) {
          query.mode = mode;
        }
        console.log("🔵 IPC: Loading file with query:", query);
        sourceSelectorWin.webContents.loadFile(path.join(RENDERER_DIST2, "index.html"), { query });
      }
      sourceSelectorWin.focus();
      return;
    }
    console.log("🔵 IPC: Creating new source selector window with mode:", mode);
    createSourceSelectorWindow2(mode);
  });
  ipcMain.handle("switch-to-editor", () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.close();
    }
    createEditorWindow2();
  });
  ipcMain.handle("store-recorded-video", async (_, videoData, fileName) => {
    try {
      const videoPath = path.join(RECORDINGS_DIR, fileName);
      await fs.writeFile(videoPath, Buffer.from(videoData));
      currentVideoPath = videoPath;
      return {
        success: true,
        path: videoPath,
        message: "Video stored successfully"
      };
    } catch (error) {
      console.error("Failed to store video:", error);
      return {
        success: false,
        message: "Failed to store video",
        error: String(error)
      };
    }
  });
  ipcMain.handle("get-recorded-video-path", async () => {
    try {
      const files = await fs.readdir(RECORDINGS_DIR);
      const videoFiles = files.filter((file) => file.endsWith(".webm"));
      if (videoFiles.length === 0) {
        return { success: false, message: "No recorded video found" };
      }
      const latestVideo = videoFiles.sort().reverse()[0];
      const videoPath = path.join(RECORDINGS_DIR, latestVideo);
      return { success: true, path: videoPath };
    } catch (error) {
      console.error("Failed to get video path:", error);
      return { success: false, message: "Failed to get video path", error: String(error) };
    }
  });
  let clickDetectionProcess = null;
  let recordingStartTime = 0;
  let autoZoomEnabled = false;
  let screenBounds = null;
  let lastClickTime = 0;
  const CLICK_DEBOUNCE_MS = 100;
  const handleMouseClick = (x, y) => {
    if (!autoZoomEnabled) return;
    const now = Date.now();
    if (now - lastClickTime < CLICK_DEBOUNCE_MS) {
      return;
    }
    lastClickTime = now;
    const relativeTime = now - recordingStartTime;
    const normalizedX = screenBounds ? x / screenBounds.width : 0.5;
    const normalizedY = screenBounds ? y / screenBounds.height : 0.5;
    console.log("🔵 Auto-zoom: Mouse click detected at:", { x: normalizedX, y: normalizedY, time: relativeTime, absolute: { x, y } });
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("auto-zoom-click-event", {
        x: normalizedX,
        y: normalizedY,
        timestamp: relativeTime
      });
      console.log("🔵 Auto-zoom: Click event sent successfully");
    } else {
      console.warn("🔵 Auto-zoom: Cannot send click event - main window is null or destroyed");
    }
  };
  const startMouseClickDetection = async () => {
    const { screen: screen2 } = await import("electron");
    const os = await import("os");
    const platform = os.platform();
    console.log("🔵 Auto-zoom: Starting mouse click detection on platform:", platform);
    if (platform === "linux") {
      await startLinuxMouseClickDetection(screen2);
    } else if (platform === "darwin") {
      console.warn("🔵 Auto-zoom: macOS mouse click detection not yet implemented");
      console.log("🔵 Auto-zoom: For macOS, consider using:");
      console.log("   1. CGEventTap API (requires native module)");
      console.log("   2. iohook npm package (cross-platform native module)");
      console.log("   3. robotjs npm package (cross-platform native module)");
    } else if (platform === "win32") {
      console.warn("🔵 Auto-zoom: Windows mouse click detection not yet implemented");
      console.log("🔵 Auto-zoom: For Windows, consider using:");
      console.log("   1. SetWindowsHookEx API (requires native module)");
      console.log("   2. iohook npm package (cross-platform native module)");
      console.log("   3. robotjs npm package (cross-platform native module)");
    } else {
      console.warn("🔵 Auto-zoom: Unsupported platform:", platform);
    }
  };
  const startLinuxMouseClickDetection = async (screen2) => {
    const { spawn, exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    try {
      const { stdout: deviceList } = await execAsync("xinput list");
      const lines = deviceList.split("\n");
      let mouseDeviceId = null;
      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if ((lowerLine.includes("mouse") || lowerLine.includes("trackpad") || lowerLine.includes("touchpad")) && !lowerLine.includes("xtest") && !lowerLine.includes("virtual core") && !lowerLine.includes("master pointer") && lowerLine.includes("slave")) {
          const match = line.match(/id=(\d+)/);
          if (match) {
            mouseDeviceId = match[1];
            console.log("🔵 Auto-zoom: Found real mouse device:", line.trim(), "ID:", mouseDeviceId);
            break;
          }
        }
      }
      if (!mouseDeviceId) {
        for (const line of lines) {
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes("slave") && lowerLine.includes("pointer") && !lowerLine.includes("xtest") && !lowerLine.includes("virtual core") && !lowerLine.includes("master")) {
            const match = line.match(/id=(\d+)/);
            if (match) {
              mouseDeviceId = match[1];
              console.log("🔵 Auto-zoom: Found pointer device (fallback):", line.trim(), "ID:", mouseDeviceId);
              break;
            }
          }
        }
      }
      if (!mouseDeviceId) {
        console.warn("🔵 Auto-zoom: Could not find mouse device, click detection disabled");
        console.log("🔵 Auto-zoom: Available devices:", deviceList);
        return;
      }
      let xinputProcess = null;
      let useTestXi2 = false;
      try {
        xinputProcess = spawn("xinput", ["test", mouseDeviceId]);
        console.log("🔵 Auto-zoom: Using xinput test with device ID:", mouseDeviceId);
      } catch (error) {
        console.warn("🔵 Auto-zoom: test failed, trying test-xi2 --root:", error);
        useTestXi2 = true;
        try {
          xinputProcess = spawn("xinput", ["test-xi2", "--root"]);
          console.log("🔵 Auto-zoom: Using xinput test-xi2 --root as fallback");
        } catch (xi2Error) {
          console.error("🔵 Auto-zoom: Both test methods failed:", xi2Error);
          return;
        }
      }
      let buttonPressed = false;
      let clickX = 0;
      let clickY = 0;
      xinputProcess.stdout.on("data", (data) => {
        const output = data.toString();
        console.log("🔵 Auto-zoom: Raw xinput output:", output.substring(0, 200));
        const lines2 = output.split("\n");
        for (const line of lines2) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          if (useTestXi2) {
            const lowerLine = trimmedLine.toLowerCase();
            if (lowerLine.includes("button")) {
              if (lowerLine.includes("press") || lowerLine.includes("down")) {
                buttonPressed = true;
                const xMatch = trimmedLine.match(/(?:root_)?x[=:]?\s*([\d.]+)/i);
                const yMatch = trimmedLine.match(/(?:root_)?y[=:]?\s*([\d.]+)/i);
                if (xMatch && yMatch) {
                  clickX = parseFloat(xMatch[1]);
                  clickY = parseFloat(yMatch[1]);
                } else {
                  const cursorPoint = screen2.getCursorScreenPoint();
                  clickX = cursorPoint.x;
                  clickY = cursorPoint.y;
                }
                console.log("🔵 Auto-zoom: Button pressed at:", { x: clickX, y: clickY, rawLine: trimmedLine });
              } else if ((lowerLine.includes("release") || lowerLine.includes("up")) && buttonPressed) {
                buttonPressed = false;
                console.log("🔵 Auto-zoom: Button released, handling click at:", { x: clickX, y: clickY });
                handleMouseClick(clickX, clickY);
              }
            }
          } else {
            if (trimmedLine.includes("button press")) {
              buttonPressed = true;
              const cursorPoint = screen2.getCursorScreenPoint();
              clickX = cursorPoint.x;
              clickY = cursorPoint.y;
              console.log("🔵 Auto-zoom: Button pressed at:", { x: clickX, y: clickY });
            } else if (trimmedLine.includes("button release") && buttonPressed) {
              buttonPressed = false;
              console.log("🔵 Auto-zoom: Button released, handling click at:", { x: clickX, y: clickY });
              handleMouseClick(clickX, clickY);
            }
          }
        }
      });
      xinputProcess.stderr.on("data", (data) => {
        const error = data.toString();
        if (useTestXi2 && error.includes("Unable to find device") || error.includes("error")) {
          console.warn("🔵 Auto-zoom: test-xi2 failed, trying test with device ID:", mouseDeviceId);
          useTestXi2 = false;
          if (xinputProcess) {
            xinputProcess.kill();
          }
          try {
            xinputProcess = spawn("xinput", ["test", mouseDeviceId]);
            xinputProcess.stdout.on("data", (data2) => {
              const output = data2.toString();
              const lines2 = output.split("\n");
              for (const line of lines2) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;
                if (trimmedLine.includes("button press")) {
                  buttonPressed = true;
                  const cursorPoint = screen2.getCursorScreenPoint();
                  clickX = cursorPoint.x;
                  clickY = cursorPoint.y;
                  console.log("🔵 Auto-zoom: Button pressed at:", { x: clickX, y: clickY });
                } else if (trimmedLine.includes("button release") && buttonPressed) {
                  buttonPressed = false;
                  handleMouseClick(clickX, clickY);
                }
              }
            });
            clickDetectionProcess = xinputProcess;
          } catch (fallbackError) {
            console.error("🔵 Auto-zoom: Fallback to test also failed:", fallbackError);
          }
        } else if (!error.includes("WARNING") && !error.includes("Unable to connect")) {
          console.error("🔵 Auto-zoom: xinput error:", error);
        }
      });
      xinputProcess.on("close", (code) => {
        console.log("🔵 Auto-zoom: xinput process closed with code:", code);
        if (code !== 0 && code !== null) {
          console.warn("🔵 Auto-zoom: xinput process exited unexpectedly");
        }
      });
      xinputProcess.on("error", (error) => {
        console.error("🔵 Auto-zoom: xinput process error:", error);
      });
      clickDetectionProcess = xinputProcess;
      console.log("🔵 Auto-zoom: Linux mouse click detection started successfully");
    } catch (error) {
      console.error("🔵 Auto-zoom: Error starting Linux mouse click detection:", error);
    }
  };
  const stopMouseClickDetection = () => {
    if (clickDetectionProcess) {
      try {
        clickDetectionProcess.kill();
        clickDetectionProcess = null;
        console.log("🔵 Auto-zoom: Mouse click detection stopped");
      } catch (error) {
        console.error("🔵 Auto-zoom: Error stopping click detection:", error);
      }
    }
  };
  ipcMain.handle("set-recording-state", async (_, recording, autoZoom) => {
    const source = selectedSource || { name: "Screen" };
    if (onRecordingStateChange) {
      onRecordingStateChange(recording, source.name);
    }
    autoZoomEnabled = autoZoom || false;
    if (recording && autoZoomEnabled) {
      recordingStartTime = Date.now();
      lastClickTime = 0;
      const { screen: screen2 } = await import("electron");
      const primaryDisplay = screen2.getPrimaryDisplay();
      screenBounds = {
        width: primaryDisplay.workAreaSize.width,
        height: primaryDisplay.workAreaSize.height
      };
      console.log("🔵 Auto-zoom: Starting mouse click detection");
      await startMouseClickDetection();
    } else {
      stopMouseClickDetection();
      console.log("🔵 Auto-zoom: Stopping click detection");
    }
  });
  ipcMain.on("auto-zoom-click", (_, data) => {
    if (!autoZoomEnabled) return;
    const relativeTime = data.timestamp - recordingStartTime;
    const normalizedX = screenBounds ? data.x / screenBounds.width : 0.5;
    const normalizedY = screenBounds ? data.y / screenBounds.height : 0.5;
    console.log("🔵 Auto-zoom: Click detected at", { x: normalizedX, y: normalizedY, time: relativeTime });
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("auto-zoom-click-event", {
        x: normalizedX,
        y: normalizedY,
        timestamp: relativeTime
      });
    }
  });
  ipcMain.handle("open-camera-preview", () => {
    console.log("🔵 IPC: open-camera-preview called");
    console.log("🔵 IPC: createCameraPreviewWindow function exists?", !!createCameraPreviewWindow2);
    if (createCameraPreviewWindow2) {
      try {
        console.log("🔵 IPC: Calling createCameraPreviewWindow()...");
        const win = createCameraPreviewWindow2();
        console.log("🔵 IPC: Camera preview window created with ID:", win == null ? void 0 : win.id);
        console.log("🔵 IPC: Window is destroyed?", win == null ? void 0 : win.isDestroyed());
        console.log("🔵 IPC: Window is visible?", win == null ? void 0 : win.isVisible());
        setTimeout(() => {
          if (win && !win.isDestroyed()) {
            console.log("🔵 IPC: Forcing window to show...");
            win.show();
            win.focus();
            win.setAlwaysOnTop(true, "screen-saver");
            win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            console.log("🔵 IPC: Camera preview window forced to show. Is visible now?", win.isVisible());
          } else {
            console.error("🔵 IPC: Window is destroyed or null, cannot show");
          }
        }, 500);
        return { success: true };
      } catch (error) {
        console.error("🔵 IPC: Error creating camera preview window:", error);
        return { success: false, error: String(error) };
      }
    }
    console.error("🔵 IPC: createCameraPreviewWindow function not available");
    return { success: false, error: "Camera preview not available" };
  });
  ipcMain.handle("close-camera-preview", () => {
    if (closeCameraPreviewWindow) {
      closeCameraPreviewWindow();
      return { success: true };
    }
    return { success: false };
  });
  ipcMain.handle("stop-camera-track", () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("stop-camera-track-request");
      return { success: true };
    }
    return { success: false, error: "Main window not available" };
  });
  ipcMain.handle("stop-mic-track", () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("stop-mic-track-request");
      return { success: true };
    }
    return { success: false, error: "Main window not available" };
  });
  ipcMain.handle("resize-camera-preview", (_, width, height) => {
    const cameraPreviewWin = getCameraPreviewWindow == null ? void 0 : getCameraPreviewWindow();
    if (cameraPreviewWin && !cameraPreviewWin.isDestroyed()) {
      cameraPreviewWin.setSize(width, height, false);
      return { success: true };
    }
    return { success: false };
  });
  ipcMain.handle("open-external-url", async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("Failed to open URL:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("get-asset-base-path", () => {
    try {
      if (app.isPackaged) {
        return path.join(process.resourcesPath, "assets");
      }
      return path.join(app.getAppPath(), "public", "assets");
    } catch (err) {
      console.error("Failed to resolve asset base path:", err);
      return null;
    }
  });
  ipcMain.handle("save-exported-video", async (_, videoData, fileName) => {
    try {
      const isGif = fileName.endsWith(".gif");
      const result = await dialog.showSaveDialog({
        title: isGif ? "Save Exported GIF" : "Save Exported Video",
        defaultPath: path.join(app.getPath("downloads"), fileName),
        filters: [
          { name: isGif ? "GIF Image" : "MP4 Video", extensions: [isGif ? "gif" : "mp4"] },
          { name: "All Files", extensions: ["*"] }
        ],
        properties: ["createDirectory", "showOverwriteConfirmation"]
      });
      if (result.canceled || !result.filePath) {
        return {
          success: false,
          cancelled: true,
          message: "Export cancelled"
        };
      }
      await fs.writeFile(result.filePath, Buffer.from(videoData));
      return {
        success: true,
        path: result.filePath,
        message: "Video exported successfully"
      };
    } catch (error) {
      console.error("Failed to save exported video:", error);
      return {
        success: false,
        message: "Failed to save exported video",
        error: String(error)
      };
    }
  });
  ipcMain.handle("open-video-file-picker", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Select Video File",
        defaultPath: RECORDINGS_DIR,
        filters: [
          { name: "Video Files", extensions: ["webm", "mp4", "mov", "avi", "mkv"] },
          { name: "All Files", extensions: ["*"] }
        ],
        properties: ["openFile"]
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }
      return {
        success: true,
        path: result.filePaths[0]
      };
    } catch (error) {
      console.error("Failed to open file picker:", error);
      return {
        success: false,
        message: "Failed to open file picker",
        error: String(error)
      };
    }
  });
  let currentVideoPath = null;
  let currentCameraVideoPath = null;
  ipcMain.handle("store-recorded-camera-video", async (_, videoData, fileName) => {
    try {
      const videoPath = path.join(RECORDINGS_DIR, fileName);
      await fs.writeFile(videoPath, Buffer.from(videoData));
      currentCameraVideoPath = videoPath;
      return {
        success: true,
        path: videoPath,
        message: "Camera video stored successfully"
      };
    } catch (error) {
      console.error("Failed to store camera video:", error);
      return {
        success: false,
        message: "Failed to store camera video",
        error: String(error)
      };
    }
  });
  ipcMain.handle("set-current-video-path", (_, path2, cameraPath) => {
    currentVideoPath = path2;
    if (cameraPath !== void 0) {
      currentCameraVideoPath = cameraPath;
    }
    return { success: true };
  });
  ipcMain.handle("get-current-video-path", () => {
    return currentVideoPath ? { success: true, path: currentVideoPath } : { success: false };
  });
  ipcMain.handle("get-current-camera-path", () => {
    return currentCameraVideoPath ? { success: true, path: currentCameraVideoPath } : { success: false };
  });
  ipcMain.handle("clear-current-video-path", () => {
    currentVideoPath = null;
    currentCameraVideoPath = null;
    return { success: true };
  });
  const dialogResponseCallbacks = [];
  ipcMain.handle("open-camera-warning-dialog", () => {
    if (createCameraWarningDialogWindow2) {
      createCameraWarningDialogWindow2();
      return { success: true };
    }
    return { success: false, error: "Dialog window not available" };
  });
  ipcMain.handle("close-camera-warning-dialog", () => {
    if (closeCameraWarningDialogWindow) {
      closeCameraWarningDialogWindow();
      return { success: true };
    }
    return { success: false };
  });
  ipcMain.on("camera-warning-dialog-response", (_, data) => {
    dialogResponseCallbacks.forEach((callback) => {
      callback(data.action);
    });
    dialogResponseCallbacks.length = 0;
    if (closeCameraWarningDialogWindow) {
      closeCameraWarningDialogWindow();
    }
  });
  ipcMain.handle("wait-for-camera-warning-dialog-response", () => {
    return new Promise((resolve) => {
      dialogResponseCallbacks.push((action) => {
        resolve(action);
      });
    });
  });
  ipcMain.on("menu-save-project", async () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("save-project-request");
    }
  });
  ipcMain.on("menu-re-record", () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.close();
    }
    createSourceSelectorWindow2("screen");
  });
  ipcMain.on("menu-discard-exit", () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.close();
    }
    if (process.platform !== "darwin") {
      const allWindows = BrowserWindow.getAllWindows();
      if (allWindows.length === 0) {
        app.quit();
      }
    }
  });
  ipcMain.on("close-editor", () => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.close();
    }
  });
  ipcMain.handle("save-project-data", async (_, projectData) => {
    try {
      const PROJECTS_DIR = path.join(app.getPath("userData"), "projects");
      await fs.mkdir(PROJECTS_DIR, { recursive: true });
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const projectFileName = `project-${timestamp}.json`;
      const projectPath = path.join(PROJECTS_DIR, projectFileName);
      await fs.writeFile(projectPath, JSON.stringify(projectData, null, 2), "utf-8");
      return { success: true, path: projectPath };
    } catch (error) {
      console.error("Failed to save project:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings");
async function ensureRecordingsDir() {
  try {
    await fs.mkdir(RECORDINGS_DIR, { recursive: true });
    console.log("RECORDINGS_DIR:", RECORDINGS_DIR);
    console.log("User Data Path:", app.getPath("userData"));
  } catch (error) {
    console.error("Failed to create recordings directory:", error);
  }
}
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let mainWindow = null;
let sourceSelectorWindow = null;
let cameraPreviewWindow = null;
let cameraWarningDialogWindow = null;
let tray = null;
let selectedSourceName = "";
function createWindow() {
  mainWindow = createHudOverlayWindow();
}
function createTray() {
  const iconPath = path.join(process.env.VITE_PUBLIC || RENDERER_DIST, "rec-button.png");
  let icon = nativeImage.createFromPath(iconPath);
  icon = icon.resize({ width: 24, height: 24, quality: "best" });
  tray = new Tray(icon);
  updateTrayMenu();
}
function updateTrayMenu() {
  if (!tray) return;
  const menuTemplate = [
    {
      label: "Stop Recording",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("stop-recording-from-tray");
        }
      }
    }
  ];
  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Recording: ${selectedSourceName}`);
}
function createEditorWindowWrapper() {
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
  mainWindow = createEditorWindow();
  setEditorMenu();
}
function setEditorMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Save Project",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("menu-save-project");
            }
          }
        },
        {
          type: "separator"
        },
        {
          label: "Re-record",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("menu-re-record");
            }
          }
        },
        {
          label: "Discard & Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("menu-discard-exit");
            }
          }
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", label: "Undo" },
        { role: "redo", label: "Redo" },
        { type: "separator" },
        { role: "cut", label: "Cut" },
        { role: "copy", label: "Copy" },
        { role: "paste", label: "Paste" },
        { role: "selectAll", label: "Select All" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "Reload" },
        { role: "forceReload", label: "Force Reload" },
        { role: "toggleDevTools", label: "Toggle Developer Tools" },
        { type: "separator" },
        { role: "resetZoom", label: "Actual Size" },
        { role: "zoomIn", label: "Zoom In" },
        { role: "zoomOut", label: "Zoom Out" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Toggle Fullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize", label: "Minimize" },
        { role: "close", label: "Close" }
      ]
    }
  ];
  if (process.platform === "darwin") {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: "about", label: "About " + app.getName() },
        { type: "separator" },
        { role: "services", label: "Services" },
        { type: "separator" },
        { role: "hide", label: "Hide " + app.getName() },
        { role: "hideOthers", label: "Hide Others" },
        { role: "unhide", label: "Show All" },
        { type: "separator" },
        { role: "quit", label: "Quit " + app.getName() }
      ]
    });
    template[4].submenu = [
      { role: "close", label: "Close" },
      { role: "minimize", label: "Minimize" },
      { role: "zoom", label: "Zoom" },
      { type: "separator" },
      { role: "front", label: "Bring All to Front" }
    ];
  }
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
function createSourceSelectorWindowWrapper(mode) {
  console.log("🔵 main.ts: createSourceSelectorWindowWrapper called with mode:", mode);
  sourceSelectorWindow = createSourceSelectorWindow(mode);
  sourceSelectorWindow.on("closed", () => {
    sourceSelectorWindow = null;
  });
  return sourceSelectorWindow;
}
function createCameraPreviewWindowWrapper() {
  console.log("🔵 main.ts: createCameraPreviewWindowWrapper called");
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    console.log("🔵 main.ts: Reusing existing camera preview window");
    cameraPreviewWindow.show();
    cameraPreviewWindow.focus();
    cameraPreviewWindow.setAlwaysOnTop(true, "screen-saver");
    cameraPreviewWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    console.log("🔵 main.ts: Existing window shown. Is visible?", cameraPreviewWindow.isVisible());
    return cameraPreviewWindow;
  }
  console.log("🔵 main.ts: Creating new camera preview window");
  cameraPreviewWindow = createCameraPreviewWindow();
  console.log("🔵 main.ts: Camera preview window created with ID:", cameraPreviewWindow.id);
  cameraPreviewWindow.on("closed", () => {
    console.log("🔵 main.ts: Camera preview window closed");
    cameraPreviewWindow = null;
  });
  cameraPreviewWindow.once("ready-to-show", () => {
    console.log("🔵 main.ts: Camera preview window ready-to-show");
    if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
      cameraPreviewWindow.show();
      cameraPreviewWindow.focus();
      cameraPreviewWindow.setAlwaysOnTop(true, "screen-saver");
      cameraPreviewWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      console.log("🔵 main.ts: Window shown from ready-to-show. Is visible?", cameraPreviewWindow.isVisible());
    }
  });
  setTimeout(() => {
    if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
      console.log("🔵 main.ts: Force showing window after 100ms");
      cameraPreviewWindow.show();
      cameraPreviewWindow.focus();
      console.log("🔵 main.ts: Window forced to show. Is visible?", cameraPreviewWindow.isVisible());
    }
  }, 100);
  return cameraPreviewWindow;
}
function closeCameraPreviewWindowWrapper() {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.close();
    cameraPreviewWindow = null;
  }
}
function createCameraWarningDialogWindowWrapper() {
  if (cameraWarningDialogWindow && !cameraWarningDialogWindow.isDestroyed()) {
    cameraWarningDialogWindow.show();
    cameraWarningDialogWindow.focus();
    return cameraWarningDialogWindow;
  }
  cameraWarningDialogWindow = createCameraWarningDialogWindow();
  cameraWarningDialogWindow.on("closed", () => {
    cameraWarningDialogWindow = null;
  });
  return cameraWarningDialogWindow;
}
function closeCameraWarningDialogWindowWrapper() {
  if (cameraWarningDialogWindow && !cameraWarningDialogWindow.isDestroyed()) {
    cameraWarningDialogWindow.close();
    cameraWarningDialogWindow = null;
  }
}
app.on("window-all-closed", () => {
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(async () => {
  const { ipcMain: ipcMain2 } = await import("electron");
  ipcMain2.on("hud-overlay-close", () => {
    if (process.platform === "darwin") {
      app.quit();
    }
  });
  await ensureRecordingsDir();
  registerIpcHandlers(
    createEditorWindowWrapper,
    createSourceSelectorWindowWrapper,
    () => mainWindow,
    () => sourceSelectorWindow,
    (recording, sourceName) => {
      selectedSourceName = sourceName;
      if (recording) {
        if (!tray) createTray();
        updateTrayMenu();
      } else {
        if (tray) {
          tray.destroy();
          tray = null;
        }
        if (mainWindow) mainWindow.restore();
      }
    },
    () => cameraPreviewWindow,
    createCameraPreviewWindowWrapper,
    closeCameraPreviewWindowWrapper,
    createCameraWarningDialogWindowWrapper,
    closeCameraWarningDialogWindowWrapper
  );
  createWindow();
});
export {
  MAIN_DIST,
  RECORDINGS_DIR,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
