/* ============================================================
   راصد — استيراد سجل الغياب السابق من تقارير نور
   ============================================================ */
import {
  $, $$, icon, fmt, escapeHtml, todayISO, formatHijri, normalizeArabic, hijriToISO,
  STAGES, classLabel, stageName
} from "./core.js";
import { getSettings, listStudents, bulkImportAttendance } from "./db.js";
import { sectionCard, emptyState, toast, confirmDialog } from "./ui.js";

let xlsxPromise = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "./vendor/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error("تعذر تحميل قارئ Excel. تأكد من اتصال الموقع أو أعد تحميل الصفحة."));
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

const state = { files: [], analysis: null, busy: false };

const norm = (s) => normalizeArabic(String(s || ""))
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();
const normClass = (v) => Number(String(v || "").replace(/\D/g, "")) || 0;
function stageIdFromName(value) {
  const s = norm(value);
  if (/الاول|اول/.test(s)) return 1;
  if (/الثاني|ثاني/.test(s)) return 2;
  if (/الثالث|ثالث/.test(s)) return 3;
  return 0;
}
function parseHijriDMY(value) {
  const m = String(value || "").trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (d < 1 || d > 30 || mo < 1 || mo > 12) return null;
  return { y, m: mo, d };
}
function excelFileLabel(file) { return `${file.name} (${(file.size / 1024).toFixed(0)} ك.ب)`; }

function parseWorkbook(XLSX, buffer, filename) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const out = { records: [], sheets: 0, skippedSheets: 0, issues: [] };
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const get = (addr) => (ws[addr] && ws[addr].v != null ? ws[addr].v : "");
    const stName = String(get("B4") || "").trim();
    const classRaw = String(get("B9") || "").trim();
    const name = String(get("L20") || "").trim();
    if (!name) { out.skippedSheets++; continue; }
    const stageId = stageIdFromName(stName);
    const classNo = normClass(classRaw);
    if (!stageId || !classNo) {
      out.issues.push({ file: filename, sheet: sheetName, name, reason: "تعذر قراءة المرحلة/الفصل" });
      out.skippedSheets++;
      continue;
    }
    out.sheets++;
    let maxRow = 100;
    try {
      if (ws["!ref"]) maxRow = XLSX.utils.decode_range(ws["!ref"]).e.r + 1;
    } catch (e) { }
    let found = 0;
    for (let r = 25; r <= Math.min(maxRow, 120); r++) {
      const typeText = String(get(`L${r}`) || "").trim();
      const dateText = String(get(`P${r}`) || "").trim();
      if (!dateText) {
        if (/نسبة/.test(typeText)) break;
        continue;
      }
      const date = parseHijriDMY(dateText);
      if (!date) {
        out.issues.push({ file: filename, sheet: sheetName, name, reason: `تاريخ غير مقروء: ${dateText}` });
        continue;
      }
      if (!typeText) {
        out.issues.push({ file: filename, sheet: sheetName, name, reason: `نوع غياب مفقود للتاريخ ${dateText}` });
        continue;
      }
      const excused = /بعذر/.test(typeText) && !/بدون/.test(typeText);
      out.records.push({
        file: filename, sheet: sheetName, name, stageId, classNo,
        dateHijri: `${String(date.d).padStart(2, "0")}/${String(date.m).padStart(2, "0")}/${date.y}`,
        hijri: date, excused, typeText
      });
      found++;
    }
    if (!found) out.issues.push({ file: filename, sheet: sheetName, name, reason: "لا توجد تواريخ غياب في الصفحة" });
  }
  return out;
}

function buildMatch(records, students) {
  const byExact = new Map();
  const byName = new Map();
  for (const s of students) {
    const key = `${norm(s.name)}|${s.stageId}|${s.classNo}`;
    if (!byExact.has(key)) byExact.set(key, []);
    byExact.get(key).push(s);
    const nk = norm(s.name);
    if (!byName.has(nk)) byName.set(nk, []);
    byName.get(nk).push(s);
  }
  const groups = new Map();
  for (const rec of records) {
    const key = `${norm(rec.name)}|${rec.stageId}|${rec.classNo}`;
    if (!groups.has(key)) groups.set(key, { name: rec.name, stageId: rec.stageId, classNo: rec.classNo, records: [] });
    groups.get(key).records.push(rec);
  }
  const matched = [], unmatched = [];
  for (const g of groups.values()) {
    const key = `${norm(g.name)}|${g.stageId}|${g.classNo}`;
    let s = (byExact.get(key) || [])[0];
    let how = "exact";
    if (!s) {
      const cands = byName.get(norm(g.name)) || [];
      if (cands.length === 1) { s = cands[0]; how = "name"; }
    }
    if (s) matched.push({ ...g, student: s, how });
    else unmatched.push({ ...g, reason: "لا يوجد طالب مطابق بالاسم والصف" });
  }
  return { matched, unmatched };
}

function dedupe(records) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.name}|${r.stageId}|${r.classNo}|${r.dateHijri}`;
    if (!map.has(key)) map.set(key, r);
  }
  return Array.from(map.values());
}

export async function renderImportAbsence(root, settings) {
  const students = await listStudents();
  root.innerHTML = `
    <div class="admin-head">
      <div><h1>استيراد الغياب السابق من نور</h1><p>ارفع تقارير «الغياب على مستوى الطالب» من نور، وسيطابق راصد الاسم والصف ويسجل أيام الغياب بالتواريخ.</p></div>
      <div class="admin-head-actions"><a class="btn ghost" href="#/admin/records">${icon("clipboard", 20)} سجل الغياب</a></div>
    </div>
    <div class="callout info" style="margin-bottom:16px">
      يقبل النظام ملفات <b>.xlsx</b> و<b>.xls</b> الصادرة من نور بصيغة «تقرير الغياب على مستوى الطالب» (كل طالب في ورقة). تتم مطابقة <b>اسم الطالب + المرحلة + الفصل</b>، ثم تحويل التاريخ الهجري إلى ميلادي وتسجيل الغياب. لا تُنشأ جلسات رصد جديدة.
    </div>

    <section class="section-card">
      <div class="section-head"><div class="section-title">${icon("upload", 24)}<div><h2>ملفات نور</h2><p>يمكنك اختيار الملفات الثلاثة معاً (الأول والثاني والثالث المتوسط).</p></div></div></div>
      <div class="section-body">
        <label class="import-drop" id="importDrop">
          ${icon("file", 34)}
          <b>اسحب ملفات Excel هنا أو اضغط للاختيار</b>
          <span>AbsenceOnStudentLevel.xlsx — تقرير الغياب على مستوى الطالب</span>
          <input type="file" id="importFiles" accept=".xlsx,.xls" multiple>
        </label>
        <div id="importFilesList" class="import-files"></div>
        <div class="import-options">
          <label class="check-line"><input type="checkbox" id="importOverwrite"> <span>تحديث السجلات الموجودة مسبقاً (استبدال نوع الغياب)</span></label>
          <span class="legal">بدون تحديد: تُضاف السجلات الجديدة فقط، وتُتجاهل الأيام المسجلة سابقاً.</span>
        </div>
        <div class="btn-row">
          <button class="btn primary" id="importAnalyze" disabled>${icon("search", 20)} تحليل الملفات ومطابقة الطلاب</button>
          <button class="btn ghost" id="importClear" disabled>مسح</button>
        </div>
        <div id="importStatus"></div>
      </div>
    </section>

    <div id="importResult" class="section-gap"></div>`;

  const fileInput = $("#importFiles");
  const listEl = $("#importFilesList");
  const analyzeBtn = $("#importAnalyze");
  const clearBtn = $("#importClear");
  const statusEl = $("#importStatus");
  const resultEl = $("#importResult");

  const setFiles = (files) => {
    state.files = Array.from(files || []).filter(f => /\.(xlsx|xls)$/i.test(f.name));
    state.analysis = null;
    listEl.innerHTML = state.files.length
      ? state.files.map(f => `<span class="import-chip">${icon("file", 16)} ${escapeHtml(excelFileLabel(f))}</span>`).join("")
      : "";
    analyzeBtn.disabled = !state.files.length;
    clearBtn.disabled = !state.files.length;
    resultEl.innerHTML = "";
    statusEl.innerHTML = "";
  };

  $("#importDrop").addEventListener("dragover", e => { e.preventDefault(); e.currentTarget.classList.add("drag"); });
  $("#importDrop").addEventListener("dragleave", e => e.currentTarget.classList.remove("drag"));
  fileInput.addEventListener("change", () => setFiles(fileInput.files));
  $("#importDrop").addEventListener("drop", e => {
    e.preventDefault(); e.currentTarget.classList.remove("drag");
    setFiles(e.dataTransfer.files);
  });
  clearBtn.addEventListener("click", () => { fileInput.value = ""; setFiles([]); });

  analyzeBtn.addEventListener("click", async () => {
    if (!state.files.length || state.busy) return;
    state.busy = true; analyzeBtn.disabled = true; clearBtn.disabled = true;
    statusEl.innerHTML = `<div class="import-progress"><span class="spinner"></span> جارٍ قراءة الملفات ومطابقة الطلاب…</div>`;
    try {
      const XLSX = await loadXLSX();
      let all = [];
      const issues = [];
      for (const file of state.files) {
        const buffer = await file.arrayBuffer();
        const parsed = parseWorkbook(XLSX, buffer, file.name);
        all = all.concat(parsed.records);
        issues.push(...parsed.issues);
      }
      const before = all.length;
      all = dedupe(all);
      const matching = buildMatch(all, students);
      const matchedRecords = matching.matched.reduce((n, m) => n + m.records.length, 0);
      const unmatchedRecords = matching.unmatched.reduce((n, m) => n + m.records.length, 0);
      const dates = Array.from(new Set(all.map(r => r.dateHijri))).sort((a, b) => {
        const pa = a.split("/").map(Number), pb = b.split("/").map(Number);
        return pa[2] - pb[2] || pa[1] - pb[1] || pa[0] - pb[0];
      });
      state.analysis = { records: all, matching, issues, dates, before, matchedRecords, unmatchedRecords };
      renderResult(root, settings, students);
      statusEl.innerHTML = "";
    } catch (e) {
      console.error(e);
      statusEl.innerHTML = `<div class="callout warn">${escapeHtml(e.message || String(e))}</div>`;
    } finally {
      state.busy = false; analyzeBtn.disabled = false; clearBtn.disabled = false;
    }
  });
}

function renderResult(root, settings, students) {
  const a = state.analysis;
  if (!a) return;
  const matchedStudents = a.matching.matched.length;
  const unmatchedStudents = a.matching.unmatched.length;
  const result = $("#importResult");
  const dateMin = a.dates[0], dateMax = a.dates[a.dates.length - 1];
  const hijriRange = dateMin ? `من ${formatHijri(parseHijriISO(dateMin))}هـ إلى ${formatHijri(parseHijriISO(dateMax))}هـ` : "—";
  result.innerHTML = `
    <section class="section-card">
      <div class="section-head"><div class="section-title">${icon("check", 24)}<div><h2>نتيجة التحليل</h2><p>راجع الأرقام قبل الاستيراد.</p></div></div></div>
      <div class="section-body">
        <div class="import-summary">
          <div><b>${fmt(a.before)}</b><span>سجل غياب في الملفات</span></div>
          <div><b>${fmt(a.records.length)}</b><span>سجل بعد إزالة التكرار</span></div>
          <div><b>${fmt(matchedStudents)}</b><span>طالباً مطابقاً</span></div>
          <div class="${unmatchedStudents ? "warn" : ""}"><b>${fmt(unmatchedStudents)}</b><span>طالباً غير مطابق</span></div>
        </div>
        <div class="import-summary" style="margin-top:10px">
          <div><b>${fmt(a.matchedRecords)}</b><span>يوم غياب سيُستورد</span></div>
          <div><b>${fmt(a.unmatchedRecords)}</b><span>يوم غياب غير مربوط</span></div>
          <div class="span-2"><b>${escapeHtml(hijriRange)}</b><span>نطاق التواريخ</span></div>
        </div>
        ${a.issues.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:800">ملاحظات الملفات (${fmt(a.issues.length)})</summary><ul class="list" style="margin-top:8px">${a.issues.slice(0, 30).map(x => `<li>${escapeHtml(x.file)} / ${escapeHtml(x.sheet)} — ${escapeHtml(x.name || "")}: ${escapeHtml(x.reason)}</li>`).join("")}${a.issues.length > 30 ? `<li>…</li>` : ""}</ul></details>` : ""}

        ${a.matching.unmatched.length ? `<h3 style="margin:18px 0 8px">طلاب غير مطابقين</h3>
          <div class="table-wrap" style="border:1px solid var(--line)"><table class="data-table"><thead><tr><th>الاسم في نور</th><th>الصف/الفصل</th><th>عدد الأيام</th><th>السبب</th></tr></thead><tbody>
          ${a.matching.unmatched.map(u => `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(stageName(u.stageId))} · ${escapeHtml(classLabel(u.classNo, u.stageId))}</td><td>${fmt(u.records.length)}</td><td>${escapeHtml(u.reason)}</td></tr>`).join("")}
          </tbody></table></div>` : `<div class="callout ok" style="margin-top:14px">تمت مطابقة جميع الطلاب بالاسم والمرحلة والفصل.</div>`}

        <details style="margin-top:16px">
          <summary style="cursor:pointer;font-weight:800">عرض الطلاب المطابقين (${fmt(matchedStudents)})</summary>
          <div class="table-wrap" style="border:1px solid var(--line);margin-top:8px;max-height:360px;overflow:auto"><table class="data-table"><thead><tr><th>الطالب في راصد</th><th>الصف/الفصل</th><th>أيام الغياب</th><th>بعذر</th><th>بدون عذر</th><th>المطابقة</th></tr></thead><tbody>
          ${a.matching.matched.map(m => {
            const ex = m.records.filter(x => x.excused).length;
            return `<tr><td>${escapeHtml(m.student.name)}</td><td>${escapeHtml(classLabel(m.student.classNo, m.student.stageId))}</td><td>${fmt(m.records.length)}</td><td>${fmt(ex)}</td><td>${fmt(m.records.length - ex)}</td><td><span class="badge ${m.how === "exact" ? "green" : "gold"}">${m.how === "exact" ? "دقيق" : "بالاسم"}</span></td></tr>`;
          }).join("")}
          </tbody></table></div>
        </details>

        <div class="btn-row" style="margin-top:16px">
          <button class="btn primary lg" id="importRun" ${a.matchedRecords ? "" : "disabled"}>${icon("download", 22)} استيراد ${fmt(a.matchedRecords)} سجل غياب</button>
          <span class="legal">لن تُنشأ جلسات رصد؛ سيُسجّل الغياب في سجل الأيام فقط.</span>
        </div>
      </div>
    </section>`;

  $("#importRun")?.addEventListener("click", () => runImport(root, settings, students));
}

function parseHijriISO(dmy) {
  const [d, m, y] = String(dmy).split("/").map(Number);
  return hijriToISO(y, m, d);
}

async function runImport(root, settings, students) {  const a = state.analysis;
  if (!a || state.busy) return;
  const overwrite = !!$("#importOverwrite")?.checked;
  const ok = await confirmDialog({
    title: "تأكيد استيراد الغياب",
    message: `سيتم استيراد ${fmt(a.matchedRecords)} يوم غياب لـ ${fmt(a.matching.matched.length)} طالباً.\n${overwrite ? "سيتم تحديث السجلات الموجودة." : "لن تُعدّل السجلات الموجودة."}\nهل تريد المتابعة؟`,
    confirmText: "استيراد",
    iconName: "download"
  });
  if (!ok) return;
  state.busy = true;
  const btn = $("#importRun"); const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> جارٍ الاستيراد…`; }
  try {
    const records = [];
    let invalid = 0;
    for (const m of a.matching.matched) {
      for (const r of m.records) {
        const iso = parseHijriISO(r.dateHijri);
        if (!iso) { invalid++; continue; }
        records.push({
          date: iso, studentId: m.student.id, stageId: m.student.stageId,
          classNo: m.student.classNo, excused: r.excused
        });
      }
    }
    const res = await bulkImportAttendance(records, { overwrite });
    toast(`تم استيراد ${fmt(res.imported)} سجل، وتجاهل ${fmt(res.skipped)} موجود${invalid ? `، وتعذر ${fmt(invalid)} تاريخ` : ""}.`, { type: "ok", duration: 6000 });
    const done = $("#importResult");
    if (done) done.insertAdjacentHTML("afterbegin", `<div class="callout ok" style="margin-bottom:12px"><b>اكتمل الاستيراد:</b> ${fmt(res.imported)} سجل جديد/محدث، ${fmt(res.skipped)} سجل موجود تم تجاهله. يمكنك مراجعة <a href="#/admin/records">سجل الغياب</a> أو <a href="#/admin/reports">التقارير</a>.</div>`);
  } catch (e) {
    console.error(e);
    toast("تعذر الاستيراد: " + (e.message || e), { type: "error", duration: 7000 });
  } finally {
    state.busy = false;
    if (btn) { btn.disabled = false; btn.innerHTML = old; }
  }
}

export { parseWorkbook, buildMatch, dedupe, loadXLSX };

