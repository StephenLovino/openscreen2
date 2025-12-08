import { ipcMain as l, screen as Q, BrowserWindow as W, app as f, desktopCapturer as Ce, shell as Pe, dialog as oe, nativeImage as Ae, Tray as Ie, Menu as ie } from "electron";
import { fileURLToPath as ae } from "node:url";
import u from "node:path";
import A from "node:fs/promises";
const H = u.dirname(ae(import.meta.url)), Se = u.join(H, ".."), P = process.env.VITE_DEV_SERVER_URL, q = u.join(Se, "dist");
let B = null;
l.on("hud-overlay-hide", () => {
  B && !B.isDestroyed() && B.minimize();
});
function ke() {
  const n = Q.getPrimaryDisplay(), { workArea: c } = n, i = 500, b = 48, g = Math.floor(c.x + (c.width - i) / 2), S = Math.floor(c.y + c.height - b - 5), a = new W({
    width: i,
    height: b,
    minWidth: 500,
    maxWidth: 500,
    minHeight: b,
    maxHeight: b,
    x: g,
    y: S,
    frame: !1,
    transparent: !0,
    resizable: !1,
    alwaysOnTop: !0,
    skipTaskbar: !0,
    hasShadow: !1,
    webPreferences: {
      preload: u.join(H, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      backgroundThrottling: !1
    }
  });
  return a.webContents.on("did-finish-load", () => {
    a == null || a.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), B = a, a.on("closed", () => {
    B === a && (B = null);
  }), P ? a.loadURL(P + "?windowType=hud-overlay") : a.loadFile(u.join(q, "index.html"), {
    query: { windowType: "hud-overlay" }
  }), a;
}
function xe() {
  const n = new W({
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
      preload: u.join(H, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      webSecurity: !1,
      backgroundThrottling: !1
    }
  });
  return n.maximize(), n.webContents.on("did-finish-load", () => {
    n == null || n.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), P ? n.loadURL(P + "?windowType=editor") : n.loadFile(u.join(q, "index.html"), {
    query: { windowType: "editor" }
  }), n;
}
function De(n) {
  const { width: c, height: i } = Q.getPrimaryDisplay().workAreaSize, b = new W({
    width: 620,
    height: 420,
    minHeight: 350,
    maxHeight: 500,
    x: Math.round((c - 620) / 2),
    y: Math.round((i - 420) / 2),
    frame: !1,
    resizable: !1,
    alwaysOnTop: !0,
    transparent: !0,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: u.join(H, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0
    }
  });
  if (P) {
    const g = P.endsWith("/") ? P.slice(0, -1) : P, S = n ? `${g}?windowType=source-selector&mode=${n}` : `${g}?windowType=source-selector`;
    console.log("🔵 windows.ts: Loading URL:", S), b.loadURL(S);
  } else {
    const g = { windowType: "source-selector" };
    n && (g.mode = n), console.log("🔵 windows.ts: Loading file with query:", g), b.loadFile(u.join(q, "index.html"), { query: g });
  }
  return b;
}
function Ee() {
  console.log("🔵 windows.ts: createCameraPreviewWindow called");
  const { width: n, height: c } = Q.getPrimaryDisplay().workAreaSize, i = 250, b = 250, g = Math.round(n - i - 20), S = 20;
  console.log("🔵 windows.ts: Creating camera preview window at", g, S, "size", i, "x", b);
  const a = new W({
    width: i,
    height: b,
    minWidth: 250,
    minHeight: 250,
    maxWidth: 640,
    maxHeight: 640,
    x: g,
    y: S,
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
      preload: u.join(H, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      backgroundThrottling: !1
    }
  });
  if (a.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), a.webContents.on("did-finish-load", () => {
    console.log("🔵 windows.ts: Camera preview window loaded, showing..."), a == null || a.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString()), a.show(), a.focus(), a.setAlwaysOnTop(!0, "screen-saver"), a.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 windows.ts: Camera preview window shown and focused. Is visible?", a.isVisible());
  }), a.webContents.once("dom-ready", () => {
    console.log("🔵 windows.ts: Camera preview DOM ready, forcing show..."), a.show(), a.focus(), a.setAlwaysOnTop(!0, "screen-saver"), a.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 windows.ts: Camera preview window forced to show. Is visible?", a.isVisible());
  }), a.once("ready-to-show", () => {
    console.log("🔵 windows.ts: Camera preview ready-to-show event"), a.show(), a.focus();
  }), a.webContents.on("did-fail-load", (T, F, $) => {
    console.error("🔵 windows.ts: Camera preview window failed to load:", F, $);
  }), P) {
    const F = (P.endsWith("/") ? P.slice(0, -1) : P) + "?windowType=camera-preview";
    console.log("🔵 windows.ts: Loading camera preview URL:", F), a.loadURL(F);
  } else {
    const T = { windowType: "camera-preview" };
    console.log("🔵 windows.ts: Loading camera preview file with query:", T), a.loadFile(u.join(q, "index.html"), { query: T });
  }
  return console.log("🔵 windows.ts: Camera preview window created with ID:", a.id), a;
}
function Te() {
  const { width: n, height: c } = Q.getPrimaryDisplay().workAreaSize, i = new W({
    width: 600,
    height: 500,
    minWidth: 500,
    minHeight: 400,
    x: Math.round((n - 600) / 2),
    y: Math.round((c - 500) / 2),
    frame: !0,
    resizable: !0,
    alwaysOnTop: !1,
    backgroundColor: "#09090b",
    webPreferences: {
      preload: u.join(H, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0
    },
    title: "Settings - AHA Clips"
  });
  return P ? i.loadURL(`${P}?windowType=settings`) : i.loadFile(u.join(q, "index.html"), {
    query: { windowType: "settings" }
  }), i;
}
function ze() {
  const { width: n, height: c } = Q.getPrimaryDisplay().workAreaSize, i = new W({
    width: 480,
    height: 280,
    minWidth: 400,
    minHeight: 240,
    maxWidth: 600,
    maxHeight: 400,
    x: Math.round((n - 480) / 2),
    y: Math.round((c - 280) / 2),
    frame: !1,
    resizable: !1,
    alwaysOnTop: !0,
    transparent: !0,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: u.join(H, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0
    }
  });
  if (P) {
    const g = `${P.endsWith("/") ? P.slice(0, -1) : P}?windowType=camera-warning-dialog`;
    i.loadURL(g);
  } else {
    const b = { windowType: "camera-warning-dialog" };
    i.loadFile(u.join(q, "index.html"), { query: b });
  }
  return i;
}
const Fe = "aha-config.json";
function le() {
  const n = f.getPath("userData");
  return u.join(n, Fe);
}
async function Z() {
  try {
    const n = le(), c = await A.readFile(n, "utf-8"), i = JSON.parse(c);
    return !i.apiKey || typeof i.apiKey != "string" ? (console.error("[AhaConfig] Invalid config: missing or invalid apiKey"), null) : i.subaccountId !== void 0 && typeof i.subaccountId != "string" ? (console.error("[AhaConfig] Invalid config: subaccountId must be a string if provided"), null) : i;
  } catch (n) {
    return n.code === "ENOENT" || console.error("[AhaConfig] Error reading config:", n), null;
  }
}
async function Re(n) {
  try {
    if (!n.apiKey || typeof n.apiKey != "string")
      throw new Error("Invalid config: apiKey is required and must be a string");
    if (n.subaccountId !== void 0 && typeof n.subaccountId != "string")
      throw new Error("Invalid config: subaccountId must be a string if provided");
    const c = le(), i = JSON.stringify(n, null, 2);
    return await A.writeFile(c, i, "utf-8"), console.log("[AhaConfig] Config saved successfully"), !0;
  } catch (c) {
    return console.error("[AhaConfig] Error saving config:", c), !1;
  }
}
async function je() {
  try {
    const n = le();
    return await A.unlink(n), console.log("[AhaConfig] Config deleted successfully"), !0;
  } catch (n) {
    return n.code === "ENOENT" ? !0 : (console.error("[AhaConfig] Error deleting config:", n), !1);
  }
}
async function Le() {
  return await Z() !== null;
}
async function Oe(n, c, i, b) {
  try {
    const S = await (await import("fs/promises")).readFile(n), a = await fetch("https://api.ahainnovations.com/v1/media/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${i}`,
        "Content-Type": "application/octet-stream",
        ...b && { "X-Subaccount-Id": b }
      },
      body: S
    });
    if (!a.ok) {
      const F = await a.text();
      return {
        success: !1,
        error: `Upload failed: ${a.status} ${F}`
      };
    }
    const T = await a.json();
    return {
      success: !0,
      mediaId: T.mediaId,
      url: T.url
    };
  } catch (g) {
    return {
      success: !1,
      error: g instanceof Error ? g.message : "Unknown error occurred"
    };
  }
}
async function _e(n, c) {
  try {
    const i = await fetch(`https://api.ahainnovations.com/v1/media/${n}/url`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${c}`
      }
    });
    if (!i.ok) {
      const g = await i.text();
      return {
        success: !1,
        error: `Failed to get media URL: ${i.status} ${g}`
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
async function We(n) {
  try {
    const c = await fetch("https://api.ahainnovations.com/v1/auth/verify", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${n}`
      }
    });
    return c.ok ? {
      valid: !0
    } : {
      valid: !1,
      error: `API key verification failed: ${c.status}`
    };
  } catch (c) {
    return {
      valid: !1,
      error: c instanceof Error ? c.message : "Unknown error occurred"
    };
  }
}
const Ve = u.dirname(ae(import.meta.url));
let U = null, L = [], fe = 0;
function Ue(n, c, i, b, g, S, a, T, F, $, Qe, ce) {
  l.handle("get-sources", async (e, t) => (await Ce.getSources(t)).map((r) => ({
    id: r.id,
    name: r.name,
    display_id: r.display_id,
    thumbnail: r.thumbnail ? r.thumbnail.toDataURL() : null,
    appIcon: r.appIcon ? r.appIcon.toDataURL() : null
  }))), l.handle("select-source", (e, t) => {
    U = t;
    const o = b();
    return o && o.close(), U;
  }), l.handle("select-sources", (e, t) => {
    console.log("🔵 IPC: select-sources called with sources:", JSON.stringify(t, null, 2));
    const o = {};
    for (const s of L)
      s != null && s.id && (o[s.id] = s);
    for (const s of t)
      s != null && s.id && (o[s.id] = s);
    L = Object.values(o), U = L.length > 0 ? L[0] : null, console.log("🔵 IPC: Stored selectedSources:", L.length, "sources");
    const r = L.some((s) => {
      var d;
      return s.type === "camera" || ((d = s.id) == null ? void 0 : d.startsWith("camera:"));
    });
    return console.log("🔵 IPC: Camera source found?", r), L;
  }), l.handle("get-selected-source", () => U), l.handle("get-selected-sources", () => {
    const e = L.length > 0 ? L : U ? [U] : [];
    if (e.length > 0 && Date.now() - fe > 5e3) {
      const t = e.map((o) => {
        var r;
        return `${o.type || "unknown"}:${(r = o.id) == null ? void 0 : r.substring(0, 20)}...`;
      }).join(", ");
      console.log("🔵 IPC: get-selected-sources returning:", e.length, "sources:", t), fe = Date.now();
    }
    return e;
  }), l.handle("open-source-selector", (e, t) => {
    console.log("🔵 IPC: open-source-selector called with mode:", t);
    const o = b();
    if (o && !o.isDestroyed()) {
      const r = process.env.VITE_DEV_SERVER_URL;
      if (console.log("🔵 IPC: VITE_DEV_SERVER_URL:", r), r) {
        const s = r.endsWith("/") ? r.slice(0, -1) : r, d = t ? `${s}?windowType=source-selector&mode=${t}` : `${s}?windowType=source-selector`;
        console.log("🔵 IPC: Reloading window with URL:", d), o.webContents.loadURL(d);
      } else {
        const s = u.join(Ve, ".."), d = u.join(s, "dist"), y = { windowType: "source-selector" };
        t && (y.mode = t), console.log("🔵 IPC: Loading file with query:", y), o.webContents.loadFile(u.join(d, "index.html"), { query: y });
      }
      o.focus();
      return;
    }
    console.log("🔵 IPC: Creating new source selector window with mode:", t), c(t);
  }), l.handle("switch-to-editor", () => {
    const e = i();
    e && e.close(), n();
  }), l.handle("open-settings", () => {
    ce && ce();
  }), l.handle("store-recorded-video", async (e, t, o) => {
    try {
      const r = u.join(M, o);
      return await A.writeFile(r, Buffer.from(t)), K = r, {
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
  }), l.handle("get-recorded-video-path", async () => {
    try {
      const t = (await A.readdir(M)).filter((s) => s.endsWith(".webm"));
      if (t.length === 0)
        return { success: !1, message: "No recorded video found" };
      const o = t.sort().reverse()[0];
      return { success: !0, path: u.join(M, o) };
    } catch (e) {
      return console.error("Failed to get video path:", e), { success: !1, message: "Failed to get video path", error: String(e) };
    }
  });
  let G = null, te = 0, ee = !1, k = null, re = 0;
  const ge = 100, ne = (e, t) => {
    if (!ee) return;
    const o = Date.now();
    if (o - re < ge)
      return;
    re = o;
    const r = o - te;
    let s = 0.5, d = 0.5;
    if (k && k.width > 0 && k.height > 0) {
      const v = Math.max(0, Math.min(k.width, e)), m = Math.max(0, Math.min(k.height, t));
      s = v / k.width, d = m / k.height;
    }
    console.log("🔵 Auto-zoom: Mouse click detected at:", {
      normalized: { x: s, y: d },
      absolute: { x: e, y: t },
      screenBounds: k,
      time: r
    });
    const y = i();
    y && !y.isDestroyed() ? (y.webContents.send("auto-zoom-click-event", {
      x: s,
      y: d,
      timestamp: r
    }), console.log("🔵 Auto-zoom: Click event sent successfully")) : console.warn("🔵 Auto-zoom: Cannot send click event - main window is null or destroyed");
  }, ye = async () => {
    const { screen: e } = await import("electron"), o = (await import("os")).platform();
    console.log("🔵 Auto-zoom: Starting mouse click detection on platform:", o), o === "linux" ? await ve(e) : o === "darwin" ? (console.warn("🔵 Auto-zoom: macOS mouse click detection not yet implemented"), console.log("🔵 Auto-zoom: For macOS, consider using:"), console.log("   1. CGEventTap API (requires native module)"), console.log("   2. iohook npm package (cross-platform native module)"), console.log("   3. robotjs npm package (cross-platform native module)")) : o === "win32" ? (console.warn("🔵 Auto-zoom: Windows mouse click detection not yet implemented"), console.log("🔵 Auto-zoom: For Windows, consider using:"), console.log("   1. SetWindowsHookEx API (requires native module)"), console.log("   2. iohook npm package (cross-platform native module)"), console.log("   3. robotjs npm package (cross-platform native module)")) : console.warn("🔵 Auto-zoom: Unsupported platform:", o);
  }, ve = async (e) => {
    const { spawn: t, exec: o } = await import("child_process"), { promisify: r } = await import("util"), s = r(o);
    try {
      const { stdout: d } = await s("xinput list"), y = d.split(`
`);
      let v = null;
      for (const C of y) {
        const w = C.toLowerCase();
        if ((w.includes("mouse") || w.includes("trackpad") || w.includes("touchpad")) && !w.includes("xtest") && !w.includes("virtual core") && !w.includes("master pointer") && w.includes("slave")) {
          const E = C.match(/id=(\d+)/);
          if (E) {
            v = E[1], console.log("🔵 Auto-zoom: Found real mouse device:", C.trim(), "ID:", v);
            break;
          }
        }
      }
      if (!v)
        for (const C of y) {
          const w = C.toLowerCase();
          if (w.includes("slave") && w.includes("pointer") && !w.includes("xtest") && !w.includes("virtual core") && !w.includes("master")) {
            const E = C.match(/id=(\d+)/);
            if (E) {
              v = E[1], console.log("🔵 Auto-zoom: Found pointer device (fallback):", C.trim(), "ID:", v);
              break;
            }
          }
        }
      if (!v) {
        console.warn("🔵 Auto-zoom: Could not find mouse device, click detection disabled"), console.log("🔵 Auto-zoom: Available devices:", d);
        return;
      }
      let m = null, V = !1;
      try {
        m = t("xinput", ["test", v]), console.log("🔵 Auto-zoom: Using xinput test with device ID:", v);
      } catch (C) {
        console.warn("🔵 Auto-zoom: test failed, trying test-xi2 --root:", C), V = !0;
        try {
          m = t("xinput", ["test-xi2", "--root"]), console.log("🔵 Auto-zoom: Using xinput test-xi2 --root as fallback");
        } catch (w) {
          console.error("🔵 Auto-zoom: Both test methods failed:", w);
          return;
        }
      }
      let R = !1, x = 0, D = 0;
      m.stdout.on("data", (C) => {
        const w = C.toString();
        console.log("🔵 Auto-zoom: Raw xinput output:", w.substring(0, 200));
        const E = w.split(`
`);
        for (const ue of E) {
          const j = ue.trim();
          if (j)
            if (V) {
              const z = j.toLowerCase();
              if (z.includes("button"))
                if (z.includes("press") || z.includes("down")) {
                  R = !0;
                  const N = j.match(/(?:root_)?x[=:]?\s*([\d.]+)/i), X = j.match(/(?:root_)?y[=:]?\s*([\d.]+)/i);
                  if (N && X)
                    x = parseFloat(N[1]), D = parseFloat(X[1]);
                  else {
                    const de = e.getCursorScreenPoint();
                    x = de.x, D = de.y;
                  }
                  console.log("🔵 Auto-zoom: Button pressed at:", { x, y: D, rawLine: j });
                } else (z.includes("release") || z.includes("up")) && R && (R = !1, console.log("🔵 Auto-zoom: Button released, handling click at:", { x, y: D }), ne(x, D));
            } else if (j.includes("button press")) {
              R = !0;
              const z = e.getCursorScreenPoint();
              x = z.x, D = z.y, console.log("🔵 Auto-zoom: Button pressed at:", { x, y: D });
            } else j.includes("button release") && R && (R = !1, console.log("🔵 Auto-zoom: Button released, handling click at:", { x, y: D }), ne(x, D));
        }
      }), m.stderr.on("data", (C) => {
        const w = C.toString();
        if (V && w.includes("Unable to find device") || w.includes("error")) {
          console.warn("🔵 Auto-zoom: test-xi2 failed, trying test with device ID:", v), V = !1, m && m.kill();
          try {
            m = t("xinput", ["test", v]), m.stdout.on("data", (E) => {
              const j = E.toString().split(`
`);
              for (const z of j) {
                const N = z.trim();
                if (N)
                  if (N.includes("button press")) {
                    R = !0;
                    const X = e.getCursorScreenPoint();
                    x = X.x, D = X.y, console.log("🔵 Auto-zoom: Button pressed at:", { x, y: D });
                  } else N.includes("button release") && R && (R = !1, ne(x, D));
              }
            }), G = m;
          } catch (E) {
            console.error("🔵 Auto-zoom: Fallback to test also failed:", E);
          }
        } else !w.includes("WARNING") && !w.includes("Unable to connect") && console.error("🔵 Auto-zoom: xinput error:", w);
      }), m.on("close", (C) => {
        console.log("🔵 Auto-zoom: xinput process closed with code:", C), C !== 0 && C !== null && console.warn("🔵 Auto-zoom: xinput process exited unexpectedly");
      }), m.on("error", (C) => {
        console.error("🔵 Auto-zoom: xinput process error:", C);
      }), G = m, console.log("🔵 Auto-zoom: Linux mouse click detection started successfully");
    } catch (d) {
      console.error("🔵 Auto-zoom: Error starting Linux mouse click detection:", d);
    }
  }, be = () => {
    if (G)
      try {
        G.kill(), G = null, console.log("🔵 Auto-zoom: Mouse click detection stopped");
      } catch (e) {
        console.error("🔵 Auto-zoom: Error stopping click detection:", e);
      }
  };
  l.handle("set-recording-state", async (e, t, o) => {
    if (g && g(t, (U || { name: "Screen" }).name), ee = o || !1, t && ee) {
      te = Date.now(), re = 0;
      const { screen: s } = await import("electron"), d = s.getPrimaryDisplay();
      k = {
        width: d.workAreaSize.width,
        height: d.workAreaSize.height
      }, console.log("🔵 Auto-zoom: Starting mouse click detection"), await ye();
    } else
      be(), console.log("🔵 Auto-zoom: Stopping click detection");
  }), l.on("auto-zoom-click", (e, t) => {
    if (!ee) return;
    const o = t.timestamp - te, r = k ? t.x / k.width : 0.5, s = k ? t.y / k.height : 0.5;
    console.log("🔵 Auto-zoom: Click detected at", { x: r, y: s, time: o });
    const d = i();
    d && !d.isDestroyed() && d.webContents.send("auto-zoom-click-event", {
      x: r,
      y: s,
      timestamp: o
    });
  }), l.handle("open-camera-preview", () => {
    if (console.log("🔵 IPC: open-camera-preview called"), console.log("🔵 IPC: createCameraPreviewWindow function exists?", !!a), a)
      try {
        console.log("🔵 IPC: Calling createCameraPreviewWindow()...");
        const e = a();
        return console.log("🔵 IPC: Camera preview window created with ID:", e == null ? void 0 : e.id), console.log("🔵 IPC: Window is destroyed?", e == null ? void 0 : e.isDestroyed()), console.log("🔵 IPC: Window is visible?", e == null ? void 0 : e.isVisible()), setTimeout(() => {
          e && !e.isDestroyed() ? (console.log("🔵 IPC: Forcing window to show..."), e.show(), e.focus(), e.setAlwaysOnTop(!0, "screen-saver"), e.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 IPC: Camera preview window forced to show. Is visible now?", e.isVisible())) : console.error("🔵 IPC: Window is destroyed or null, cannot show");
        }, 500), { success: !0 };
      } catch (e) {
        return console.error("🔵 IPC: Error creating camera preview window:", e), { success: !1, error: String(e) };
      }
    return console.error("🔵 IPC: createCameraPreviewWindow function not available"), { success: !1, error: "Camera preview not available" };
  }), l.handle("close-camera-preview", () => T ? (T(), { success: !0 }) : { success: !1 }), l.handle("stop-camera-track", () => {
    const e = i();
    return e && !e.isDestroyed() ? (e.webContents.send("stop-camera-track-request"), { success: !0 }) : { success: !1, error: "Main window not available" };
  }), l.handle("stop-mic-track", () => {
    const e = i();
    return e && !e.isDestroyed() ? (e.webContents.send("stop-mic-track-request"), { success: !0 }) : { success: !1, error: "Main window not available" };
  }), l.handle("resize-camera-preview", (e, t, o) => {
    const r = S == null ? void 0 : S();
    return r && !r.isDestroyed() ? (r.setSize(t, o, !1), { success: !0 }) : { success: !1 };
  }), l.handle("open-external-url", async (e, t) => {
    try {
      return await Pe.openExternal(t), { success: !0 };
    } catch (o) {
      return console.error("Failed to open URL:", o), { success: !1, error: String(o) };
    }
  }), l.handle("get-asset-base-path", () => {
    try {
      return f.isPackaged ? u.join(process.resourcesPath, "assets") : u.join(f.getAppPath(), "public");
    } catch (e) {
      return console.error("Failed to resolve asset base path:", e), null;
    }
  }), l.handle("save-exported-video", async (e, t, o) => {
    try {
      const r = o.endsWith(".gif"), s = await oe.showSaveDialog({
        title: r ? "Save Exported GIF" : "Save Exported Video",
        defaultPath: u.join(f.getPath("downloads"), o),
        filters: [
          { name: r ? "GIF Image" : "MP4 Video", extensions: [r ? "gif" : "mp4"] },
          { name: "All Files", extensions: ["*"] }
        ],
        properties: ["createDirectory", "showOverwriteConfirmation"]
      });
      return s.canceled || !s.filePath ? {
        success: !1,
        cancelled: !0,
        message: "Export cancelled"
      } : (await A.writeFile(s.filePath, Buffer.from(t)), {
        success: !0,
        path: s.filePath,
        message: "Video exported successfully"
      });
    } catch (r) {
      return console.error("Failed to save exported video:", r), {
        success: !1,
        message: "Failed to save exported video",
        error: String(r)
      };
    }
  }), l.handle("open-video-file-picker", async () => {
    try {
      const e = await oe.showOpenDialog({
        title: "Select Video File",
        defaultPath: M,
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
  let K = null, J = null;
  l.handle("store-recorded-camera-video", async (e, t, o) => {
    try {
      const r = u.join(M, o);
      return await A.writeFile(r, Buffer.from(t)), J = r, {
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
  }), l.handle("set-current-video-path", (e, t, o) => (K = t, o !== void 0 && (J = o), { success: !0 })), l.handle("get-current-video-path", () => K ? { success: !0, path: K } : { success: !1 }), l.handle("get-current-camera-path", () => J ? { success: !0, path: J } : { success: !1 }), l.handle("clear-current-video-path", () => (K = null, J = null, { success: !0 }));
  const se = [];
  l.handle("open-camera-warning-dialog", () => F ? (F(), { success: !0 }) : { success: !1, error: "Dialog window not available" }), l.handle("close-camera-warning-dialog", () => $ ? ($(), { success: !0 }) : { success: !1 }), l.on("camera-warning-dialog-response", (e, t) => {
    se.forEach((o) => {
      o(t.action);
    }), se.length = 0, $ && $();
  }), l.handle("wait-for-camera-warning-dialog-response", () => new Promise((e) => {
    se.push((t) => {
      e(t);
    });
  })), l.on("menu-open-project", async () => {
    const e = i();
    if (!(!e || e.isDestroyed()))
      try {
        const t = await oe.showOpenDialog(e, {
          title: "Open Project",
          filters: [
            { name: "JSON Files", extensions: ["json"] },
            { name: "All Files", extensions: ["*"] }
          ],
          properties: ["openFile"]
        });
        if (t.canceled || !t.filePaths || t.filePaths.length === 0)
          return;
        const o = t.filePaths[0], r = await A.readFile(o, "utf-8"), s = JSON.parse(r), d = [], y = (v) => {
          let m = v.replace(/^file:\/\/+/, "");
          return m.match(/^\/[a-zA-Z]:/) && (m = m.substring(1)), process.platform === "win32" && (m = m.replace(/\//g, u.sep)), m;
        };
        if (s.videoPath) {
          const v = y(s.videoPath);
          try {
            await A.access(v);
          } catch {
            d.push("Main video");
          }
        }
        if (s.cameraVideoPath) {
          const v = y(s.cameraVideoPath);
          try {
            await A.access(v);
          } catch {
            d.push("Camera video");
          }
        }
        e.webContents.send("open-project-data", {
          projectData: s,
          missingFiles: d,
          projectPath: o
        });
      } catch (t) {
        console.error("Failed to open project:", t), e.webContents.send("open-project-error", {
          error: t instanceof Error ? t.message : "Unknown error"
        });
      }
  }), l.on("menu-save-project", async () => {
    console.log("[IPC] menu-save-project received");
    const e = i();
    e && !e.isDestroyed() ? (console.log("[IPC] Sending save-project-request to renderer"), e.webContents.send("save-project-request")) : console.warn("[IPC] Main window not available for save-project");
  }), l.on("menu-re-record", () => {
    const e = i();
    e && !e.isDestroyed() && e.close(), c("screen");
  }), l.on("menu-discard-exit", () => {
    const e = i();
    e && !e.isDestroyed() && e.close(), process.platform !== "darwin" && W.getAllWindows().length === 0 && f.quit();
  }), l.on("close-editor", () => {
    const e = i();
    e && !e.isDestroyed() && e.close();
  }), l.handle("save-project-data", async (e, t) => {
    console.log("[IPC] save-project-data handler called");
    try {
      const o = i();
      if (!o || o.isDestroyed())
        return { success: !1, error: "Main window not available" };
      const s = `project-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`, d = await oe.showSaveDialog(o, {
        title: "Save Project",
        defaultPath: s,
        filters: [
          { name: "JSON Files", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] }
        ],
        properties: ["showOverwriteConfirmation"]
      });
      if (d.canceled || !d.filePath)
        return { success: !1, error: "Save cancelled" };
      const y = d.filePath, v = u.dirname(y);
      return await A.mkdir(v, { recursive: !0 }), await A.writeFile(y, JSON.stringify(t, null, 2), "utf-8"), { success: !0, path: y };
    } catch (o) {
      return console.error("Failed to save project:", o), { success: !1, error: o instanceof Error ? o.message : "Unknown error" };
    }
  }), l.handle("upload-to-aha", async (e, t, o) => {
    try {
      const r = await Z();
      if (!r)
        return {
          success: !1,
          error: "AHA account not configured. Please set up your account first."
        };
      let s, d = !1, y;
      if (t instanceof ArrayBuffer) {
        y = t.byteLength;
        const m = f.getPath("temp"), V = u.join(m, `aha-upload-${Date.now()}-${o}`);
        await A.writeFile(V, Buffer.from(t)), s = V, d = !0;
      } else
        s = t, y = (await A.stat(s)).size;
      const v = 25 * 1024 * 1024;
      if (y > v)
        return {
          success: !1,
          error: `File size (${(y / 1048576).toFixed(1)} MB) exceeds AHA Innovations upload limit (25 MB). Please reduce resolution, frame rate, or trim the video and export again.`
        };
      try {
        return await Oe(s, o, r.apiKey, r.subaccountId);
      } finally {
        if (d)
          try {
            await A.unlink(s);
          } catch (m) {
            console.warn("[IPC] Failed to cleanup temp file:", m);
          }
      }
    } catch (r) {
      return console.error("[IPC] Error uploading to AHA:", r), {
        success: !1,
        error: r instanceof Error ? r.message : "Unknown error occurred"
      };
    }
  }), l.handle("get-aha-media-url", async (e, t) => {
    try {
      const o = await Z();
      return o ? await _e(t, o.apiKey) : {
        success: !1,
        error: "AHA account not configured. Please set up your account first."
      };
    } catch (o) {
      return console.error("[IPC] Error getting AHA media URL:", o), {
        success: !1,
        error: o instanceof Error ? o.message : "Unknown error occurred"
      };
    }
  }), l.handle("verify-aha-config", async (e, t) => {
    try {
      let o = t;
      if (!o) {
        const s = await Z();
        if (!s)
          return {
            valid: !1,
            error: "AHA account not configured."
          };
        o = s.apiKey;
      }
      return await We(o);
    } catch (o) {
      return console.error("[IPC] Error verifying AHA config:", o), {
        valid: !1,
        error: o instanceof Error ? o.message : "Unknown error occurred"
      };
    }
  }), l.handle("save-aha-config", async (e, t, o) => {
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
  }), l.handle("get-aha-config", async () => {
    try {
      if (!await Le())
        return { hasConfig: !1 };
      const t = await Z();
      return t ? {
        hasConfig: !0,
        subaccountId: t.subaccountId
      } : { hasConfig: !1 };
    } catch (e) {
      return console.error("[IPC] Error getting AHA config:", e), { hasConfig: !1 };
    }
  }), l.handle("delete-aha-config", async () => {
    try {
      return { success: await je() };
    } catch (e) {
      return console.error("[IPC] Error deleting AHA config:", e), {
        success: !1,
        error: e instanceof Error ? e.message : "Unknown error occurred"
      };
    }
  });
}
const Me = u.dirname(ae(import.meta.url));
f.commandLine.appendSwitch("enable-gpu-rasterization");
f.commandLine.appendSwitch("enable-zero-copy");
f.commandLine.appendSwitch("enable-hardware-accelerated-video-decode");
f.commandLine.appendSwitch("enable-hardware-accelerated-video-encode");
f.commandLine.appendSwitch("enable-accelerated-video-decode");
f.commandLine.appendSwitch("enable-accelerated-video-encode");
f.commandLine.appendSwitch("enable-gpu-compositing");
f.disableHardwareAcceleration = !1;
process.platform === "linux" && (f.commandLine.appendSwitch("use-gl", "desktop"), f.commandLine.appendSwitch("ignore-gpu-blacklist"), f.commandLine.appendSwitch("ignore-gpu-blocklist"), f.commandLine.appendSwitch("enable-unsafe-webgpu"), f.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder,VaapiVideoEncoder,UseChromeOSDirectVideoDecoder,PlatformHEVCDecoderSupport"), f.commandLine.appendSwitch("use-angle", "gl"), f.commandLine.appendSwitch("enable-gpu-memory-buffer-video-frames"), f.commandLine.appendSwitch("enable-native-gpu-memory-buffers"), console.log("[Electron] Linux GPU acceleration flags enabled"));
const M = u.join(f.getPath("userData"), "recordings");
async function He() {
  try {
    await A.mkdir(M, { recursive: !0 }), console.log("RECORDINGS_DIR:", M), console.log("User Data Path:", f.getPath("userData"));
  } catch (n) {
    console.error("Failed to create recordings directory:", n);
  }
}
process.env.APP_ROOT = u.join(Me, "..");
const $e = process.env.VITE_DEV_SERVER_URL, no = u.join(process.env.APP_ROOT, "dist-electron"), pe = u.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = $e ? u.join(process.env.APP_ROOT, "public") : pe;
let h = null, Y = null, p = null, I = null, O = null, _ = null, me = "";
function we() {
  h = ke();
}
function Ne() {
  const n = u.join(process.env.VITE_PUBLIC || pe, "rec-button.png");
  let c = Ae.createFromPath(n);
  c = c.resize({ width: 24, height: 24, quality: "best" }), _ = new Ie(c), he();
}
function he() {
  if (!_) return;
  const n = [
    {
      label: "Stop Recording",
      click: () => {
        h && !h.isDestroyed() && h.webContents.send("stop-recording-from-tray");
      }
    }
  ], c = ie.buildFromTemplate(n);
  _.setContextMenu(c), _.setToolTip(`Recording: ${me}`);
}
function Be() {
  h && (h.close(), h = null), h = xe(), qe();
}
function qe() {
  const n = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Project",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            h && !h.isDestroyed() && h.webContents.send("menu-open-project");
          }
        },
        {
          label: "Save Project",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            h && !h.isDestroyed() && h.webContents.send("menu-save-project");
          }
        },
        {
          type: "separator"
        },
        {
          label: "Re-record",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            h && !h.isDestroyed() && h.webContents.send("menu-re-record");
          }
        },
        {
          label: "Discard & Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            h && !h.isDestroyed() && h.webContents.send("menu-discard-exit");
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
  process.platform === "darwin" && (n.unshift({
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
  }), n[4].submenu = [
    { role: "close", label: "Close" },
    { role: "minimize", label: "Minimize" },
    { role: "zoom", label: "Zoom" },
    { type: "separator" },
    { role: "front", label: "Bring All to Front" }
  ]);
  const c = ie.buildFromTemplate(n);
  ie.setApplicationMenu(c);
}
function Ge(n) {
  return console.log("🔵 main.ts: createSourceSelectorWindowWrapper called with mode:", n), Y = De(n), Y.on("closed", () => {
    Y = null;
  }), Y;
}
function Ke() {
  return O && !O.isDestroyed() ? (O.focus(), O) : (O = Te(), O.on("closed", () => {
    O = null;
  }), O);
}
function Je() {
  return console.log("🔵 main.ts: createCameraPreviewWindowWrapper called"), p && !p.isDestroyed() ? (console.log("🔵 main.ts: Reusing existing camera preview window"), p.show(), p.focus(), p.setAlwaysOnTop(!0, "screen-saver"), p.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 main.ts: Existing window shown. Is visible?", p.isVisible()), p) : (console.log("🔵 main.ts: Creating new camera preview window"), p = Ee(), console.log("🔵 main.ts: Camera preview window created with ID:", p.id), p.on("closed", () => {
    console.log("🔵 main.ts: Camera preview window closed"), p = null;
  }), p.once("ready-to-show", () => {
    console.log("🔵 main.ts: Camera preview window ready-to-show"), p && !p.isDestroyed() && (p.show(), p.focus(), p.setAlwaysOnTop(!0, "screen-saver"), p.setVisibleOnAllWorkspaces(!0, { visibleOnFullScreen: !0 }), console.log("🔵 main.ts: Window shown from ready-to-show. Is visible?", p.isVisible()));
  }), setTimeout(() => {
    p && !p.isDestroyed() && (console.log("🔵 main.ts: Force showing window after 100ms"), p.show(), p.focus(), console.log("🔵 main.ts: Window forced to show. Is visible?", p.isVisible()));
  }, 100), p);
}
function Xe() {
  p && !p.isDestroyed() && (p.close(), p = null);
}
function Ze() {
  return I && !I.isDestroyed() ? (I.show(), I.focus(), I) : (I = ze(), I.on("closed", () => {
    I = null;
  }), I);
}
function Ye() {
  I && !I.isDestroyed() && (I.close(), I = null);
}
f.on("window-all-closed", () => {
});
f.on("activate", () => {
  W.getAllWindows().length === 0 && we();
});
f.whenReady().then(async () => {
  const { ipcMain: n } = await import("electron");
  n.on("hud-overlay-close", () => {
    process.platform === "darwin" && f.quit();
  }), await He(), Ue(
    Be,
    Ge,
    () => h,
    () => Y,
    (c, i) => {
      me = i, c ? (_ || Ne(), he()) : (_ && (_.destroy(), _ = null), h && h.restore());
    },
    () => p,
    Je,
    Xe,
    Ze,
    Ye,
    () => I,
    Ke
  ), we();
});
export {
  no as MAIN_DIST,
  M as RECORDINGS_DIR,
  pe as RENDERER_DIST,
  $e as VITE_DEV_SERVER_URL
};
