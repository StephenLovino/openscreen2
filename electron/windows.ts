import { BrowserWindow, screen } from 'electron'
import { ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(APP_ROOT, 'dist')

let hudOverlayWindow: BrowserWindow | null = null;

ipcMain.on('hud-overlay-hide', () => {
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.minimize();
  }
});

export function createHudOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;


  const windowWidth = 500;
  // Make HUD window just tall enough for the bar itself so there is
  // essentially no transparent padding above/below.
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
    x: x,
    y: y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })


  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  hudOverlayWindow = win;

  win.on('closed', () => {
    if (hudOverlayWindow === win) {
      hudOverlayWindow = null;
    }
  });


  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=hud-overlay')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { 
      query: { windowType: 'hud-overlay' } 
    })
  }

  return win
}

export function createEditorWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: 'OpenScreen',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
    },
  })

  // Maximize the window by default
  win.maximize();

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=editor')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { 
      query: { windowType: 'editor' } 
    })
  }

  return win
}

export function createSourceSelectorWindow(mode?: 'screen' | 'camera'): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  
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
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Construct URL with mode parameter
  if (VITE_DEV_SERVER_URL) {
    const baseUrl = VITE_DEV_SERVER_URL.endsWith('/') 
      ? VITE_DEV_SERVER_URL.slice(0, -1) 
      : VITE_DEV_SERVER_URL;
    const url = mode 
      ? `${baseUrl}?windowType=source-selector&mode=${mode}`
      : `${baseUrl}?windowType=source-selector`;
    console.log('🔵 windows.ts: Loading URL:', url);
    win.loadURL(url);
  } else {
    const query: { windowType: string; mode?: string } = { windowType: 'source-selector' }
    if (mode) {
      query.mode = mode;
    }
    console.log('🔵 windows.ts: Loading file with query:', query);
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { query })
  }

  return win
}

export function createCameraPreviewWindow(): BrowserWindow {
  console.log('🔵 windows.ts: createCameraPreviewWindow called');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  
  // Create a compact floating window, positioned top-right.
  // Size matches editor overlay: 250px preview + ~60px for controls = 310px total
  // Initial size will be adjusted by the component based on shape/size selection
  const winWidth = 310;
  const winHeight = 310;
  const x = Math.round(width - winWidth - 20);
  const y = 20;
  
  console.log('🔵 windows.ts: Creating camera preview window at', x, y, 'size', winWidth, 'x', winHeight);
  
  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 250,
    minHeight: 250,
    maxWidth: 640,
    maxHeight: 640,
    x: x,
    y: y,
    frame: false,
    resizable: false, // Don't allow resizing - size is controlled by UI
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    show: true, // Show immediately - we'll ensure it stays visible
    movable: true, // Allow window to be moved
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })
  
  // Ensure window is visible and on top
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.webContents.on('did-finish-load', () => {
    console.log('🔵 windows.ts: Camera preview window loaded, showing...');
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
    // Show and focus the window
    win.show();
    win.focus();
    win.setAlwaysOnTop(true, 'screen-saver'); // Ensure it stays on top
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    console.log('🔵 windows.ts: Camera preview window shown and focused. Is visible?', win.isVisible());
  })
  
  // Also show when DOM is ready
  win.webContents.once('dom-ready', () => {
    console.log('🔵 windows.ts: Camera preview DOM ready, forcing show...');
    win.show();
    win.focus();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    console.log('🔵 windows.ts: Camera preview window forced to show. Is visible?', win.isVisible());
  })
  
  // Show immediately after creation
  win.once('ready-to-show', () => {
    console.log('🔵 windows.ts: Camera preview ready-to-show event');
    win.show();
    win.focus();
  })

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('🔵 windows.ts: Camera preview window failed to load:', errorCode, errorDescription);
  })

  if (VITE_DEV_SERVER_URL) {
    const baseUrl = VITE_DEV_SERVER_URL.endsWith('/') 
      ? VITE_DEV_SERVER_URL.slice(0, -1) 
      : VITE_DEV_SERVER_URL;
    const url = baseUrl + '?windowType=camera-preview';
    console.log('🔵 windows.ts: Loading camera preview URL:', url);
    win.loadURL(url);
  } else {
    const query = { windowType: 'camera-preview' };
    console.log('🔵 windows.ts: Loading camera preview file with query:', query);
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { query });
  }

  console.log('🔵 windows.ts: Camera preview window created with ID:', win.id);
  return win
}

export function createCameraWarningDialogWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  
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
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    const baseUrl = VITE_DEV_SERVER_URL.endsWith('/') 
      ? VITE_DEV_SERVER_URL.slice(0, -1) 
      : VITE_DEV_SERVER_URL;
    const url = `${baseUrl}?windowType=camera-warning-dialog`;
    win.loadURL(url);
  } else {
    const query = { windowType: 'camera-warning-dialog' };
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { query });
  }

  return win
}
