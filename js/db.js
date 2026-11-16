/* ============================================================
   راصد — طبقة البيانات المحلية (IndexedDB) + البيانات التجريبية
   ============================================================ */
import {
  todayISO, addDays, isoToDate, hijriParts, formatHijri, weekdayIndex,
  uid, clamp, classLabel, stageName, activeTermRange, nowClock
} from "./core.js";
import { loadSeed, SCHOOL_DEFAULT } from "../data/seed.js";
import { SHARED_SYNC_CODE } from "./shared-cloud.js";

const DB_NAME = "rased-db";
const DB_VERSION = 2;

export const DEFAULT_SETTINGS = {
  school: { ...SCHOOL_DEFAULT },
  academicYear: "1448",
  termStart: "2026-08-23",
  termEnd: "2027-06-10",
  activeTerm: 1,
  term1Start: "2026-08-23",
  term1End: "2026-11-30",
  term2Start: "2026-12-13",
  term2End: "2027-06-10",
  weekend: [5, 6],                 // الجمعة والسبت
  adminPinHash: "onvevfyjnhs1",
  adminUsername: "admin",
  adminPasswordHash: "ou6r824zmiz0",
  recorderUsername: "1",
  recorderPasswordHash: "ctm3g91o5ud47",
  allowHolidayRecording: false,
  schoolWhatsApp: "",
  excuseSecret: "rased-1448-mohammed-alrashid",
  excuseMessage: "السلام عليكم ورحمة الله وبركاته،\nنود إفادتكم بأن ابنكم {name} تغيب عن المدرسة يوم {weekday} الموافق {hijri}هـ ({gregorian}).\nنأمل منكم تقديم عذر الغياب عبر الرابط التالي:\n{link}\nولكم منا جزيل الشكر والتقدير.\nمدرسة {school}",
  lateMessage: "السلام عليكم ورحمة الله وبركاته،\nنود إفادتكم بأن ابنكم {name} تأخر عن الطابور الصباحي يوم {weekday} الموافق {hijri}هـ ({gregorian}).\nنأمل منكم متابعة انتظام ابنكم في الوقت المحدد.\nولكم منا جزيل الشكر والتقدير.\nمدرسة {school}",
  whatsapp: { min: 8, max: 25, every: 5, extra: 45, closeTab: true },
  resolvedCases: {},
  cloud: { provider: "brewpage", ns: "", id: "", token: "", link: "", lastSync: 0, enabled: false, lastError: "" },
  noor: { includeLate: false, dateMode: "hijri" },
  demoDismissed: false,
  createdAt: 0,
  updatedAt: 0
};

let db = null;
let cache = { students: null, settings: null, holidays: null, sessionsByDate: new Map() };
let channel = null;
export const events = new EventTarget();

/* ---------------- بصمة التعديل المستقلة عن ساعة الجهاز ---------------- */
const DEVICE_KEY = "rased_device_id";
const LAMPORT_KEY = "rased_lamport";
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) { return "device"; }
}
const DEVICE_ID = getDeviceId();
let lamport = Number((() => { try { return localStorage.getItem(LAMPORT_KEY) || 0; } catch (e) { return 0; } })()) || 0;
function saveLamport() { try { localStorage.setItem(LAMPORT_KEY, String(lamport)); } catch (e) { } }
function parseRev(rev) {
  const m = /^(\d+)-(.+)$/.exec(String(rev || ""));
  return m ? { n: Number(m[1]), d: m[2] } : null;
}
export function noteRev(rev) {
  const r = parseRev(rev);
  if (r && r.n > lamport) { lamport = r.n; saveLamport(); }
}
function nextRev() { lamport++; saveLamport(); return `${lamport}-${DEVICE_ID}`; }
function compareRevs(a, b) {
  const A = parseRev(a), B = parseRev(b);
  if (A && B) return A.n - B.n || (A.d > B.d ? 1 : A.d < B.d ? -1 : 0);
  if (A) return 1;
  if (B) return -1;
  return 0;
}
function withRev(value, keepRev = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return keepRev ? value : { ...value, rev: nextRev() };
}

function broadcast(type, detail = {}) {
  try {
    if (!channel && "BroadcastChannel" in window) channel = new BroadcastChannel("rased-db");
    channel?.postMessage({ type, ...detail, at: Date.now() });
    if (type === "changed") events.dispatchEvent(new CustomEvent("changed", { detail }));
  } catch (e) { /* ignore */ }
}
if ("BroadcastChannel" in window) {
  channel = new BroadcastChannel("rased-db");
  channel.onmessage = e => {
    if (e.data && e.data.type === "changed") {
      cache.students = null; cache.settings = null; cache.holidays = null; cache.sessionsByDate = new Map();
      events.dispatchEvent(new CustomEvent("changed", { detail: e.data }));
    }
  };
}

/* ---------------- فتح قاعدة البيانات ---------------- */
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("students")) {
        const s = d.createObjectStore("students", { keyPath: "id" });
        s.createIndex("stage", "stageId");
        s.createIndex("class", "classNo");
        s.createIndex("name", "name");
        s.createIndex("active", "active");
      }
      if (!d.objectStoreNames.contains("attendance")) {
        const s = d.createObjectStore("attendance", { keyPath: "id" });
        s.createIndex("date", "date");
        s.createIndex("date_mode", ["date", "mode"]);
        s.createIndex("student", "studentId");
        s.createIndex("stage", "stageId");
        s.createIndex("class", "classNo");
      }
      if (!d.objectStoreNames.contains("sessions")) {
        const s = d.createObjectStore("sessions", { keyPath: "id" });
        s.createIndex("date", "date");
        s.createIndex("stage", "stageId");
      }
      if (!d.objectStoreNames.contains("holidays")) d.createObjectStore("holidays", { keyPath: "date" });
      if (!d.objectStoreNames.contains("excuses")) {
        const s = d.createObjectStore("excuses", { keyPath: "id" });
        s.createIndex("status", "status");
        s.createIndex("student", "studentId");
        s.createIndex("date", "date");
      }
      if (!d.objectStoreNames.contains("actions")) {
        const s = d.createObjectStore("actions", { keyPath: "id" });
        s.createIndex("student", "studentId");
        s.createIndex("at", "at");
      }
      if (!d.objectStoreNames.contains("logs")) {
        const s = d.createObjectStore("logs", { keyPath: "id" });
        s.createIndex("at", "at");
        s.createIndex("student", "studentId");
      }
      if (!d.objectStoreNames.contains("excusedRoster")) d.createObjectStore("excusedRoster", { keyPath: "studentId" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}
export function getDB() { return db; }

function tx(store, mode = "readonly") {
  return db.transaction(store, mode).objectStore(store);
}
function reqPromise(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
function all(store) { return reqPromise(tx(store).getAll()); }
function get(store, key) { return reqPromise(tx(store).get(key)); }
function put(store, value, { keepRev = false } = {}) {
  if (store !== "meta") value = withRev(value, keepRev);
  return reqPromise(tx(store, "readwrite").put(value));
}
function del(store, key) { return reqPromise(tx(store, "readwrite").delete(key)); }
function clearStore(store) { return reqPromise(tx(store, "readwrite").clear()); }
function count(store) { return reqPromise(tx(store).count()); }
function byIndex(store, index, key) { return reqPromise(tx(store).index(index).getAll(key)); }

/* ---------------- التهيئة ---------------- */
export async function initDB() {
  await openDB();
  const meta = await all("meta");
  const metaMap = Object.fromEntries(meta.map(m => [m.key, m.value]));
  let settings = metaMap.settings;
  if (!settings) {
    settings = { ...structuredClone(DEFAULT_SETTINGS), createdAt: Date.now(), updatedAt: Date.now() };
    await put("meta", { key: "settings", value: settings });
  } else {
    settings = deepMerge(structuredClone(DEFAULT_SETTINGS), settings);
    if (!settings.term1Start) settings.term1Start = settings.termStart || DEFAULT_SETTINGS.term1Start;
    if (!settings.term2End) settings.term2End = settings.termEnd || DEFAULT_SETTINGS.term2End;
    if (!settings.activeTerm) settings.activeTerm = 1;
    if (settings.adminPin) {
      // ترحيل الإصدارات السابقة: لا نحتفظ بالرقم السري نصاً.
      const s = `${"admin-pin"}|${settings.adminPin}`;
      let h1 = 0x811c9dc5, h2 = 0x1000193;
      for (let i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193); h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x85ebca6b); }
      settings.adminPinHash = (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
      delete settings.adminPin;
      await put("meta", { key: "settings", value: settings });
    }
    if (!settings.excuseSecret) { settings.excuseSecret = DEFAULT_SETTINGS.excuseSecret; await put("meta", { key: "settings", value: settings }); }
    if (!settings.createdAt) settings.createdAt = Date.now();
  }
  cache.settings = settings;

  const seed = loadSeed();
  if (await count("students") === 0) {
    await bulkPut("students", seed.students.map(s => ({ ...s, createdAt: Date.now(), updatedAt: Date.now() })));
  }
  if (await count("holidays") === 0) {
    await bulkPut("holidays", seed.holidays.map(h => ({ ...h, createdAt: Date.now() })));
  }

  // بيانات تجريبية للعرض عند أول تشغيل فقط — لا تُستخدم في وضع السحابة المشتركة
  if (!SHARED_SYNC_CODE && !metaMap.demoSeeded && (await count("attendance")) === 0) {
    const ok = await seedDemoData();
    if (ok) await put("meta", { key: "demoSeeded", value: true });
  }
  if (!metaMap.pending) await put("meta", { key: "pending", value: 0 });
  cache.students = null; cache.holidays = null;
  return settings;
}

function deepMerge(base, extra) {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return extra ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === "object" && !Array.isArray(v) && base && typeof base[k] === "object" && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else out[k] = v;
  }
  return out;
}

/* ---------------- الإعدادات ---------------- */
export async function getSettings() {
  if (cache.settings) return cache.settings;
  const m = await get("meta", "settings");
  cache.settings = m?.value || structuredClone(DEFAULT_SETTINGS);
  return cache.settings;
}
export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = deepMerge(structuredClone(cur), patch || {});
  next.updatedAt = Date.now();
  await put("meta", { key: "settings", value: next });
  cache.settings = next;
  broadcast("changed", { store: "settings" });
  events.dispatchEvent(new CustomEvent("changed", { detail: { store: "settings" } }));
  return next;
}
export async function getPending() {
  const m = await get("meta", "pending");
  return Number(m?.value || 0);
}
export async function markPending(n = 1) {
  const cur = await getPending();
  await put("meta", { key: "pending", value: cur + n });
  events.dispatchEvent(new CustomEvent("pending"));
}
export async function resetPending() {
  await put("meta", { key: "pending", value: 0 });
  events.dispatchEvent(new CustomEvent("pending"));
}

/* ---------------- الطلاب ---------------- */
export async function listStudents(opts = {}) {
  if (!cache.students) cache.students = await all("students");
  let rows = cache.students;
  if (!opts.includeInactive) rows = rows.filter(s => s.active !== false);
  if (opts.stageId) rows = rows.filter(s => Number(s.stageId) === Number(opts.stageId));
  if (opts.classNo) rows = rows.filter(s => Number(s.classNo) === Number(opts.classNo));
  return rows.slice().sort((a, b) => (a.stageId - b.stageId) || (a.classNo - b.classNo) || a.name.localeCompare(b.name, "ar"));
}
export async function getStudent(id) {
  if (!cache.students) cache.students = await all("students");
  return cache.students.find(s => s.id === id) || null;
}
export async function saveStudent(student) {
  const now = Date.now();
  const row = { ...student, updatedAt: now, createdAt: student.createdAt || now };
  if (!row.id) row.id = uid("st");
  await put("students", row);
  cache.students = null;
  broadcast("changed", { store: "students" });
  return row;
}
export async function deleteStudent(id) {
  const s = await getStudent(id);
  if (!s) return;
  await put("students", { ...s, active: false, deleted: true, updatedAt: Date.now() });
  cache.students = null;
  broadcast("changed", { store: "students" });
}
export async function bulkPutStudents(rows) {
  await bulkPut("students", rows);
  cache.students = null;
  broadcast("changed", { store: "students" });
}
export async function classCounts() {
  const students = await listStudents();
  const map = new Map();
  for (const s of students) {
    const key = `${s.stageId}-${s.classNo}`;
    if (!map.has(key)) map.set(key, { stageId: Number(s.stageId), classNo: Number(s.classNo), count: 0 });
    map.get(key).count++;
  }
  return Array.from(map.values()).sort((a, b) => a.stageId - b.stageId || a.classNo - b.classNo);
}

/* ---------------- الحضور والغياب ---------------- */
export function attendanceId(date, studentId, mode) { return `${date}::${studentId}::${mode}`; }
export async function getDayRecords(date, mode) {
  const rows = await byIndex("attendance", "date_mode", [date, mode]);
  return rows.filter(r => !r.deleted);
}
export async function getDayMap(date, mode) {
  const rows = await getDayRecords(date, mode);
  const map = new Map();
  for (const r of rows) map.set(r.studentId, r);
  return map;
}
export async function getStatus(date, studentId, mode) {
  const r = await get("attendance", attendanceId(date, studentId, mode));
  return r && !r.deleted ? r.status : "present";
}
export async function bulkImportAttendance(records, { overwrite = true, by = "noor-import" } = {}) {
  const now = Date.now();
  const ops = [];
  let skipped = 0;
  for (const rec of records) {
    const id = attendanceId(rec.date, rec.studentId, "absence");
    const existing = await get("attendance", id);
    if (existing && existing.status === "absent" && existing.excused === !!rec.excused && !overwrite) { skipped++; continue; }
    if (existing && !overwrite) { skipped++; continue; }
    ops.push({
      id, date: rec.date, studentId: rec.studentId,
      stageId: Number(rec.stageId), classNo: Number(rec.classNo),
      mode: "absence", status: "absent", excused: !!rec.excused,
      updatedAt: now, createdAt: existing?.createdAt || now, by, demo: false
    });
  }
  if (ops.length) {
    await bulkPut("attendance", ops);
    await markPending(ops.length);
    broadcast("changed", { store: "attendance", mode: "absence" });
  }
  return { imported: ops.length, skipped, total: records.length };
}

function lateStamp() {
  return { at: Date.now(), time: nowClock() };
}
export async function setStatus({ date, studentId, stageId, classNo, mode, status, excused = false, by = "recorder", demo = false }) {
  const id = attendanceId(date, studentId, mode);
  const existing = await get("attendance", id);
  const late = mode === "late" && status === "late" ? lateStamp() : null;
  if (status === "present") {
    if (existing) {
      await put("attendance", { ...existing, status: "present", excused: false, lateAt: null, lateTime: "", updatedAt: Date.now(), by, demo: false });
    }
    // لا ننشئ سجلات للحاضرين افتراضياً (لتقليل حجم البيانات)
  } else {
    await put("attendance", {
      id, date, studentId, stageId: Number(stageId), classNo: Number(classNo), mode,
      status, excused: status === "absent" ? !!excused : false,
      lateAt: late?.at || null, lateTime: late?.time || "",
      updatedAt: Date.now(), createdAt: existing?.createdAt || Date.now(), by, demo
    });
  }
  await markSession({ date, stageId, classNo, mode, by });
  await markPending(1);
  broadcast("changed", { store: "attendance", date, mode });
  return status;
}
export async function setExcused({ date, studentId, excused }) {
  const id = attendanceId(date, studentId, "absence");
  const rec = await get("attendance", id);
  if (!rec || rec.deleted) return false;
  await put("attendance", { ...rec, excused: !!excused, updatedAt: Date.now(), demo: false });
  await markPending(1);
  broadcast("changed", { store: "attendance", date, mode: "absence" });
  return true;
}
export async function bulkSetStatus({ date, stageId, classNo, mode, status, by = "recorder" }) {
  const students = await listStudents({ stageId, classNo });
  const existing = await getDayMap(date, mode);
  const now = Date.now();
  const late = mode === "late" && status === "late" ? lateStamp() : null;
  const ops = [];
  if (status === "present") {
    for (const [sid, rec] of existing) {
      const s = students.find(x => x.id === sid);
      if (!s) continue;
      if (rec.status !== "present") ops.push({ ...rec, status: "present", excused: false, lateAt: null, lateTime: "", updatedAt: now, by, demo: false });
    }
  } else {
    for (const s of students) {
      const rec = existing.get(s.id);
      ops.push({
        id: attendanceId(date, s.id, mode), date, studentId: s.id, stageId: Number(s.stageId), classNo: Number(s.classNo),
        mode, status, excused: false,
        lateAt: late?.at || null, lateTime: late?.time || "",
        updatedAt: now, createdAt: rec?.createdAt || now, by, demo: false
      });
    }
  }
  if (ops.length) await bulkPut("attendance", ops);
  const cls = classNo ? [Number(classNo)] : Array.from(new Set(students.map(s => Number(s.classNo))));
  for (const c of cls) await markSession({ date, stageId, classNo: c, mode, by });
  await markPending(ops.length || 1);
  broadcast("changed", { store: "attendance", date, mode });
  return ops.length;
}
export async function getSessions(date) {
  if (cache.sessionsByDate.has(date)) return cache.sessionsByDate.get(date);
  const rows = await byIndex("sessions", "date", date);
  const valid = rows.filter(r => !r.deleted);
  cache.sessionsByDate.set(date, valid);
  return valid;
}
export async function markSession({ date, stageId, classNo, mode, by = "recorder", demo = false }) {
  const id = `${date}::${stageId}::${classNo}::${mode}`;
  const existing = await get("sessions", id);
  const row = {
    id, date, stageId: Number(stageId), classNo: Number(classNo), mode,
    updatedAt: Date.now(), createdAt: existing?.createdAt || Date.now(), by, demo: demo || existing?.demo || false
  };
  await put("sessions", row);
  cache.sessionsByDate.delete(date);
  broadcast("changed", { store: "sessions", date });
}
export async function getDayStats(date) {
  const [absence, late, sessions, students, holidays] = await Promise.all([
    getDayRecords(date, "absence"), getDayRecords(date, "late"), getSessions(date), listStudents(), all("holidays")
  ]);
  const absent = new Set(), lateSet = new Set(), excused = new Set();
  for (const r of absence) {
    if (r.status === "absent") { absent.add(r.studentId); if (r.excused) excused.add(r.studentId); }
  }
  for (const r of late) if (r.status === "late") lateSet.add(r.studentId);
  const classes = new Set(students.map(s => `${s.stageId}-${s.classNo}`));
  const recorded = new Set(sessions.filter(s => s.mode === "absence").map(s => `${s.stageId}-${s.classNo}`));
  const perStage = { 1: { total: 0, absent: 0, late: 0, recorded: 0, classes: 0 }, 2: { total: 0, absent: 0, late: 0, recorded: 0, classes: 0 }, 3: { total: 0, absent: 0, late: 0, recorded: 0, classes: 0 } };
  for (const s of students) { if (perStage[s.stageId]) perStage[s.stageId].total++; }
  for (const sid of absent) {
    const s = students.find(x => x.id === sid);
    if (s && perStage[s.stageId]) perStage[s.stageId].absent++;
  }
  for (const sid of lateSet) {
    const s = students.find(x => x.id === sid);
    if (s && perStage[s.stageId]) perStage[s.stageId].late++;
  }
  for (const key of classes) { const [st] = key.split("-"); if (perStage[st]) perStage[st].classes++; }
  for (const key of recorded) { const [st] = key.split("-"); if (perStage[st]) perStage[st].recorded++; }
  return {
    date, absent: absent.size, late: lateSet.size, excusedAbsent: excused.size,
    unexcusedAbsent: absent.size - excused.size, recordedClasses: recorded.size, totalClasses: classes.size,
    totalStudents: students.length, sessions, perStage,
    holiday: holidays.find(h => h.date === date) || null
  };
}

/* ---------------- نطاقات وتقارير ---------------- */
export async function getRangeRecords(from, to, opts = {}) {
  if (!from || !to || from > to) return [];
  const rows = await new Promise((resolve, reject) => {
    const out = [];
    const range = IDBKeyRange.bound(from, to);
    const req = tx("attendance").index("date").openCursor(range);
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { if (!cur.value.deleted) out.push(cur.value); cur.continue(); }
      else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
  return rows.filter(r => {
    if (r.status === "present") return false;
    if (opts.mode && opts.mode !== "all" && r.mode !== opts.mode) return false;
    if (opts.status && opts.status !== "all" && r.status !== opts.status) return false;
    if (opts.stageId && Number(r.stageId) !== Number(opts.stageId)) return false;
    if (opts.classNo && Number(r.classNo) !== Number(opts.classNo)) return false;
    if (opts.studentId && r.studentId !== opts.studentId) return false;
    if (opts.excused === "yes" && !r.excused) return false;
    if (opts.excused === "no" && r.excused) return false;
    return true;
  });
}
export async function totalsByStudent(from, to, opts = {}) {
  const rows = await getRangeRecords(from, to, { ...opts, mode: "absence" });
  const map = new Map();
  for (const r of rows) {
    if (r.status !== "absent") continue;
    const cur = map.get(r.studentId) || { absent: 0, excused: 0, unexcused: 0, late: 0, last: "" };
    cur.absent++;
    if (r.excused) cur.excused++; else cur.unexcused++;
    if (!cur.last || r.date > cur.last) cur.last = r.date;
    map.set(r.studentId, cur);
  }
  const lateRows = await getRangeRecords(from, to, { ...opts, mode: "late" });
  for (const r of lateRows) {
    if (r.status !== "late") continue;
    const cur = map.get(r.studentId) || { absent: 0, excused: 0, unexcused: 0, late: 0, last: "" };
    cur.late++;
    map.set(r.studentId, cur);
  }
  return map;
}
export async function studentStats(studentId, from, to) {
  const rows = await getRangeRecords(from, to, { studentId });
  const out = { absent: 0, excused: 0, unexcused: 0, late: 0, records: [] };
  for (const r of rows) {
    if (r.mode === "absence" && r.status === "absent") {
      out.absent++; if (r.excused) out.excused++; else out.unexcused++;
    }
    if (r.mode === "late" && r.status === "late") out.late++;
    out.records.push(r);
  }
  out.records.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

/* ---------------- طلاب ذوو الأعذار (رصد تلقائي بعذر) ---------------- */
export async function listExcusedRoster() {
  const rows = await all("excusedRoster");
  return rows.filter(r => r.active !== false).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
export async function addExcusedStudent({ studentId, from, to = "", reason = "عذر مستمر" }) {
  const now = Date.now();
  const existing = await get("excusedRoster", studentId);
  const row = {
    studentId, from: from || todayISO(), to: to || "", reason: reason || "عذر مستمر",
    active: true, createdAt: existing?.createdAt || now, updatedAt: now
  };
  await put("excusedRoster", row);
  await markPending(1);
  broadcast("changed", { store: "excusedRoster" });
  await applyExcusedRoster(todayISO(), { studentId, force: true });
  return row;
}
export async function removeExcusedStudent(studentId) {
  const existing = await get("excusedRoster", studentId);
  if (existing) await put("excusedRoster", { ...existing, active: false, updatedAt: Date.now() });
  const today = todayISO();
  const rec = await get("attendance", attendanceId(today, studentId, "absence"));
  if (rec && rec.auto && rec.status === "absent") {
    await put("attendance", { ...rec, status: "present", excused: false, auto: false, updatedAt: Date.now() });
  }
  await markPending(1);
  broadcast("changed", { store: "excusedRoster" });
  broadcast("changed", { store: "attendance", date: today, mode: "absence" });
}
export async function applyExcusedRoster(date, { studentId = null, force = false } = {}) {
  const settings = await getSettings();
  const term = activeTermRange(settings);
  if (date < term.from || date > term.to) return 0;
  const idx = weekdayIndex(date);
  if ((settings.weekend || [5, 6]).map(Number).includes(idx)) return 0;
  const holidays = await all("holidays");
  if (holidays.some(h => h.date === date)) return 0;
  let roster = await listExcusedRoster();
  if (studentId) roster = roster.filter(r => r.studentId === studentId);
  const students = await listStudents({ includeInactive: true });
  const smap = new Map(students.map(s => [s.id, s]));
  const ops = [];
  const now = Date.now();
  for (const entry of roster) {
    if (entry.from && date < entry.from) continue;
    if (entry.to && date > entry.to) continue;
    const s = smap.get(entry.studentId);
    if (!s || s.active === false) continue;
    const id = attendanceId(date, s.id, "absence");
    const existing = await get("attendance", id);
    // لا نتجاوز تسجيلاً يدوياً للحضور أو التأخر؛ نكمل النقص فقط.
    if (!force && existing && (existing.status === "present" || existing.status === "late")) continue;
    if (existing && existing.status === "absent" && existing.excused && !force) continue;
    ops.push({
      id, date, studentId: s.id, stageId: Number(s.stageId), classNo: Number(s.classNo), mode: "absence",
      status: "absent", excused: true, auto: true,
      updatedAt: now, createdAt: existing?.createdAt || now, by: "auto-excuse", demo: false
    });
  }
  if (ops.length) {
    await bulkPut("attendance", ops);
    await markPending(ops.length);
    broadcast("changed", { store: "attendance", date, mode: "absence" });
  }
  return ops.length;
}

/* ---------------- الإجازات ---------------- */
export async function listHolidays() {
  if (!cache.holidays) cache.holidays = await all("holidays");
  return cache.holidays.slice().sort((a, b) => a.date.localeCompare(b.date));
}
export async function addHoliday(row) {
  const rec = { ...row, createdAt: Date.now() };
  await put("holidays", rec);
  cache.holidays = null;
  broadcast("changed", { store: "holidays" });
  return rec;
}
export async function addHolidayRange(from, to, title, type = "official") {
  const settings = await getSettings();
  const rows = [];
  let cur = from;
  while (cur <= to && rows.length < 90) {
    rows.push({ date: cur, hijri: formatHijri(cur), title, type, createdAt: Date.now() });
    cur = addDays(cur, 1);
  }
  await bulkPut("holidays", rows);
  cache.holidays = null;
  broadcast("changed", { store: "holidays" });
  return rows.length;
}
export async function removeHoliday(date) {
  await del("holidays", date);
  cache.holidays = null;
  broadcast("changed", { store: "holidays" });
}
export async function holidayInfo(date) {
  const settings = await getSettings();
  const holidays = await listHolidays();
  const h = holidays.find(x => x.date === date);
  const idx = weekdayIndex(date);
  const weekend = (settings.weekend || [5, 6]).map(Number);
  const isWeekend = weekend.includes(idx);
  return {
    isHoliday: !!h || isWeekend,
    title: h?.title || (isWeekend ? "نهاية الأسبوع" : ""),
    holiday: h || null,
    isWeekend
  };
}

/* ---------------- الأعذار ---------------- */
export async function listExcuses(opts = {}) {
  let rows = await all("excuses");
  if (opts.status && opts.status !== "all") rows = rows.filter(r => r.status === opts.status);
  if (opts.studentId) rows = rows.filter(r => r.studentId === opts.studentId);
  return rows.filter(r => !r.deleted).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
export async function saveExcuse(row) {
  const now = Date.now();
  const rec = { ...row, id: row.id || uid("exc"), createdAt: row.createdAt || now, updatedAt: now };
  await put("excuses", rec);
  await markPending(1);
  broadcast("changed", { store: "excuses" });
  return rec;
}
export async function setExcuseStatus(id, status, note = "") {
  const ex = await get("excuses", id);
  if (!ex) return;
  const updated = { ...ex, status, adminNote: note, updatedAt: Date.now() };
  await put("excuses", updated);
  if (ex.date && ex.studentId) {
    const aid = attendanceId(ex.date, ex.studentId, "absence");
    const rec = await get("attendance", aid);
    if (rec) await put("attendance", { ...rec, excused: status === "accepted", updatedAt: Date.now() });
  }
  await markPending(1);
  broadcast("changed", { store: "excuses" });
  return updated;
}

/* ---------------- إجراءات الحالات المتكررة ---------------- */
export async function listActions(studentId = null) {
  let rows = await all("actions");
  if (studentId) rows = rows.filter(r => r.studentId === studentId);
  return rows.filter(r => !r.deleted).sort((a, b) => (b.at || 0) - (a.at || 0));
}
export async function addAction(row) {
  const rec = { ...row, id: row.id || uid("act"), at: row.at || Date.now(), updatedAt: Date.now() };
  await put("actions", rec);
  await markPending(1);
  broadcast("changed", { store: "actions" });
  return rec;
}

/* ---------------- الحالات المتكررة: إخفاء بعد تنفيذ الإجراء ---------------- */
export function caseResolutionKey(studentId, category) { return `${studentId}::${category}`; }
export async function getResolvedCases({ includeInactive = false } = {}) {
  const s = await getSettings();
  const all = s.resolvedCases || {};
  if (includeInactive) return all;
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v && v.active !== false));
}
export async function resolveCase({ studentId, category, level, count, note = "" }) {
  const s = await getSettings();
  const key = caseResolutionKey(studentId, category);
  const row = { studentId, category, level: Number(level) || 3, count: Number(count) || 0, note, active: true, at: new Date().toISOString() };
  const next = { ...s, resolvedCases: { ...(s.resolvedCases || {}), [key]: row }, updatedAt: Date.now() };
  await put("meta", { key: "settings", value: next });
  cache.settings = next;
  await addAction({ studentId, type: "resolved", note: note || "تم عمل الإجراء اللازم مع الحالة" });
  broadcast("changed", { store: "settings" });
  events.dispatchEvent(new CustomEvent("changed", { detail: { store: "settings" } }));
  return row;
}
export async function restoreCase(key) {
  const s = await getSettings();
  const resolved = { ...(s.resolvedCases || {}) };
  const cur = resolved[key] || {};
  resolved[key] = { ...cur, active: false, at: new Date().toISOString() };
  const next = { ...s, resolvedCases: resolved, updatedAt: Date.now() };
  await put("meta", { key: "settings", value: next });
  cache.settings = next;
  broadcast("changed", { store: "settings" });
  events.dispatchEvent(new CustomEvent("changed", { detail: { store: "settings" } }));
}

/* ---------------- سجل واتساب ---------------- */
export async function addLog(row) {
  const rec = { ...row, id: row.id || uid("log"), at: row.at || Date.now() };
  await put("logs", rec);
  broadcast("changed", { store: "logs" });
  return rec;
}
export async function listLogs(limit = 100) {
  const rows = await all("logs");
  return rows.sort((a, b) => b.at - a.at).slice(0, limit);
}

/* ---------------- أدوات مساعدة للتخزين ---------------- */
export function bulkPut(store, rows, { keepRev = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!rows.length) return resolve();
    const t = db.transaction(store, "readwrite");
    const os = t.objectStore(store);
    for (const row of rows) os.put(store === "meta" ? row : withRev(row, keepRev));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
export async function exportAll() {
  const settings = await getSettings();
  const [students, attendance, sessions, holidays, excuses, actions, logs, excusedRoster] = await Promise.all([
    all("students"), all("attendance"), all("sessions"), all("holidays"), all("excuses"), all("actions"), all("logs"), all("excusedRoster")
  ]);
  return {
    app: "rased", version: 1, exportedAt: new Date().toISOString(),
    settings: { ...settings, cloud: { ...settings.cloud, token: "" } },
    students, attendance, sessions, holidays, excuses, actions, logs, excusedRoster
  };
}

/* ---------------- النسخ الاحتياطية الدورية ---------------- */
const BACKUP_MAX = 3;
function bytesToB64Backup(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytesBackup(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function compressBackup(text) {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === "function") {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
      return { compressed: true, data: bytesToB64Backup(new Uint8Array(await new Response(stream).arrayBuffer())) };
    } catch (e) { }
  }
  return { compressed: false, data: bytesToB64Backup(bytes) };
}
async function decompressBackup(entry) {
  const raw = b64ToBytesBackup(entry.data);
  if (!entry.compressed) return new TextDecoder().decode(raw);
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
export async function getAutoBackups(includeData = false) {
  const m = await get("meta", "autoBackups");
  const rows = Array.isArray(m?.value) ? m.value : [];
  return includeData ? rows : rows.map(({ data, ...meta }) => meta);
}
export async function getAutoBackup(id) {
  const m = await get("meta", "autoBackups");
  const rows = Array.isArray(m?.value) ? m.value : [];
  const entry = rows.find(x => x.id === id);
  if (!entry) return null;
  const text = await decompressBackup(entry);
  const obj = JSON.parse(text);
  return { meta: (({ data, ...x }) => x)(entry), data: obj };
}
export async function saveAutoBackup(trigger = "auto") {
  const data = await exportAll();
  const text = JSON.stringify(data);
  const packed = await compressBackup(text);
  const now = Date.now();
  const entry = {
    id: `bkp-${now}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date(now).toISOString(), trigger,
    size: text.length, stored: packed.data.length, compressed: packed.compressed,
    data: packed.data
  };
  const current = await getAutoBackups(true);
  const rows = [entry, ...current.filter(x => x.id !== entry.id)].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, BACKUP_MAX);
  await put("meta", { key: "autoBackups", value: rows });
  await put("meta", { key: "lastAutoBackup", value: now });
  broadcast("changed", { store: "backups" });
  events.dispatchEvent(new CustomEvent("changed", { detail: { store: "backups" } }));
  return { ...entry, data: undefined };
}
export async function deleteAutoBackup(id) {
  const current = await getAutoBackups(true);
  await put("meta", { key: "autoBackups", value: current.filter(x => x.id !== id) });
  broadcast("changed", { store: "backups" });
  events.dispatchEvent(new CustomEvent("changed", { detail: { store: "backups" } }));
}
export async function autoBackupIfDue(force = false) {
  const last = await get("meta", "lastAutoBackup");
  const now = Date.now();
  if (!force && last?.value && now - Number(last.value) < 24 * 60 * 60 * 1000) return null;
  if (!force && (await count("attendance")) === 0) return null;
  return saveAutoBackup(force ? "manual" : "auto");
}

export async function importAll(data, mode = "replace") {
  if (!data || data.app !== "rased") throw new Error("ملف نسخة احتياطية غير صالح");
  const stores = ["students", "attendance", "sessions", "holidays", "excuses", "actions", "logs", "excusedRoster"];
  if (mode === "replace") {
    for (const s of stores) await clearStore(s);
    for (const s of stores) if (Array.isArray(data[s])) await bulkPut(s, data[s]);
    if (data.settings) {
      const current = await getSettings();
      const restored = deepMerge(structuredClone(DEFAULT_SETTINGS), data.settings);
      restored.cloud = current.cloud;
      await put("meta", { key: "settings", value: restored });
    }
  } else {
    for (const s of stores) {
      if (!Array.isArray(data[s])) continue;
      const local = await all(s);
      const map = new Map(local.map(x => [x.id || x.date || x.key, x]));
      const rows = [];
      for (const r of data[s]) {
        const key = r.id || r.date || r.key;
        const cur = map.get(key);
        if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) rows.push(r);
      }
      if (rows.length) await bulkPut(s, rows);
    }
  }
  cache.students = null; cache.settings = null; cache.holidays = null;
  broadcast("changed", { store: "all" });
}
export async function resetAttendance() {
  for (const s of ["attendance", "sessions", "excuses", "actions"]) await clearStore(s);
  await resetPending();
  broadcast("changed", { store: "all" });
}
export async function clearDemoData() {
  const stores = ["attendance", "sessions", "excuses", "actions"];
  for (const s of stores) {
    const rows = await all(s);
    const demo = rows.filter(r => r.demo);
    if (demo.length) {
      const t = db.transaction(s, "readwrite");
      for (const r of demo) t.objectStore(s).delete(r.id || r.date);
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    }
  }
  await put("meta", { key: "demoSeeded", value: false });
  cache.sessionsByDate = new Map();
  broadcast("changed", { store: "all" });
}
export async function hasDemoData() {
  const m = await get("meta", "demoSeeded");
  return !!m?.value;
}

/* ---------------- البيانات التجريبية ---------------- */
function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
async function seedDemoData() {
  const students = await listStudents();
  const settings = await getSettings();
  const holidays = await all("holidays");
  const weekdays = (settings.weekend || [5, 6]).map(Number);
  const schoolDays = [];
  let d = todayISO();
  let guard = 0;
  while (schoolDays.length < 21 && guard++ < 70) {
    const idx = weekdayIndex(d);
    if (!weekdays.includes(idx) && !holidays.some(h => h.date === d)) schoolDays.unshift(d);
    d = addDays(d, -1);
  }
  if (!schoolDays.length) return false;
  const rnd = mulberry32(1448);
  const shuffled = students.slice().sort(() => rnd() - 0.5);
  const plan = new Map();
  const assign = (count, list) => { for (const s of list) plan.set(s.id, count); };
  assign(10, shuffled.slice(0, 8));
  assign(5, shuffled.slice(8, 26));
  assign(3, shuffled.slice(26, 56));
  const records = new Map();
  const sessions = new Map();
  const add = (date, s, mode, status, extra = {}) => {
    const id = attendanceId(date, s.id, mode);
    records.set(id, {
      id, date, studentId: s.id, stageId: Number(s.stageId), classNo: Number(s.classNo), mode, status,
      excused: false, createdAt: isoToDate(date).getTime(), updatedAt: isoToDate(date).getTime() + Math.floor(rnd() * 1000),
      by: "demo", demo: true, ...extra
    });
  };
  const markSess = (date, s, mode) => {
    const id = `${date}::${s.stageId}::${s.classNo}::${mode}`;
    sessions.set(id, { id, date, stageId: Number(s.stageId), classNo: Number(s.classNo), mode, createdAt: isoToDate(date).getTime(), updatedAt: Date.now(), by: "demo", demo: true });
  };
  for (const date of schoolDays) {
    const byClass = new Map();
    for (const s of students) {
      const k = `${s.stageId}-${s.classNo}`;
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k).push(s);
    }
    for (const [k, list] of byClass) {
      if (rnd() < 0.055) continue; // فصل لم يُرصد
      markSess(date, list[0], "absence");
      if (rnd() < 0.72) markSess(date, list[0], "late");
      const absN = Math.floor(rnd() * Math.min(4, list.length * 0.14));
      const lateN = Math.floor(rnd() * Math.min(3, list.length * 0.1));
      const pool = list.slice().sort(() => rnd() - 0.5);
      for (let i = 0; i < absN; i++) add(date, pool[i], "absence", "absent");
      for (let i = 0; i < lateN; i++) add(date, pool[(i + absN) % pool.length], "late", "late");
    }
    // الحالات المتكررة: غياب في أحدث الأيام
    for (const [sid, n] of plan) {
      const idx = schoolDays.indexOf(date);
      if (idx >= schoolDays.length - n) {
        const s = students.find(x => x.id === sid);
        if (s) { add(date, s, "absence", "absent"); markSess(date, s, "absence"); }
      }
    }
  }
  const allRecords = Array.from(records.values());
  // أعذار تجريبية
  const excuses = [];
  const absents = allRecords.filter(r => r.mode === "absence" && r.date >= schoolDays[Math.max(0, schoolDays.length - 12)]);
  for (let i = 0; i < Math.min(7, absents.length); i++) {
    const r = absents[Math.floor(rnd() * absents.length)];
    const accepted = i < 4;
    excuses.push({
      id: uid("exc"), studentId: r.studentId, date: r.date, mode: "absence",
      type: ["مرض", "ظرف عائلي", "موعد طبي"][i % 3], reason: "عذر تجريبي للعرض — يمكن حذف البيانات التجريبية من الإعدادات.",
      guardianName: "ولي الأمر", guardianPhone: "", status: accepted ? "accepted" : "pending",
      createdAt: Date.now() - i * 3600000, updatedAt: Date.now(), demo: true
    });
    if (accepted) {
      const rec = records.get(r.id);
      if (rec) rec.excused = true;
    }
  }
  await bulkPut("attendance", allRecords);
  await bulkPut("sessions", Array.from(sessions.values()));
  if (excuses.length) await bulkPut("excuses", excuses);
  cache.sessionsByDate = new Map();
  return true;
}

/* ---------------- السحابة: لقطة ودمج ---------------- */
export async function snapshotForCloud() {
  const settings = await getSettings();
  const [students, attendance, sessions, holidays, excuses, actions, logs, excusedRoster] = await Promise.all([
    all("students"), all("attendance"), all("sessions"), all("holidays"), all("excuses"), all("actions"), all("logs"), all("excusedRoster")
  ]);
  const cutoff = addDays(todayISO(), -400);
  const att = attendance.filter(r => {
    if (r.deleted) return false;
    if (r.status === "present" && r.date < addDays(todayISO(), -30)) return false;
    return r.date >= cutoff;
  });
  const s = { ...settings };
  delete s.cloud;
  delete s.adminPinHash;
  delete s.adminPasswordHash;
  delete s.recorderPasswordHash;
  delete s.excuseSecret;
  const backups = await getAutoBackups(true);
  return {
    app: "rased", schema: 1, updatedAt: Date.now(),
    settings: s,
    students: students.slice(),
    attendance: att,
    sessions: sessions.filter(r => r.date >= cutoff),
    holidays: holidays.slice(),
    excuses: excuses.slice(),
    actions: actions.slice(),
    logs: logs.slice(-300),
    excusedRoster: excusedRoster.slice(),
    resolvedCases: { ...(settings.resolvedCases || {}) },
    backups: backups.slice()
  };
}
export async function mergeRemote(remote, { syncSettings = true } = {}) {
  if (!remote || remote.app !== "rased") throw new Error("بيانات سحابية غير صالحة");
  let changed = 0;
  const mergeStore = async (store, rows) => {
    if (!Array.isArray(rows)) return;
    const local = await all(store);
    const map = new Map(local.map(x => [x.id || x.date || x.studentId, x]));
    const toPut = [];
    for (const r of rows) {
      const key = r.id || r.date || r.studentId;
      noteRev(r.rev);
      const cur = map.get(key);
      const cmp = compareRevs(r.rev, cur?.rev);
      const newer = !cur || (cmp !== 0 ? cmp > 0 : (r.updatedAt || 0) > (cur.updatedAt || 0));
      if (newer) { toPut.push(r); changed++; }
    }
    if (toPut.length) await bulkPut(store, toPut, { keepRev: true });
  };
  await mergeStore("students", remote.students);
  await mergeStore("attendance", remote.attendance);
  await mergeStore("sessions", remote.sessions);
  await mergeStore("holidays", remote.holidays);
  await mergeStore("excuses", remote.excuses);
  await mergeStore("actions", remote.actions);
  await mergeStore("logs", remote.logs);
  await mergeStore("excusedRoster", remote.excusedRoster);
  if (syncSettings && remote.settings) {
    const local = await getSettings();
    if ((remote.settings.updatedAt || 0) > (local.updatedAt || 0)) {
      const remoteSettings = { ...remote.settings };
      // بيانات الدخول تبقى محلية لكل جهاز ولا تُستبدل من جهاز آخر.
      for (const k of ["adminPinHash", "adminUsername", "adminPasswordHash", "recorderUsername", "recorderPasswordHash"]) {
        if (local[k] !== undefined) remoteSettings[k] = local[k];
      }
      const merged = deepMerge(structuredClone(local), { ...remoteSettings, cloud: local.cloud });
      await put("meta", { key: "settings", value: merged });
      cache.settings = merged;
      changed++;
    }
  }
  if (remote.resolvedCases && typeof remote.resolvedCases === "object") {
    const local = await getSettings();
    const resolved = { ...(local.resolvedCases || {}) };
    let touched = 0;
    for (const [key, row] of Object.entries(remote.resolvedCases)) {
      if (!row || typeof row !== "object") continue;
      const cur = resolved[key];
      if (!cur || String(row.at || "") > String(cur.at || "")) { resolved[key] = row; touched++; }
    }
    if (touched) {
      const next = { ...local, resolvedCases: resolved };
      await put("meta", { key: "settings", value: next });
      cache.settings = next;
      changed += touched;
    }
  }
  if (Array.isArray(remote.backups) && remote.backups.length) {
    const local = await getAutoBackups(true);
    const map = new Map(local.map(x => [x.id, x]));
    let touched = 0;
    for (const b of remote.backups) {
      if (!b || !b.id || !b.data) continue;
      if (!map.has(b.id)) { map.set(b.id, b); touched++; }
    }
    if (touched) {
      const rows = Array.from(map.values()).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 3);
      await put("meta", { key: "autoBackups", value: rows });
      changed += touched;
    }
  }
  cache.students = null; cache.sessionsByDate = new Map();
  broadcast("changed", { store: "all" });
  return changed;
}
