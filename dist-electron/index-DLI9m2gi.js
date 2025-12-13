let nativeModule = null;
async function loadNativeModule() {
  if (nativeModule) {
    return nativeModule;
  }
  try {
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const possiblePaths = [
      path.join(__dirname, "build", "Release", "mouse_click_detector.node"),
      path.join(__dirname, "build", "Debug", "mouse_click_detector.node"),
      path.join(process.cwd(), "electron", "native", "build", "Release", "mouse_click_detector.node"),
      path.join(process.cwd(), "electron", "native", "build", "Debug", "mouse_click_detector.node")
    ];
    for (const modulePath of possiblePaths) {
      try {
        nativeModule = await import(modulePath);
        console.log("🔵 Auto-zoom: Native module loaded from:", modulePath);
        return nativeModule;
      } catch (e) {
        continue;
      }
    }
    throw new Error("Native module not found. Please rebuild the native addon.");
  } catch (error) {
    console.error("🔵 Auto-zoom: Failed to load native module:", error);
    throw error;
  }
}
async function startMacOSClickDetection(callback) {
  try {
    const module = await loadNativeModule();
    const wrappedCallback = (data) => {
      callback(data.x, data.y, data.timestamp);
    };
    module.startDetection(wrappedCallback);
    return () => {
      try {
        module.stopDetection();
      } catch (error) {
        console.error("🔵 Auto-zoom: Error stopping native detection:", error);
      }
    };
  } catch (error) {
    console.error("🔵 Auto-zoom: Failed to start macOS click detection:", error);
    throw error;
  }
}
async function stopMacOSClickDetection() {
  if (nativeModule) {
    try {
      nativeModule.stopDetection();
    } catch (error) {
      console.error("🔵 Auto-zoom: Error stopping native detection:", error);
    }
  }
}
export {
  startMacOSClickDetection,
  stopMacOSClickDetection
};
