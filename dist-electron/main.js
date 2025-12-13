import { ipcMain as c, screen as oe, BrowserWindow as F, app as f, desktopCapturer as Ae, shell as ke, dialog as ne, Menu as se, nativeImage as Ie, Tray as xe } from "electron";
import { fileURLToPath as ae } from "node:url";
import m from "node:path";
import I from "node:fs/promises";
const V = m.dirname(ae(import.meta.url)), De = m.join(V, ".."), S = process.env.VITE_DEV_SERVER_URL, K = m.join(De, "dist");
let q = null;
c.on("hud-overlay-hide", () => {
  q && !q.isDestroyed() && q.minimize();
});
function ze() {
  const s = oe.getPrimaryDisplay(), { workArea: d } = s, i = 500, b = 48, v = Math.floor(d.x + (d.width - i) / 2), z = Math.floor(d.y + d.height - b - 5), l = new F({
    width: i,
    height: b,
    minWidth: 500,
    maxWidth: 500,
    minHeight: b,
    maxHeight: b,
    x: v,
    y: z,
    frame: !1,
    transparent: !0,
    resizable: !1,
    alwaysOnTop: !0,
    skipTaskbar: !0,
    hasShadow: !1,
    webPreferences: {
      preload: m.join(V, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      backgroundThrottling: !1
    }
  });
  return l.setIgnoreMouseEvents(!1), l.webContents.on("did-finish-load", () => {
    l == null || l.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString()), S && l.webContents.openDevTools();
  }), q = l, l.on("closed", () => {
    q === l && (q = null);
  }), S ? l.loadURL(S + "?windowType=hud-overlay") : l.loadFile(m.join(K, "index.html"), {
    query: { windowType: "hud-overlay" }
  }), l;
}
function Ee() {
  const s = new F({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    transparent: !1,
    resizable: !0,
    alwaysOnTop: !1,
    skipTaskbar: !1,
    title: "AHA Clips",
    backgroundColor: "#000000",
    webPreferences: {
      preload: m.join(V, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      webSecurity: !1,
      backgroundThrottling: !1
    }
  });
  return s.maximize(), s.webContents.on("did-finish-load", () => {
    s == null || s.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), S ? s.loadURL(S + "?windowType=editor") : s.loadFile(m.join(K, "index.html"), {
    query: { windowType: "editor" }
  }), s;
}
function Te(s) {
  const { width: d, height: i } = oe.getPrimaryDisplay().workAreaSize, b = new F({
    width: 620,
    height: 420,
    minHeight: 350,
    maxHeight: 500,
    x: Math.round((d - 620) / 2),
    y: Math.round((i - 420) / 2),
    frame: !1,
    resizable: !1,
    alwaysOnTop: !0,
    transparent: !0,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: m.join(V, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0
    }
  });
  if (S) {
    const v = S.endsWith("/") ? S.slice(0, -1) : S, z = s ? `${v}?windowType=source-selector&mode=${s}` : `${v}?windowType=source-selector`;
    console.log("🔵 windows.ts: Loading URL:", z), b.loadURL(z);
  } else {
    const v = { windowType: "source-selector" };
    s && (v.mode = s), console.log("🔵 windows.ts: Loading file with query:", v), b.loadFile(m.join(K, "index.html"), { query: v });
  }
  return b;
}
function Le() {
  console.log("🔵 windows.ts: createCameraPreviewWindow called");
  const { width: s, height: d } = oe.getPrimaryDisplay().workAreaSize, i = 250, b = 250, v = Math.round(s - i - 20), z = 20;
  console.log("🔵 windows.ts: Creating camera preview window at", v, z, "size", i, "x", b);
  const l = new F({
    width: i,
    height: b,
    minWidth: 250,
    minHeight: 250,
    maxWidth: 640,
    maxHeight: 640,
    x: v,
    y: z,
    frame: !1,
    resizable: !1,
    // Don't allow resizing - size is controlled by UI
    alwaysOnTop: !0,
    transparent: !0,
    backgroundColor: "#00000000",
    skipTaskbar: !0,
    show: !0,
    // Show immediately - we'll ensure it stays visible
    movable: !0,
    // Allow window to be moved
    webPreferences: {
      preload: m.join(V, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      backgroundThrottling: !1
    }
  });
  if (l.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), l.webContents.on("did-finish-load", () => {
    console.log("🔵 windows.ts: Camera preview window loaded, showing..."), l == null || l.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString()), l.show(), l.focus(), l.setAlwaysOnTop(!0, "screen-saver"), l.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 windows.ts: Camera preview window shown and focused. Is visible?", l.isVisible());
  }), l.webContents.once("dom-ready", () => {
    console.log("🔵 windows.ts: Camera preview DOM ready, forcing show..."), l.show(), l.focus(), l.setAlwaysOnTop(!0, "screen-saver"), l.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 windows.ts: Camera preview window forced to show. Is visible?", l.isVisible());
  }), l.once("ready-to-show", () => {
    console.log("🔵 windows.ts: Camera preview ready-to-show event"), l.show(), l.focus();
  }), l.webContents.on("did-fail-load", (O, M, $) => {
    console.error("🔵 windows.ts: Camera preview window failed to load:", M, $);
  }), S) {
    const M = (S.endsWith("/") ? S.slice(0, -1) : S) + "?windowType=camera-preview";
    console.log("🔵 windows.ts: Loading camera preview URL:", M), l.loadURL(M);
  } else {
    const O = { windowType: "camera-preview" };
    console.log("🔵 windows.ts: Loading camera preview file with query:", O), l.loadFile(m.join(K, "index.html"), { query: O });
  }
  return console.log("🔵 windows.ts: Camera preview window created with ID:", l.id), l;
}
function Oe() {
  const { width: s, height: d } = oe.getPrimaryDisplay().workAreaSize, i = new F({
    width: 600,
    height: 500,
    minWidth: 500,
    minHeight: 400,
    x: Math.round((s - 600) / 2),
    y: Math.round((d - 500) / 2),
    frame: !0,
    resizable: !0,
    alwaysOnTop: !1,
    backgroundColor: "#09090b",
    webPreferences: {
      preload: m.join(V, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0
    },
    title: "Settings - AHA Clips"
  });
  return S ? i.loadURL(`${S}?windowType=settings`) : i.loadFile(m.join(K, "index.html"), {
    query: { windowType: "settings" }
  }), i;
}
function We() {
  const { width: s, height: d } = oe.getPrimaryDisplay().workAreaSize, i = new F({
    width: 480,
    height: 280,
    minWidth: 400,
    minHeight: 240,
    maxWidth: 600,
    maxHeight: 400,
    x: Math.round((s - 480) / 2),
    y: Math.round((d - 280) / 2),
    frame: !1,
    resizable: !1,
    alwaysOnTop: !0,
    transparent: !0,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: m.join(V, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0
    }
  });
  if (S) {
    const v = `${S.endsWith("/") ? S.slice(0, -1) : S}?windowType=camera-warning-dialog`;
    i.loadURL(v);
  } else {
    const b = { windowType: "camera-warning-dialog" };
    i.loadFile(m.join(K, "index.html"), { query: b });
  }
  return i;
}
const Me = "aha-config.json";
function le() {
  const s = f.getPath("userData");
  return m.join(s, Me);
}
async function Q() {
  try {
    const s = le(), d = await I.readFile(s, "utf-8"), i = JSON.parse(d);
    return !i.apiKey || typeof i.apiKey != "string" ? (console.error("[AhaConfig] Invalid config: missing or invalid apiKey"), null) : i.subaccountId !== void 0 && typeof i.subaccountId != "string" ? (console.error("[AhaConfig] Invalid config: subaccountId must be a string if provided"), null) : i;
  } catch (s) {
    return s.code === "ENOENT" || console.error("[AhaConfig] Error reading config:", s), null;
  }
}
async function Re(s) {
  try {
    if (!s.apiKey || typeof s.apiKey != "string")
      throw new Error("Invalid config: apiKey is required and must be a string");
    if (s.subaccountId !== void 0 && typeof s.subaccountId != "string")
      throw new Error("Invalid config: subaccountId must be a string if provided");
    const d = le(), i = JSON.stringify(s, null, 2);
    return await I.writeFile(d, i, "utf-8"), console.log("[AhaConfig] Config saved successfully"), !0;
  } catch (d) {
    return console.error("[AhaConfig] Error saving config:", d), !1;
  }
}
async function _e() {
  try {
    const s = le();
    return await I.unlink(s), console.log("[AhaConfig] Config deleted successfully"), !0;
  } catch (s) {
    return s.code === "ENOENT" ? !0 : (console.error("[AhaConfig] Error deleting config:", s), !1);
  }
}
async function Fe() {
  return await Q() !== null;
}
async function Ue(s, d, i, b) {
  try {
    const z = await (await import("fs/promises")).readFile(s), l = await fetch("https://api.ahainnovations.com/v1/media/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${i}`,
        "Content-Type": "application/octet-stream",
        ...b && { "X-Subaccount-Id": b }
      },
      body: z
    });
    if (!l.ok) {
      const M = await l.text();
      return {
        success: !1,
        error: `Upload failed: ${l.status} ${M}`
      };
    }
    const O = await l.json();
    return {
      success: !0,
      mediaId: O.mediaId,
      url: O.url
    };
  } catch (v) {
    return {
      success: !1,
      error: v instanceof Error ? v.message : "Unknown error occurred"
    };
  }
}
async function je(s, d) {
  try {
    const i = await fetch(`https://api.ahainnovations.com/v1/media/${s}/url`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${d}`
      }
    });
    if (!i.ok) {
      const v = await i.text();
      return {
        success: !1,
        error: `Failed to get media URL: ${i.status} ${v}`
      };
    }
    return {
      success: !0,
      url: (await i.json()).url
    };
  } catch (i) {
    return {
      success: !1,
      error: i instanceof Error ? i.message : "Unknown error occurred"
    };
  }
}
async function Ne(s) {
  try {
    const d = await fetch("https://api.ahainnovations.com/v1/auth/verify", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${s}`
      }
    });
    return d.ok ? {
      valid: !0
    } : {
      valid: !1,
      error: `API key verification failed: ${d.status}`
    };
  } catch (d) {
    return {
      valid: !1,
      error: d instanceof Error ? d.message : "Unknown error occurred"
    };
  }
}
const He = m.dirname(ae(import.meta.url));
let N = null, _ = [], pe = 0;
function Ve(s, d, i, b, v, z, l, O, M, $, oo, ce) {
  c.handle("get-sources", async (e, t) => (await Ae.getSources(t)).map((r) => ({
    id: r.id,
    name: r.name,
    display_id: r.display_id,
    thumbnail: r.thumbnail ? r.thumbnail.toDataURL() : null,
    appIcon: r.appIcon ? r.appIcon.toDataURL() : null
  }))), c.handle("select-source", (e, t) => {
    N = t;
    const o = b();
    return o && o.close(), N;
  }), c.handle("select-sources", (e, t) => {
    console.log("🔵 IPC: select-sources called with sources:", JSON.stringify(t, null, 2));
    const o = {};
    for (const n of _)
      n != null && n.id && (o[n.id] = n);
    for (const n of t)
      n != null && n.id && (o[n.id] = n);
    _ = Object.values(o), N = _.length > 0 ? _[0] : null, console.log("🔵 IPC: Stored selectedSources:", _.length, "sources");
    const r = _.some((n) => {
      var a;
      return n.type === "camera" || ((a = n.id) == null ? void 0 : a.startsWith("camera:"));
    });
    return console.log("🔵 IPC: Camera source found?", r), _;
  }), c.handle("get-selected-source", () => N), c.handle("get-selected-sources", () => {
    const e = _.length > 0 ? _ : N ? [N] : [];
    if (e.length > 0 && Date.now() - pe > 5e3) {
      const t = e.map((o) => {
        var r;
        return `${o.type || "unknown"}:${(r = o.id) == null ? void 0 : r.substring(0, 20)}...`;
      }).join(", ");
      console.log("🔵 IPC: get-selected-sources returning:", e.length, "sources:", t), pe = Date.now();
    }
    return e;
  }), c.handle("open-source-selector", (e, t) => {
    console.log("🔵 IPC: open-source-selector called with mode:", t);
    const o = b();
    if (o && !o.isDestroyed()) {
      const r = process.env.VITE_DEV_SERVER_URL;
      if (console.log("🔵 IPC: VITE_DEV_SERVER_URL:", r), r) {
        const n = r.endsWith("/") ? r.slice(0, -1) : r, a = t ? `${n}?windowType=source-selector&mode=${t}` : `${n}?windowType=source-selector`;
        console.log("🔵 IPC: Reloading window with URL:", a), o.webContents.loadURL(a);
      } else {
        const n = m.join(He, ".."), a = m.join(n, "dist"), p = { windowType: "source-selector" };
        t && (p.mode = t), console.log("🔵 IPC: Loading file with query:", p), o.webContents.loadFile(m.join(a, "index.html"), { query: p });
      }
      o.focus();
      return;
    }
    console.log("🔵 IPC: Creating new source selector window with mode:", t), d(t);
  }), c.handle("switch-to-editor", () => {
    const e = i();
    e && e.close(), s();
  }), c.handle("open-settings", () => {
    ce && ce();
  }), c.handle("store-recorded-video", async (e, t, o) => {
    try {
      const r = m.join(H, o);
      return await I.writeFile(r, Buffer.from(t)), J = r, {
        success: !0,
        path: r,
        message: "Video stored successfully"
      };
    } catch (r) {
      return console.error("Failed to store video:", r), {
        success: !1,
        message: "Failed to store video",
        error: String(r)
      };
    }
  }), c.handle("get-recorded-video-path", async () => {
    try {
      const t = (await I.readdir(H)).filter((n) => n.endsWith(".webm"));
      if (t.length === 0)
        return { success: !1, message: "No recorded video found" };
      const o = t.sort().reverse()[0];
      return { success: !0, path: m.join(H, o) };
    } catch (e) {
      return console.error("Failed to get video path:", e), { success: !1, message: "Failed to get video path", error: String(e) };
    }
  });
  let E = null, te = 0, re = !1, k = null, G = 0;
  const ue = 100, Z = (e, t) => {
    if (!re) return;
    const o = Date.now();
    if (o - G < ue)
      return;
    G = o;
    const r = o - te;
    let n = 0.5, a = 0.5;
    if (k && k.width > 0 && k.height > 0) {
      const h = Math.max(0, Math.min(k.width, e)), u = Math.max(0, Math.min(k.height, t));
      n = h / k.width, a = u / k.height;
    }
    console.log("🔵 Auto-zoom: Mouse click detected at:", {
      normalized: { x: n, y: a },
      absolute: { x: e, y: t },
      screenBounds: k,
      time: r
    });
    const p = i();
    p && !p.isDestroyed() ? (p.webContents.send("auto-zoom-click-event", {
      x: n,
      y: a,
      timestamp: r
    }), console.log("🔵 Auto-zoom: Click event sent successfully")) : console.warn("🔵 Auto-zoom: Cannot send click event - main window is null or destroyed");
  }, ve = async () => {
    const { screen: e } = await import("electron"), o = (await import("os")).platform();
    console.log("🔵 Auto-zoom: Starting mouse click detection on platform:", o), o === "linux" ? await be(e) : o === "darwin" ? await Ce(e) : o === "win32" ? await Pe() : console.warn("🔵 Auto-zoom: Unsupported platform:", o);
  }, be = async (e) => {
    const { spawn: t, exec: o } = await import("child_process"), { promisify: r } = await import("util"), n = r(o);
    try {
      const { stdout: a } = await n("xinput list"), p = a.split(`
`);
      let h = null;
      for (const P of p) {
        const g = P.toLowerCase();
        if ((g.includes("mouse") || g.includes("trackpad") || g.includes("touchpad")) && !g.includes("xtest") && !g.includes("virtual core") && !g.includes("master pointer") && g.includes("slave")) {
          const L = P.match(/id=(\d+)/);
          if (L) {
            h = L[1], console.log("🔵 Auto-zoom: Found real mouse device:", P.trim(), "ID:", h);
            break;
          }
        }
      }
      if (!h)
        for (const P of p) {
          const g = P.toLowerCase();
          if (g.includes("slave") && g.includes("pointer") && !g.includes("xtest") && !g.includes("virtual core") && !g.includes("master")) {
            const L = P.match(/id=(\d+)/);
            if (L) {
              h = L[1], console.log("🔵 Auto-zoom: Found pointer device (fallback):", P.trim(), "ID:", h);
              break;
            }
          }
        }
      if (!h) {
        console.warn("🔵 Auto-zoom: Could not find mouse device, click detection disabled"), console.log("🔵 Auto-zoom: Available devices:", a);
        return;
      }
      let u = null, C = !1;
      try {
        u = t("xinput", ["test", h]), console.log("🔵 Auto-zoom: Using xinput test with device ID:", h);
      } catch (P) {
        console.warn("🔵 Auto-zoom: test failed, trying test-xi2 --root:", P), C = !0;
        try {
          u = t("xinput", ["test-xi2", "--root"]), console.log("🔵 Auto-zoom: Using xinput test-xi2 --root as fallback");
        } catch (g) {
          console.error("🔵 Auto-zoom: Both test methods failed:", g);
          return;
        }
      }
      let A = !1, x = 0, T = 0;
      u.stdout.on("data", (P) => {
        const g = P.toString();
        console.log("🔵 Auto-zoom: Raw xinput output:", g.substring(0, 200));
        const L = g.split(`
`);
        for (const de of L) {
          const R = de.trim();
          if (R)
            if (C) {
              const W = R.toLowerCase();
              if (W.includes("button"))
                if (W.includes("press") || W.includes("down")) {
                  A = !0;
                  const B = R.match(/(?:root_)?x[=:]?\s*([\d.]+)/i), Y = R.match(/(?:root_)?y[=:]?\s*([\d.]+)/i);
                  if (B && Y)
                    x = parseFloat(B[1]), T = parseFloat(Y[1]);
                  else {
                    const me = e.getCursorScreenPoint();
                    x = me.x, T = me.y;
                  }
                  console.log("🔵 Auto-zoom: Button pressed at:", { x, y: T, rawLine: R });
                } else (W.includes("release") || W.includes("up")) && A && (A = !1, console.log("🔵 Auto-zoom: Button released, handling click at:", { x, y: T }), Z(x, T));
            } else if (R.includes("button press")) {
              A = !0;
              const W = e.getCursorScreenPoint();
              x = W.x, T = W.y, console.log("🔵 Auto-zoom: Button pressed at:", { x, y: T });
            } else R.includes("button release") && A && (A = !1, console.log("🔵 Auto-zoom: Button released, handling click at:", { x, y: T }), Z(x, T));
        }
      }), u.stderr.on("data", (P) => {
        const g = P.toString();
        if (C && g.includes("Unable to find device") || g.includes("error")) {
          console.warn("🔵 Auto-zoom: test-xi2 failed, trying test with device ID:", h), C = !1, u && u.kill();
          try {
            u = t("xinput", ["test", h]), u.stdout.on("data", (L) => {
              const R = L.toString().split(`
`);
              for (const W of R) {
                const B = W.trim();
                if (B)
                  if (B.includes("button press")) {
                    A = !0;
                    const Y = e.getCursorScreenPoint();
                    x = Y.x, T = Y.y, console.log("🔵 Auto-zoom: Button pressed at:", { x, y: T });
                  } else B.includes("button release") && A && (A = !1, Z(x, T));
              }
            }), E = u;
          } catch (L) {
            console.error("🔵 Auto-zoom: Fallback to test also failed:", L);
          }
        } else !g.includes("WARNING") && !g.includes("Unable to connect") && console.error("🔵 Auto-zoom: xinput error:", g);
      }), u.on("close", (P) => {
        console.log("🔵 Auto-zoom: xinput process closed with code:", P), P !== 0 && P !== null && console.warn("🔵 Auto-zoom: xinput process exited unexpectedly");
      }), u.on("error", (P) => {
        console.error("🔵 Auto-zoom: xinput process error:", P);
      }), E = u, console.log("🔵 Auto-zoom: Linux mouse click detection started successfully");
    } catch (a) {
      console.error("🔵 Auto-zoom: Error starting Linux mouse click detection:", a);
    }
  }, Ce = async (e) => {
    const { spawn: t } = await import("child_process");
    try {
      try {
        const n = await import("./index-CQUquVNU.js");
        console.log("🔵 Auto-zoom: Attempting to use native macOS click detection module"), E = { kill: await n.startMacOSClickDetection((p, h, u) => {
          const C = u - te;
          Z(p, h);
        }) }, console.log("🔵 Auto-zoom: macOS native click detection started successfully");
        return;
      } catch (n) {
        console.warn("🔵 Auto-zoom: Native module not available, falling back to command-line approach:", n);
      }
      console.log("🔵 Auto-zoom: Using polling fallback for macOS click detection"), console.warn("🔵 Auto-zoom: For better reliability, build the native module with: npm run build:native");
      let o = { left: !1, right: !1 };
      const r = setInterval(() => {
        try {
          const n = e.getCursorScreenPoint();
        } catch (n) {
          console.error("🔵 Auto-zoom: Error in polling:", n);
        }
      }, 50);
      E = {
        kill: () => clearInterval(r),
        interval: r
      }, console.log("🔵 Auto-zoom: macOS click detection started (polling fallback - limited functionality)"), console.warn("🔵 Auto-zoom: Native module recommended for full click detection. Run: npm run build:native");
      return;
    } catch (o) {
      console.error("🔵 Auto-zoom: Error starting macOS mouse click detection:", o), console.warn("🔵 Auto-zoom: macOS click detection requires either:"), console.warn("   1. Native module (requires compilation)"), console.warn("   2. Accessibility permissions for native module"), console.warn("   3. System logs access for command-line fallback");
    }
  }, Pe = async (e) => {
    const { spawn: t } = await import("child_process");
    try {
      console.log("🔵 Auto-zoom: Starting Windows click detection using PowerShell");
      const r = t("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `
        Add-Type -TypeDefinition @"
          using System;
          using System.Runtime.InteropServices;
          using System.Windows.Forms;
          
          public class MouseHook {
            private static LowLevelMouseProc _proc = HookCallback;
            private static IntPtr _hookID = IntPtr.Zero;
            private static Action<int, int> _callback;
            
            public static void SetCallback(Action<int, int> callback) {
              _callback = callback;
            }
            
            public static void Start() {
              _hookID = SetHook(_proc);
            }
            
            public static void Stop() {
              UnhookWindowsHookEx(_hookID);
            }
            
            private static IntPtr SetHook(LowLevelMouseProc proc) {
              using (var curProcess = System.Diagnostics.Process.GetCurrentProcess())
              using (var curModule = curProcess.MainModule) {
                return SetWindowsHookEx(WH_MOUSE_LL, proc,
                  GetModuleHandle(curModule.ModuleName), 0);
              }
            }
            
            private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);
            
            private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
              if (nCode >= 0 && (wParam == (IntPtr)WM_LBUTTONDOWN || wParam == (IntPtr)WM_RBUTTONDOWN)) {
                MSLLHOOKSTRUCT hookStruct = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
                _callback?.Invoke(hookStruct.pt.x, hookStruct.pt.y);
              }
              return CallNextHookEx(_hookID, nCode, wParam, lParam);
            }
            
            private const int WH_MOUSE_LL = 14;
            private const int WM_LBUTTONDOWN = 0x0201;
            private const int WM_RBUTTONDOWN = 0x0204;
            
            [StructLayout(LayoutKind.Sequential)]
            private struct POINT {
              public int x;
              public int y;
            }
            
            [StructLayout(LayoutKind.Sequential)]
            private struct MSLLHOOKSTRUCT {
              public POINT pt;
              public uint mouseData;
              public uint flags;
              public uint time;
              public IntPtr dwExtraInfo;
            }
            
            [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
            private static extern IntPtr SetWindowsHookEx(int idHook,
              LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);
            
            [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
            [return: MarshalAs(UnmanagedType.Bool)]
            private static extern bool UnhookWindowsHookEx(IntPtr hhk);
            
            [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
            private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode,
              IntPtr wParam, IntPtr lParam);
            
            [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
            private static extern IntPtr GetModuleHandle(string lpModuleName);
          }
"@
        
        $script:mouseHook = [MouseHook]::new()
        [MouseHook]::SetCallback({
          param($x, $y)
          Write-Output "CLICK:$x,$y"
        })
        
        [MouseHook]::Start()
        
        # Keep script running
        try {
          while ($true) {
            Start-Sleep -Milliseconds 100
          }
        } finally {
          [MouseHook]::Stop()
        }
      `]);
      let n = "";
      r.stdout.on("data", (a) => {
        n += a.toString();
        const p = n.split(`
`);
        n = p.pop() || "";
        for (const h of p) {
          const u = h.trim();
          if (u.startsWith("CLICK:")) {
            const C = u.substring(6).split(",");
            if (C.length === 2) {
              const A = parseInt(C[0], 10), x = parseInt(C[1], 10);
              !isNaN(A) && !isNaN(x) && Z(A, x);
            }
          }
        }
      }), r.stderr.on("data", (a) => {
        const p = a.toString();
        !p.includes("WARNING") && !p.includes("INFO") && console.error("🔵 Auto-zoom: PowerShell error:", p);
      }), r.on("close", (a) => {
        console.log("🔵 Auto-zoom: PowerShell process closed with code:", a), a !== 0 && a !== null && console.warn("🔵 Auto-zoom: PowerShell process exited unexpectedly");
      }), r.on("error", (a) => {
        console.error("🔵 Auto-zoom: PowerShell process error:", a), console.warn("🔵 Auto-zoom: Windows click detection requires PowerShell. Please ensure PowerShell is available.");
      }), E = r, console.log("🔵 Auto-zoom: Windows click detection started successfully");
    } catch (o) {
      console.error("🔵 Auto-zoom: Error starting Windows mouse click detection:", o), console.warn("🔵 Auto-zoom: Windows click detection requires PowerShell to be available.");
    }
  }, Se = () => {
    if (E)
      try {
        typeof E.kill == "function" && E.kill.length, E.kill(), E = null, console.log("🔵 Auto-zoom: Mouse click detection stopped");
      } catch (e) {
        console.error("🔵 Auto-zoom: Error stopping click detection:", e);
      }
  };
  c.handle("set-recording-state", async (e, t, o) => {
    if (v && v(t, (N || { name: "Screen" }).name), re = o || !1, t && re) {
      te = Date.now(), G = 0;
      const { screen: n } = await import("electron"), a = n.getPrimaryDisplay();
      k = {
        width: a.workAreaSize.width,
        height: a.workAreaSize.height
      }, console.log("🔵 Auto-zoom: Starting mouse click detection"), await ve();
    } else
      Se(), console.log("🔵 Auto-zoom: Stopping click detection");
  }), c.on("test-auto-zoom-ipc", (e) => {
    console.log("🔵 Auto-zoom: Test IPC request received, sending test event");
    const t = i();
    t && !t.isDestroyed() ? (t.webContents.send("auto-zoom-click-event", {
      x: 0.5,
      y: 0.5,
      timestamp: 0
    }), console.log("🔵 Auto-zoom: Test event sent to main window")) : console.warn("🔵 Auto-zoom: Cannot send test event - main window is null or destroyed");
  }), c.on("auto-zoom-click", (e, t) => {
    if (!re) {
      console.log("🔵 Auto-zoom: Click received but autoZoomEnabled is false");
      return;
    }
    const o = t.timestamp - te;
    let r = 0.5, n = 0.5;
    if (k && k.width > 0 && k.height > 0) {
      const u = Math.max(0, Math.min(k.width, t.x)), C = Math.max(0, Math.min(k.height, t.y));
      r = u / k.width, n = C / k.height;
    }
    const a = Date.now();
    if (a - G < ue) {
      console.log("🔵 Auto-zoom: Click ignored (debounce) - too soon after last click");
      return;
    }
    G = a, console.log("🔵 Auto-zoom: Click detected at", {
      absolute: { x: t.x, y: t.y },
      normalized: { x: r, y: n },
      time: o,
      screenBounds: k
    });
    const p = F.getAllWindows();
    console.log("🔵 Auto-zoom: Found", p.length, "windows, sending click event to all"), p.forEach((u, C) => {
      const A = u.webContents.getURL();
      console.log(`🔵 Auto-zoom: Window ${C} - URL: ${A}, destroyed: ${u.isDestroyed()}`);
    });
    let h = 0;
    p.forEach((u, C) => {
      if (u && !u.isDestroyed())
        try {
          const A = u.webContents.getURL();
          console.log(`🔵 Auto-zoom: Sending click event to window ${C} (${A}):`, { x: r, y: n, timestamp: o }), u.webContents.send("auto-zoom-click-event", {
            x: r,
            y: n,
            timestamp: o
          }), h++, console.log(`🔵 Auto-zoom: Successfully sent to window ${C}`);
        } catch (A) {
          console.error(`🔵 Auto-zoom: Error sending to window ${C}:`, A);
        }
      else
        console.log(`🔵 Auto-zoom: Skipping window ${C} - destroyed or null`);
    }), h > 0 ? console.log("🔵 Auto-zoom: Click event sent to", h, "window(s) successfully") : console.warn("🔵 Auto-zoom: Could not send click event to any window");
  }), c.handle("open-camera-preview", () => {
    if (console.log("🔵 IPC: open-camera-preview called"), console.log("🔵 IPC: createCameraPreviewWindow function exists?", !!l), l)
      try {
        console.log("🔵 IPC: Calling createCameraPreviewWindow()...");
        const e = l();
        return console.log("🔵 IPC: Camera preview window created with ID:", e == null ? void 0 : e.id), console.log("🔵 IPC: Window is destroyed?", e == null ? void 0 : e.isDestroyed()), console.log("🔵 IPC: Window is visible?", e == null ? void 0 : e.isVisible()), setTimeout(() => {
          e && !e.isDestroyed() ? (console.log("🔵 IPC: Forcing window to show..."), e.show(), e.focus(), e.setAlwaysOnTop(!0, "screen-saver"), e.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 IPC: Camera preview window forced to show. Is visible now?", e.isVisible())) : console.error("🔵 IPC: Window is destroyed or null, cannot show");
        }, 500), { success: !0 };
      } catch (e) {
        return console.error("🔵 IPC: Error creating camera preview window:", e), { success: !1, error: String(e) };
      }
    return console.error("🔵 IPC: createCameraPreviewWindow function not available"), { success: !1, error: "Camera preview not available" };
  }), c.handle("close-camera-preview", () => O ? (O(), { success: !0 }) : { success: !1 }), c.handle("stop-camera-track", () => {
    const e = i();
    return e && !e.isDestroyed() ? (e.webContents.send("stop-camera-track-request"), { success: !0 }) : { success: !1, error: "Main window not available" };
  }), c.handle("stop-mic-track", () => {
    const e = i();
    return e && !e.isDestroyed() ? (e.webContents.send("stop-mic-track-request"), { success: !0 }) : { success: !1, error: "Main window not available" };
  }), c.handle("resize-camera-preview", (e, t, o) => {
    const r = z == null ? void 0 : z();
    return r && !r.isDestroyed() ? (r.setSize(t, o, !1), { success: !0 }) : { success: !1 };
  }), c.handle("open-external-url", async (e, t) => {
    try {
      return await ke.openExternal(t), { success: !0 };
    } catch (o) {
      return console.error("Failed to open URL:", o), { success: !1, error: String(o) };
    }
  }), c.handle("get-asset-base-path", () => {
    try {
      return f.isPackaged ? m.join(process.resourcesPath, "assets") : m.join(f.getAppPath(), "public");
    } catch (e) {
      return console.error("Failed to resolve asset base path:", e), null;
    }
  }), c.handle("save-exported-video", async (e, t, o) => {
    try {
      const r = o.endsWith(".gif"), n = await ne.showSaveDialog({
        title: r ? "Save Exported GIF" : "Save Exported Video",
        defaultPath: m.join(f.getPath("downloads"), o),
        filters: [
          { name: r ? "GIF Image" : "MP4 Video", extensions: [r ? "gif" : "mp4"] },
          { name: "All Files", extensions: ["*"] }
        ],
        properties: ["createDirectory", "showOverwriteConfirmation"]
      });
      return n.canceled || !n.filePath ? {
        success: !1,
        cancelled: !0,
        message: "Export cancelled"
      } : (await I.writeFile(n.filePath, Buffer.from(t)), {
        success: !0,
        path: n.filePath,
        message: "Video exported successfully"
      });
    } catch (r) {
      return console.error("Failed to save exported video:", r), {
        success: !1,
        message: "Failed to save exported video",
        error: String(r)
      };
    }
  }), c.handle("open-video-file-picker", async () => {
    try {
      const e = await ne.showOpenDialog({
        title: "Select Video File",
        defaultPath: H,
        filters: [
          { name: "Video Files", extensions: ["webm", "mp4", "mov", "avi", "mkv"] },
          { name: "All Files", extensions: ["*"] }
        ],
        properties: ["openFile"]
      });
      return e.canceled || e.filePaths.length === 0 ? { success: !1, cancelled: !0 } : {
        success: !0,
        path: e.filePaths[0]
      };
    } catch (e) {
      return console.error("Failed to open file picker:", e), {
        success: !1,
        message: "Failed to open file picker",
        error: String(e)
      };
    }
  });
  let J = null, X = null;
  c.handle("store-recorded-camera-video", async (e, t, o) => {
    try {
      const r = m.join(H, o);
      return await I.writeFile(r, Buffer.from(t)), X = r, {
        success: !0,
        path: r,
        message: "Camera video stored successfully"
      };
    } catch (r) {
      return console.error("Failed to store camera video:", r), {
        success: !1,
        message: "Failed to store camera video",
        error: String(r)
      };
    }
  }), c.handle("set-current-video-path", (e, t, o) => (J = t, o !== void 0 && (X = o), { success: !0 })), c.handle("get-current-video-path", () => J ? { success: !0, path: J } : { success: !1 }), c.handle("get-current-camera-path", () => X ? { success: !0, path: X } : { success: !1 }), c.handle("clear-current-video-path", () => (J = null, X = null, { success: !0 }));
  const ie = [];
  c.handle("open-camera-warning-dialog", () => M ? (M(), { success: !0 }) : { success: !1, error: "Dialog window not available" }), c.handle("close-camera-warning-dialog", () => $ ? ($(), { success: !0 }) : { success: !1 }), c.on("camera-warning-dialog-response", (e, t) => {
    ie.forEach((o) => {
      o(t.action);
    }), ie.length = 0, $ && $();
  }), c.handle("wait-for-camera-warning-dialog-response", () => new Promise((e) => {
    ie.push((t) => {
      e(t);
    });
  })), c.on("menu-open-project", async () => {
    const e = i();
    if (!(!e || e.isDestroyed()))
      try {
        const t = await ne.showOpenDialog(e, {
          title: "Open Project",
          filters: [
            { name: "JSON Files", extensions: ["json"] },
            { name: "All Files", extensions: ["*"] }
          ],
          properties: ["openFile"]
        });
        if (t.canceled || !t.filePaths || t.filePaths.length === 0)
          return;
        const o = t.filePaths[0], r = await I.readFile(o, "utf-8"), n = JSON.parse(r), a = [], p = (h) => {
          let u = h.replace(/^file:\/\/+/, "");
          return u.match(/^\/[a-zA-Z]:/) && (u = u.substring(1)), process.platform === "win32" && (u = u.replace(/\//g, m.sep)), u;
        };
        if (n.videoPath) {
          const h = p(n.videoPath);
          try {
            await I.access(h);
          } catch {
            a.push("Main video");
          }
        }
        if (n.cameraVideoPath) {
          const h = p(n.cameraVideoPath);
          try {
            await I.access(h);
          } catch {
            a.push("Camera video");
          }
        }
        e.webContents.send("open-project-data", {
          projectData: n,
          missingFiles: a,
          projectPath: o
        });
      } catch (t) {
        console.error("Failed to open project:", t), e.webContents.send("open-project-error", {
          error: t instanceof Error ? t.message : "Unknown error"
        });
      }
  }), c.on("menu-save-project", async () => {
    console.log("[IPC] menu-save-project received");
    const e = i();
    e && !e.isDestroyed() ? (console.log("[IPC] Sending save-project-request to renderer"), e.webContents.send("save-project-request")) : console.warn("[IPC] Main window not available for save-project");
  }), c.on("menu-re-record", () => {
    const e = i();
    e && !e.isDestroyed() && e.close(), d("screen");
  }), c.on("menu-discard-exit", () => {
    const e = i();
    e && !e.isDestroyed() && e.close(), process.platform !== "darwin" && F.getAllWindows().length === 0 && f.quit();
  }), c.on("close-editor", () => {
    const e = i();
    e && !e.isDestroyed() && e.close();
  }), c.handle("save-project-data", async (e, t) => {
    console.log("[IPC] save-project-data handler called");
    try {
      const o = i();
      if (!o || o.isDestroyed())
        return { success: !1, error: "Main window not available" };
      const n = `project-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`, a = await ne.showSaveDialog(o, {
        title: "Save Project",
        defaultPath: n,
        filters: [
          { name: "JSON Files", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] }
        ],
        properties: ["showOverwriteConfirmation"]
      });
      if (a.canceled || !a.filePath)
        return { success: !1, error: "Save cancelled" };
      const p = a.filePath, h = m.dirname(p);
      return await I.mkdir(h, { recursive: !0 }), await I.writeFile(p, JSON.stringify(t, null, 2), "utf-8"), { success: !0, path: p };
    } catch (o) {
      return console.error("Failed to save project:", o), { success: !1, error: o instanceof Error ? o.message : "Unknown error" };
    }
  }), c.handle("upload-to-aha", async (e, t, o) => {
    try {
      const r = await Q();
      if (!r)
        return {
          success: !1,
          error: "AHA account not configured. Please set up your account first."
        };
      let n, a = !1, p;
      if (t instanceof ArrayBuffer) {
        p = t.byteLength;
        const u = f.getPath("temp"), C = m.join(u, `aha-upload-${Date.now()}-${o}`);
        await I.writeFile(C, Buffer.from(t)), n = C, a = !0;
      } else
        n = t, p = (await I.stat(n)).size;
      const h = 25 * 1024 * 1024;
      if (p > h)
        return {
          success: !1,
          error: `File size (${(p / 1048576).toFixed(1)} MB) exceeds AHA Innovations upload limit (25 MB). Please reduce resolution, frame rate, or trim the video and export again.`
        };
      try {
        return await Ue(n, o, r.apiKey, r.subaccountId);
      } finally {
        if (a)
          try {
            await I.unlink(n);
          } catch (u) {
            console.warn("[IPC] Failed to cleanup temp file:", u);
          }
      }
    } catch (r) {
      return console.error("[IPC] Error uploading to AHA:", r), {
        success: !1,
        error: r instanceof Error ? r.message : "Unknown error occurred"
      };
    }
  }), c.handle("get-aha-media-url", async (e, t) => {
    try {
      const o = await Q();
      return o ? await je(t, o.apiKey) : {
        success: !1,
        error: "AHA account not configured. Please set up your account first."
      };
    } catch (o) {
      return console.error("[IPC] Error getting AHA media URL:", o), {
        success: !1,
        error: o instanceof Error ? o.message : "Unknown error occurred"
      };
    }
  }), c.handle("verify-aha-config", async (e, t) => {
    try {
      let o = t;
      if (!o) {
        const n = await Q();
        if (!n)
          return {
            valid: !1,
            error: "AHA account not configured."
          };
        o = n.apiKey;
      }
      return await Ne(o);
    } catch (o) {
      return console.error("[IPC] Error verifying AHA config:", o), {
        valid: !1,
        error: o instanceof Error ? o.message : "Unknown error occurred"
      };
    }
  }), c.handle("save-aha-config", async (e, t, o) => {
    try {
      return await Re({ apiKey: t, subaccountId: o }) ? { success: !0 } : {
        success: !1,
        error: "Failed to save configuration"
      };
    } catch (r) {
      return console.error("[IPC] Error saving AHA config:", r), {
        success: !1,
        error: r instanceof Error ? r.message : "Unknown error occurred"
      };
    }
  }), c.handle("get-aha-config", async () => {
    try {
      if (!await Fe())
        return { hasConfig: !1 };
      const t = await Q();
      return t ? {
        hasConfig: !0,
        subaccountId: t.subaccountId
      } : { hasConfig: !1 };
    } catch (e) {
      return console.error("[IPC] Error getting AHA config:", e), { hasConfig: !1 };
    }
  }), c.handle("delete-aha-config", async () => {
    try {
      return { success: await _e() };
    } catch (e) {
      return console.error("[IPC] Error deleting AHA config:", e), {
        success: !1,
        error: e instanceof Error ? e.message : "Unknown error occurred"
      };
    }
  });
}
const $e = m.dirname(ae(import.meta.url));
f.commandLine.appendSwitch("enable-gpu-rasterization");
f.commandLine.appendSwitch("enable-zero-copy");
f.commandLine.appendSwitch("enable-hardware-accelerated-video-decode");
f.commandLine.appendSwitch("enable-hardware-accelerated-video-encode");
f.commandLine.appendSwitch("enable-accelerated-video-decode");
f.commandLine.appendSwitch("enable-accelerated-video-encode");
f.commandLine.appendSwitch("enable-gpu-compositing");
f.disableHardwareAcceleration = !1;
process.platform === "linux" && (f.commandLine.appendSwitch("use-gl", "desktop"), f.commandLine.appendSwitch("ignore-gpu-blacklist"), f.commandLine.appendSwitch("ignore-gpu-blocklist"), f.commandLine.appendSwitch("enable-unsafe-webgpu"), f.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder,VaapiVideoEncoder,UseChromeOSDirectVideoDecoder,PlatformHEVCDecoderSupport"), f.commandLine.appendSwitch("use-angle", "gl"), f.commandLine.appendSwitch("enable-gpu-memory-buffer-video-frames"), f.commandLine.appendSwitch("enable-native-gpu-memory-buffers"), console.log("[Electron] Linux GPU acceleration flags enabled"));
const H = m.join(f.getPath("userData"), "recordings");
async function Be() {
  try {
    await I.mkdir(H, { recursive: !0 }), console.log("RECORDINGS_DIR:", H), console.log("User Data Path:", f.getPath("userData"));
  } catch (s) {
    console.error("Failed to create recordings directory:", s);
  }
}
process.env.APP_ROOT = m.join($e, "..");
const qe = process.env.VITE_DEV_SERVER_URL, io = m.join(process.env.APP_ROOT, "dist-electron"), fe = m.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = qe ? m.join(process.env.APP_ROOT, "public") : fe;
let y = null, ee = null, w = null, D = null, U = null, j = null, we = "";
function he() {
  y = ze();
}
function Ke() {
  const s = m.join(process.env.VITE_PUBLIC || fe, "rec-button.png");
  let d = Ie.createFromPath(s);
  d = d.resize({ width: 24, height: 24, quality: "best" }), j = new xe(d), ge();
}
function ge() {
  if (!j) return;
  const s = [
    {
      label: "Stop Recording",
      click: () => {
        y && !y.isDestroyed() && y.webContents.send("stop-recording-from-tray");
      }
    }
  ], d = se.buildFromTemplate(s);
  j.setContextMenu(d), j.setToolTip(`Recording: ${we}`);
}
function Ge() {
  y && (y.close(), y = null), y = Ee(), ye();
}
function ye() {
  const s = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Project",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            y && !y.isDestroyed() && y.webContents.send("menu-open-project");
          }
        },
        {
          label: "Save Project",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            y && !y.isDestroyed() && y.webContents.send("menu-save-project");
          }
        },
        {
          type: "separator"
        },
        {
          label: "Re-record",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            y && !y.isDestroyed() && y.webContents.send("menu-re-record");
          }
        },
        {
          label: "Discard & Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            y && !y.isDestroyed() && y.webContents.send("menu-discard-exit");
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
  process.platform === "darwin" && (s.unshift({
    label: f.getName(),
    submenu: [
      { role: "about", label: "About " + f.getName() },
      { type: "separator" },
      { role: "services", label: "Services" },
      { type: "separator" },
      { role: "hide", label: "Hide " + f.getName() },
      { role: "hideOthers", label: "Hide Others" },
      { role: "unhide", label: "Show All" },
      { type: "separator" },
      { role: "quit", label: "Quit " + f.getName() }
    ]
  }), s[4].submenu = [
    { role: "close", label: "Close" },
    { role: "minimize", label: "Minimize" },
    { role: "zoom", label: "Zoom" },
    { type: "separator" },
    { role: "front", label: "Bring All to Front" }
  ]);
  const d = se.buildFromTemplate(s);
  se.setApplicationMenu(d), console.log("🔵 Menu: Application menu set with", s.length, "top-level items"), process.platform === "darwin" && (se.getApplicationMenu() ? console.log("🔵 Menu: Application menu is active and accessible") : console.warn("🔵 Menu: WARNING - Application menu is not set!"));
}
function Ze(s) {
  return console.log("🔵 main.ts: createSourceSelectorWindowWrapper called with mode:", s), ee = Te(s), ee.on("closed", () => {
    ee = null;
  }), ee;
}
function Je() {
  return U && !U.isDestroyed() ? (U.focus(), U) : (U = Oe(), U.on("closed", () => {
    U = null;
  }), U);
}
function Xe() {
  return console.log("🔵 main.ts: createCameraPreviewWindowWrapper called"), w && !w.isDestroyed() ? (console.log("🔵 main.ts: Reusing existing camera preview window"), w.show(), w.focus(), w.setAlwaysOnTop(!0, "screen-saver"), w.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 main.ts: Existing window shown. Is visible?", w.isVisible()), w) : (console.log("🔵 main.ts: Creating new camera preview window"), w = Le(), console.log("🔵 main.ts: Camera preview window created with ID:", w.id), w.on("closed", () => {
    console.log("🔵 main.ts: Camera preview window closed"), w = null;
  }), w.once("ready-to-show", () => {
    console.log("🔵 main.ts: Camera preview window ready-to-show"), w && !w.isDestroyed() && (w.show(), w.focus(), w.setAlwaysOnTop(!0, "screen-saver"), w.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 main.ts: Window shown from ready-to-show. Is visible?", w.isVisible()));
  }), setTimeout(() => {
    w && !w.isDestroyed() && (console.log("🔵 main.ts: Force showing window after 100ms"), w.show(), w.focus(), console.log("🔵 main.ts: Window forced to show. Is visible?", w.isVisible()));
  }, 100), w);
}
function Ye() {
  w && !w.isDestroyed() && (w.close(), w = null);
}
function Qe() {
  return D && !D.isDestroyed() ? (D.show(), D.focus(), D) : (D = We(), D.on("closed", () => {
    D = null;
  }), D);
}
function eo() {
  D && !D.isDestroyed() && (D.close(), D = null);
}
f.on("window-all-closed", () => {
});
f.on("activate", () => {
  F.getAllWindows().length === 0 && he();
});
f.whenReady().then(async () => {
  ye();
  const { ipcMain: s } = await import("electron");
  s.on("hud-overlay-close", () => {
    process.platform === "darwin" && f.quit();
  }), await Be(), Ve(
    Ge,
    Ze,
    () => y,
    () => ee,
    (d, i) => {
      we = i, d ? (j || Ke(), ge()) : (j && (j.destroy(), j = null), y && y.restore());
    },
    () => w,
    Xe,
    Ye,
    Qe,
    eo,
    () => D,
    Je
  ), he();
});
export {
  io as MAIN_DIST,
  H as RECORDINGS_DIR,
  fe as RENDERER_DIST,
  qe as VITE_DEV_SERVER_URL
};
