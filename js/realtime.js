/* ============================================================
   راصد — قناة التزامن اللحظي (MQTT عام، بدون حساب)
   كل جهاز ينشر حالته الكاملة في موضوع خاص به، والبقية يدمجون.
   لا توجد كتابة جماعية واحدة تلغي إدخالات الآخرين.
   ============================================================ */
import { snapshotForCloud, mergeRemote, events as dbEvents } from "./db.js";
import { setRealtimeActive } from "./sync.js";
import { SHARED_SYNC_NS } from "./shared-cloud.js";

const BROKERS = [
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://broker.emqx.io:8084/mqtt"
];
const ROOT = `rased/${SHARED_SYNC_NS}/v4`;
const DEVICE_KEY = "rased_device_id";
const state = { connected: false, broker: "", last: 0, error: "", device: "" };
let client = null;
let brokerIndex = 0;
let started = false;
let applying = false;
let publishTimer = null;
let connectTimer = null;
let attempts = 0;

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) { return "device"; }
}
const DEVICE = deviceId();

function emit() {
  state.device = DEVICE;
  try { document.dispatchEvent(new CustomEvent("rased:realtime", { detail: { ...state } })); } catch (e) { }
}

function b64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}
function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function gzipB64(text) {
  if (typeof CompressionStream === "undefined") return "";
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return b64(new Uint8Array(buf));
  } catch (e) { return ""; }
}
async function gunzipB64(data) {
  if (typeof DecompressionStream === "undefined") throw new Error("no decompression");
  const stream = new Blob([unb64(data)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

async function buildSnapshot() {
  const snap = await snapshotForCloud();
  delete snap.backups;
  return snap;
}

async function publishState() {
  if (!client || !client.connected) return;
  clearTimeout(publishTimer);
  try {
    const snap = await buildSnapshot();
    const raw = JSON.stringify(snap);
    const gz = await gzipB64(raw);
    const body = gz
      ? JSON.stringify({ v: 3, device: DEVICE, at: Date.now(), gz })
      : JSON.stringify({ v: 3, device: DEVICE, at: Date.now(), snap });
    if (body.length > 900000) { state.error = "حجم البيانات أكبر من حد القناة اللحظية"; emit(); return; }
    await new Promise((resolve, reject) => {
      client.publish(`${ROOT}/dev/${DEVICE}`, body, { qos: 0, retain: true }, err => err ? reject(err) : resolve());
    });
    state.last = Date.now();
    state.error = "";
    emit();
  } catch (e) {
    state.error = e.message || String(e);
    emit();
  }
}
function schedulePublish() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(publishState, 350);
}
function requestState() {
  if (!client || !client.connected) return;
  client.publish(`${ROOT}/req`, JSON.stringify({ device: DEVICE, at: Date.now() }), { qos: 0, retain: false });
}

async function onMessage(topic, payload) {
  if (topic === `${ROOT}/req`) { publishState(); return; }
  if (!topic.startsWith(`${ROOT}/dev/`)) return;
  if (topic.endsWith(`/${DEVICE}`)) return;
  let data;
  try { data = JSON.parse(payload.toString()); } catch (e) { return; }
  if (!data || data.v !== 3) return;
  let remote;
  try {
    remote = data.gz ? JSON.parse(await gunzipB64(data.gz)) : data.snap;
  } catch (e) { return; }
  if (!remote || remote.app !== "rased") return;
  applying = true;
  try {
    const changed = await mergeRemote(remote, { syncSettings: true });
    if (changed) {
      state.last = Date.now();
      try { window.dispatchEvent(new CustomEvent("rased:remote", { detail: { changed } })); } catch (e) { }
      emit();
    }
  } catch (e) {
    state.error = e.message || String(e);
    emit();
  } finally {
    applying = false;
  }
}

function stopClient() {
  try { client?.end(true); } catch (e) { }
  client = null;
}

function connect() {
  if (started) return;
  const lib = window.mqtt;
  if (!lib) { state.error = "تعذر تحميل قناة التزامن اللحظي"; emit(); return; }
  started = true;
  const url = BROKERS[brokerIndex];
  state.broker = url;
  state.error = "";
  const c = lib.connect(url, {
    clientId: `rased_${DEVICE.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}_${Math.random().toString(16).slice(2, 6)}`,
    clean: true,
    connectTimeout: 6000,
    reconnectPeriod: 1000,
    keepalive: 20,
    protocolVersion: 4
  });
  client = c;
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (!c.connected) {
      state.error = "تعذر الاتصال بقناة التزامن اللحظي";
      emit();
      if (brokerIndex < BROKERS.length - 1) {
        brokerIndex++;
        stopClient();
        started = false;
        setTimeout(connect, 300);
      }
    }
  }, 12000);
  c.on("connect", () => {
    attempts = 0;
    state.connected = true;
    state.error = "";
    emit();
    setRealtimeActive(true);
    c.subscribe([`${ROOT}/dev/+`, `${ROOT}/req`], { qos: 0 }, err => {
      if (err) state.error = err.message || String(err);
      emit();
    });
    setTimeout(() => { publishState(); requestState(); }, 300);
  });
  c.on("message", (topic, payload) => { onMessage(topic, payload).catch(() => { }); });
  c.on("close", () => {
    state.connected = false;
    emit();
    setRealtimeActive(false);
  });
  c.on("offline", () => {
    state.connected = false;
    emit();
    setRealtimeActive(false);
  });
  c.on("error", e => {
    state.error = e?.message || String(e);
    emit();
    attempts++;
    if (!c.connected && attempts >= 3 && brokerIndex < BROKERS.length - 1) {
      attempts = 0;
      brokerIndex++;
      stopClient();
      started = false;
      setTimeout(connect, 400);
    }
  });
}

export function initRealtime() {
  if (!("WebSocket" in window)) return;
  dbEvents.addEventListener("changed", e => {
    if (applying) return;
    if (e.detail?.store === "settings") return;
    schedulePublish();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !client) return;
    if (!client.connected) { try { client.reconnect(); } catch (e) { } }
    else { schedulePublish(); requestState(); }
  });
  window.addEventListener("online", () => {
    if (!client) { started = false; connect(); }
    else if (!client.connected) { try { client.reconnect(); } catch (e) { } }
  });
  setInterval(() => {
    if (!started || !client || client.connected) return;
    try { client.reconnect(); } catch (e) { }
  }, 5000);
  connect();
}

export function getRealtimeState() { return { ...state, device: DEVICE }; }
