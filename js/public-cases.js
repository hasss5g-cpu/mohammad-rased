/* ============================================================
   راصد — صفحة عرض الحالات المتكررة (قراءة فقط)
   ============================================================ */
import {
  escapeHtml, fmt, icon, todayISO, formatHijri, stageName, classLabel, activeTermRange, STAGES
} from "./core.js";
import { getSettings, listStudents, totalsByStudent, listActions, getResolvedCases, caseResolutionKey, getRangeRecords } from "./db.js";
import { printCaseFile, printCaseFiles } from "./print.js";
import { emptyState, confirmDialog } from "./ui.js";

const CATEGORIES = [
  { id: "unexcused", label: "بدون عذر" },
  { id: "excused", label: "بعذر" },
  { id: "late", label: "التأخر" }
];
const ACTION_LABELS = {
  referral: "إحالة إلى الموجه الطلابي", notice: "إشعار ولي الأمر", call: "اتصال هاتفي بولي الأمر",
  meeting: "اجتماع مع ولي الأمر", pledge: "تعهد خطي", committee: "إحالة لجنة التوجيه الطلابي",
  protection: "مخاطبة حماية الطفل", education: "إشعار إدارة التعليم", followup: "متابعة الحالة",
  resolved: "تم عمل الإجراء اللازم", other: "إجراء آخر"
};
const state = { category: "unexcused", threshold: "all", stage: "", classNo: "" };
const q0 = new URLSearchParams((location.hash.split("?")[1] || ""));
if (CATEGORIES.some(c => c.id === q0.get("cat"))) state.category = q0.get("cat");
if (q0.get("stage")) state.stage = q0.get("stage");
if (q0.get("class")) state.classNo = q0.get("class");
if (q0.get("level")) state.threshold = q0.get("level");

export async function renderPublicCases(root) {
  const settings = await getSettings();
  const term = activeTermRange(settings);
  const from = term.from, to = todayISO();
  const [students, totals, actions, resolved, rangeRecords] = await Promise.all([
    listStudents({ stageId: state.stage || null, classNo: state.classNo || null }),
    totalsByStudent(from, to, { stageId: state.stage || null, classNo: state.classNo || null }),
    listActions(), getResolvedCases(), getRangeRecords(from, to)
  ]);
  const smap = new Map(students.map(s => [s.id, s]));
  const actionsByStudent = new Map();
  for (const a of actions) {
    if (!actionsByStudent.has(a.studentId)) actionsByStudent.set(a.studentId, []);
    actionsByStudent.get(a.studentId).push({ ...a, label: ACTION_LABELS[a.type] || a.type });
  }
  const recordsByStudent = new Map();
  for (const r of rangeRecords) {
    if (state.category === "late") {
      if (r.mode !== "late") continue;
    } else {
      if (r.mode !== "absence" || r.status !== "absent") continue;
      if (state.category === "excused" ? !r.excused : !!r.excused) continue;
    }
    if (!recordsByStudent.has(r.studentId)) recordsByStudent.set(r.studentId, []);
    recordsByStudent.get(r.studentId).push(r);
  }
  let cases = [];
  for (const [sid, t] of totals) {
    const s = smap.get(sid); if (!s) continue;
    const count = state.category === "unexcused" ? t.unexcused : state.category === "excused" ? t.excused : t.late;
    if (count < 3) continue;
    const level = count >= 10 ? 10 : count >= 5 ? 5 : 3;
    if (state.threshold !== "all" && level < Number(state.threshold)) continue;
    const actionList = actionsByStudent.get(sid) || [];
    cases.push({ student: s, count, level, totals: t, actionList, records: recordsByStudent.get(sid) || [] });
  }
  cases.sort((a, b) => b.count - a.count || a.student.name.localeCompare(b.student.name, "ar"));
  const hidden = cases.filter(c => resolved[caseResolutionKey(c.student.id, state.category)]);
  const visible = cases.filter(c => !resolved[caseResolutionKey(c.student.id, state.category)]);
  const cat = CATEGORIES.find(c => c.id === state.category)?.label || "";
  const counts = { 10: visible.filter(c => c.level === 10).length, 5: visible.filter(c => c.level === 5).length, 3: visible.filter(c => c.level === 3).length };

  root.innerHTML = `
    <div class="public-page public-page-cases">
      <header class="public-top">
        <div class="public-brand"><span class="public-mark">${icon("alert", 28)}</span><span><b>راصد</b><small>الحالات المتكررة</small></span></div>
        <div class="public-school"><b>${escapeHtml(settings.school?.name || "")}</b><span>العام الدراسي ${escapeHtml(settings.academicYear || "1448")}هـ · ${escapeHtml(term.short)}</span></div>
        <span class="public-badge">عرض فقط</span>
      </header>
      <main class="public-main">
        <div class="public-title">
          <div><span class="eyebrow">الحالات المتكررة</span><h1>الطلاب المستحقون للمتابعة — ${escapeHtml(cat)}</h1></div>
          <button class="btn ghost" id="pcPrintAll" ${visible.length ? "" : "disabled"}>${icon("print", 20)} طباعة جميع الحالات</button>
        </div>

        <div class="cases-toolbar">
          ${CATEGORIES.map(c => `<button class="chip ${state.category === c.id ? "active" : ""}" data-pc-cat="${c.id}">${c.label}</button>`).join("")}
          ${[["all", "كل الحدود"], [3, "3 أيام"], [5, "5 أيام"], [10, "10 أيام"]].map(([v, l]) => `<button class="chip ${String(state.threshold) === String(v) ? "active" : ""}" data-pc-thr="${v}">${l}</button>`).join("")}
          <select class="input" id="pcStage" style="max-width:190px"><option value="">كل المراحل</option>${STAGES.map(s => `<option value="${s.id}" ${String(state.stage) === String(s.id) ? "selected" : ""}>${s.name}</option>`).join("")}</select>
          <select class="input" id="pcClass" style="max-width:150px"><option value="">كل الفصول</option>${Array.from({ length: 9 }, (_, i) => i + 1).map(c => `<option value="${c}" ${String(state.classNo) === String(c) ? "selected" : ""}>${classLabel(c, state.stage)}</option>`).join("")}</select>
        </div>

        <section class="list-hero" style="margin-top:14px">
          <div class="list-total"><b>${fmt(visible.length)}</b><span>حالة ظاهرة</span></div>
          <div class="list-rate"><b>${fmt(counts[10])}</b><span>بلغوا 10 أيام</span></div>
          <div class="list-chips"><span class="chip red">حد 3: ${fmt(counts[3])}</span><span class="chip gold">حد 5: ${fmt(counts[5])}</span>${hidden.length ? `<span class="chip">مخفية: ${fmt(hidden.length)}</span>` : ""}</div>
        </section>

        ${visible.length ? `<div class="public-cases-grid">
          ${visible.map(c => `<article class="public-case">
            <div class="public-case-head">
              <div><b>${escapeHtml(c.student.name)}</b><span>${escapeHtml(stageName(c.student.stageId))} · ${escapeHtml(classLabel(c.student.classNo, c.student.stageId))}</span></div>
              <div class="public-case-count"><b>${fmt(c.count)}</b><span>${state.category === "late" ? "مرة" : "أيام"}</span></div>
            </div>
            <div class="public-case-meta">
              <span class="chip red">حد ${fmt(c.level)}</span>
              ${state.category !== "late" ? `<span class="chip">بعذر ${fmt(c.totals.excused)}</span><span class="chip gold">بدون عذر ${fmt(c.totals.unexcused)}</span>` : ""}
              <span class="chip">${fmt(c.actionList.length)} إجراء</span>
            </div>
            ${c.totals.last ? `<div class="public-case-last">آخر حالة: ${formatHijri(c.totals.last)}هـ</div>` : ""}
            <div class="public-case-actions">
              <button class="btn primary sm" data-pc-print="${c.student.id}">${icon("print", 16)} طباعة جميع الإجراءات</button>
              <a class="btn ghost sm" href="#/admin/recurring">${icon("clipboard", 16)} المتابعة في الإدارة</a>
            </div>
          </article>`).join("")}
        </div>` : emptyState({ iconName: "check", title: "لا توجد حالات ظاهرة", text: hidden.length ? `توجد ${fmt(hidden.length)} حالة تم عمل الإجراء اللازم معها.` : "لا توجد حالات بلغت الحد في هذه الفترة." })}

        ${hidden.length ? `<div class="callout info" style="margin-top:14px">${icon("eye", 18)} توجد <b>${fmt(hidden.length)}</b> حالة تم عمل الإجراء اللازم معها. تُعرض وتُستعاد من <a href="#/admin/settings">الإعدادات</a>.</div>` : ""}
        <p class="public-privacy">${icon("lock", 16)} عرض للقراءة فقط — بدون إمكانية تعديل. البيانات من متصفح هذا الجهاز.</p>
      </main>
    </div>`;

  document.title = "الحالات المتكررة — راصد";
  const updateHash = () => {
    const q = new URLSearchParams();
    q.set("cat", state.category); q.set("level", state.threshold);
    if (state.stage) q.set("stage", state.stage);
    if (state.classNo) q.set("class", state.classNo);
    history.replaceState(null, "", `#/recurring?${q.toString()}`);
  };
  root.querySelectorAll("[data-pc-cat]").forEach(b => b.addEventListener("click", () => { state.category = b.dataset.pcCat; state.threshold = "all"; updateHash(); renderPublicCases(root); }));
  root.querySelectorAll("[data-pc-thr]").forEach(b => b.addEventListener("click", () => { state.threshold = b.dataset.pcThr; updateHash(); renderPublicCases(root); }));
  root.querySelector("#pcStage")?.addEventListener("change", e => { state.stage = e.target.value; state.classNo = ""; updateHash(); renderPublicCases(root); });
  root.querySelector("#pcClass")?.addEventListener("change", e => { state.classNo = e.target.value; updateHash(); renderPublicCases(root); });
  root.querySelector("#pcPrintAll")?.addEventListener("click", async () => {
    if (!visible.length) return;
    const ok = await confirmDialog({
      title: "طباعة جميع ملفات الحالات",
      message: `سيتم إنشاء غلاف والوثائق الخمس لكل طالب.\nعدد الحالات: ${fmt(visible.length)} — التقدير: ${fmt(visible.length * 6)} صفحة.\nهل تريد المتابعة؟`,
      confirmText: "طباعة الملفات", iconName: "print"
    });
    if (!ok) return;
    printCaseFiles({ cases: visible, settings, categoryLabel: cat, reference: state.category === "excused" ? "المادة (33)" : "المادة (34)", from, to });
  });
  root.querySelectorAll("[data-pc-print]").forEach(b => b.addEventListener("click", () => {
    const c = visible.find(x => x.student.id === b.dataset.pcPrint); if (!c) return;
    printCaseFile({ caseData: c, settings, categoryLabel: cat, reference: state.category === "excused" ? "المادة (33)" : "المادة (34)", from, to });
  }));
}
