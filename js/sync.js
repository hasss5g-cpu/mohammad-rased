/* ============================================================
   راصد — المزامنة السحابية (تعمل دون اتصال ثم ترفع فور الاتصال)
   المزود الافتراضي: BrewPage JSON (مجاني، بلا تسجيل)
   ويمكن ربط خادم خاص (Google Apps Script) من الإعدادات.
   ============================================================ */
import { getSettings, saveSettings, snapshotForCloud, mergeRemote, resetPending, getPending, hasDemoData, clearDemoData, events as dbEvents } from "./db.js";
import { debounce, todayISO } from "./core.js";
import { SHARED_SYNC_CODE, SHARED_SYNC_NS } from "./shared-cloud.js";

const API = "https://brewpage.app";
const CODE_PREFIX = "RASED1.";

export const state = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  configured: false,
  syncing: false,
  lastSync: 0,
  error: "",
  pending: 0,
  expiresAt: 0,
  lastChecked: 0,
  provider: "brewpage",
  shared: false,
  realtime: false
};

let settings = null;
let applyingRemote = false;
let lastHash = "";
let pushTimer = null;
let heartbeatTimer = null;
let pullTimer = null;
let renewTimer = null;
let realtimeActive = false;

function emit() {
  try { document.dispatchEvent(new CustomEvent("rased:sync", { detail: { ...state } })); } catch (e) { }
}
function setState(patch) { Object.assign(state, patch); emit(); }
function notifyRemote(changed) {
  if (!changed) return;
  try { window.dispatchEvent(new CustomEvent("rased:remote", { detail: { changed } })); } catch (e) { }
}

/* ---------------- أدوات الضغط ---------------- */
async function gzipB64(str) {
  if (typeof CompressionStream === "undefined") return null;
  const cs = new CompressionStream("gzip");
  const stream = new Blob([str]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzipB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Response(stream).text();
}

/* ---------------- ترميز رمز المزامنة ---------------- */
export function encodeCode(cfg) {
  const raw = JSON.stringify({ v: 1, n: cfg.ns, i: cfg.id, t: cfg.token, p: cfg.provider || "brewpage", u: cfg.url || "" });
  const b64 = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return CODE_PREFIX + b64;
}
export function decodeCode(code) {
  const s = String(code || "").trim().replace(/\s+/g, "");
  if (!s.startsWith(CODE_PREFIX)) throw new Error("رمز المزامنة غير صالح");
  let b64 = s.slice(CODE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
  if (!obj || !obj.n || !obj.i || !obj.t) throw new Error("رمز المزامنة غير مكتمل");
  return obj;
}

/* ---------------- المزود ---------------- */
async function apiCreate(ns, snapshot) {
  const res = await fetch(`${API}/api/json?ns=${encodeURIComponent(ns)}&ttl=30`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot)
  });
  if (!res.ok) throw new Error(await apiError(res));
  return res.json();
}
async function apiRead(cfg) {
  const res = await fetch(`${API}/api/json/${encodeURIComponent(cfg.ns)}/${encodeURIComponent(cfg.id)}?t=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) throw Object.assign(new Error("انتهت صلاحية السحابة أو حُذفت. أنشئ سحابة جديدة من الإعدادات."), { code: 404 });
  if (!res.ok) throw new Error(await apiError(res));
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("استجابة سحابية غير صالحة"); }
  if (data && data.gz) {
    try { data = JSON.parse(await gunzipB64(data.gz)); } catch (e) { throw new Error("تعذر فك ضغط البيانات السحابية"); }
  }
  return data;
}
async function apiWrite(cfg, snapshot) {
  const res = await fetch(`${API}/api/json/${encodeURIComponent(cfg.ns)}/${encodeURIComponent(cfg.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Owner-Token": cfg.token },
    body: JSON.stringify(snapshot)
  });
  if (!res.ok) throw new Error(await apiError(res));
  return res.json().catch(() => ({}));
}
async function apiError(res) {
  let msg = `خطأ ${res.status}`;
  try {
    const j = await res.json();
    msg = j.message || j.error || msg;
    if (j.result?.reason) msg += ` (${j.result.reason})`;
  } catch (e) { }
  if (res.status === 413) msg = "حجم البيانات أكبر من الحد المسموح للسحابة (1 ميجابايت).";
  if (res.status === 401 || res.status === 403) msg = "رمز المزامنة غير صحيح أو منتهي.";
  return msg;
}

/* ---------------- إنشاء / ربط ---------------- */
export async function createCloud() {
  settings = await getSettings();
  const ns = `rased-${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 4)}`;
  const snap = await snapshotForCloud();
  setState({ syncing: true, error: "" });
  try {
    const created = await apiCreate(ns, snap);
    const cfg = {
      provider: "brewpage", ns: created.namespace, id: created.id, token: created.ownerToken,
      link: created.link, lastSync: Date.now(), enabled: true, lastError: "", expiresAt: created.expiresAt ? Date.parse(created.expiresAt) : 0
    };
    settings = await saveSettings({ cloud: cfg });
    lastHash = hash(JSON.stringify(snap));
    setState({ configured: true, syncing: false, lastSync: Date.now(), expiresAt: cfg.expiresAt, error: "" });
    await resetPending();
    setState({ pending: 0 });
    schedulePull();
    return { ...cfg, code: encodeCode(cfg) };
  } catch (e) {
    setState({ syncing: false, error: e.message });
    throw e;
  }
}

export async function connectCloud(code, { verify = true, shared = false, syncSettings = true } = {}) {
  const obj = decodeCode(code);
  const isShared = !!(shared || obj.n === SHARED_SYNC_NS);
  const cfg = { provider: obj.p || "brewpage", ns: obj.n, id: obj.i, token: obj.t, url: obj.u || "", link: `${API}/api/json/${obj.n}/${obj.i}`, lastSync: 0, enabled: true, lastError: "", expiresAt: 0, shared: isShared };
  setState({ syncing: true, error: "", shared: isShared });
  try {
    let cleared = false;
    if (isShared && await hasDemoData()) { await clearDemoData(); cleared = true; }
    if (verify) {
      const remote = await apiRead(cfg);
      applyingRemote = true;
      const changed = await mergeRemote(remote, { syncSettings: syncSettings && !isShared });
      applyingRemote = false;
      notifyRemote(changed + (cleared ? 1 : 0));
      if (remote.updatedAt) lastHash = hash(JSON.stringify(remote));
    } else if (cleared) {
      notifyRemote(1);
    }
    settings = await saveSettings({ cloud: cfg });
    setState({ configured: true, syncing: false, lastSync: Date.now(), error: "", shared: isShared });
    await resetPending();
    setState({ pending: 0 });
    schedulePull();
    pushNow(!isShared).catch(() => { });
    return cfg;
  } catch (e) {
    applyingRemote = false;
    setState({ syncing: false, error: e.message });
    throw e;
  }
}

export async function disconnectCloud() {
  settings = await saveSettings({ cloud: { provider: "brewpage", ns: "", id: "", token: "", link: "", lastSync: 0, enabled: false, lastError: "", expiresAt: 0 } });
  lastHash = "";
  setState({ configured: false, lastSync: 0, error: "", expiresAt: 0, pending: 0, shared: false });
  stopTimers();
}

/* ---------------- الدفع والسحب ---------------- */
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + ":" + s.length;
}

export async function pushNow(force = false) {
  if (realtimeActive && !force) return false;
  if (!settings?.cloud?.enabled || !settings.cloud.id) return false;
  if (state.syncing) return false;
  if (!navigator.onLine) { setState({ online: false, error: "" }); return false; }
  // قبل الكتابة: اسحب أحدث نسخة ودمجها لتقليل فقدان إدخالات جهاز آخر.
  if (!force && state.shared) {
    try {
      const remote = await apiRead(settings.cloud);
      applyingRemote = true;
      await mergeRemote(remote, { syncSettings: false });
      applyingRemote = false;
    } catch (e) { applyingRemote = false; }
  }
  const snap = await snapshotForCloud();
  let body = JSON.stringify(snap);
  const h = hash(body);
  if (!force && h === lastHash) {
    setState({ lastSync: Date.now(), error: "", online: true });
    await resetPending(); setState({ pending: 0 });
    return true;
  }
  // ضغط تلقائي إذا كبر الحجم (حد BrewPage ميجابايت واحد)
  if (body.length > 520000) {
    const gz = await gzipB64(body);
    if (gz) body = JSON.stringify({ app: "rased", schema: 1, gz, updatedAt: snap.updatedAt });
  }
  setState({ syncing: true, error: "" });
  try {
    await apiWrite(settings.cloud, JSON.parse(body));
    lastHash = h;
    await resetPending();
    setState({ syncing: false, lastSync: Date.now(), lastChecked: Date.now(), online: true, pending: 0, error: "" });
    return true;
  } catch (e) {
    setState({ syncing: false, error: e.message, lastChecked: Date.now() });
    return false;
  }
}

export async function pullNow() {
  if (realtimeActive) return false;
  if (!settings?.cloud?.enabled || !settings.cloud.id) return false;
  if (state.syncing) return false;
  if (!navigator.onLine) { setState({ online: false }); return false; }
  setState({ syncing: true, error: "" });
  try {
    const remote = await apiRead(settings.cloud);
    applyingRemote = true;
    const changed = await mergeRemote(remote, { syncSettings: !state.shared });
    applyingRemote = false;
    notifyRemote(changed);
    lastHash = hash(JSON.stringify(remote));
    setState({ syncing: false, lastSync: Date.now(), lastChecked: Date.now(), online: true, error: "" });
    if (changed) {
      // لا نصفّر العدّاد هنا: قد تكون هناك تغييرات محلية لم تُرفع بعد.
      schedulePush();
    }
    return true;
  } catch (e) {
    applyingRemote = false;
    setState({ syncing: false, error: e.message, lastChecked: Date.now() });
    return false;
  }
}

export async function syncNow() {
  const ok = await pullNow();
  if (ok) await pushNow(true);
  return ok;
}

/* ---------------- الشبكة والمؤقتات ---------------- */
async function checkNetwork() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setState({ online: false, lastChecked: Date.now() });
    return false;
  }
  try {
    await fetch(`${API}/favicon.ico`, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(6000) });
    setState({ online: true, lastChecked: Date.now() });
    return true;
  } catch (e) {
    setState({ online: false, lastChecked: Date.now() });
    return false;
  }
}

function schedulePull() {
  clearInterval(pullTimer);
  if (realtimeActive) return;
  pullTimer = setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine) pullNow().catch(() => { });
  }, state.shared ? 2000 : 60000);
}

function stopTimers() {
  clearInterval(pullTimer); clearInterval(heartbeatTimer); clearInterval(renewTimer);
}

const schedulePush = debounce(() => {
  if (applyingRemote || realtimeActive) return;
  pushNow().catch(() => { });
}, 500);

export function setRealtimeActive(active) {
  realtimeActive = !!active;
  setState({ realtime: realtimeActive });
  if (realtimeActive) {
    clearInterval(pullTimer);
    clearTimeout(pushTimer);
    clearInterval(renewTimer);
  } else if (state.configured) {
    schedulePull();
    if (navigator.onLine) schedulePush();
  }
}

export async function initSync() {
  settings = await getSettings();
  const cfg = settings.cloud || {};
  const pending = await getPending();
  const isShared = !!(cfg.shared || cfg.ns === SHARED_SYNC_NS);
  setState({
    configured: !!(cfg.enabled && cfg.id), provider: cfg.provider || "brewpage", shared: isShared,
    lastSync: cfg.lastSync || 0, expiresAt: cfg.expiresAt || 0, pending, online: navigator.onLine
  });
  if (!state.configured && SHARED_SYNC_CODE) {
    try {
      await connectCloud(SHARED_SYNC_CODE, { verify: true, shared: true, syncSettings: false });
    } catch (e) {
      console.warn("shared cloud", e);
      setState({ error: e.message || "تعذر الاتصال بالمزامنة المشتركة" });
    }
  }
  if (state.configured) schedulePull();
  if (state.shared) {
    clearInterval(renewTimer);
    renewTimer = setInterval(() => {
      if (!realtimeActive && document.visibilityState === "visible" && navigator.onLine) pushNow(true).catch(() => { });
    }, 12 * 60 * 60 * 1000);
  }

  window.addEventListener("online", async () => {
    setState({ online: true });
    const ok = await checkNetwork();
    if (!ok) return;
    if (state.configured && !realtimeActive) await pushNow(true);
    else if (SHARED_SYNC_CODE) {
      try { await connectCloud(SHARED_SYNC_CODE, { verify: true, shared: true, syncSettings: false }); } catch (e) { console.warn("shared cloud retry", e); }
    }
  });
  window.addEventListener("offline", () => setState({ online: false }));

  dbEvents.addEventListener("changed", e => {
    if (applyingRemote) return;
    if (e.detail?.store === "settings") return;
    setState({ pending: state.pending + 1 });
    schedulePush();
  });
  document.addEventListener("pending", async () => setState({ pending: await getPending() }));

  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === "visible") checkNetwork();
  }, 35000);
  setTimeout(() => checkNetwork(), 800);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkNetwork();
      if (state.configured) pullNow().catch(() => { });
    }
  });
  window.addEventListener("beforeunload", () => { if (!realtimeActive && state.configured && state.pending > 0) pushNow(true); });
  return state;
}

export function getState() { return { ...state }; }
export async function copyCode() {
  if (!settings?.cloud?.id) return "";
  return encodeCode(settings.cloud);
}

