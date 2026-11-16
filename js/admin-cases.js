/* ============================================================
   راصد — الحالات المتكررة، الأعذار، تصدير نور
   ============================================================ */
import {
  $, $$, icon, fmt, escapeHtml, todayISO, addDays, formatHijri, formatHijriLong, formatGregorianLong, weekdayName,
  parseHijriText, STAGES, classLabel, stageName, displayPhone, waLink, toCSV, download, downloadJSON, normalizeArabic, debounce,
  modeLabel, studentCount, activeTermRange, fullYearRange
} from "./core.js";
import {
  getSettings, saveSettings, listStudents, listExcuses, saveExcuse, setExcuseStatus, totalsByStudent,
  getRangeRecords, listActions, addAction, getDayStats, getDayRecords, resolveCase, getResolvedCases, caseResolutionKey
} from "./db.js";
import {
  sectionCard, emptyState, toast, confirmDialog, modal, avatar, field, chips, statCard, copyText
} from "./ui.js";
import { printGuardianNotice, printReferral, printPledge, printCaseFile, printCaseFiles } from "./print.js";

/* ---------------- النصوص النظامية ---------------- */
const PROCEDURES = {
  unexcused: {
    3: [
      "تحويل الطالب للموجه الطلابي لدراسة الحالة وتقديم الخدمات التربوية المناسبة له.",
      "عند استمرار الغياب واستدعاء ولي الأمر، يُعقد اجتماع لتقييم الخدمات التربوية والخطة العلاجية المقدمة للطالب، وتحديدها بما يلزم وفق الحالة.",
      "أخذ التعهد الخطي من الطالب وولي الأمر بالالتزام والخطة.",
      "استمرار تقديم الخدمات التربوية للطالب ومتابعة حالته."
    ],
    5: [
      "استدعاء ولي الأمر لمناقشة أسباب الغياب.",
      "إحالة الطالب للجنة التوجيه الطلابي، وعقد اجتماع لمراجعة الخطة التربوية والعلاجية المقدمة للطالب.",
      "استمرار تقديم الخدمات التربوية للطالب ومتابعة حالته.",
      "تنبيه ولي الأمر بالإجراءات التربوية على استمرار غياب الطالب."
    ],
    10: [
      "مخاطبة الجهات ذات الاختصاص من قبل المدرسة حيال تطبيق ما ورد في نظام حماية الطفل ونظام الحماية من الإيذاء ولائحتهما التنفيذية، مع إشعار إدارة التعليم بذلك.",
      "متابعة الإجراءات والتنسيق من قبل المدرسة بعد اتخاذ الإجراءات النظامية المطلوبة، مع الجهات ذات الاختصاص المذكورة في الفقرة السابقة، حيال ما تم من إجراءات الحالات."
    ]
  },
  excused: {
    3: [
      "تحويل الطالب للموجه الطلابي لتقديم الدعم والخدمات التربوية المناسبة له (خطة التعلم في أيام الغياب)، ودراسة الحالة إذا احتاج الأمر.",
      "استدعاء ولي الأمر، ويعقد اجتماع حضوري معه يتضمن: إبلاغه بالإجراءات المترتبة على غياب ابنه، وتقييم الخدمات التربوية والخطة العلاجية المقدمة للطالب وتحديدها بما يلزم وفق الحالة."
    ],
    5: [
      "في حال عدم التزام ولي الأمر بالخطة التربوية (خطة التعلم في أيام الغياب)، يُحال الطالب إلى لجنة التوجيه الطلابي، ويتم تنظيم جلسة توعية مع ولي الأمر؛ للتأكيد على أهمية اتباع الخطط التربوية والعلاجية."
    ],
    10: [
      "في حال الاشتباه بتعرض الطالب للإهمال تخاطب المدرسة الجهات ذات الاختصاص حيال تطبيق ما ورد في نظام حماية الطفل ونظام الحماية من الإيذاء ولائحتهما التنفيذية، وإشعار إدارة التعليم بذلك.",
      "تتخذ المدرسة الإجراءات النظامية المطلوبة بالتنسيق والمتابعة مع الجهات ذات الاختصاص المذكورة في الفقرة السابقة حيال ما تم من إجراءات للحالات المحالة لهم."
    ]
  }
};
const ACTION_LABELS = {
  referral: "إحالة إلى الموجه الطلابي",
  notice: "إشعار ولي الأمر",
  call: "اتصال هاتفي بولي الأمر",
  meeting: "اجتماع مع ولي الأمر",
  pledge: "تعهد خطي",
  committee: "إحالة لجنة التوجيه الطلابي",
  protection: "مخاطبة حماية الطفل",
  education: "إشعار إدارة التعليم",
  followup: "متابعة الحالة",
  resolved: "تم عمل الإجراء اللازم",
  other: "إجراء آخر"
};

/* ---------------- الحالات المتكررة ---------------- */
const caseState = { category: "unexcused", threshold: "all", stage: "", classNo: "", period: "term", from: "", to: "" };

export async function renderRecurring(root, settings) {
  const today = todayISO();
  const from = caseState.from || activeTermRange(settings).from;
  const to = caseState.to || today;
  const students = await listStudents();
  const smap = new Map(students.map(s => [s.id, s]));
  const totals = await totalsByStudent(from, to, { stageId: caseState.stage || null, classNo: caseState.classNo || null });
  const actions = await listActions();
  const actionsByStudent = new Map();
  for (const a of actions) {
    if (!actionsByStudent.has(a.studentId)) actionsByStudent.set(a.studentId, []);
    actionsByStudent.get(a.studentId).push(a);
  }
  const rangeRecords = await getRangeRecords(from, to);
  const recordsByStudent = new Map();
  for (const r of rangeRecords) {
    if (caseState.category === "late") {
      if (r.mode !== "late") continue;
    } else {
      if (r.mode !== "absence" || r.status !== "absent") continue;
      if (caseState.category === "excused" ? !r.excused : !!r.excused) continue;
    }
    if (!recordsByStudent.has(r.studentId)) recordsByStudent.set(r.studentId, []);
    recordsByStudent.get(r.studentId).push(r);
  }
  const resolved = await getResolvedCases();
  let cases = [];
  for (const [sid, t] of totals) {
    const s = smap.get(sid); if (!s) continue;
    let count = 0;
    if (caseState.category === "unexcused") count = t.unexcused;
    else if (caseState.category === "excused") count = t.excused;
    else count = t.late;
    if (count < 3) continue;
    const level = count >= 10 ? 10 : count >= 5 ? 5 : 3;
    if (caseState.threshold !== "all" && level < Number(caseState.threshold)) continue;
    cases.push({ student: s, count, level, totals: t, actions: (actionsByStudent.get(sid) || []).length, records: recordsByStudent.get(sid) || [] });
  }
  cases.sort((a, b) => b.count - a.count || a.student.name.localeCompare(b.student.name, "ar"));
  const hiddenCases = cases.filter(c => resolved[caseResolutionKey(c.student.id, caseState.category)]);
  cases = cases.filter(c => !resolved[caseResolutionKey(c.student.id, caseState.category)]);
  const counts = { 10: cases.filter(c => c.level === 10).length, 5: cases.filter(c => c.level === 5).length, 3: cases.filter(c => c.level === 3).length };
  const catLabel = caseState.category === "excused" ? "الغياب بعذر" : caseState.category === "late" ? "التأخر المتكرر" : "الغياب بدون عذر";
  const reference = caseState.category === "excused" ? "المادة (33)" : "المادة (34)";

  root.innerHTML = `
    <div class="admin-head">
      <div><h1>الحالات المتكررة</h1><p>متابعة الطلاب الذين بلغوا حد الغياب (3 / 5 / 10 أيام) وتطبيق الإجراءات النظامية.</p></div>
      <div class="admin-head-actions">
        <button class="btn primary" id="printAllCases" ${cases.length ? "" : "disabled"}>${icon("print", 20)} طباعة جميع الحالات</button>
        <button class="btn ghost" id="showHidden">${icon("eye", 20)} الحالات المخفية (${fmt(hiddenCases.length)})</button>
        <button class="btn ghost" id="showProc">${icon("book", 20)} الإجراءات النظامية</button>
        <button class="btn ghost" id="exportCases">${icon("download", 20)} تصدير الحالات</button>
        <a class="btn ghost" href="#/recurring" target="_blank">${icon("external", 20)} رابط عرض الحالات</a>
      </div>
    </div>

    <div class="callout info" style="margin-bottom:16px">
      <b>${reference} — ${catLabel}:</b> تُطبَّق الإجراءات التربوية على الطالب عند بلوغه 3 أيام، ثم 5 أيام، ثم 10 أيام. اختر الفئة والحد لعرض الحالات المستحقة.
    </div>

    <div class="cases-toolbar">
      ${chips([
        { label: "بدون عذر", value: "unexcused" },
        { label: "بعذر", value: "excused" },
        { label: "التأخر", value: "late" }
      ], caseState.category, { name: "caseCat" })}
      ${chips([
        { label: "كل الحدود", value: "all" },
        { label: "3 أيام", value: 3 },
        { label: "5 أيام", value: 5 },
        { label: "10 أيام", value: 10 }
      ], caseState.threshold, { name: "caseThreshold" })}
      <select class="input" id="caseStage" style="max-width:190px"><option value="">كل المراحل</option>${STAGES.map(s => `<option value="${s.id}" ${String(caseState.stage) === String(s.id) ? "selected" : ""}>${s.name}</option>`).join("")}</select>
      <select class="input" id="caseClass" style="max-width:150px"><option value="">كل الفصول</option>${Array.from({ length: 9 }, (_, i) => i + 1).map(c => `<option value="${c}" ${String(caseState.classNo) === String(c) ? "selected" : ""}>${classLabel(c, caseState.stage)}</option>`).join("")}</select>
      <select class="input" id="casePeriod" style="max-width:190px">
        <option value="term" ${caseState.period === "term" ? "selected" : ""}>من بداية الفترة الدراسية</option>
        <option value="month" ${caseState.period === "month" ? "selected" : ""}>آخر 30 يوماً</option>
        <option value="year" ${caseState.period === "year" ? "selected" : ""}>كامل العام</option>
      </select>
    </div>

    <div class="overview-cards" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      ${statCard({ label: "إجمالي الحالات", value: fmt(cases.length), iconName: "alert", tone: "red", sub: catLabel })}
      ${statCard({ label: "بلغوا 10 أيام", value: fmt(counts[10]), iconName: "shield", tone: "red", sub: "إجراءات حماية الطفل" })}
      ${statCard({ label: "بلغوا 5 أيام", value: fmt(counts[5]), iconName: "users", tone: "amber", sub: "لجنة التوجيه" })}
      ${statCard({ label: "بلغوا 3 أيام", value: fmt(counts[3]), iconName: "bell", tone: "gold", sub: "إحالة وإشعار" })}
    </div>

    ${hiddenCases.length ? `<div class="callout info" style="margin-bottom:14px">
      ${icon("eye", 18)} يوجد <b>${fmt(hiddenCases.length)}</b> حالة تم عمل الإجراء اللازم معها وأُخفيت من القائمة.
      <a href="#/admin/settings" style="font-weight:800;text-decoration:underline">عرض الحالات المخفية من الإعدادات</a>
    </div>` : ""}

    ${cases.length ? `<div class="case-grid" id="caseGrid">
      ${cases.map(c => `
        <article class="case-card level-${c.level}">
          <div class="case-top">
            ${avatar(c.student.name, c.student.stageId)}
            <div class="grow"><div class="case-name">${escapeHtml(c.student.name)}</div>
              <div class="case-meta">${escapeHtml(stageName(c.student.stageId))} · ${escapeHtml(classLabel(c.student.classNo, c.student.stageId))} · ${escapeHtml(displayPhone(c.student.phone))}</div>
              <button class="case-print-link" data-case-print-actions="${c.student.id}">${icon("print", 14)} طباعة جميع الإجراءات</button>
            </div>
            <div class="case-count"><b>${fmt(c.count)}</b><span>${caseState.category === "late" ? "مرة" : "أيام"}</span></div>
          </div>
          <div class="case-flags">
            <span class="badge ${c.level === 10 ? "red" : c.level === 5 ? "amber" : "gray"}">${c.level === 10 ? "حد 10 أيام" : c.level === 5 ? "حد 5 أيام" : "حد 3 أيام"}</span>
            ${caseState.category !== "late" ? `<span class="badge green">بعذر ${fmt(c.totals.excused)}</span><span class="badge red">بدون عذر ${fmt(c.totals.unexcused)}</span>` : ""}
            ${c.actions ? `<span class="badge blue">${fmt(c.actions)} إجراء مسجل</span>` : ""}
          </div>
          <div class="case-progress"><i style="width:${Math.min(100, (c.count / 10) * 100)}%"></i></div>
          <div class="case-progress-label"><span>0</span><span>3</span><span>5</span><span>10</span></div>
          ${c.totals.last ? `<div class="case-note">آخر غياب: ${formatHijri(c.totals.last)}هـ — ${weekdayName(c.totals.last)}</div>` : ""}
          <div class="case-actions">
            <button class="btn primary sm" data-case-open="${c.student.id}">${icon("clipboard", 16)} الإجراءات</button>
            <button class="btn ghost sm" data-case-referral="${c.student.id}">${icon("print", 16)} إحالة</button>
            <button class="btn ghost sm" data-case-notice="${c.student.id}">${icon("print", 16)} إشعار</button>
            <button class="btn ghost sm" data-case-log="${c.student.id}">${icon("clock", 16)} السجل</button>
            <button class="btn soft sm" data-case-resolve="${c.student.id}">${icon("check", 16)} تم عمل الإجراء اللازم</button>
          </div>
        </article>`).join("")}
    </div>` : emptyState({ iconName: "check", title: hiddenCases.length ? "تم عمل الإجراء اللازم مع جميع الحالات الظاهرة" : "لا توجد حالات مطابقة", text: hiddenCases.length ? `توجد ${fmt(hiddenCases.length)} حالة مخفية. يمكنك عرضها من الإعدادات أو إعادة إظهارها.` : "اختر فئة أخرى أو وسّع الفترة. تظهر هنا الحالات التي بلغت 3 أيام غياب أو أكثر.", action: hiddenCases.length ? `<a class="btn soft" href="#/admin/settings">عرض الحالات المخفية</a>` : "" })}
  `;

  $$("[data-chip='caseCat']").forEach(b => b.addEventListener("click", () => { caseState.category = b.dataset.value; caseState.threshold = "all"; renderRecurring(root, settings); }));
  $$("[data-chip='caseThreshold']").forEach(b => b.addEventListener("click", () => { caseState.threshold = b.dataset.value; renderRecurring(root, settings); }));
  $("#caseStage").addEventListener("change", e => { caseState.stage = e.target.value; renderRecurring(root, settings); });
  $("#caseClass").addEventListener("change", e => { caseState.classNo = e.target.value; renderRecurring(root, settings); });
  $("#casePeriod").addEventListener("change", e => {
    caseState.period = e.target.value;
    const t = todayISO();
    if (caseState.period === "month") { caseState.from = addDays(t, -30); caseState.to = t; }
    else if (caseState.period === "year") { const y = fullYearRange(settings); caseState.from = y.from; caseState.to = y.to; }
    else { caseState.from = ""; caseState.to = ""; }
    renderRecurring(root, settings);
  });
  $("#showProc")?.addEventListener("click", () => showProceduresModal(settings));
  $("#showHidden")?.addEventListener("click", () => { location.hash = "#/admin/settings"; });
  $("#exportCases")?.addEventListener("click", () => exportCases(cases, catLabel));
  const actionsFor = (sid) => (actionsByStudent.get(sid) || []).map(a => ({ ...a, label: ACTION_LABELS[a.type] || a.type }));
  $("#printAllCases")?.addEventListener("click", async () => {
    if (!cases.length) return;
    const pages = cases.length * 6;
    const ok = await confirmDialog({
      title: "طباعة جميع ملفات الحالات",
      message: `سيتم إنشاء ملف لكل طالب: غلاف + الوثائق الخمس (إحالة الموجه، إشعار ولي الأمر، اجتماع ولي الأمر، تعهد خطي، إحالة لجنة التوجيه).\n\nعدد الحالات: ${fmt(cases.length)} — التقدير: ${fmt(pages)} صفحة تقريباً (6 صفحات لكل حالة).\nقد يستغرق إنشاء المعاينة بعض الوقت. هل تريد المتابعة؟`,
      confirmText: "طباعة الملفات",
      iconName: "print"
    });
    if (!ok) return;
    printCaseFiles({
      cases: cases.map(c => ({ ...c, actionList: actionsFor(c.student.id) })),
      settings, categoryLabel: catLabel, reference, from, to
    });
  });
  $$("[data-case-print-actions]").forEach(b => b.addEventListener("click", () => {
    const c = cases.find(x => x.student.id === b.dataset.casePrintActions) || hiddenCases.find(x => x.student.id === b.dataset.casePrintActions);
    if (!c) return;
    printCaseFile({ caseData: { ...c, actionList: actionsFor(c.student.id) }, settings, categoryLabel: catLabel, reference, from, to });
  }));
  $$("[data-case-resolve]").forEach(b => b.addEventListener("click", async () => {
    const c = cases.find(x => x.student.id === b.dataset.caseResolve); if (!c) return;
    const ok = await confirmDialog({
      title: "تم عمل الإجراء اللازم",
      message: `سيتم إخفاء حالة الطالب «${c.student.name}» من قائمة الحالات المتكررة، مع الاحتفاظ بسجل الإجراءات. يمكنك إعادة إظهارها من الإعدادات ← الحالات المتكررة المخفية.\n\nهل تريد المتابعة؟`,
      confirmText: "نعم، إخفاء الحالة",
      iconName: "check"
    });
    if (!ok) return;
    await resolveCase({ studentId: c.student.id, category: caseState.category, level: c.level, count: c.count });
    toast("تم حفظ الإجراء وإخفاء الحالة. يمكن استعادتها من الإعدادات.");
    renderRecurring(root, settings);
  }));
  $$("[data-case-open]").forEach(b => b.addEventListener("click", () => openCaseModal(b.dataset.caseOpen, cases, settings, root)));
  $$("[data-case-referral]").forEach(b => b.addEventListener("click", async () => {
    const c = cases.find(x => x.student.id === b.dataset.caseReferral); if (!c) return;
    await addAction({ studentId: c.student.id, type: "referral", note: `إحالة آلية عند بلوغ ${c.count} ${caseState.category === "late" ? "مرة تأخر" : "أيام غياب"}` });
    printReferral({ student: c.student, stats: { absent: c.count, late: caseState.category === "late" ? c.count : c.totals.late }, settings, level: c.level });
    toast("تم تسجيل الإحالة وفتح نموذج الطباعة.");
  }));
  $$("[data-case-notice]").forEach(b => b.addEventListener("click", async () => {
    const c = cases.find(x => x.student.id === b.dataset.caseNotice); if (!c) return;
    await addAction({ studentId: c.student.id, type: "notice", note: "إشعار ولي الأمر" });
    printGuardianNotice({ student: c.student, stats: { absent: c.count, excused: c.totals.excused, unexcused: c.totals.unexcused, late: c.totals.late }, settings, level: c.level, mode: caseState.category === "late" ? "late" : "absence" });
    toast("تم تسجيل الإشعار وفتح نموذج الطباعة.");
  }));
  $$("[data-case-log]").forEach(b => b.addEventListener("click", () => openActionLog(b.dataset.caseLog, cases)));
}

function showProceduresModal(settings) {
  const body = `<div class="settings-grid">
    <div class="section-card"><div class="section-head"><div class="section-title"><h2>المادة (34) — بدون عذر</h2></div></div><div class="section-body">
      ${[3, 5, 10].map(l => `<h3>عند بلوغ ${l} أيام</h3><ol class="list">${PROCEDURES.unexcused[l].map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ol>`).join("")}
    </div></div>
    <div class="section-card"><div class="section-head"><div class="section-title"><h2>المادة (33) — بعذر</h2></div></div><div class="section-body">
      ${[3, 5, 10].map(l => `<h3>عند بلوغ ${l} أيام</h3><ol class="list">${PROCEDURES.excused[l].map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ol>`).join("")}
    </div></div>
  </div>
  <p class="legal" style="margin-top:12px">المصدر: إجراءات التعامل مع الطلبة المتغيبين بعذر وبدون عذر خلال العام الدراسي — وزارة التعليم.</p>`;
  modal({ title: "الإجراءات النظامية للحالات المتكررة", iconName: "book", size: "xl", body, actions: [{ label: "إغلاق", kind: "ghost" }] });
}

async function openCaseModal(studentId, cases, settings, root) {
  const c = cases.find(x => x.student.id === studentId); if (!c) return;
  const procedures = PROCEDURES[caseState.category === "excused" ? "excused" : "unexcused"][c.level];
  const existing = await listActions(studentId);
  const checklist = [
    ["referral", "إحالة إلى الموجه الطلابي"],
    ["notice", "إشعار ولي الأمر"],
    ["call", "اتصال هاتفي بولي الأمر"],
    ["meeting", "اجتماع مع ولي الأمر"],
    ["pledge", "أخذ تعهد خطي"],
    ["committee", "إحالة لجنة التوجيه الطلابي"],
    ...(c.level >= 10 ? [["protection", "مخاطبة حماية الطفل"], ["education", "إشعار إدارة التعليم"]] : []),
    ["followup", "متابعة الحالة"]
  ];
  const body = `
    <div class="callout ${c.level >= 10 ? "danger" : c.level >= 5 ? "warn" : "info"}" style="margin-bottom:14px">
      <b>${escapeHtml(c.student.name)}</b> — ${escapeHtml(stageName(c.student.stageId))} / ${escapeHtml(classLabel(c.student.classNo, c.student.stageId))}<br>
      ${caseState.category === "late" ? `تأخر ${fmt(c.count)} مرة` : `غياب ${fmt(c.count)} أيام`} · بعذر ${fmt(c.totals.excused)} · بدون عذر ${fmt(c.totals.unexcused)} · التأخر ${fmt(c.totals.late)}
    </div>
    <h3>الإجراءات النظامية المطلوبة (${c.level} أيام)</h3>
    <ol class="list" style="margin-bottom:14px">${procedures.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ol>
    <div class="field"><span class="field-label">تسجيل الإجراءات المنفذة</span>
      <div class="form-grid">${checklist.map(([k, l]) => `<label class="mini-row" style="cursor:pointer"><input type="checkbox" data-act="${k}" style="width:20px;height:20px;accent-color:#0f6b4f"><span class="grow">${l}</span></label>`).join("")}</div>
    </div>
    <label class="field" style="margin-top:12px"><span class="field-label">ملاحظات</span><textarea class="input" id="caseNote" rows="3" placeholder="ملاحظات الاجتماع أو الإجراء..."></textarea></label>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn ghost sm" id="caseNoticeBtn">${icon("print", 16)} إشعار ولي الأمر</button>
      <button class="btn ghost sm" id="caseReferralBtn">${icon("print", 16)} إحالة للموجه</button>
      <button class="btn ghost sm" id="casePledgeBtn">${icon("print", 16)} تعهد خطي</button>
      <a class="btn ghost sm" target="_blank" rel="noopener" href="${waLink(c.student.phone, `السلام عليكم، ولي أمر الطالب ${c.student.name}، نود إفادتكم بأن ابنكم بلغ ${c.count} ${caseState.category === "late" ? "مرة تأخر" : "أيام غياب"}، ونأمل مراجعة المدرسة لمناقشة الخطة التربوية. مدرسة ${settings.school?.name || ""}`)}">${icon("whatsapp", 16)} واتساب</a>
    </div>
    ${existing.length ? `<div class="divider"></div><h3>سجل الإجراءات السابق</h3><div class="action-log">${existing.map(a => `<div class="log-row"><span class="ic">${icon("check", 16)}</span><span class="grow">${escapeHtml(ACTION_LABELS[a.type] || a.type)}${a.note ? " — " + escapeHtml(a.note) : ""}</span><time>${formatHijri(new Date(a.at).toISOString().slice(0, 10))}هـ</time></div>`).join("")}</div>` : ""}
  `;
  const m = modal({
    title: "إجراءات الحالة المتكررة", subtitle: c.student.name, iconName: "clipboard", size: "lg", body,
    actions: [
      { label: "إغلاق", kind: "ghost" },
      { label: "حفظ الإجراءات", kind: "primary", icon: "save", onClick: async () => {
        const checked = $$("[data-act]:checked").map(x => x.dataset.act);
        const note = $("#caseNote").value.trim();
        if (!checked.length && !note) { toast("حدد إجراءً واحداً على الأقل أو اكتب ملاحظة.", { type: "warn" }); return false; }
        for (const type of checked) await addAction({ studentId: c.student.id, type, note });
        if (!checked.length && note) await addAction({ studentId: c.student.id, type: "other", note });
        toast("تم تسجيل الإجراءات.");
        renderRecurring(root, settings);
      } }
    ]
  });
  $("#caseNoticeBtn")?.addEventListener("click", () => printGuardianNotice({ student: c.student, stats: { absent: c.count, excused: c.totals.excused, unexcused: c.totals.unexcused, late: c.totals.late }, settings, level: c.level, mode: caseState.category === "late" ? "late" : "absence" }));
  $("#caseReferralBtn")?.addEventListener("click", () => printReferral({ student: c.student, stats: { absent: c.count, late: c.totals.late }, settings, level: c.level }));
  $("#casePledgeBtn")?.addEventListener("click", () => printPledge({ student: c.student, stats: c.totals, settings }));
}

async function openActionLog(studentId, cases) {
  const c = cases.find(x => x.student.id === studentId);
  const actions = await listActions(studentId);
  modal({
    title: "سجل الإجراءات", subtitle: c?.student.name || "", iconName: "clock", size: "lg",
    body: actions.length ? `<div class="action-log">${actions.map(a => `<div class="log-row"><span class="ic">${icon("check", 16)}</span><span class="grow"><b>${escapeHtml(ACTION_LABELS[a.type] || a.type)}</b>${a.note ? `<br><span style="font-size:.75rem;color:#5d6c64">${escapeHtml(a.note)}</span>` : ""}</span><time>${new Date(a.at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</time></div>`).join("")}</div>` : emptyState({ iconName: "file", title: "لا توجد إجراءات", text: "لم يُسجَّل أي إجراء لهذا الطالب بعد." }),
    actions: [{ label: "إغلاق", kind: "ghost" }]
  });
}

function exportCases(cases, catLabel) {
  const rows = cases.map((c, i) => [i + 1, c.student.name, c.student.studentId || "", stageName(c.student.stageId), classLabel(c.student.classNo, c.student.stageId), c.count, c.totals.excused, c.totals.unexcused, c.totals.late, c.level, c.totals.last ? formatHijri(c.totals.last) : ""]);
  download(`rased-cases-${caseState.category}-${todayISO()}.csv`, toCSV(["م", "اسم الطالب", "رقم الطالب", "المرحلة", "الفصل", "عدد الأيام", "بعذر", "بدون عذر", "التأخر", "مستوى الإجراء", "آخر حالة"], rows), "text/csv;charset=utf-8");
  toast("تم تصدير الحالات.");
}

/* ---------------- الأعذار ---------------- */
const excuseState = { status: "pending", q: "" };

export async function renderExcuses(root, settings) {
  const students = await listStudents({ includeInactive: true });
  const smap = new Map(students.map(s => [s.id, s]));
  const all = await listExcuses({});
  const filtered = all.filter(e => (excuseState.status === "all" || e.status === excuseState.status) && (!excuseState.q || normalizeArabic(smap.get(e.studentId)?.name || "").includes(normalizeArabic(excuseState.q))));
  const counts = { pending: all.filter(e => e.status === "pending").length, accepted: all.filter(e => e.status === "accepted").length, rejected: all.filter(e => e.status === "rejected").length };

  root.innerHTML = `
    <div class="admin-head">
      <div><h1>أعذار الغياب</h1><p>مراجعة الأعذار الواردة من أولياء الأمور وربطها بسجلات الغياب.</p></div>
      <div class="admin-head-actions">
        <button class="btn primary" id="addExcuse">${icon("plus", 20)} تسجيل عذر يدوي</button>
        <a class="btn ghost" href="#/admin/whatsapp">${icon("whatsapp", 20)} إرسال روابط الأعذار</a>
      </div>
    </div>
    <div class="cases-toolbar">
      ${chips([
        { label: `بانتظار المراجعة (${fmt(counts.pending)})`, value: "pending" },
        { label: `مقبولة (${fmt(counts.accepted)})`, value: "accepted" },
        { label: `مرفوضة (${fmt(counts.rejected)})`, value: "rejected" },
        { label: "الكل", value: "all" }
      ], excuseState.status, { name: "excStatus" })}
      <div class="search-box" style="min-width:240px">${icon("search", 18)}<input type="search" id="excSearch" placeholder="ابحث باسم الطالب…" value="${escapeHtml(excuseState.q)}"></div>
    </div>
    ${filtered.length ? `<div class="excuse-list">${filtered.map(e => {
      const s = smap.get(e.studentId);
      return `<article class="excuse-card">
        <div class="excuse-top">
          ${avatar(s?.name || "؟", s?.stageId || 1)}
          <div class="grow"><b>${escapeHtml(s?.name || "طالب محذوف")}</b><br><span style="font-size:.75rem;color:#5d6c64">${escapeHtml(s ? stageName(s.stageId) + " · " + classLabel(s.classNo, s.stageId) : "")} · ${e.date ? formatHijri(e.date) + "هـ" : ""}</span></div>
          <span class="badge ${e.status === "accepted" ? "green" : e.status === "rejected" ? "red" : "amber"}">${e.status === "accepted" ? "مقبول" : e.status === "rejected" ? "مرفوض" : "بانتظار المراجعة"}</span>
        </div>
        <div class="excuse-reason"><b>نوع العذر:</b> ${escapeHtml(e.type || "—")} — ${escapeHtml(e.reason || "")}${e.guardianName ? `<br><b>ولي الأمر:</b> ${escapeHtml(e.guardianName)} ${e.guardianPhone ? "· " + escapeHtml(displayPhone(e.guardianPhone)) : ""}` : ""}</div>
        <div class="excuse-actions">
          ${e.status !== "accepted" ? `<button class="btn primary sm" data-exc-accept="${e.id}">${icon("check", 16)} قبول العذر</button>` : ""}
          ${e.status !== "rejected" ? `<button class="btn ghost sm" data-exc-reject="${e.id}">${icon("x", 16)} رفض</button>` : ""}
          <button class="btn ghost sm" data-exc-view="${e.id}">${icon("eye", 16)} تفاصيل</button>
          ${e.attachment ? `<a class="btn ghost sm" href="${e.attachment}" target="_blank" rel="noopener">${icon("file", 16)} المرفق</a>` : ""}
        </div>
      </article>`;
    }).join("")}</div>` : emptyState({ iconName: "file", title: "لا توجد أعذار", text: "لم يصل أي عذر مطابق. يمكنك تسجيل عذر يدوي أو إرسال روابط الأعذار لأولياء الأمور." })}
  `;

  $$("[data-chip='excStatus']").forEach(b => b.addEventListener("click", () => { excuseState.status = b.dataset.value; renderExcuses(root, settings); }));
  $("#excSearch").addEventListener("input", debounce(e => { excuseState.q = e.target.value; renderExcuses(root, settings); }, 250));
  $("#addExcuse").addEventListener("click", () => openManualExcuse(students, root, settings));
  $$("[data-exc-accept]").forEach(b => b.addEventListener("click", async () => {
    await setExcuseStatus(b.dataset.excAccept, "accepted");
    toast("تم قبول العذر وتحويل الغياب إلى «بعذر».");
    renderExcuses(root, settings);
  }));
  $$("[data-exc-reject]").forEach(b => b.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "رفض العذر", message: "سيُرفض العذر ويبقى الغياب «بدون عذر». هل تريد المتابعة؟", confirmText: "رفض", iconName: "x" });
    if (!ok) return;
    await setExcuseStatus(b.dataset.excReject, "rejected");
    toast("تم رفض العذر.");
    renderExcuses(root, settings);
  }));
  $$("[data-exc-view]").forEach(b => b.addEventListener("click", () => {
    const e = all.find(x => x.id === b.dataset.excView); if (!e) return;
    const s = smap.get(e.studentId);
    modal({ title: "تفاصيل العذر", iconName: "file", size: "lg", body: `<div class="analysis-list">
        <div class="analysis-item"><span class="ai">${icon("user", 18)}</span><div>الطالب: <b>${escapeHtml(s?.name || "")}</b></div></div>
        <div class="analysis-item"><span class="ai">${icon("calendar", 18)}</span><div>التاريخ: ${e.date ? `${formatHijri(e.date)}هـ — ${formatGregorianLong(e.date)}` : "—"}</div></div>
        <div class="analysis-item"><span class="ai">${icon("file", 18)}</span><div>النوع: ${escapeHtml(e.type || "")}<br>${escapeHtml(e.reason || "")}</div></div>
        <div class="analysis-item"><span class="ai">${icon("phone", 18)}</span><div>ولي الأمر: ${escapeHtml(e.guardianName || "—")} — ${escapeHtml(displayPhone(e.guardianPhone || ""))}</div></div>
        ${e.adminNote ? `<div class="analysis-item warn"><span class="ai">${icon("info", 18)}</span><div>${escapeHtml(e.adminNote)}</div></div>` : ""}
      </div>`, actions: [{ label: "إغلاق", kind: "ghost" }] });
  }));
}

function openManualExcuse(students, root, settings) {
  const m = modal({
    title: "تسجيل عذر يدوي", iconName: "file", size: "lg",
    body: `<div class="form-grid">
      <label class="field span-2"><span class="field-label">الطالب</span><select class="input" id="me-student">${students.map(s => `<option value="${s.id}">${escapeHtml(s.name)} — ${classLabel(s.classNo, s.stageId)}</option>`).join("")}</select></label>
      <label class="field"><span class="field-label">تاريخ الغياب</span><input class="input" type="date" id="me-date" value="${todayISO()}"></label>
      <label class="field"><span class="field-label">نوع العذر</span><select class="input" id="me-type"><option>مرض</option><option>ظرف عائلي</option><option>موعد طبي</option><option>سفر</option><option>أخرى</option></select></label>
      <label class="field"><span class="field-label">اسم ولي الأمر</span><input class="input" id="me-guardian" placeholder="الاسم"></label>
      <label class="field"><span class="field-label">جوال ولي الأمر</span><input class="input" id="me-phone" placeholder="05xxxxxxxx" dir="ltr"></label>
      <label class="field span-2"><span class="field-label">نص العذر</span><textarea class="input" id="me-reason" rows="3"></textarea></label>
      <label class="field span-2" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="me-accept" checked style="width:22px;height:22px;accent-color:#0f6b4f"><span class="field-label" style="margin:0">قبول العذر مباشرةً (يُحوَّل الغياب إلى «بعذر»)</span></label>
    </div>`,
    actions: [
      { label: "إلغاء", kind: "ghost" },
      { label: "حفظ", kind: "primary", icon: "save", onClick: async () => {
        const sid = $("#me-student").value, date = $("#me-date").value;
        const row = await saveExcuse({ studentId: sid, date, mode: "absence", type: $("#me-type").value, reason: $("#me-reason").value.trim(), guardianName: $("#me-guardian").value.trim(), guardianPhone: $("#me-phone").value.trim(), status: "pending" });
        if ($("#me-accept").checked) await setExcuseStatus(row.id, "accepted", "تسجيل يدوي من الإدارة");
        toast("تم حفظ العذر.");
        renderExcuses(root, settings);
      } }
    ]
  });
}

/* ---------------- جسر نور (ربط مباشر مع صفحة الرصد) ---------------- */
const NOOR_URL = "https://noor.moe.gov.sa/Noor/EduWaveSMS/ManageAttendance.aspx?EKME-sZ-qgdJhYZtXdsecQ2=CbAaLvlaYI41";
const noorState = { date: todayISO(), stage: "", classNo: "", payload: null };

export async function renderNoor(root, settings) {
  const students = await listStudents();
  const smap = new Map(students.map(s => [s.id, s]));

  root.innerHTML = `
    <div class="admin-head">
      <div><h1>جسر نور — رصد الغياب مباشرة</h1><p>جهّز بيانات الغياب من راصد، ثم رصدها في صفحة المواظبة بنور بعد تسجيل دخولك الرسمي.</p></div>
      <div class="admin-head-actions">
        <a class="btn ghost" href="${NOOR_URL}" target="_blank" rel="noopener">${icon("external", 20)} فتح نور</a>
        <a class="btn primary" href="./noor-bridge-extension.zip?v=110" download="noor-bridge-extension.zip">${icon("download", 20)} تحميل جسر نور</a>
      </div>
    </div>

    <div class="callout info" style="margin-bottom:16px">
      <b>كيف يعمل؟</b> لا يرسل راصد بياناتك إلى أي جهة خارجية، ولا يحفظ في نور تلقائياً. أنت تسجّل دخولك في نور، وتفتح صفحة رصد المواظبة، ثم يملأ «جسر نور» الغياب في الصفحة بعد مراجعته، وتبقى خطوة <b>حفظ</b> النهائية بيدك داخل نور.
    </div>

    <div class="settings-grid">
      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("calendar", 24)}<div><h2>تجهيز بيانات الرصد</h2><p>اختر اليوم والفصل المفتوح حالياً في نور.</p></div></div></div>
        <div class="section-body">
          <div class="form-grid">
            <label class="field"><span class="field-label">تاريخ الغياب</span><input class="input" type="date" id="noorSyncDate" value="${noorState.date}"></label>
            <label class="field"><span class="field-label">المرحلة</span><select class="input" id="noorSyncStage"><option value="">كل المراحل</option>${STAGES.map(s => `<option value="${s.id}" ${String(noorState.stage) === String(s.id) ? "selected" : ""}>${s.name}</option>`).join("")}</select></label>
            <label class="field"><span class="field-label">الفصل</span><select class="input" id="noorSyncClass"><option value="">كل الفصول</option>${Array.from({ length: 9 }, (_, i) => i + 1).map(c => `<option value="${c}" ${String(noorState.classNo) === String(c) ? "selected" : ""}>${classLabel(c, noorState.stage)}</option>`).join("")}</select></label>
            <div class="field"><span class="field-label">الإجراء</span><button class="btn primary" id="noorSyncGenerate">${icon("sync", 20)} تجهيز بيانات نور</button></div>
          </div>
          <div class="callout warn" style="margin-top:12px;font-size:.8rem">
            افتح في نور صفحة <b>إدخال السلوك والمواظبة</b> لنفس الفصل والتاريخ، ثم استخدم إضافة «جسر نور». إن كانت الصفحة تعرض فصلاً واحداً، اختر نفس الفصل هنا.
          </div>
        </div>
      </section>

      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("book", 24)}<div><h2>خطوات الربط</h2></div></div></div>
        <div class="section-body">
          <ol class="list" style="font-size:.92rem;line-height:1.9">
            <li>ثبّت إضافة <b>جسر نور</b> في كروم أو إيدج (وضع المطوّر ← تحميل غير مضغوط).</li>
            <li>سجّل الدخول إلى <b>نظام نور</b> بحساب المدرسة، وافتح صفحة إدخال المواظبة للفصل.</li>
            <li>ارجع إلى هذه الصفحة، واضغط <b>تجهيز بيانات نور</b>، ثم <b>نسخ بيانات نور</b>.</li>
            <li>في صفحة نور اضغط زر <b>راصد — جسر نور</b>، وألصق البيانات، ثم <b>معاينة</b>.</li>
            <li>راجع الطلاب المطابقين وغير المطابقين، ثم اضغط <b>تنفيذ الرصد</b>.</li>
            <li>راجع الصفحة في نور واضغط <b>حفظ</b> داخل نور — هذه الخطوة لا تتم تلقائياً.</li>
          </ol>
          <div class="callout ok" style="margin-top:12px;font-size:.78rem">التصميم المقصود: لا كتابة عمياء. معاينة أولاً، ثم تنفيذ، ثم حفظ يدوي منك.</div>
        </div>
      </section>
    </div>

    <div id="noorSyncPreview" class="section-gap"></div>`;

  function updateClassOptions() {
    const st = noorState.stage;
    $("#noorSyncClass").innerHTML = `<option value="">كل الفصول</option>` + Array.from({ length: 9 }, (_, i) => i + 1).map(c => `<option value="${c}" ${String(noorState.classNo) === String(c) ? "selected" : ""}>${classLabel(c, st)}</option>`).join("");
  }

  $("#noorSyncDate").addEventListener("change", e => { noorState.date = e.target.value || todayISO(); });
  $("#noorSyncStage").addEventListener("change", e => { noorState.stage = e.target.value; noorState.classNo = ""; updateClassOptions(); });
  $("#noorSyncClass").addEventListener("change", e => { noorState.classNo = e.target.value; });

  $("#noorSyncGenerate").addEventListener("click", async () => {
    noorState.date = $("#noorSyncDate").value || todayISO();
    noorState.stage = $("#noorSyncStage").value;
    noorState.classNo = $("#noorSyncClass").value;
    const records = (await getDayRecords(noorState.date, "absence")).filter(r => r.status === "absent");
    let items = records.map(r => {
      const s = smap.get(r.studentId);
      if (!s) return null;
      if (noorState.stage && Number(s.stageId) !== Number(noorState.stage)) return null;
      if (noorState.classNo && Number(s.classNo) !== Number(noorState.classNo)) return null;
      return { studentId: s.studentId || s.id, name: s.name, stageId: Number(s.stageId), classNo: Number(s.classNo), excused: !!r.excused };
    }).filter(Boolean).sort((a, b) => a.classNo - b.classNo || a.name.localeCompare(b.name, "ar"));
    items = items.filter((x, i, arr) => arr.findIndex(y => y.studentId === x.studentId) === i);
    const payload = {
      app: "rased-noor", version: 1,
      school: settings.school?.name || "",
      date: noorState.date, hijri: formatHijri(noorState.date),
      stageId: noorState.stage ? Number(noorState.stage) : null,
      classNo: noorState.classNo ? Number(noorState.classNo) : null,
      generatedAt: new Date().toISOString(),
      items
    };
    noorState.payload = payload;
    const excused = items.filter(x => x.excused).length;
    const box = $("#noorSyncPreview");
    if (!items.length) {
      box.innerHTML = emptyState({ iconName: "search", title: "لا توجد حالات غياب", text: "لم يُرصد أي غياب في هذا اليوم/الفصل. سجّل الغياب في راصد أولاً." });
      return;
    }
    box.innerHTML = `<div class="section-card">
      <div class="section-head"><div class="section-title">${icon("file", 22)}<div><h2>بيانات نور جاهزة</h2><p>${formatHijri(noorState.date)}هـ — ${fmt(items.length)} حالة (${fmt(excused)} بعذر، ${fmt(items.length - excused)} بدون عذر)</p></div></div></div>
      <div class="section-body">
        <div class="btn-row" style="margin-bottom:12px">
          <button class="btn primary" id="noorCopyPayload">${icon("copy", 20)} نسخ بيانات نور</button>
          <button class="btn ghost" id="noorDownloadPayload">${icon("download", 20)} تنزيل ملف JSON</button>
          <button class="btn ghost" id="noorDownloadCSV">${icon("download", 20)} تنزيل CSV</button>
          <button class="btn ghost" id="noorOpenPage">${icon("external", 20)} فتح صفحة نور</button>
        </div>
        <div class="table-wrap" style="border:1px solid var(--line)">
          <table class="data-table"><thead><tr><th>الطالب</th><th>رقم الطالب</th><th>الفصل</th><th>نوع الغياب</th></tr></thead><tbody>
            ${items.map(it => `<tr><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.studentId)}</td><td>${escapeHtml(classLabel(it.classNo, it.stageId))}</td><td>${it.excused ? `<span class="badge gold">بعذر</span>` : `<span class="badge red">بدون عذر</span>`}</td></tr>`).join("")}
          </tbody></table>
        </div>
      </div>
    </div>`;
    $("#noorCopyPayload").addEventListener("click", async () => {
      await copyText(JSON.stringify(payload, null, 1));
      toast("تم نسخ بيانات نور. الصقها في إضافة جسر نور.");
    });
    $("#noorDownloadPayload").addEventListener("click", () => downloadJSON(`rased-noor-${noorState.date}.json`, payload));
    $("#noorDownloadCSV").addEventListener("click", () => {
      const rows = items.map(it => [it.studentId, it.name, classLabel(it.classNo, it.stageId), `${formatHijri(noorState.date)}هـ`, it.excused ? "بعذر" : "بدون عذر"]);
      download(`rased-noor-${noorState.date}.csv`, toCSV(["رقم الطالب", "اسم الطالب", "الفصل", "التاريخ الهجري", "نوع الغياب"], rows), "text/csv;charset=utf-8");
      toast("تم تنزيل كشف نور بصيغة CSV.");
    });
    $("#noorOpenPage").addEventListener("click", () => window.open(NOOR_URL, "_blank", "noopener"));
  });
}



