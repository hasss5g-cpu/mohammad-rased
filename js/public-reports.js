/* ============================================================
   راصد — صفحات العرض العامة: ملخص الغياب وقائمة الغائبين
   تعمل محلياً على بيانات المتصفح، أو من لقطة ثابتة داخل الرابط.
   ============================================================ */
import {
  fmt, escapeHtml, todayISO, formatHijri, formatGregorianLong, weekdayName,
  icon, STAGES, classLabel, stageName
} from "./core.js";
import { getSettings, listStudents, getDayStats, getDayRecords, applyExcusedRoster } from "./db.js";

const PREFIX_GZIP = "g.";
const PREFIX_PLAIN = "j.";

function rateOf(absent, total) {
  if (!total) return 0;
  return Math.round((absent / total) * 1000) / 10;
}
function bytesToB64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64ToBytes(text) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function encodeData(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === "function") {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
      const buf = await new Response(stream).arrayBuffer();
      return PREFIX_GZIP + bytesToB64(new Uint8Array(buf));
    } catch (e) { }
  }
  return PREFIX_PLAIN + bytesToB64(bytes);
}
async function decodeData(text) {
  try {
    let bytes;
    if (text.startsWith(PREFIX_GZIP)) {
      const raw = b64ToBytes(text.slice(PREFIX_GZIP.length));
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      bytes = b64ToBytes(text.startsWith(PREFIX_PLAIN) ? text.slice(PREFIX_PLAIN.length) : text);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) { return null; }
}

function readQuery() {
  const raw = (location.hash.split("?")[1] || "").replace(/^#/, "");
  return new URLSearchParams(raw);
}

async function buildData(date) {
  const settings = await getSettings();
  const [students, stats, records] = await Promise.all([
    listStudents(), getDayStats(date), getDayRecords(date, "absence")
  ]);
  const smap = new Map(students.map(s => [s.id, s]));
  const totals = { 1: 0, 2: 0, 3: 0 };
  const absent = { 1: 0, 2: 0, 3: 0 };
  for (const s of students) if (totals[s.stageId] !== undefined) totals[s.stageId]++;
  const list = [];
  for (const r of records) {
    if (r.status !== "absent") continue;
    const s = smap.get(r.studentId);
    if (!s) continue;
    absent[s.stageId] = (absent[s.stageId] || 0) + 1;
    list.push([s.studentId || s.id, s.name, Number(s.classNo), Number(s.stageId), !!r.excused]);
  }
  list.sort((a, b) => a[3] - b[3] || a[2] - b[2] || a[1].localeCompare(b[1], "ar"));
  const total = students.length || stats.totalStudents;
  const absentTotal = list.length;
  return {
    v: 1, d: date,
    school: settings.school?.name || "المدرسة",
    y: settings.academicYear || "1448",
    t: total, a: absentTotal, r: rateOf(absentTotal, total),
    st: [1, 2, 3].map(id => [id, totals[id], absent[id] || 0, rateOf(absent[id] || 0, totals[id])]),
    l: list
  };
}

function model(d) {
  return {
    date: d.d, school: d.school, year: d.y,
    total: Number(d.t || 0), absent: Number(d.a || 0), rate: Number(d.r || 0),
    stages: (d.st || []).map(([id, total, absent, rate]) => ({
      id: Number(id), total: Number(total), absent: Number(absent), rate: Number(rate)
    })),
    list: (d.l || []).map(([id, name, classNo, stageId, excused]) => ({
      studentId: String(id), name: String(name), classNo: Number(classNo), stageId: Number(stageId), excused: !!excused
    }))
  };
}

async function loadModel() {
  const q = readQuery();
  if (q.get("s")) {
    const raw = await decodeData(q.get("s"));
    if (raw) return { data: model(raw), snapshot: true };
    return { data: null, snapshot: true, error: "تعذر قراءة بيانات الرابط. تأكد من نسخ الرابط كاملاً." };
  }
  const date = q.get("d") || todayISO();
  if (date === todayISO()) { try { await applyExcusedRoster(date); } catch (e) { } }
  return { data: model(await buildData(date)), snapshot: false };
}

export async function buildShareLink(kind, date = todayISO()) {
  return `${location.origin}${location.pathname}#/${kind}?d=${date}`;
}

function publicHead(data, subtitle, snapshot) {
  return `<header class="public-top">
    <div class="public-brand"><span class="public-mark">${icon("clipboard", 28)}</span><span><b>راصد</b><small>رصد الغياب</small></span></div>
    <div class="public-school"><b>${escapeHtml(data.school)}</b><span>العام الدراسي ${escapeHtml(data.year)}هـ</span></div>
    <span class="public-badge">${snapshot ? "لقطة محفوظة" : "عرض مباشر"}</span>
  </header>`;
}
function dateLine(data) {
  return `${weekdayName(data.date)} ${formatHijri(data.date)}هـ — ${formatGregorianLong(data.date)}`;
}
function printActions(kind, data, snapshot, extra = "") {
  const date = data.date;
  const qs = snapshot ? `?s=${readQuery().get("s")}` : `?d=${date}`;
  const other = kind === "summary" ? "absentees" : "summary";
  const label = kind === "summary" ? "قائمة الغائبين" : "ملخص الغياب";
  return `<div class="public-actions no-print">
    <a class="btn primary lg" href="#/${other}${qs}">${icon(other === "summary" ? "chart" : "users", 22)} ${label}</a>
    <button class="btn ghost lg" type="button" onclick="window.print()">${icon("print", 22)} طباعة</button>
    ${extra}
    ${snapshot ? `<span class="public-note">${icon("lock", 16)} لقطة ثابتة لا تتغير</span>` : `<span class="public-note">${icon("sync", 16)} يتحدث لحظياً من جميع الأجهزة</span>`}
  </div>`;
}

export async function renderSummary(root) {
  const res = await loadModel();
  document.title = "ملخص الغياب — راصد";
  if (!res.data) {
    root.innerHTML = `${publicHead({ school: "راصد", year: "1448" }, "", res.snapshot)}<main class="public-main"><div class="empty-state"><h2>تعذر عرض الملخص</h2><p>${escapeHtml(res.error || "")}</p><a class="btn primary" href="#/summary">فتح الملخص المحلي</a></div></main>`;
    return;
  }
  const d = res.data;
  const present = Math.max(0, d.total - d.absent);
  const maxRate = Math.max(1, ...d.stages.map(s => s.rate), d.rate);
  root.innerHTML = `
    <div class="public-page">
      ${publicHead(d, "", res.snapshot)}
      <main class="public-main">
        <div class="public-title">
          <div><span class="eyebrow">ملخص الغياب</span><h1>${escapeHtml(dateLine(d))}</h1></div>
          ${res.snapshot ? "" : `<label class="date-mini"><span>اليوم</span><input type="date" id="publicDate" value="${d.date}"></label>`}
        </div>

        <section class="summary-hero">
          <div class="rate-ring" style="--p:${d.rate}">
            <div><b>${d.rate}%</b><span>نسبة الغياب</span></div>
          </div>
          <div class="hero-numbers">
            <div class="hero-num danger"><b>${fmt(d.absent)}</b><span>غائب</span></div>
            <div class="hero-num"><b>${fmt(d.total)}</b><span>إجمالي الطلاب</span></div>
            <div class="hero-num green"><b>${fmt(present)}</b><span>حاضر</span></div>
          </div>
        </section>

        <section class="public-card">
          <div class="public-card-head"><h2>${icon("chart", 24)} الغياب لكل مرحلة</h2><span>${fmt(d.absent)} غائب من ${fmt(d.total)}</span></div>
          <div class="stage-grid">
            ${d.stages.map(s => `<div class="stage-card">
              <div class="stage-card-top"><b>${escapeHtml(stageName(s.id))}</b><span class="rate-pill">${s.rate}%</span></div>
              <div class="stage-count"><b>${fmt(s.absent)}</b><span>غائب من ${fmt(s.total)}</span></div>
              <div class="bar-track"><span style="width:${Math.min(100, s.rate)}%"></span></div>
              <div class="stage-foot">نسبة الغياب ${s.rate}%</div>
            </div>`).join("")}
          </div>
          <div class="chart-bars" aria-label="مخطط نسبة الغياب لكل مرحلة">
            ${d.stages.map(s => `<div class="chart-col">
              <div class="chart-value">${s.rate}%</div>
              <div class="chart-track"><div class="chart-bar" style="height:${Math.max(4, Math.round((s.rate / maxRate) * 100))}%"></div></div>
              <div class="chart-label">${escapeHtml(STAGES.find(x => x.id === s.id)?.short || "")}</div>
            </div>`).join("")}
          </div>
        </section>

        <section class="public-total-strip">
          <div><span>إجمالي الغياب</span><b>${fmt(d.absent)}</b></div>
          <div><span>النسبة الإجمالية</span><b>${d.rate}%</b></div>
          <div><span>آخر تحديث</span><b>${new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</b></div>
        </section>

        ${printActions("summary", d, res.snapshot)}
        <p class="public-privacy">${icon("lock", 16)} هذا العرض للقراءة فقط. بيانات الطلاب لا تُرسل إلى أي جهة خارجية.</p>
      </main>
    </div>`;

  if (!res.snapshot) {
    document.getElementById("publicDate")?.addEventListener("change", e => {
      location.hash = `#/summary?d=${e.target.value || todayISO()}`;
    });
  }
}

export async function renderAbsentees(root) {
  const res = await loadModel();
  document.title = "قائمة الغائبين — راصد";
  if (!res.data) {
    root.innerHTML = `${publicHead({ school: "راصد", year: "1448" }, "", res.snapshot)}<main class="public-main"><div class="empty-state"><h2>تعذر عرض قائمة الغائبين</h2><p>${escapeHtml(res.error || "")}</p><a class="btn primary" href="#/absentees">فتح القائمة المحلية</a></div></main>`;
    return;
  }
  const d = res.data;
  const groups = new Map();
  for (const it of d.list) {
    const key = `${it.stageId}-${it.classNo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => {
    const [as, ac] = a[0].split("-").map(Number);
    const [bs, bc] = b[0].split("-").map(Number);
    return as - bs || ac - bc;
  });

  root.innerHTML = `
    <div class="public-page public-page-list">
      ${publicHead(d, "", res.snapshot)}
      <main class="public-main">
        <div class="public-title">
          <div><span class="eyebrow">قائمة الغائبين</span><h1>${escapeHtml(dateLine(d))}</h1></div>
          ${res.snapshot ? "" : `<label class="date-mini"><span>اليوم</span><input type="date" id="publicDate" value="${d.date}"></label>`}
        </div>

        <section class="list-hero">
          <div class="list-total"><b>${fmt(d.absent)}</b><span>طالباً غائباً</span></div>
          <div class="list-rate"><b>${d.rate}%</b><span>نسبة الغياب من ${fmt(d.total)}</span></div>
          <div class="list-chips"><span class="chip red">${fmt(d.absent)} غائب</span><span class="chip gold">${fmt(d.list.filter(x => x.excused).length)} بعذر</span><span class="chip">${fmt(d.list.filter(x => !x.excused).length)} بدون عذر</span></div>
        </section>

        ${d.list.length ? `<div class="absent-list">
          ${sorted.map(([key, rows]) => {
            const [st, cl] = key.split("-").map(Number);
            return `<div class="absent-group">
              <h2 class="absent-group-title"><span>${escapeHtml(stageName(st))}</span><b>${escapeHtml(classLabel(cl, st))}</b><small>${fmt(rows.length)} غائب</small></h2>
              ${rows.map((it, i) => `<div class="absent-row">
                <span class="absent-index">${fmt(i + 1)}</span>
                <div class="absent-name"><b>${escapeHtml(it.name)}</b><span>رقم الطالب: ${escapeHtml(it.studentId)} · ${escapeHtml(classLabel(it.classNo, it.stageId))}</span></div>
                <span class="absent-type ${it.excused ? "excused" : "unexcused"}">${it.excused ? "بعذر" : "بدون عذر"}</span>
              </div>`).join("")}
            </div>`;
          }).join("")}
        </div>` : `<div class="empty-state public-empty"><h2>لا يوجد طلاب غائبون</h2><p>جميع الطلاب حاضرون في هذا اليوم حتى الآن.</p></div>`}

        ${printActions("absentees", d, res.snapshot)}
        <p class="public-privacy">${icon("lock", 16)} قائمة للقراءة فقط — مناسبة للمدخل أو المراجع. الخطوط كبيرة والصفوف مرتبة طولياً.</p>
      </main>
    </div>`;

  if (!res.snapshot) {
    document.getElementById("publicDate")?.addEventListener("change", e => {
      location.hash = `#/absentees?d=${e.target.value || todayISO()}`;
    });
  }
}
