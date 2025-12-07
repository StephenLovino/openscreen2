import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHudOverlayWindow, createEditorWindow, createSourceSelectorWindow, createCameraPreviewWindow, createCameraWarningDialogWindow } from './windows'
import { registerIpcHandlers } from './ipc/handlers'


const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const RECORDINGS_DIR = path.join(app.getPath('userData'), 'recordings')


async function ensureRecordingsDir() {
  try {
    await fs.mkdir(RECORDINGS_DIR, { recursive: true })
    console.log('RECORDINGS_DIR:', RECORDINGS_DIR)
    console.log('User Data Path:', app.getPath('userData'))
  } catch (error) {
    console.error('Failed to create recordings directory:', error)
  }
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// Window references
let mainWindow: BrowserWindow | null = null
let sourceSelectorWindow: BrowserWindow | null = null
let cameraPreviewWindow: BrowserWindow | null = null
let cameraWarningDialogWindow: BrowserWindow | null = null
let tray: Tray | null = null
let selectedSourceName = ''

function createWindow() {
  mainWindow = createHudOverlayWindow()
}

function createTray() {
  const iconPath = path.join(process.env.VITE_PUBLIC || RENDERER_DIST, 'rec-button.png');
  let icon = nativeImage.createFromPath(iconPath);
  icon = icon.resize({ width: 24, height: 24, quality: 'best' });
  tray = new Tray(icon);
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const menuTemplate = [
    {
      label: 'Stop Recording',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('stop-recording-from-tray');
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
    mainWindow.close()
    mainWindow = null
  }
  mainWindow = createEditorWindow()
  // Set application menu for editor window
  setEditorMenu()
}

function setEditorMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu-save-project')
            }
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Re-record',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu-re-record')
            }
          }
        },
        {
          label: 'Discard & Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu-discard-exit')
            }
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Fullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', label: 'Minimize' },
        { role: 'close', label: 'Close' }
      ]
    }
  ]

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about', label: 'About ' + app.getName() },
        { type: 'separator' },
        { role: 'services', label: 'Services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide ' + app.getName() },
        { role: 'hideOthers', label: 'Hide Others' },
        { role: 'unhide', label: 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit ' + app.getName() }
      ]
    })

    // Window menu
    template[4].submenu = [
      { role: 'close', label: 'Close' },
      { role: 'minimize', label: 'Minimize' },
      { role: 'zoom', label: 'Zoom' },
      { type: 'separator' },
      { role: 'front', label: 'Bring All to Front' }
    ]
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createSourceSelectorWindowWrapper(mode?: 'screen' | 'camera') {
  console.log('🔵 main.ts: createSourceSelectorWindowWrapper called with mode:', mode);
  sourceSelectorWindow = createSourceSelectorWindow(mode)
  sourceSelectorWindow.on('closed', () => {
    sourceSelectorWindow = null
  })
  return sourceSelectorWindow
}

function createCameraPreviewWindowWrapper() {
  console.log('🔵 main.ts: createCameraPreviewWindowWrapper called');
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    console.log('🔵 main.ts: Reusing existing camera preview window');
    cameraPreviewWindow.show();
    cameraPreviewWindow.focus();
    cameraPreviewWindow.setAlwaysOnTop(true, 'screen-saver');
    cameraPreviewWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    console.log('🔵 main.ts: Existing window shown. Is visible?', cameraPreviewWindow.isVisible());
    return cameraPreviewWindow;
  }
  console.log('🔵 main.ts: Creating new camera preview window');
  cameraPreviewWindow = createCameraPreviewWindow();
  console.log('🔵 main.ts: Camera preview window created with ID:', cameraPreviewWindow.id);
  cameraPreviewWindow.on('closed', () => {
    console.log('🔵 main.ts: Camera preview window closed');
    cameraPreviewWindow = null;
  });
  // Ensure window is visible
  cameraPreviewWindow.once('ready-to-show', () => {
    console.log('🔵 main.ts: Camera preview window ready-to-show');
    if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
      cameraPreviewWindow.show();
      cameraPreviewWindow.focus();
      cameraPreviewWindow.setAlwaysOnTop(true, 'screen-saver');
      cameraPreviewWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      console.log('🔵 main.ts: Window shown from ready-to-show. Is visible?', cameraPreviewWindow.isVisible());
    }
  });
  // Also try to show immediately
  setTimeout(() => {
    if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
      console.log('🔵 main.ts: Force showing window after 100ms');
      cameraPreviewWindow.show();
      cameraPreviewWindow.focus();
      console.log('🔵 main.ts: Window forced to show. Is visible?', cameraPreviewWindow.isVisible());
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
  cameraWarningDialogWindow.on('closed', () => {
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

// On macOS, applications and their menu bar stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // Keep app running (macOS behavior)
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})



// Register all IPC handlers when app is ready
app.whenReady().then(async () => {
    // Listen for HUD overlay quit event (macOS only)
    const { ipcMain } = await import('electron');
    ipcMain.on('hud-overlay-close', () => {
      if (process.platform === 'darwin') {
        app.quit();
      }
    });
  // Ensure recordings directory exists
  await ensureRecordingsDir()

  registerIpcHandlers(
    createEditorWindowWrapper,
    createSourceSelectorWindowWrapper,
    () => mainWindow,
    () => sourceSelectorWindow,
    (recording: boolean, sourceName: string) => {
      selectedSourceName = sourceName
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
    closeCameraWarningDialogWindowWrapper,
    () => cameraWarningDialogWindow
  )
  createWindow()
})
