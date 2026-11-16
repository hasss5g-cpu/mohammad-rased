/* ============================================================
   راصد — التقارير والإحصاءات
   ============================================================ */
import {
  $, $$, icon, fmt, pct, escapeHtml, todayISO, addDays, formatHijri, formatHijriLong, formatGregorianLong,
  weekdayName, schoolWeek, startOfMonth, endOfMonth, parseHijriText, stageName, classLabel, STAGES, toCSV, download,
  hijriMonthRange, activeTermRange, fullYearRange
} from "./core.js";
import { getSettings, listStudents, getRangeRecords, totalsByStudent, studentStats, getStudent } from "./db.js";
import { sectionCard, emptyState, toast, field, chips, modal, copyText } from "./ui.js";
import { printRangeReport, printStudentReport } from "./print.js";
import { buildShareLink } from "./public-reports.js";

const state = {
  type: "detailed", mode: "absence", excused: "all", stage: "", classNo: "", studentId: "",
  period: "term", from: "", to: "", rows: [], summary: null, generatedAt: 0
};

export async function renderReports(root) {
  const settings = await getSettings();
  const students = await listStudents();
  const term = activeTermRange(settings);
  if (!state.from) state.from = term.from;
  if (!state.to) state.to = todayISO();
  if (term.from > todayISO()) { state.from = term.from; state.to = term.from; }

  root.innerHTML = `
    <div class="admin-head">
      <div><h1>التقارير والإحصاءات</h1><p>تقارير يومية وشهرية وسنوية، وباسم الطالب، قابلة للطباعة والتصدير. ${activeTermRange(settings).label}</p></div>
      <div class="admin-head-actions">
        <button class="btn ghost" id="quickDaily">${icon("calendar", 20)} تقرير اليوم</button>
        <button class="btn ghost" id="quickMonth">${icon("calendar", 20)} تقرير الشهر</button>
        <button class="btn ghost" id="quickYear">${icon("file", 20)} تقرير العام</button>
      </div>
    </div>
    ${term.from > todayISO() ? `<div class="callout warn" style="margin-bottom:14px">لم تبدأ <b>${term.label}</b> بعد (تبدأ ${formatHijri(term.from)}هـ). يمكنك اختيار فترة مخصصة من الفترة الأولى، أو تعديل تواريخ الفترة من الإعدادات.</div>` : ""}

    <section class="section-card no-print" style="margin-bottom:14px">
      <div class="section-head"><div class="section-title">${icon("external", 22)}<div><h2>روابط عرض الغياب</h2><p>رابطان جاهزان للمدخل: ملخص بالمخطط والنسب، وقائمة طولية بأسماء الغائبين.</p></div></div></div>
      <div class="section-body">
        <div class="btn-row" style="align-items:flex-end">
          <label class="field" style="min-width:180px"><span class="field-label">يوم الملخص</span><input class="input" type="date" id="shareDate" value="${todayISO()}"></label>
          <button class="btn primary" id="makeSummaryLink">${icon("chart", 20)} رابط ملخص الغياب</button>
          <button class="btn soft" id="makeAbsenteesLink">${icon("users", 20)} رابط قائمة الغائبين</button>
          <a class="btn ghost" href="#/summary" target="_blank">${icon("external", 18)} فتح الملخص المحلي</a>
          <a class="btn ghost" href="#/absentees" target="_blank">${icon("external", 18)} فتح القائمة المحلية</a>
        </div>
        <p class="legal" style="margin:8px 0 0">الرابط المنسوخ يحتوي لقطة ثابتة لليوم المحدد ويعمل على أي جهاز. الرابط المحلي يقرأ بيانات هذا المتصفح فقط.</p>
      </div>
    </section>

    <div class="report-controls">
      <div class="report-grid">
        <label class="field"><span class="field-label">نوع التقرير</span>
          <select class="input" id="rType">
            <option value="detailed" ${state.type === "detailed" ? "selected" : ""}>تقرير تفصيلي (سجل الحالات)</option>
            <option value="byStudent" ${state.type === "byStudent" ? "selected" : ""}>إحصائي حسب الطالب</option>
            <option value="byClass" ${state.type === "byClass" ? "selected" : ""}>إحصائي حسب الفصل</option>
          </select>
        </label>
        <label class="field"><span class="field-label">نوع الرصد</span>
          <select class="input" id="rMode">
            <option value="absence" ${state.mode === "absence" ? "selected" : ""}>الغياب</option>
            <option value="late" ${state.mode === "late" ? "selected" : ""}>التأخر</option>
            <option value="all" ${state.mode === "all" ? "selected" : ""}>الغياب والتأخر</option>
          </select>
        </label>
        <label class="field"><span class="field-label">حالة العذر</span>
          <select class="input" id="rExcused">
            <option value="all" ${state.excused === "all" ? "selected" : ""}>الكل</option>
            <option value="no" ${state.excused === "no" ? "selected" : ""}>بدون عذر</option>
            <option value="yes" ${state.excused === "yes" ? "selected" : ""}>بعذر</option>
          </select>
        </label>
        <label class="field"><span class="field-label">الفترة</span>
          <select class="input" id="rPeriod">
            <option value="today" ${state.period === "today" ? "selected" : ""}>اليوم</option>
            <option value="week" ${state.period === "week" ? "selected" : ""}>هذا الأسبوع</option>
            <option value="month" ${state.period === "month" ? "selected" : ""}>هذا الشهر الهجري</option>
            <option value="term" ${state.period === "term" ? "selected" : ""}>الفترة الدراسية الحالية</option>
            <option value="year" ${state.period === "year" ? "selected" : ""}>كامل العام الدراسي</option>
            <option value="custom" ${state.period === "custom" ? "selected" : ""}>فترة مخصصة</option>
          </select>
        </label>
        <label class="field"><span class="field-label">المرحلة</span>
          <select class="input" id="rStage">
            <option value="">كل المراحل</option>
            ${STAGES.map(s => `<option value="${s.id}" ${String(state.stage) === String(s.id) ? "selected" : ""}>${s.name}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span class="field-label">الفصل</span>
          <select class="input" id="rClass"><option value="">كل الفصول</option></select>
        </label>
        <label class="field"><span class="field-label">الطالب</span>
          <select class="input" id="rStudent"><option value="">كل الطلاب</option></select>
        </label>
        <label class="field"><span class="field-label">من تاريخ (هجري)</span><input class="input" id="rFrom" value="${formatHijri(state.from)}" placeholder="1448/6/1"></label>
        <label class="field"><span class="field-label">إلى تاريخ (هجري)</span><input class="input" id="rTo" value="${formatHijri(state.to)}" placeholder="1448/6/5"></label>
      </div>
      <div class="report-actions">
        <button class="btn primary" id="runReport">${icon("chart", 20)} عرض التقرير</button>
        <button class="btn ghost" id="printReport">${icon("print", 20)} طباعة</button>
        <button class="btn ghost" id="exportReport">${icon("download", 20)} تصدير CSV</button>
        ${state.studentId ? `<button class="btn soft" id="studentReportBtn">${icon("user", 20)} تقرير الطالب</button>` : ""}
        <span class="legal" style="margin-inline-start:auto">${icon("info", 16)} التواريخ الهجرية تُحوَّل تلقائياً وفق تقويم أم القرى.</span>
      </div>
    </div>

    <div id="reportResult" class="report-result"></div>`;

  const classSel = $("#rClass"), studentSel = $("#rStudent"), stageSel = $("#rStage");
  function fillClasses() {
    const st = Number(stageSel.value) || null;
    const list = st ? Array.from(new Set(students.filter(s => s.stageId === st).map(s => s.classNo))).sort((a, b) => a - b) : Array.from(new Set(students.map(s => s.classNo))).sort((a, b) => a - b);
    classSel.innerHTML = `<option value="">كل الفصول</option>` + list.map(c => `<option value="${c}" ${String(state.classNo) === String(c) ? "selected" : ""}>${classLabel(c, st)}</option>`).join("");
  }
  function fillStudents() {
    const st = Number(stageSel.value) || null;
    const cls = Number(classSel.value) || null;
    let list = students;
    if (st) list = list.filter(s => s.stageId === st);
    if (cls) list = list.filter(s => s.classNo === cls);
    studentSel.innerHTML = `<option value="">كل الطلاب</option>` + list.map(s => `<option value="${s.id}" ${state.studentId === s.id ? "selected" : ""}>${escapeHtml(s.name)} — ${classLabel(s.classNo, s.stageId)}</option>`).join("");
  }
  fillClasses(); fillStudents();

  stageSel.addEventListener("change", () => { state.stage = stageSel.value; state.classNo = ""; fillClasses(); fillStudents(); });
  classSel.addEventListener("change", () => { state.classNo = classSel.value; state.studentId = ""; fillStudents(); });
  studentSel.addEventListener("change", () => { state.studentId = studentSel.value; });

  $("#rPeriod").addEventListener("change", e => {
    state.period = e.target.value;
    const { from, to } = resolvePeriod(state.period, settings);
    state.from = from; state.to = to;
    $("#rFrom").value = formatHijri(from); $("#rTo").value = formatHijri(to);
  });
  $("#runReport").addEventListener("click", () => generate(root, settings, students));
  $("#printReport").addEventListener("click", () => doPrint(settings, students));
  $("#exportReport").addEventListener("click", () => doExport());
  $("#studentReportBtn")?.addEventListener("click", () => doStudentPrint(settings));
  $("#quickDaily").addEventListener("click", () => { state.period = "today"; $("#rPeriod").value = "today"; const r = resolvePeriod("today", settings); state.from = r.from; state.to = r.to; $("#rFrom").value = formatHijri(r.from); $("#rTo").value = formatHijri(r.to); generate(root, settings, students); });
  $("#quickMonth").addEventListener("click", () => { state.period = "month"; $("#rPeriod").value = "month"; const r = resolvePeriod("month", settings); state.from = r.from; state.to = r.to; $("#rFrom").value = formatHijri(r.from); $("#rTo").value = formatHijri(r.to); generate(root, settings, students); });
  $("#quickYear").addEventListener("click", () => { state.period = "year"; $("#rPeriod").value = "year"; const r = resolvePeriod("year", settings); state.from = r.from; state.to = r.to; $("#rFrom").value = formatHijri(r.from); $("#rTo").value = formatHijri(r.to); generate(root, settings, students); });

  async function shareLink(kind) {
    const date = $("#shareDate").value || todayISO();
    const btn = kind === "summary" ? $("#makeSummaryLink") : $("#makeAbsenteesLink");
    const old = btn.innerHTML;
    btn.disabled = true; btn.textContent = "جارٍ إنشاء الرابط…";
    try {
      const url = await buildShareLink(kind, date);
      try { await copyText(url); } catch (e) { }
      const title = kind === "summary" ? "رابط ملخص الغياب" : "رابط قائمة الغائبين";
      const m = modal({
        title, iconName: kind === "summary" ? "chart" : "users", size: "sm",
        body: `<p style="margin:0 0 8px">تم إنشاء الرابط ونسخه. أرسله للمدخل أو افتحه على أي جهاز:</p>
          <textarea class="input" readonly rows="5" style="direction:ltr;text-align:left;font-size:.7rem;width:100%;resize:vertical">${escapeHtml(url)}</textarea>
          <p class="legal" style="margin:8px 0 0">رابط مباشر لبيانات ${formatHijri(date)}هـ. يتحدث تلقائياً عند وصول أي إدخال من أي جهاز، ولا يعرض بيانات الإدارة أو إمكانية تعديل.</p>`,
        actions: [
          { label: "فتح الرابط", kind: "primary", icon: "external", onClick: () => window.open(url, "_blank", "noopener") },
          { label: "إغلاق", kind: "ghost" }
        ]
      });
      m.dialog.querySelector("textarea")?.addEventListener("focus", e => e.target.select());
    } catch (e) {
      toast("تعذر إنشاء الرابط: " + (e.message || e), { type: "error" });
    } finally {
      btn.disabled = false; btn.innerHTML = old;
    }
  }
  $("#makeSummaryLink").addEventListener("click", () => shareLink("summary"));
  $("#makeAbsenteesLink").addEventListener("click", () => shareLink("absentees"));

  if (state.rows.length) renderResult(root, settings, students);
  else $("#reportResult").innerHTML = emptyState({ iconName: "chart", title: "اختر الفترة ثم اعرض التقرير", text: "يمكنك البدء بتقرير اليوم أو الشهر، أو تحديد فترة مخصصة بالتاريخ الهجري." });
}

function resolvePeriod(period, settings) {
  const today = todayISO();
  if (period === "today") return { from: today, to: today };
  if (period === "week") return schoolWeek(today);
  if (period === "month") return hijriMonthRange(today);
  if (period === "term") { const r = activeTermRange(settings); return { from: r.from, to: r.to < today ? r.to : today }; }
  if (period === "year") { const r = fullYearRange(settings); return { from: r.from, to: r.to < today ? r.to : today }; }
  return { from: today, to: today };
}

async function generate(root, settings, students) {
  state.type = $("#rType").value;
  state.mode = $("#rMode").value;
  state.excused = $("#rExcused").value;
  state.period = $("#rPeriod").value;
  state.stage = $("#rStage").value;
  state.classNo = $("#rClass").value;
  state.studentId = $("#rStudent").value;
  const f = parseHijriText($("#rFrom").value), t = parseHijriText($("#rTo").value);
  if (!f || !t || !f.iso || !t.iso) { toast("أدخل تاريخاً هجرياً صحيحاً بالصيغة 1448/6/5", { type: "error" }); return; }
  if (f.iso > t.iso) { toast("تاريخ البداية يجب أن يسبق تاريخ النهاية.", { type: "error" }); return; }
  state.from = f.iso; state.to = t.iso;
  const opts = {
    mode: state.mode, excused: state.excused === "all" ? "" : state.excused,
    stageId: state.stage || null, classNo: state.classNo || null, studentId: state.studentId || null
  };
  const records = await getRangeRecords(state.from, state.to, opts);
  state.rows = records;
  state.summary = summarize(records);
  state.generatedAt = Date.now();
  renderResult(root, settings, students);
  toast(`تم إنشاء التقرير: ${fmt(records.length)} سجلاً.`);
}

function summarize(records) {
  const affected = new Set(), absent = new Set(), late = new Set();
  let excused = 0, unexcused = 0;
  for (const r of records) {
    affected.add(r.studentId);
    if (r.mode === "absence" && r.status === "absent") {
      absent.add(r.studentId);
      if (r.excused) excused++; else unexcused++;
    }
    if (r.mode === "late" && r.status === "late") late.add(r.studentId);
  }
  return { total: records.length, affected: affected.size, absentStudents: absent.size, lateStudents: late.size, excused, unexcused };
}

function renderResult(root, settings, students) {
  const box = $("#reportResult");
  if (!box) return;
  const rows = state.rows;
  if (!rows.length) {
    box.innerHTML = `<div class="table-wrap">${emptyState({ iconName: "search", title: "لا توجد سجلات مطابقة", text: "جرّب توسيع الفترة أو تغيير الفلاتر." })}</div>`;
    return;
  }
  const sm = state.summary;
  const summaryHTML = `<div class="report-summary">
    <div class="cell"><b>${fmt(sm.total)}</b><span>إجمالي السجلات</span></div>
    <div class="cell red"><b>${fmt(sm.unexcused)}</b><span>غياب بدون عذر</span></div>
    <div class="cell amber"><b>${fmt(sm.excused)}</b><span>غياب بعذر</span></div>
    <div class="cell"><b>${fmt(sm.lateStudents)}</b><span>طلاب متأخرون</span></div>
    <div class="cell"><b>${fmt(sm.affected)}</b><span>طلاب متأثرون</span></div>
  </div>`;
  let table = "";
  if (state.type === "detailed") {
    table = `<div class="table-wrap"><table class="data-table"><thead><tr>
      <th>م</th><th>التاريخ</th><th>اليوم</th><th>الطالب</th><th>المرحلة</th><th>الفصل</th><th>النوع</th><th>العذر</th><th>المصدر</th>
    </tr></thead><tbody>${rows.slice().sort((a, b) => b.date.localeCompare(a.date)).map((r, i) => {
      const s = students.find(x => x.id === r.studentId);
      return `<tr>
        <td class="num">${i + 1}</td>
        <td class="num">${formatHijri(r.date)}هـ</td>
        <td>${weekdayName(r.date)}</td>
        <td><div class="name-cell"><span class="nm">${escapeHtml(s?.name || "—")}</span></div></td>
        <td>${escapeHtml(stageName(r.stageId))}</td>
        <td>${escapeHtml(classLabel(r.classNo, r.stageId))}</td>
        <td>${r.mode === "late" ? `<span class="badge amber">تأخر</span>` : `<span class="badge red">غياب</span>`}</td>
        <td>${r.mode === "absence" ? (r.excused ? `<span class="badge green">بعذر</span>` : `<span class="badge gray">بدون عذر</span>`) : "—"}</td>
        <td>${r.demo ? `<span class="badge gray">تجريبي</span>` : `<span class="badge blue">رصد</span>`}</td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
  } else if (state.type === "byStudent") {
    const map = new Map();
    for (const r of rows) {
      const cur = map.get(r.studentId) || { id: r.studentId, absent: 0, excused: 0, unexcused: 0, late: 0, last: "" };
      if (r.mode === "absence" && r.status === "absent") { cur.absent++; if (r.excused) cur.excused++; else cur.unexcused++; }
      if (r.mode === "late" && r.status === "late") cur.late++;
      if (!cur.last || r.date > cur.last) cur.last = r.date;
      map.set(r.studentId, cur);
    }
    const list = Array.from(map.values()).sort((a, b) => b.absent - a.absent || b.late - a.late);
    table = `<div class="table-wrap"><table class="data-table"><thead><tr>
      <th>م</th><th>الطالب</th><th>المرحلة</th><th>الفصل</th><th>الغياب</th><th>بعذر</th><th>بدون عذر</th><th>التأخر</th><th>آخر حالة</th>
    </tr></thead><tbody>${list.map((r, i) => {
      const s = students.find(x => x.id === r.id);
      return `<tr><td class="num">${i + 1}</td>
        <td><div class="name-cell"><span class="nm">${escapeHtml(s?.name || "—")}</span><span class="sub">${escapeHtml(s?.studentId || "")}</span></div></td>
        <td>${escapeHtml(stageName(s?.stageId))}</td><td>${escapeHtml(classLabel(s?.classNo, s?.stageId))}</td>
        <td class="num">${fmt(r.absent)}</td><td class="num">${fmt(r.excused)}</td><td class="num">${fmt(r.unexcused)}</td><td class="num">${fmt(r.late)}</td>
        <td class="num">${r.last ? formatHijri(r.last) + "هـ" : "—"}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  } else {
    const map = new Map();
    for (const r of rows) {
      const key = `${r.stageId}-${r.classNo}`;
      const cur = map.get(key) || { stageId: r.stageId, classNo: r.classNo, absent: 0, excused: 0, unexcused: 0, late: 0 };
      if (r.mode === "absence" && r.status === "absent") { cur.absent++; if (r.excused) cur.excused++; else cur.unexcused++; }
      if (r.mode === "late" && r.status === "late") cur.late++;
      map.set(key, cur);
    }
    const list = Array.from(map.values()).sort((a, b) => b.absent - a.absent || b.late - a.late);
    table = `<div class="table-wrap"><table class="data-table"><thead><tr>
      <th>م</th><th>المرحلة</th><th>الفصل</th><th>عدد الطلاب</th><th>الغياب</th><th>بعذر</th><th>بدون عذر</th><th>التأخر</th>
    </tr></thead><tbody>${list.map((r, i) => {
      const count = students.filter(s => s.stageId === r.stageId && s.classNo === r.classNo).length;
      return `<tr><td class="num">${i + 1}</td><td>${escapeHtml(stageName(r.stageId))}</td><td>${escapeHtml(classLabel(r.classNo, r.stageId))}</td><td class="num">${fmt(count)}</td><td class="num">${fmt(r.absent)}</td><td class="num">${fmt(r.excused)}</td><td class="num">${fmt(r.unexcused)}</td><td class="num">${fmt(r.late)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }
  const label = state.type === "detailed" ? "تقرير تفصيلي" : state.type === "byStudent" ? "تقرير إحصائي حسب الطالب" : "تقرير إحصائي حسب الفصل";
  box.innerHTML = `${summaryHTML}
    <div class="section-card">
      <div class="section-head"><div class="section-title">${icon("file", 22)}<div><h2>${label}</h2><p>${formatHijriLong(state.from)} — ${formatHijriLong(state.to)}</p></div></div>
      <div class="section-action"><span class="badge gray">${fmt(rows.length)} سجل</span></div></div>
      <div class="section-body flush">${table}</div>
    </div>`;
}

function doPrint(settings, students) {
  if (!state.rows.length) { toast("اعرض التقرير أولاً.", { type: "warn" }); return; }
  const modeLabel = state.mode === "late" ? "التأخر" : state.mode === "all" ? "الغياب والتأخر" : "الغياب";
  const title = state.type === "detailed" ? `تقرير ${modeLabel} التفصيلي` : state.type === "byStudent" ? "تقرير إحصائي حسب الطالب" : "تقرير إحصائي حسب الفصل";
  let columns, rows;
  if (state.type === "detailed") {
    columns = [
      { key: "i", label: "م", render: (r) => String(r.__i + 1) },
      { key: "date", label: "التاريخ", render: r => formatHijri(r.date) + "هـ" },
      { key: "day", label: "اليوم", render: r => weekdayName(r.date) },
      { key: "name", label: "الطالب", render: r => r.__name },
      { key: "stage", label: "المرحلة", render: r => stageName(r.stageId) },
      { key: "class", label: "الفصل", render: r => classLabel(r.classNo, r.stageId) },
      { key: "type", label: "النوع", render: r => r.mode === "late" ? "تأخر" : "غياب" },
      { key: "exc", label: "العذر", render: r => r.mode === "absence" ? (r.excused ? "بعذر" : "بدون عذر") : "—" }
    ];
    rows = state.rows.slice().sort((a, b) => b.date.localeCompare(a.date)).map((r, i) => {
      const s = students.find(x => x.id === r.studentId);
      return { ...r, __i: i, __name: s?.name || "" };
    });
  } else if (state.type === "byStudent") {
    const map = new Map();
    for (const r of state.rows) {
      const cur = map.get(r.studentId) || { id: r.studentId, absent: 0, excused: 0, unexcused: 0, late: 0, last: "" };
      if (r.mode === "absence" && r.status === "absent") { cur.absent++; if (r.excused) cur.excused++; else cur.unexcused++; }
      if (r.mode === "late" && r.status === "late") cur.late++;
      if (!cur.last || r.date > cur.last) cur.last = r.date;
      map.set(r.studentId, cur);
    }
    rows = Array.from(map.values()).sort((a, b) => b.absent - a.absent).map(r => {
      const s = students.find(x => x.id === r.id);
      return { ...r, __name: s?.name || "", __sid: s?.studentId || "", __stage: stageName(s?.stageId), __class: classLabel(s?.classNo, s?.stageId) };
    });
    columns = [
      { key: "i", label: "م", render: (r, i) => String(i + 1) },
      { key: "name", label: "الطالب", render: r => r.__name },
      { key: "sid", label: "رقم الطالب", render: r => r.__sid },
      { key: "stage", label: "المرحلة", render: r => r.__stage },
      { key: "class", label: "الفصل", render: r => r.__class },
      { key: "absent", label: "الغياب", render: r => fmt(r.absent) },
      { key: "excused", label: "بعذر", render: r => fmt(r.excused) },
      { key: "unexcused", label: "بدون عذر", render: r => fmt(r.unexcused) },
      { key: "late", label: "التأخر", render: r => fmt(r.late) },
      { key: "last", label: "آخر حالة", render: r => r.last ? formatHijri(r.last) + "هـ" : "—" }
    ];
  } else {
    const map = new Map();
    for (const r of state.rows) {
      const key = `${r.stageId}-${r.classNo}`;
      const cur = map.get(key) || { stageId: r.stageId, classNo: r.classNo, absent: 0, excused: 0, unexcused: 0, late: 0 };
      if (r.mode === "absence" && r.status === "absent") { cur.absent++; if (r.excused) cur.excused++; else cur.unexcused++; }
      if (r.mode === "late" && r.status === "late") cur.late++;
      map.set(key, cur);
    }
    rows = Array.from(map.values()).sort((a, b) => b.absent - a.absent);
    columns = [
      { key: "i", label: "م", render: (r, i) => String(i + 1) },
      { key: "stage", label: "المرحلة", render: r => stageName(r.stageId) },
      { key: "class", label: "الفصل", render: r => classLabel(r.classNo, r.stageId) },
      { key: "absent", label: "الغياب", render: r => fmt(r.absent) },
      { key: "excused", label: "بعذر", render: r => fmt(r.excused) },
      { key: "unexcused", label: "بدون عذر", render: r => fmt(r.unexcused) },
      { key: "late", label: "التأخر", render: r => fmt(r.late) }
    ];
  }
  printRangeReport({ title, from: state.from, to: state.to, rows, settings, columns, summary: `<b>ملخص:</b> إجمالي ${fmt(state.summary.total)} سجلاً — بدون عذر ${fmt(state.summary.unexcused)} — بعذر ${fmt(state.summary.excused)} — طلاب متأثرون ${fmt(state.summary.affected)}` });
}

function doExport() {
  if (!state.rows.length) { toast("اعرض التقرير أولاً.", { type: "warn" }); return; }
  let headers, rows;
  if (state.type === "detailed") {
    headers = ["التاريخ الهجري", "التاريخ الميلادي", "اليوم", "اسم الطالب", "رقم الطالب", "المرحلة", "الفصل", "النوع", "العذر"];
    rows = state.rows.map(r => {
      const s = state.rows.find(x => x.studentId === r.studentId);
      return [formatHijri(r.date), r.date, weekdayName(r.date), "", "", stageName(r.stageId), classLabel(r.classNo, r.stageId), r.mode === "late" ? "تأخر" : "غياب", r.excused ? "بعذر" : "بدون عذر"];
    });
  } else {
    headers = ["الطالب", "المرحلة", "الفصل", "الغياب", "بعذر", "بدون عذر", "التأخر"];
    rows = [];
  }
  if (state.type === "detailed") {
    // أسماء الطلاب
    listStudents().then(students => {
      const map = new Map(students.map(s => [s.id, s]));
      const out = state.rows.map(r => {
        const s = map.get(r.studentId);
        return [formatHijri(r.date), r.date, weekdayName(r.date), s?.name || "", s?.studentId || "", stageName(r.stageId), classLabel(r.classNo, r.stageId), r.mode === "late" ? "تأخر" : "غياب", r.excused ? "بعذر" : "بدون عذر"];
      });
      download(`rased-report-${state.from}-${state.to}.csv`, toCSV(headers, out), "text/csv;charset=utf-8");
      toast("تم تصدير التقرير بصيغة CSV.");
    });
  } else {
    doPrintExportSummary(headers);
  }
}

async function doPrintExportSummary(headers) {
  const students = await listStudents();
  let rows = [];
  if (state.type === "byStudent") {
    const map = new Map();
    for (const r of state.rows) {
      const cur = map.get(r.studentId) || { absent: 0, excused: 0, unexcused: 0, late: 0 };
      if (r.mode === "absence" && r.status === "absent") { cur.absent++; if (r.excused) cur.excused++; else cur.unexcused++; }
      if (r.mode === "late" && r.status === "late") cur.late++;
      map.set(r.studentId, cur);
    }
    rows = Array.from(map.entries()).map(([id, t]) => {
      const s = students.find(x => x.id === id);
      return [s?.name || "", stageName(s?.stageId), classLabel(s?.classNo, s?.stageId), t.absent, t.excused, t.unexcused, t.late];
    });
  } else {
    const map = new Map();
    for (const r of state.rows) {
      const key = `${r.stageId}-${r.classNo}`;
      const cur = map.get(key) || { absent: 0, excused: 0, unexcused: 0, late: 0 };
      if (r.mode === "absence" && r.status === "absent") { cur.absent++; if (r.excused) cur.excused++; else cur.unexcused++; }
      if (r.mode === "late" && r.status === "late") cur.late++;
      map.set(key, cur);
    }
    rows = Array.from(map.entries()).map(([key, t]) => {
      const [st, c] = key.split("-");
      return [stageName(st), classLabel(c, st), t.absent, t.excused, t.unexcused, t.late];
    });
  }
  download(`rased-summary-${state.from}-${state.to}.csv`, toCSV(["الطالب/المرحلة", "المرحلة", "الفصل", "الغياب", "بعذر", "بدون عذر", "التأخر"], rows), "text/csv;charset=utf-8");
  toast("تم تصدير التقرير بصيغة CSV.");
}

async function doStudentPrint(settings) {
  const id = state.studentId;
  if (!id) return;
  const s = await getStudent(id);
  const stats = await studentStats(id, state.from, state.to);
  printStudentReport({ student: s, stats, records: stats.records, settings });
}
