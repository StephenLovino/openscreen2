/**
 * Native mouse click detector for macOS
 * Uses CGEventTap API to monitor global mouse clicks
 */

let nativeModule: any = null;

async function loadNativeModule() {
  if (nativeModule) {
    return nativeModule;
  }
  
  try {
    // Try to load the native module using require (works better for .node files)
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const { createRequire } = await import('module');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const require = createRequire(import.meta.url);
    
    // In development, the module might be in different locations
    // Try multiple paths
    const possiblePaths = [
      path.join(__dirname, 'build', 'Release', 'mouse_click_detector.node'),
      path.join(__dirname, 'build', 'Debug', 'mouse_click_detector.node'),
      path.join(process.cwd(), 'electron', 'native', 'build', 'Release', 'mouse_click_detector.node'),
      path.join(process.cwd(), 'electron', 'native', 'build', 'Debug', 'mouse_click_detector.node'),
    ];
    
    for (const modulePath of possiblePaths) {
      try {
        // Use require for .node files
        nativeModule = require(modulePath);
        console.log('🔵 Auto-zoom: Native module loaded from:', modulePath);
        return nativeModule;
      } catch (e) {
        // Try next path
        continue;
      }
    }
    
    throw new Error('Native module not found. Run "npm run build:native" to build it.');
  } catch (error) {
    console.error('🔵 Auto-zoom: Failed to load native module:', error);
    throw error;
  }
}

export async function startMacOSClickDetection(callback: (x: number, y: number, timestamp: number) => void): Promise<() => void> {
  try {
    const module = await loadNativeModule();
    
    // Wrap the callback to match the native module's expected signature
    const wrappedCallback = (data: { x: number; y: number; timestamp: number }) => {
      callback(data.x, data.y, data.timestamp);
    };
    
    module.startDetection(wrappedCallback);
    
    // Return cleanup function
    return () => {
      try {
        module.stopDetection();
      } catch (error) {
        console.error('🔵 Auto-zoom: Error stopping native detection:', error);
      }
    };
  } catch (error) {
    console.error('🔵 Auto-zoom: Failed to start macOS click detection:', error);
    throw error;
  }
}

export async function stopMacOSClickDetection(): Promise<void> {
  if (nativeModule) {
    try {
      nativeModule.stopDetection();
    } catch (error) {
      console.error('🔵 Auto-zoom: Error stopping native detection:', error);
    }
  }
}

