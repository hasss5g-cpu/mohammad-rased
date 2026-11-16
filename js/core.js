/* ============================================================
   راصد — أدوات أساسية: التواريخ الهجرية، التنسيق، الأيقونات
   ============================================================ */

export const TZ = "Asia/Riyadh";
export const APP_VERSION = "3.0.1";

export const STAGES = [
  { id: 1, name: "الصف الأول المتوسط", short: "أول متوسط", color: "#0f6b4f" },
  { id: 2, name: "الصف الثاني المتوسط", short: "ثاني متوسط", color: "#0f766e" },
  { id: 3, name: "الصف الثالث المتوسط", short: "ثالث متوسط", color: "#115e59" }
];

export const CLASS_NAMES = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

export const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
  "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"
];

export const AR_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/* ---------------- DOM ---------------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(9)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* ---------------- النصوص ---------------- */
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function normalizeArabic(s) {
  return String(s || "")
    .replace(/[\u0617-\u061A\u064B-\u0652\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
}
export function studentCount(n) {
  if (n === 1) return "طالب واحد";
  if (n === 2) return "طالبان";
  if (n >= 3 && n <= 10) return `${fmt(n)} طلاب`;
  return `${fmt(n)} طالباً`;
}
export function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
export function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
export function uid(prefix = "id") {
  const r = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36));
  return `${prefix}-${r.slice(0, 16)}`;
}
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- التاريخ (توقيت الرياض) ---------------- */
const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", numberingSystem: "latn" });
const weekdayFmt = new Intl.DateTimeFormat("ar-SA", { timeZone: TZ, weekday: "long" });

export function todayISO() { return isoFmt.format(new Date()); }
export function isoToDate(iso) { return new Date(`${iso}T12:00:00+03:00`); }
export function dateToISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function addDays(iso, n) {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from, to) {
  const out = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 1200) { out.push(cur); cur = addDays(cur, 1); }
  return out;
}
export function weekdayIndex(iso) { return isoToDate(iso).getUTCDay(); }
export function weekdayName(iso) { return AR_WEEKDAYS[weekdayIndex(iso)]; }
export function hijriParts(input) {
  const d = typeof input === "string" ? isoToDate(input) : input;
  const o = {};
  for (const p of hijriFmt.formatToParts(d)) o[p.type] = p.value;
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day) };
}
export function formatHijri(input) {
  const p = hijriParts(input);
  return `${p.y}/${p.m}/${p.d}`;
}
export function formatHijriLong(input, withWeekday = false) {
  const p = hijriParts(input);
  const iso = typeof input === "string" ? input : isoFmt.format(input);
  return `${withWeekday ? weekdayName(iso) + " " : ""}${p.d} ${HIJRI_MONTHS[p.m - 1]} ${p.y}هـ`;
}
export function formatGregorianLong(input) {
  const iso = typeof input === "string" ? input : isoFmt.format(input);
  const d = isoToDate(iso);
  return `${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}م`;
}
export function formatDatePair(iso, withWeekday = true) {
  return `${formatHijri(iso)}هـ — ${formatGregorianLong(iso)}`;
}
export function hijriToISO(hy, hm, hd) {
  // تقدير تقريبي ثم مسح دقيق باستخدام تقويم أم القرى في المتصفح
  const base = Date.UTC(622, 4, 23, 9);
  const approx = base + ((hy - 1) * 354.367 + (hm - 1) * 29.5306 + (hd - 1)) * 86400000;
  for (let off = -75; off <= 75; off++) {
    const d = new Date(approx + off * 86400000);
    const iso = isoFmt.format(d);
    const p = hijriParts(iso);
    if (p.y === hy && p.m === hm && p.d === hd) return iso;
  }
  return null;
}
export function parseHijriText(text) {
  const m = String(text || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).match(/(\d{4})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{1,2})/);
  if (!m) return null;
  const hy = +m[1], hm = +m[2], hd = +m[3];
  if (hm < 1 || hm > 12 || hd < 1 || hd > 30) return null;
  return { hy, hm, hd, iso: hijriToISO(hy, hm, hd) };
}
export function startOfMonth(iso) { const d = isoToDate(iso); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
export function endOfMonth(iso) {
  const d = isoToDate(iso); const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 9));
  return e.toISOString().slice(0, 10);
}
export function monthLabel(iso) { const d = isoToDate(iso); return `${AR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function hijriMonthRange(iso) {
  const p = hijriParts(iso);
  const start = hijriToISO(p.y, p.m, 1);
  const nextY = p.m === 12 ? p.y + 1 : p.y;
  const nextM = p.m === 12 ? 1 : p.m + 1;
  const nextStart = hijriToISO(nextY, nextM, 1);
  return { from: start, to: addDays(nextStart, -1) };
}
export function schoolWeek(iso) {
  // أسبوع الدراسة: الأحد إلى الخميس
  const idx = weekdayIndex(iso);
  const back = idx === 5 ? 5 : idx === 6 ? 6 : idx;
  const start = addDays(iso, -back);
  return { from: start, to: addDays(start, 4) };
}
export function lastNDays(n, end = todayISO()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}
export function relativeTime(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 7) return `قبل ${d} يوم`;
  return new Intl.DateTimeFormat("ar-SA", { timeZone: TZ, day: "numeric", month: "long" }).format(new Date(ts));
}
export function nowClock() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  let h = Number(parts.find(p => p.type === "hour")?.value || 0);
  const m = parts.find(p => p.type === "minute")?.value || "00";
  const ap = h < 12 ? "ص" : "م";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

/* ---------------- الهاتف وواتساب ---------------- */
export function normalizePhone(p) {
  let s = String(p || "").replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("0") && s.length === 10) s = "966" + s.slice(1);
  if (s.startsWith("5") && s.length === 9) s = "966" + s;
  return s;
}
export function displayPhone(p) {
  const s = normalizePhone(p);
  if (s.startsWith("966") && s.length === 12) return "0" + s.slice(3);
  return s;
}
export function waLink(phone, text = "") {
  const p = normalizePhone(phone);
  return `https://wa.me/${p}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/* ---------------- التوقيع البسيط لروابط الأعذار ---------------- */
export function signToken(payload, secret) {
  const s = `${secret}|${payload}`;
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x85ebca6b);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
export function verifyToken(payload, token, secret) {
  return signToken(payload, secret) === String(token || "");
}

/* ---------------- CSV وتنزيل الملفات ---------------- */
export function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCSV(headers, rows) {
  const all = [headers, ...rows];
  return "\ufeff" + all.map(r => r.map(csvCell).join(",")).join("\r\n");
}
export function download(filename, content, type = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
export function downloadJSON(filename, obj) {
  download(filename, JSON.stringify(obj, null, 2), "application/json;charset=utf-8");
}
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file, "utf-8");
  });
}
export function readFileDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^\ufeff/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(x => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== "")) rows.push(row);
  return rows;
}

/* ---------------- أيقونات SVG ---------------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V22a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H2a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1-1.55V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.55 1H22a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/>',
  whatsapp: '<path fill="currentColor" stroke="none" d="M12.04 2a9.9 9.9 0 0 0-8.4 15.16L2 22l4.96-1.6A9.94 9.94 0 1 0 12.04 2zm0 18.13a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.1 1 1.03-3.02-.2-.31a8.22 8.22 0 1 1 6.75 3.65zm4.5-6.15c-.25-.13-1.47-.72-1.7-.8-.23-.09-.4-.13-.57.12-.17.25-.65.8-.8.97-.15.17-.3.19-.55.06a6.7 6.7 0 0 1-1.97-1.22 7.4 7.4 0 0 1-1.36-1.7c-.14-.25-.02-.38.11-.5.11-.11.25-.3.38-.45.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.57-1.37-.78-1.88-.2-.5-.42-.43-.57-.44h-.49c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.3z"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  back: '<path d="M9 18l6-6-6-6"/>',
  forward: '<path d="M15 18l-6-6 6-6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M3 21v-5h5"/><path d="M21 3v5h-5"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6.5 6.5 0 0 0 5.2 11.2 4 4 0 0 0 6 19z"/>',
  cloudOff: '<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6.5 6.5 0 0 0 5.2 11.2 4 4 0 0 0 6 19z"/><path d="M3 3l18 18"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M8.5 16.1a6 6 0 0 1 7 0"/><path d="M2 8.8a16 16 0 0 1 20 0"/><circle cx="12" cy="20" r="1"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.1a6 6 0 0 1 7 0"/><path d="M5 12.55a11 11 0 0 1 4.2-2.5"/><path d="M2 8.8a16 16 0 0 1 4.2-2.4"/><path d="M15.5 10.2A11 11 0 0 1 22 8.8"/><circle cx="12" cy="20" r="1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="1"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  external: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  graduation: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 9v6"/>',
  school: '<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-6h6v6"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  message: '<path d="M21 12a8 8 0 0 1-8 8H4l2-4a8 8 0 1 1 15-4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 18v3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/>'
};
export function icon(name, size = 24, cls = "") {
  const path = ICONS[name] || ICONS.info;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/* ---------------- أدوات مساعدة ---------------- */
export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "؟") + (parts[1]?.[0] || "");
}
export function classLabel(n, stageId = null) {
  if (stageId) {
    const prefix = Number(stageId) === 1 ? "أول" : Number(stageId) === 2 ? "ثاني" : Number(stageId) === 3 ? "ثالث" : "";
    if (prefix) return `${prefix}/${n}`;
  }
  return `الفصل ${CLASS_NAMES[n] || n}`;
}
export function activeTermRange(settings) {
  const n = Number(settings?.activeTerm) === 2 ? 2 : 1;
  const from = n === 2 ? settings?.term2Start : settings?.term1Start;
  const to = n === 2 ? settings?.term2End : settings?.term1End;
  return {
    term: n,
    from: from || settings?.termStart || todayISO(),
    to: to || settings?.termEnd || todayISO(),
    label: n === 2 ? "الفترة الدراسية الثانية" : "الفترة الدراسية الأولى",
    short: n === 2 ? "الفترة الثانية" : "الفترة الأولى"
  };
}
export function fullYearRange(settings) {
  return {
    from: settings?.term1Start || settings?.termStart || todayISO(),
    to: settings?.term2End || settings?.termEnd || todayISO()
  };
}
export function stageName(id) { return STAGES.find(s => s.id === Number(id))?.name || "—"; }
export function stageShort(id) { return STAGES.find(s => s.id === Number(id))?.short || "—"; }
export function statusLabel(status, mode = "absence") {
  if (status === "absent") return "غائب";
  if (status === "late") return "متأخر";
  return "حاضر";
}
export function modeLabel(mode) { return mode === "late" ? "التأخر" : "الغياب"; }
export function modeNoun(mode) { return mode === "late" ? "متأخر" : "غائب"; }
export function statusColor(status) { return status === "absent" ? "danger" : status === "late" ? "warn" : "ok"; }
