let r = null;
async function l() {
  if (r)
    return r;
  try {
    const o = await import("path"), { fileURLToPath: e } = await import("url"), { createRequire: c } = await import("module"), t = o.dirname(e(import.meta.url)), i = c(import.meta.url), a = [
      o.join(t, "build", "Release", "mouse_click_detector.node"),
      o.join(t, "build", "Debug", "mouse_click_detector.node"),
      o.join(process.cwd(), "electron", "native", "build", "Release", "mouse_click_detector.node"),
      o.join(process.cwd(), "electron", "native", "build", "Debug", "mouse_click_detector.node")
    ];
    for (const n of a)
      try {
        return r = i(n), console.log("🔵 Auto-zoom: Native module loaded from:", n), r;
      } catch {
        continue;
      }
    throw new Error('Native module not found. Run "npm run build:native" to build it.');
  } catch (o) {
    throw console.error("🔵 Auto-zoom: Failed to load native module:", o), o;
  }
}
async function u(o) {
  try {
    const e = await l(), c = (t) => {
      o(t.x, t.y, t.timestamp);
    };
    return e.startDetection(c), () => {
      try {
        e.stopDetection();
      } catch (t) {
        console.error("🔵 Auto-zoom: Error stopping native detection:", t);
      }
    };
  } catch (e) {
    throw console.error("🔵 Auto-zoom: Failed to start macOS click detection:", e), e;
  }
}
async function d() {
  if (r)
    try {
      r.stopDetection();
    } catch (o) {
      console.error("🔵 Auto-zoom: Error stopping native detection:", o);
    }
}
export {
  u as startMacOSClickDetection,
  d as stopMacOSClickDetection
};
