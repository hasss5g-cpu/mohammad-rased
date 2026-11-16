/* ============================================================
   راصد — الرئيسية، اختيار المرحلة، صفحة الرصد
   ============================================================ */
import {
  $, $$, icon, fmt, escapeHtml, todayISO, formatHijri, formatHijriLong, formatGregorianLong,
  weekdayName, STAGES, classLabel, stageName, modeLabel, modeNoun,
  studentCount, debounce, normalizeArabic, nowClock, activeTermRange, waLink, pct
} from "./core.js";
import {
  listStudents, getSettings, getDayMap, getSessions, setStatus, bulkSetStatus,
  hasDemoData, clearDemoData, totalsByStudent, saveSettings, holidayInfo, getDayStats, applyExcusedRoster, listExcusedRoster
} from "./db.js";
import { headerHTML, statCard, emptyState, applySyncChip, toast, confirmDialog, modal, copyText } from "./ui.js";

function navigate(hash) { location.hash = hash; }

/* ---------------- الرئيسية ---------------- */
export async function renderHome(root) {
  const settings = await getSettings();
  const today = todayISO();
  try { await applyExcusedRoster(today); } catch (e) { console.warn(e); }
  const [stats, hol, students, demo, totals] = await Promise.all([
    getDayStats(today), holidayInfo(today), listStudents(), hasDemoData(), totalsByStudent(activeTermRange(settings).from, today)
  ]);
  const cases = Array.from(totals.entries())
    .map(([sid, t]) => ({ sid, ...t }))
    .filter(x => x.absent >= 3)
    .sort((a, b) => b.absent - a.absent)
    .slice(0, 5);
  const studentMap = new Map(students.map(s => [s.id, s]));
  const holiday = hol.isHoliday && !settings.allowHolidayRecording;
  const term = activeTermRange(settings);
  const termOut = today < term.from || today > term.to;
  const viewStats = termOut ? zeroStats(stats) : stats;
  const canRecord = !holiday && !termOut;

  root.innerHTML = `
    ${headerHTML()}
    <main id="main" class="page">
      ${demo && !settings.demoDismissed ? `<div class="demo-banner">
        <span>${icon("info", 20)}</span>
        <span class="grow">وضع العرض: توجد بيانات تجريبية لتوضيح التقارير والإحصاءات. يمكنك بدء الاستخدام الفعلي بضغطة واحدة.</span>
        <button type="button" data-action="clear-demo">بدء الاستخدام الفعلي</button>
        <button type="button" data-action="hide-demo" aria-label="إخفاء">${icon("x", 16)}</button>
      </div>` : ""}
      <section class="home-hero">
        <div class="hero-head">
          <span class="eyebrow"><span class="dot"></span> ${escapeHtml(settings.school?.name || "مدرستي")} · العام الدراسي ${escapeHtml(settings.academicYear || "1448")}هـ · ${activeTermRange(settings).short}</span>
          <h1 class="home-title">رصد <span class="accent">الغياب والتأخر</span><br>بسهولة ووضوح</h1>
          <p class="home-sub">اختر نوع الرصد، ثم المرحلة، وسجّل الحضور بضغطة واحدة — يُحفظ تلقائياً.</p>
          <div class="today-line">
            <span>${icon("calendar", 20)}</span>
            <span>اليوم: <strong>${formatHijri(today)}هـ</strong></span>
            <span class="sep">|</span>
            <span>${weekdayName(today)} ${formatGregorianLong(today)}</span>
          </div>
        </div>
        ${holiday ? `<div class="callout warn" style="max-width:720px;margin:18px auto 0;text-align:start">
          <b>اليوم إجازة:</b> ${escapeHtml(hol.title || "إجازة")} — لا يمكن رصد الغياب في أيام الإجازات. يمكنك تعديل أيام الإجازة من لوحة الإدارة.
        </div>` : ""}
        ${termOut ? `<div class="callout warn" style="max-width:720px;margin:18px auto 0;text-align:start">
          <b>تنبيه:</b> تاريخ اليوم خارج نطاق ${term.label} المحددة في الإعدادات (${formatHijri(term.from)}هـ — ${formatHijri(term.to)}هـ). راجع تواريخ الفترة من الإعدادات.
        </div>` : ""}
        <div class="orbs">
          <button type="button" class="action-orb orb-absence" data-action="start" data-mode="absence" ${canRecord ? "" : "disabled"}>
            <span class="orb-badge">${fmt(viewStats.absent)} غائب اليوم</span>
            <span class="orb-icon">${icon("user", 34)}</span>
            <span class="orb-title">رصد الغياب</span>
            <span class="orb-date">اليوم ${formatHijri(today)}هـ</span>
            <span class="orb-hint">اضغط للبدء</span>
          </button>
          <button type="button" class="action-orb orb-late" data-action="start" data-mode="late" ${canRecord ? "" : "disabled"}>
            <span class="orb-badge">${fmt(viewStats.late)} متأخر اليوم</span>
            <span class="orb-icon">${icon("clock", 34)}</span>
            <span class="orb-title">رصد التأخر</span>
            <span class="orb-date">اليوم ${formatHijri(today)}هـ</span>
            <span class="orb-hint">اضغط للبدء</span>
          </button>
        </div>
      </section>

      <section class="home-stats" aria-label="إحصاءات اليوم">
        ${statCard({ label: "إجمالي الطلاب", value: fmt(viewStats.totalStudents), iconName: "users", tone: "green", sub: `${fmt(viewStats.totalClasses)} فصلاً دراسياً` })}
        ${statCard({ label: "غائب اليوم", value: fmt(viewStats.absent), iconName: "user", tone: "red", sub: `${fmt(viewStats.unexcusedAbsent)} بدون عذر · ${fmt(viewStats.excusedAbsent)} بعذر` })}
        ${statCard({ label: "متأخر اليوم", value: fmt(viewStats.late), iconName: "clock", tone: "amber", sub: "بانتظار انتظام الطابور" })}
        ${statCard({ label: "الفصول المرصودة", value: `${fmt(viewStats.recordedClasses)} / ${fmt(viewStats.totalClasses)}`, iconName: "clipboard", tone: "blue", sub: termOut ? "لم تبدأ الفترة النشطة" : viewStats.recordedClasses < viewStats.totalClasses ? "ما زال هناك فصول لم تُرصد" : "تم رصد جميع الفصول" })}
      </section>

      <div class="home-report">
        <button type="button" class="btn gold lg" id="sendPrincipal">${icon("whatsapp", 24)} إرسال إحصائية الغياب للمدير عبر واتساب</button>
        <span class="legal">ملخص اليوم بالتاريخ وعدد الغائبين ونسبة الغياب لكل مرحلة.</span>
      </div>

      <section class="home-grid">
        <div class="quick-card">
          <h3>${icon("grid", 22)} وصول سريع</h3>
          <p>كل ما تحتاجه لإدارة الغياب في مكان واحد.</p>
          <div class="quick-links">
            <a class="quick-link" href="#/entry">${icon("clipboard", 22)} الإدخال المباشر</a>
            <a class="quick-link" href="#/admin/recurring">${icon("alert", 22)} الحالات المتكررة</a>
            <a class="quick-link" href="#/admin/reports">${icon("chart", 22)} التقارير والإحصاءات</a>
            <a class="quick-link" href="#/admin/students">${icon("users", 22)} قاعدة الطلاب</a>
            <a class="quick-link" href="#/admin/whatsapp">${icon("whatsapp", 22)} إرسال واتساب</a>
            <a class="quick-link" href="#/summary">${icon("chart", 22)} ملخص الغياب</a>
            <a class="quick-link" href="#/absentees">${icon("users", 22)} قائمة الغائبين</a>
          </div>
        </div>
        <div class="quick-card">
          <h3>${icon("bell", 22)} أبرز الحالات المتكررة</h3>
          <p>طلاب بلغوا 3 أيام غياب أو أكثر هذا العام.</p>
          ${cases.length ? `<div class="mini-list">${cases.map(c => {
            const s = studentMap.get(c.sid); if (!s) return "";
            return `<a class="mini-row" href="#/admin/recurring">
              <span class="grow"><b>${escapeHtml(s.name)}</b> · ${escapeHtml(classLabel(s.classNo, s.stageId))}</span>
              <span class="count">${fmt(c.absent)} أيام</span>
            </a>`;
          }).join("")}</div>` : `<div class="callout ok" style="margin-top:14px">لا توجد حالات بلغت حد المتابعة حتى الآن.</div>`}
        </div>
      </section>
      <footer class="home-footer">
        راصد ${settings.academicYear || "1448"}هـ · ${escapeHtml(settings.school?.name || "")} · جميع البيانات محفوظة على هذا الجهاز وتُزامن عند توفر الاتصال. · <a href="./guide.html" target="_blank" rel="noopener">دليل الاستخدام</a>
      </footer>
    </main>
    ${bottomSyncHint()}`;

  applySyncChip(window.__rasedSync || {});
  bindHeaderDate();
  root.querySelectorAll("[data-action='start']").forEach(b => b.addEventListener("click", () => navigate(`#/stage/${b.dataset.mode}`)));
  root.querySelector("[data-action='clear-demo']")?.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "بدء الاستخدام الفعلي", message: "سيتم حذف جميع سجلات الغياب والتأخر والأعذار التجريبية، مع الاحتفاظ بقاعدة الطلاب. هل تريد المتابعة؟", confirmText: "نعم، ابدأ", iconName: "check" });
    if (!ok) return;
    await clearDemoData();
    toast("تم حذف البيانات التجريبية. يمكنك البدء برصد اليوم.");
    renderHome(root);
  });
  root.querySelector("[data-action='hide-demo']")?.addEventListener("click", async () => {
    await saveSettings({ demoDismissed: true });
    root.querySelector(".demo-banner")?.remove();
  });

  function principalSummary() {
    const term = activeTermRange(settings);
    const lines = [
      `إحصائية الغياب اليومية — ${settings.school?.name || ""}`,
      `اليوم: ${weekdayName(today)} ${formatHijri(today)}هـ — ${formatGregorianLong(today)}`,
      `${term.label}`,
      ""
    ];
    for (const st of [1, 2, 3]) {
      const v = viewStats.perStage[st];
      lines.push(`${stageName(st)}: ${fmt(v.absent)} غائباً من ${fmt(v.total)} — نسبة الغياب ${pct(v.absent, v.total)}%`);
    }
    lines.push("");
    lines.push(`إجمالي الغياب: ${fmt(viewStats.absent)} من ${fmt(viewStats.totalStudents)} طالباً — النسبة الإجمالية ${pct(viewStats.absent, viewStats.totalStudents)}%`);
    if (viewStats.excusedAbsent) lines.push(`منها ${fmt(viewStats.excusedAbsent)} غياباً بعذر، و${fmt(viewStats.unexcusedAbsent)} بدون عذر.`);
    lines.push(`عدد الطلاب الحاضرين: ${fmt(viewStats.totalStudents - viewStats.absent)}`);
    lines.push(`الفصول المرصودة: ${fmt(viewStats.recordedClasses)} من ${fmt(viewStats.totalClasses)}`);
    lines.push("");
    lines.push(`مدرسة ${settings.school?.name || ""}`);
    return lines.join("\n");
  }

  $("#sendPrincipal")?.addEventListener("click", async () => {
    const text = principalSummary();
    const phone = settings.school?.principalPhone || "";
    if (phone) {
      const w = window.open(waLink(phone, text), "_blank");
      if (!w) {
        await copyText(text);
        toast("يرجى السماح بالنوافذ المنبثقة. تم نسخ الإحصائية إلى الحافظة.", { type: "warn" });
      } else {
        toast("تم فتح واتساب لإرسال الإحصائية إلى المدير.");
      }
      return;
    }
    const m = modal({
      title: "إحصائية الغياب للمدير", iconName: "whatsapp", size: "lg",
      body: `<div class="callout info" style="margin-bottom:12px">لم يُسجَّل جوال المدير في الإعدادات. أضفه من الإعدادات ← بيانات المدرسة ← جوال المدير، أو انسخ النص وأرسله يدوياً.</div>
        <textarea class="input" rows="12" readonly style="font-size:.85rem">${escapeHtml(text)}</textarea>`,
      actions: [
        { label: "نسخ الإحصائية", kind: "primary", icon: "copy", close: false, onClick: async () => { await copyText(text); toast("تم نسخ الإحصائية."); } },
        { label: "إعدادات الجوال", kind: "ghost", icon: "settings", onClick: () => { location.hash = "#/admin/settings"; } },
        { label: "إغلاق", kind: "ghost" }
      ]
    });
  });
}

function zeroStats(stats) {
  const perStage = {};
  for (const id of [1, 2, 3]) perStage[id] = { ...(stats.perStage?.[id] || {}), absent: 0, late: 0, recorded: 0 };
  return { ...stats, absent: 0, late: 0, excusedAbsent: 0, unexcusedAbsent: 0, recordedClasses: 0, perStage };
}
function addDaysSafe(iso, n) { const d = new Date(iso + "T12:00:00+03:00"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function bottomSyncHint() { return ""; }

function bindHeaderDate() {
  const d = $("#headerDate");
  if (!d) return;
  const update = () => {
    const now = new Date();
    const iso = todayISO();
    d.innerHTML = `<strong>${formatHijri(iso)}</strong><span>${weekdayName(iso)} · ${nowClock()}</span>`;
  };
  update();
  clearInterval(window.__dateTimer);
  window.__dateTimer = setInterval(update, 30000);
}

/* ---------------- اختيار المرحلة ---------------- */
export async function renderStagePicker(root, mode) {
  const settings = await getSettings();
  const today = todayISO();
  try { await applyExcusedRoster(today); } catch (e) { console.warn(e); }
  const [students, dayMap, sessions] = await Promise.all([listStudents(), getDayMap(today, mode), getSessions(today)]);
  const hol = await holidayInfo(today);
  const term = activeTermRange(settings);
  const termOut = today < term.from || today > term.to;
  const blocked = (hol.isHoliday && !settings.allowHolidayRecording) || termOut;
  const effectiveDayMap = termOut ? new Map() : dayMap;
  const effectiveSessions = termOut ? [] : sessions;
  const byStage = { 1: { total: 0, absent: 0, classes: new Set(), recorded: new Set() }, 2: { total: 0, absent: 0, classes: new Set(), recorded: new Set() }, 3: { total: 0, absent: 0, classes: new Set(), recorded: new Set() } };
  for (const s of students) {
    const b = byStage[s.stageId]; if (!b) continue;
    b.total++; b.classes.add(s.classNo);
    if (effectiveDayMap.get(s.id)?.status && effectiveDayMap.get(s.id).status !== "present") b.absent++;
  }
  for (const s of effectiveSessions) {
    if (s.date === today && s.mode === mode && byStage[s.stageId]) byStage[s.stageId].recorded.add(Number(s.classNo));
  }
  root.innerHTML = `
    ${headerHTML({ back: true, title: `${modeLabel(mode)} اليوم`, subtitle: `${formatHijriLong(today, true)} — اختر المرحلة الدراسية` })}
    <main id="main" class="page">
      <div class="stage-screen">
        <div class="stage-head">
          <h1>اختر المرحلة الدراسية</h1>
          <p>سيتم عرض جميع طلاب المرحلة مرتبين حسب الفصول، والحفظ تلقائي فور الضغط.</p>
        </div>
        ${blocked ? `<div class="callout warn" style="margin-bottom:18px">${termOut
          ? `تاريخ اليوم خارج نطاق ${term.label} المحددة في الإعدادات (${formatHijri(term.from)}هـ — ${formatHijri(term.to)}هـ). لا يبدأ الرصد حتى تدخل الفترة أو تعدّل تواريخها.`
          : `اليوم إجازة (${escapeHtml(hol.title || "إجازة")}) — يمكنك تغيير ذلك من إعدادات الإدارة.`}</div>` : ""}
        <div class="stage-circles">
          ${STAGES.map(st => {
            const b = byStage[st.id];
            const done = b.recorded.size > 0;
            const complete = b.recorded.size >= b.classes.size && b.classes.size > 0;
            return `<button type="button" class="stage-circle stage-${st.id}" data-stage="${st.id}" ${blocked ? "disabled" : ""}>
              <span class="stage-num">${st.id}</span>
              <h3>${st.name}</h3>
              <span class="stage-count">${fmt(b.absent)} ${mode === "late" ? "متأخر" : "غائب"} اليوم</span>
              <span class="stage-meta">${fmt(b.total)} طالباً · ${fmt(b.classes.size)} فصول</span>
              ${done ? `<span class="stage-check">${icon("check", 16)} ${complete ? "تم الرصد" : "رصد جزئي"}</span>` : ""}
              <span class="stage-arrow">${icon("back", 26)}</span>
            </button>`;
          }).join("")}
        </div>
      </div>
    </main>`;
  applySyncChip(window.__rasedSync || {});
  bindHeaderDate();
  root.querySelectorAll("[data-stage]").forEach(b => b.addEventListener("click", () => navigate(`#/attendance/${mode}/${b.dataset.stage}`)));
}

/* ---------------- صفحة الرصد ---------------- */
export function renderAttendance(root, mode, stageId) {
  const stage = Number(stageId);
  return new Promise(async resolve => {
    const settings = await getSettings();
    const today = todayISO();
    const hol = await holidayInfo(today);
    const term = activeTermRange(settings);
    const termOut = today < term.from || today > term.to;
    if (termOut) {
      root.innerHTML = `${headerHTML({ back: true, title: `${modeLabel(mode)} اليوم` })}
        <main class="page mid">${emptyState({ iconName: "calendar", title: "اليوم خارج الفترة الدراسية", text: `تاريخ اليوم خارج نطاق ${term.label} (${formatHijri(term.from)}هـ — ${formatHijri(term.to)}هـ). لا يبدأ الرصد حتى تدخل الفترة أو تعدّل تواريخها من الإعدادات.`, action: `<a class="btn primary" href="#/admin/settings">إعدادات الفترة</a><a class="btn ghost" href="#/">الرئيسية</a>` })}</main>`;
      applySyncChip(window.__rasedSync || {});
      bindHeaderDate(); resolve(); return;
    }
    if (hol.isHoliday && !settings.allowHolidayRecording) {
      root.innerHTML = `${headerHTML({ back: true, title: `${modeLabel(mode)} اليوم` })}
        <main class="page mid">${emptyState({ iconName: "calendar", title: "اليوم إجازة", text: `${escapeHtml(hol.title || "إجازة")} — لا يمكن رصد ${modeLabel(mode)} في أيام الإجازات.`, action: `<a class="btn primary" href="#/">العودة للرئيسية</a>` })}</main>`;
      applySyncChip(window.__rasedSync || {});
      bindHeaderDate(); resolve(); return;
    }
    try { await applyExcusedRoster(today); } catch (e) { console.warn(e); }
    const students = await listStudents({ stageId: stage });
    if (!students.length) {
      root.innerHTML = `${headerHTML({ back: true })}<main class="page mid">${emptyState({ iconName: "users", title: "لا يوجد طلاب", text: "لم يتم العثور على طلاب في هذه المرحلة. أضف الطلاب من لوحة الإدارة." })}</main>`;
      applySyncChip(window.__rasedSync || {});
      bindHeaderDate(); resolve(); return;
    }
    const records = await getDayMap(today, mode);
    const roster = await listExcusedRoster();
    const autoExcused = new Set(roster.filter(r => (!r.from || today >= r.from) && (!r.to || today <= r.to)).map(r => r.studentId));
    const sessions = await getSessions(today);    const state = {
      mode, stage, today, students, records,
      filterClass: "all", q: "", onlyMarked: false,
      absent: new Set(), late: new Set(), excused: new Set(), lateTimes: new Map(), autoExcused,
      undoStack: []
    };
    for (const s of students) {
      const r = records.get(s.id);
      if (r?.status === "absent") { state.absent.add(s.id); if (r.excused || autoExcused.has(s.id)) state.excused.add(s.id); }
      if (r?.status === "late") { state.late.add(s.id); if (r.lateTime) state.lateTimes.set(s.id, r.lateTime); }
    }
    const stageInfo = STAGES.find(s => s.id === stage);
    const classes = Array.from(new Set(students.map(s => s.classNo))).sort((a, b) => a - b);

    root.innerHTML = `
      ${headerHTML({ compact: true, back: true })}
      <main id="main" class="page">
        <div class="attendance-page">
          <div class="page-top">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span class="badge ${mode === "late" ? "amber" : "red"}">${modeLabel(mode)}</span>
              <span class="badge gray">${escapeHtml(stageInfo?.name || "")}</span>
              <span class="badge green">${formatHijri(today)}هـ</span>
            </div>
            ${mode === "absence" ? `<div class="att-help">
              <span><i class="legend-dot present"></i> حاضر</span>
              <span><i class="legend-dot absent"></i> غائب بدون عذر</span>
              <span><i class="legend-dot excused"></i> غائب بعذر</span>
            </div>` : `<div class="att-help"><span><i class="legend-dot present"></i> حاضر</span><span><i class="legend-dot late"></i> متأخر</span></div>`}
            <h1>رصد ${modeLabel(mode)} — ${escapeHtml(stageInfo?.name || "")}</h1>
            <p>${weekdayName(today)} ${formatGregorianLong(today)} · ${studentCount(students.length)} في ${fmt(classes.length)} فصول.
              ${mode === "absence" ? " نقرة على الطالب: غياب بدون عذر (أحمر) · نقرتان: غياب بعذر (أصفر) · النقر على الغائب يعيده حاضراً." : " اضغط على الطالب لتسجيله متأخراً، واضغط مرة أخرى لإعادته حاضراً."} الحفظ تلقائي.</p>
          </div>

          <div class="att-toolbar" id="attToolbar">
            <div class="toolbar-row">
              <div class="class-chips" id="classChips"></div>
              <div class="search-box">${icon("search", 20)}<input type="search" id="attSearch" placeholder="ابحث باسم الطالب…" aria-label="بحث عن طالب"></div>
            </div>
            <div class="toolbar-row">
              <div class="bulk-actions">
                <button type="button" class="btn danger" data-bulk="absent">${icon("user", 20)}<span>الجميع ${mode === "late" ? "متأخرون" : "غائبون"}</span></button>
                <button type="button" class="btn soft" data-bulk="present">${icon("check", 20)}<span>الجميع حاضرون</span></button>
                <button type="button" class="btn ghost" id="onlyMarkedBtn">${icon("filter", 18)}<span>${mode === "late" ? "المتأخرون فقط" : "الغائبون فقط"}</span></button>
              </div>
              <div class="toolbar-sep"></div>
              <div class="att-meta">
                <span id="saveState" class="badge green">${icon("check", 14)} محفوظ</span>
                <span class="dot"></span>
                <span id="toolbarSummary">${summaryText()}</span>
              </div>
            </div>
          </div>

          <div class="roster" id="roster"></div>
        </div>
      </main>
      <div class="att-summary-bar">
        <div class="att-summary-inner">
          <div class="summary-info" id="summaryInfo"></div>
          <div class="summary-actions">
            <a class="btn ghost" href="#/stage/${mode}" id="backToStages">${icon("back", 20)}<span>المراحل</span></a>
            <button class="btn primary lg" id="saveAndHome">${icon("save", 22)}<span>حفظ والانتقال لاختيار المراحل</span></button>
          </div>
        </div>
      </div>
      <div class="scroll-fabs">
        <button class="scroll-fab" data-scroll="top" aria-label="أعلى الصفحة">${icon("arrowUp", 20)}</button>
        <button class="scroll-fab" data-scroll="bottom" aria-label="أسفل الصفحة">${icon("arrowDown", 20)}</button>
      </div>`;

    applySyncChip(window.__rasedSync || {});
    bindHeaderDate();

    const chipsEl = $("#classChips");
    const rosterEl = $("#roster");
    const searchEl = $("#attSearch");
    let saveTimer = null;

    function classStats(c) {
      const list = state.students.filter(s => s.classNo === c);
      const marked = list.filter(s => state.mode === "late" ? state.late.has(s.id) : state.absent.has(s.id)).length;
      const excused = list.filter(s => state.absent.has(s.id) && state.excused.has(s.id)).length;
      return { total: list.length, marked, excused };
    }
    function summaryText() {
      const marked = state.mode === "late" ? state.late.size : state.absent.size;
      const exc = state.mode === "absence" ? state.excused.size : 0;
      return `<strong>${fmt(marked)}</strong> ${modeNoun(state.mode)}${exc ? ` <span style="color:var(--gold);font-weight:800">(${fmt(exc)} بعذر)</span>` : ""} من ${fmt(state.students.length)}`;
    }
    function renderChips() {
      const allMarked = state.mode === "late" ? state.late.size : state.absent.size;
      chipsEl.innerHTML = `<button type="button" class="chip ${state.filterClass === "all" ? "active" : ""}" data-class="all">كل الفصول <span class="chip-count">${fmt(allMarked)}</span></button>` +
        classes.map(c => {
          const st = classStats(c);
          return `<button type="button" class="chip ${String(state.filterClass) === String(c) ? "active" : ""}" data-class="${c}">${escapeHtml(classLabel(c, state.stage))} <span class="chip-count">${st.marked ? fmt(st.marked) : fmt(st.total)}</span></button>`;
        }).join("");
      chipsEl.querySelectorAll("[data-class]").forEach(b => b.addEventListener("click", () => {
        state.filterClass = b.dataset.class;
        renderChips(); renderRoster();
      }));
    }
    function filteredStudents() {
      let list = state.students;
      if (state.filterClass !== "all") list = list.filter(s => String(s.classNo) === String(state.filterClass));
      const q = normalizeArabic(state.q);
      if (q) list = list.filter(s => normalizeArabic(s.name).includes(q) || String(s.studentId).includes(q));
      if (state.onlyMarked) list = list.filter(s => state.mode === "late" ? state.late.has(s.id) : state.absent.has(s.id));
      return list;
    }
    function statusOf(s) {
      if (state.mode === "late") return state.late.has(s.id) ? "late" : "present";
      return state.absent.has(s.id) ? "absent" : "present";
    }
    function isExcused(s) { return state.mode === "absence" && state.absent.has(s.id) && state.excused.has(s.id); }
    function cardHTML(s) {
      const st = statusOf(s);
      const exc = isExcused(s);
      const cls = st === "present" ? "present" : st === "absent" && exc ? "excused" : st;
      const ic = st === "absent" ? (exc ? "file" : "x") : st === "late" ? "clock" : "check";
      const lateTime = st === "late" ? (state.lateTimes.get(s.id) || "") : "";
      const label = st === "absent" ? (exc ? "غائب بعذر" : "غائب بدون عذر") : st === "late" ? (lateTime ? `متأخر ${lateTime}` : "متأخر") : "حاضر";
      return `<button type="button" class="student-card ${cls}" data-student="${s.id}" aria-pressed="${st !== "present"}" aria-label="${escapeHtml(s.name)} — ${label}" title="نقرة: ${st === "present" ? (state.mode === "late" ? "متأخر" : "غياب بدون عذر") : "حاضر"}${state.mode === "absence" ? " · نقرتان: غياب بعذر" : ""}">
        <span class="s-index">${escapeHtml(s.studentId.slice(-4))}</span>
        <span class="s-state">${icon(ic, 22)}</span>
        <span class="s-body"><span class="s-name">${escapeHtml(s.name)}</span><span class="s-meta">${escapeHtml(classLabel(s.classNo, s.stageId))} · ${label}</span></span>
      </button>`;
    }
    function renderRoster() {
      const list = filteredStudents();
      if (!list.length) {
        rosterEl.innerHTML = emptyState({ iconName: "search", title: "لا توجد نتائج", text: "جرّب تغيير الفصل أو كلمة البحث." });
        updateSummary(); return;
      }
      const groups = new Map();
      for (const s of list) {
        if (!groups.has(s.classNo)) groups.set(s.classNo, []);
        groups.get(s.classNo).push(s);
      }
      rosterEl.innerHTML = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]).map(([c, arr]) => {
        const st = classStats(c);
        const marked = state.mode === "late" ? arr.filter(s => state.late.has(s.id)).length : arr.filter(s => state.absent.has(s.id)).length;
        return `<section class="class-group" data-class-group="${c}">
          <div class="class-head">
            <div class="class-title">${escapeHtml(classLabel(c, state.stage))}</div>
            <div class="class-counts">
              <span class="c">${fmt(arr.length)} طالباً</span>
              ${marked ? `<span class="c ${state.mode === "late" ? "amber" : "red"}">${fmt(marked)} ${modeNoun(state.mode)}</span>` : `<span class="c">لا يوجد ${modeNoun(state.mode)}</span>`}
              ${st.excused ? `<span class="c gold">${fmt(st.excused)} بعذر</span>` : ""}
            </div>
            <div class="class-actions">
              <button type="button" class="btn sm ${state.mode === "late" ? "warn" : "danger"}" data-class-bulk="marked" data-class-no="${c}">الكل ${mode === "late" ? "متأخر" : "غائب"}</button>
              <button type="button" class="btn sm ghost" data-class-bulk="present" data-class-no="${c}">الكل حاضر</button>
            </div>
          </div>
          <div class="students-grid">${arr.map(cardHTML).join("")}</div>
        </section>`;
      }).join("");
      updateSummary();
    }
    function updateSummary() {
      const marked = state.mode === "late" ? state.late.size : state.absent.size;
      const exc = state.mode === "absence" ? state.excused.size : 0;
      const total = state.students.length;
      const present = total - marked;
      const info = $("#summaryInfo");
      if (info) info.innerHTML = `
        <span class="pill ${state.mode === "late" ? "amber" : "red"}">${icon(state.mode === "late" ? "clock" : "user", 16)} ${fmt(marked)} ${modeNoun(state.mode)}</span>
        ${exc ? `<span class="pill gold">${icon("file", 16)} ${fmt(exc)} بعذر</span>` : ""}
        <span class="pill green">${icon("check", 16)} ${fmt(present)} حاضر</span>
        <span class="pill">${fmt(total)} إجمالي</span>`;
      const ts = $("#toolbarSummary");
      if (ts) ts.innerHTML = summaryText();
      $$("[data-class]").forEach(b => {
        if (b.dataset.class === "all") b.querySelector(".chip-count") && (b.querySelector(".chip-count").textContent = fmt(marked));
      });
    }
    async function markSaved() {
      const s = $("#saveState");
      if (!s) return;
      s.className = "badge blue";
      s.innerHTML = `${icon("sync", 14)} جارٍ الحفظ…`;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const el = $("#saveState");
        if (el) { el.className = "badge green"; el.innerHTML = `${icon("check", 14)} محفوظ`; }
      }, 450);
    }
    async function applyStudentState(id, status, excused = false) {
      const s = state.students.find(x => x.id === id);
      if (!s) return;
      if (status === "absent" && state.autoExcused.has(id)) excused = true;
      const lateTime = status === "late" ? nowClock() : "";
      if (status === "present") { state.absent.delete(id); state.late.delete(id); state.excused.delete(id); state.lateTimes.delete(id); }
      else if (status === "late") { state.late.add(id); state.absent.delete(id); state.excused.delete(id); state.lateTimes.set(id, lateTime); }
      else { state.absent.add(id); if (excused) state.excused.add(id); else state.excused.delete(id); }
      const card = rosterEl.querySelector(`[data-student="${cssEscape(id)}"]`);
      if (card) {
        const isAbsent = status === "absent";
        card.classList.toggle("present", status === "present");
        card.classList.toggle("absent", isAbsent && !excused);
        card.classList.toggle("excused", isAbsent && excused);
        card.classList.toggle("late", status === "late");
        card.setAttribute("aria-pressed", status !== "present");
        const label = isAbsent ? (excused ? "غائب بعذر" : "غائب بدون عذر") : status === "late" ? (lateTime ? `متأخر ${lateTime}` : "متأخر") : "حاضر";
        card.setAttribute("aria-label", `${s.name} — ${label}`);
        card.setAttribute("title", `نقرة: ${status === "present" ? (state.mode === "late" ? "متأخر" : "غياب بدون عذر") : "حاضر"}${state.mode === "absence" ? " · نقرتان: غياب بعذر" : ""}`);
        const st = card.querySelector(".s-state");
        if (st) st.innerHTML = icon(isAbsent ? (excused ? "file" : "x") : status === "late" ? "clock" : "check", 22);
        const meta = card.querySelector(".s-meta");
        if (meta) meta.textContent = `${classLabel(s.classNo, s.stageId)} · ${label}`;
        const group = card.closest("[data-class-group]");
        if (group) {
          const arr = state.students.filter(x => x.classNo === Number(group.dataset.classGroup));
          const marked = state.mode === "late" ? arr.filter(x => state.late.has(x.id)).length : arr.filter(x => state.absent.has(x.id)).length;
          const exc = state.mode === "absence" ? arr.filter(x => state.absent.has(x.id) && state.excused.has(x.id)).length : 0;
          const counts = group.querySelector(".class-counts");
          if (counts) counts.innerHTML = `<span class="c">${fmt(arr.length)} طالباً</span>${marked ? `<span class="c ${state.mode === "late" ? "amber" : "red"}">${fmt(marked)} ${modeNoun(state.mode)}</span>` : `<span class="c">لا يوجد ${modeNoun(state.mode)}</span>`}${exc ? `<span class="c gold">${fmt(exc)} بعذر</span>` : ""}`;
        }
      }
      updateSummary();
      markSaved();
      try {
        await setStatus({ date: state.today, studentId: id, stageId: s.stageId, classNo: s.classNo, mode: state.mode, status, excused });
      } catch (e) { toast("تعذر الحفظ المحلي: " + e.message, { type: "error" }); }
    }
    async function singleClick(id) {
      const s = state.students.find(x => x.id === id);
      if (!s) return;
      const cur = statusOf(s);
      if (cur === "present") {
        const t = nowClock();
        await applyStudentState(id, state.mode === "late" ? "late" : "absent", false);
        if (state.mode === "late") toast(`تم تسجيل تأخر ${s.name} — ${t}`, { type: "ok", duration: 2400 });
      } else {
        await applyStudentState(id, "present", false);
      }
    }
    async function doubleClick(id) {
      if (state.mode !== "absence") return;
      await applyStudentState(id, "absent", true);
    }
    let clickTimer = null, pendingId = null;
    function scheduleSingle(id) {
      if (clickTimer) {
        clearTimeout(clickTimer);
        const prev = pendingId;
        clickTimer = null; pendingId = null;
        if (prev && prev !== id) singleClick(prev);
      }
      pendingId = id;
      clickTimer = setTimeout(() => {
        const current = pendingId;
        clickTimer = null; pendingId = null;
        if (current) singleClick(current);
      }, 300);
    }
    function cssEscape(s) { return window.CSS?.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

    rosterEl.addEventListener("click", e => {
      const card = e.target.closest("[data-student]");
      if (card) {
        if (e.detail === 1 || e.detail === 0) scheduleSingle(card.dataset.student);
        return;
      }
      const cb = e.target.closest("[data-class-bulk]");
      if (cb) {
        const c = Number(cb.dataset.classNo);
        if (cb.dataset.classBulk === "present") bulk(c, "present"); else bulk(c, state.mode === "late" ? "late" : "absent");
      }
    });
    rosterEl.addEventListener("dblclick", e => {
      const card = e.target.closest("[data-student]");
      if (!card) return;
      e.preventDefault();
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      pendingId = null;
      doubleClick(card.dataset.student);
    });
    async function bulk(classNo, status) {
      status = state.mode === "late" && status === "absent" ? "late" : status;
      const label = status === "present" ? "حاضرين" : status === "late" ? "متأخرين" : "غائبين";
      if (status !== "present") {
        const n = state.students.filter(s => classNo === "all" || s.classNo === Number(classNo)).length;
        const ok = await confirmDialog({ title: `تسجيل الجميع ${label}`, message: `سيتم تسجيل ${fmt(n)} طالباً ${label} في ${classNo === "all" ? "جميع فصول المرحلة" : classLabel(classNo, state.stage)}. يمكنك التراجع بعد الحفظ.`, confirmText: `نعم، سجّل ${label}`, kind: status === "late" ? "warn" : "danger", iconName: status === "late" ? "clock" : "user" });
        if (!ok) return;
      }
      const affected = state.students.filter(s => classNo === "all" || s.classNo === Number(classNo));
      const prev = affected.map(s => ({ id: s.id, status: statusOf(s), excused: isExcused(s), lateTime: state.lateTimes.get(s.id) || "" }));
      const bulkLateTime = nowClock();
      if (status === "present") {
        for (const s of affected) { state.absent.delete(s.id); state.late.delete(s.id); state.excused.delete(s.id); state.lateTimes.delete(s.id); }
      } else if (status === "late") {
        for (const s of affected) { state.late.add(s.id); state.absent.delete(s.id); state.excused.delete(s.id); state.lateTimes.set(s.id, bulkLateTime); }
      } else {
        for (const s of affected) {
          state.absent.add(s.id);
          if (state.autoExcused.has(s.id)) state.excused.add(s.id); else state.excused.delete(s.id);
          state.lateTimes.delete(s.id);
        }
      }
      renderChips(); renderRoster(); markSaved();
      await bulkSetStatus({ date: state.today, stageId: state.stage, classNo: classNo === "all" ? null : Number(classNo), mode: state.mode, status });
      // ملاحظة: bulkSetStatus مع classNo=null يسجل كل فصول المرحلة
      toast(`تم تسجيل ${fmt(affected.length)} طالباً ${label}${status === "late" ? ` — ${bulkLateTime}` : ""}.`, {
        type: "ok", action: { label: "تراجع", onClick: async () => {
          for (const p of prev) {
            const s = state.students.find(x => x.id === p.id);
            if (!s) continue;
            if (p.status === "present") { state.absent.delete(p.id); state.late.delete(p.id); state.excused.delete(p.id); state.lateTimes.delete(p.id); }
            else if (p.status === "late") { state.late.add(p.id); state.absent.delete(p.id); state.excused.delete(p.id); if (p.lateTime) state.lateTimes.set(p.id, p.lateTime); }
            else { state.absent.add(p.id); if (p.excused || state.autoExcused.has(p.id)) state.excused.add(p.id); else state.excused.delete(p.id); state.lateTimes.delete(p.id); }
            await setStatus({ date: state.today, studentId: p.id, stageId: s.stageId, classNo: s.classNo, mode: state.mode, status: p.status, excused: p.excused });
          }
          renderChips(); renderRoster();
        } }
      });
    }
    root.querySelectorAll("[data-bulk]").forEach(b => b.addEventListener("click", () => bulk("all", b.dataset.bulk)));
    searchEl.addEventListener("input", debounce(() => { state.q = searchEl.value; renderRoster(); }, 180));
    $("#onlyMarkedBtn").addEventListener("click", () => {
      state.onlyMarked = !state.onlyMarked;
      $("#onlyMarkedBtn").classList.toggle("soft", state.onlyMarked);
      $("#onlyMarkedBtn").classList.toggle("ghost", !state.onlyMarked);
      renderRoster();
    });
    $("#saveAndHome").addEventListener("click", () => {
      toast("تم حفظ رصد اليوم. اختر المرحلة التالية.");
      navigate(`#/stage/${mode}`);
    });
    root.querySelectorAll("[data-scroll]").forEach(b => b.addEventListener("click", () => window.scrollTo({ top: b.dataset.scroll === "top" ? 0 : document.body.scrollHeight, behavior: "smooth" })));
    renderChips(); renderRoster(); updateSummary();
    resolve();
  });
}

