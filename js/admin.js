/* ============================================================
   راصد — لوحة الإدارة: الدخول، النظرة العامة، قاعدة الطلاب
   ============================================================ */
import {
  $, $$, icon, fmt, pct, escapeHtml, todayISO, addDays, formatHijri, formatHijriLong, formatGregorianLong,
  weekdayName, lastNDays, STAGES, classLabel, stageName, toCSV, download, readFileText, normalizeArabic,
  parseHijriText, debounce, uid, displayPhone, signToken, activeTermRange, fullYearRange, waLink
} from "./core.js";
import {
  getSettings, saveSettings, listStudents, getStudent, saveStudent, deleteStudent, bulkPutStudents,
  getDayStats, getDayRecords, getSessions, totalsByStudent, listExcuses, listHolidays, hasDemoData, clearDemoData,
  listActions, addAction, setStatus, setExcused, listExcusedRoster, addExcusedStudent, removeExcusedStudent
} from "./db.js";
import {
  headerHTML, applySyncChip, statCard, sectionCard, progressRing, barChart, lineChart, emptyState,
  toast, confirmDialog, modal, avatar, field, chips
} from "./ui.js";
import { renderReports } from "./reports.js";
import { renderWhatsApp, renderWhatsAppHelp, buildMessage } from "./whatsapp.js";
import { renderSettings } from "./settings.js";
import { renderRecurring, renderExcuses, renderNoor } from "./admin-cases.js";
import { renderImportAbsence } from "./admin-import.js";
import { printDailyReport } from "./print.js";

const TABS = [
  { id: "overview", label: "النظرة العامة", icon: "grid" },
  { id: "students", label: "قاعدة الطلاب", icon: "users" },
  { id: "records", label: "سجل الغياب", icon: "clipboard" },
  { id: "late-log", label: "سجل التأخر", icon: "clock" },
  { id: "import-absence", label: "استيراد الغياب", icon: "upload" },
  { id: "recurring", label: "الحالات المتكررة", icon: "alert" },
  { id: "reports", label: "التقارير", icon: "chart" },
  { id: "excuses", label: "الأعذار", icon: "file" },
  { id: "whatsapp", label: "واتساب", icon: "whatsapp" },
  { id: "noor", label: "جسر نور", icon: "sync" },
  { id: "settings", label: "الإعدادات", icon: "settings" }
];

const REMEMBER_KEY = "rased_admin_remember";
const ADMIN_SESSION_VERSION = "2";
const rememberToken = (settings) => signToken(`${settings.adminUsername || "admin"}|${settings.adminPasswordHash || ""}`, "admin-remember");
const isAuthed = (settings) => {
  if (sessionStorage.getItem("rased_admin") === "1" && sessionStorage.getItem("rased_admin_version") === ADMIN_SESSION_VERSION) return true;
  try {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved && saved === rememberToken(settings)) {
      sessionStorage.setItem("rased_admin", "1");
      sessionStorage.setItem("rased_admin_version", ADMIN_SESSION_VERSION);
      sessionStorage.setItem("rased_admin_at", String(Date.now()));
      return true;
    }
  } catch (e) { }
  return false;
};

export async function renderAdmin(root, tab = "overview") {
  const settings = await getSettings();
  if (!isAuthed(settings)) return renderLogin(root, settings, tab);
  if (!TABS.some(t => t.id === tab) && tab !== "whatsapp-help" && tab !== "excused-roster") tab = "overview";
  root.innerHTML = `
    ${headerHTML({ compact: true, back: true })}
    <div class="admin-shell">
      <div class="admin-tabs" role="tablist" aria-label="أقسام الإدارة">
        <div class="admin-tabs-inner">
          ${TABS.map(t => `<a class="admin-tab ${tab === t.id ? "active" : ""}" href="#/admin/${t.id}" role="tab" aria-selected="${tab === t.id}">${icon(t.icon, 20)} ${t.label}</a>`).join("")}
          <button class="btn ghost sm" id="lockAdmin" style="margin-inline-start:auto;flex:none">${icon("lock", 18)} قفل</button>
        </div>
      </div>
      <div class="admin-content" id="adminContent"></div>
    </div>`;
  applySyncChip(window.__rasedSync || {});
  $("#lockAdmin").addEventListener("click", () => {
    sessionStorage.removeItem("rased_admin");
    sessionStorage.removeItem("rased_admin_version");
    sessionStorage.removeItem("rased_admin_at");
    try { localStorage.removeItem(REMEMBER_KEY); } catch (e) { }
    location.hash = "#/admin";
    renderAdmin(root, tab);
  });
  const content = $("#adminContent");
  if (tab === "overview") await renderOverview(content, settings);
  else if (tab === "students") await renderStudents(content, settings);
  else if (tab === "excused-roster") await renderExcusedRoster(content, settings);
  else if (tab === "records") await renderRecords(content, settings);
  else if (tab === "late-log") await renderLateLog(content, settings);
  else if (tab === "import-absence") await renderImportAbsence(content, settings);
  else if (tab === "recurring") await renderRecurring(content, settings);
  else if (tab === "reports") await renderReports(content, settings);
  else if (tab === "excuses") await renderExcuses(content, settings);
  else if (tab === "whatsapp") await renderWhatsApp(content, settings);
  else if (tab === "whatsapp-help") await renderWhatsAppHelp(content, settings);
  else if (tab === "noor") await renderNoor(content, settings);
  else if (tab === "settings") await renderSettings(content, settings);
}

/* ---------------- تسجيل الدخول ---------------- */
function renderLogin(root, settings, tab) {
  let attempts = Number(sessionStorage.getItem("rased_pin_attempts") || 0);
  let lockedUntil = Number(sessionStorage.getItem("rased_pin_locked") || 0);
  root.innerHTML = `
    ${headerHTML({ compact: true, back: true, admin: false })}
    <main class="page mid">
      <div class="admin-login">
        <div class="pin-card" style="max-width:460px;width:100%">
          <div class="pin-icon">${icon("shield", 38)}</div>
          <h1>لوحة الإدارة</h1>
          <p>سجّل الدخول باسم المستخدم وكلمة المرور.</p>
          <form id="loginForm" class="form-grid" autocomplete="on" style="text-align:start;margin-top:14px">
            <label class="field span-2"><span class="field-label">اسم المستخدم</span><input class="input" name="username" id="loginUser" autocomplete="username" value="${escapeHtml(settings.adminUsername || "admin")}" required></label>
            <label class="field span-2"><span class="field-label">كلمة المرور</span><input class="input" type="password" name="password" id="loginPass" autocomplete="current-password" inputmode="text" required></label>
            <label class="mini-row span-2" style="cursor:pointer"><input type="checkbox" name="remember" id="loginRemember" checked style="width:20px;height:20px;accent-color:#0f6b4f"><span class="grow">تذكرني للدخول المباشر في المرات القادمة</span></label>
            <div class="span-2"><button class="btn primary lg" type="submit" style="width:100%">${icon("check", 20)} دخول</button></div>
          </form>
          <div class="pin-error" id="pinError" style="margin-top:10px"></div>
          <div class="pin-hint">اسم المستخدم الافتراضي: admin — كلمة المرور الافتراضية: 0000. يمكن تغييرهما من الإعدادات بعد الدخول. سيقوم المتصفح بعرض حفظ كلمة المرور.</div>
        </div>
      </div>
    </main>`;
  applySyncChip(window.__rasedSync || {});
  const err = $("#pinError");
  function fail(msg) {
    err.textContent = msg;
    attempts++;
    sessionStorage.setItem("rased_pin_attempts", attempts);
    if (attempts >= 5) {
      lockedUntil = Date.now() + 30000;
      sessionStorage.setItem("rased_pin_locked", lockedUntil);
      err.textContent = "تم إيقاف المحاولات 30 ثانية لحماية النظام.";
    }
  }
  $("#loginForm").addEventListener("submit", e => {
    e.preventDefault();
    if (Date.now() < lockedUntil) { err.textContent = "يرجى الانتظار قبل المحاولة مجدداً."; return; }
    const username = String($("#loginUser").value || "").trim();
    const password = String($("#loginPass").value || "");
    const expectedUser = String(settings.adminUsername || "admin");
    const expectedHash = String(settings.adminPasswordHash || "");
    if (username === expectedUser && signToken(password, "admin-password") === expectedHash) {
      sessionStorage.setItem("rased_admin", "1");
      sessionStorage.setItem("rased_admin_version", ADMIN_SESSION_VERSION);
      sessionStorage.setItem("rased_admin_at", String(Date.now()));
      sessionStorage.removeItem("rased_pin_attempts");
      sessionStorage.removeItem("rased_pin_locked");
      try {
        if ($("#loginRemember")?.checked) localStorage.setItem(REMEMBER_KEY, rememberToken(settings));
        else localStorage.removeItem(REMEMBER_KEY);
      } catch (e2) { }
      renderAdmin(root, tab);
    } else {
      fail("اسم المستخدم أو كلمة المرور غير صحيحة.");
    }
  });
}

/* ---------------- النظرة العامة ---------------- */
async function renderOverview(root, settings) {
  const today = todayISO();
  const [stats, students, sessions, todayRecs, pendingExcuses, totals, demo, holidays] = await Promise.all([
    getDayStats(today), listStudents(), getSessions(today), getDayRecords(today, "absence"),
    listExcuses({ status: "pending" }), totalsByStudent(activeTermRange(settings).from, today),
    hasDemoData(), listHolidays()
  ]);
  const cases = Array.from(totals.entries()).map(([sid, t]) => ({ sid, ...t })).filter(x => x.absent >= 3);
  const smap = new Map(students.map(s => [s.id, s]));
  const term = activeTermRange(settings);
  const termOut = today < term.from || today > term.to;
  const viewStats = termOut ? zeroStats(stats) : stats;
  const effectiveSessions = termOut ? [] : sessions;
  const effectiveRecs = termOut ? [] : todayRecs;
  const days = lastNDays(7);
  let dayStats = await Promise.all(days.map(d => getDayStats(d)));
  if (termOut) dayStats = dayStats.map(s => ({ ...s, absent: 0, late: 0 }));
  const yesterday = dayStats[5] || { absent: 0, late: 0 };
  const diff = viewStats.absent - (yesterday.absent || 0);
  const classes = new Set(students.map(s => `${s.stageId}-${s.classNo}`));
  const recorded = new Set(effectiveSessions.filter(s => s.mode === "absence").map(s => `${s.stageId}-${s.classNo}`));
  const unrecorded = Array.from(classes).filter(k => !recorded.has(k)).map(k => {
    const [st, c] = k.split("-").map(Number);
    return { stageId: st, classNo: c };
  });
  const byClass = new Map();
  for (const r of effectiveRecs) {
    if (r.status !== "absent") continue;
    const k = `${r.stageId}-${r.classNo}`;
    const cur = byClass.get(k) || { stageId: r.stageId, classNo: r.classNo, count: 0, excused: 0 };
    cur.count++; if (r.excused) cur.excused++;
    byClass.set(k, cur);
  }
  const topClasses = Array.from(byClass.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  const stageBars = [1, 2, 3].map(id => ({ label: STAGES[id - 1].short, value: viewStats.perStage[id]?.absent || 0, color: id === 1 ? "#0f6b4f" : id === 2 ? "#0f766e" : "#115e59" }));
  const hol = holidays.find(h => h.date === today);
  const topStage = [1, 2, 3].map(id => ({ id, n: viewStats.perStage[id]?.absent || 0 })).sort((a, b) => b.n - a.n)[0];
  const pending = pendingExcuses.length;
  const analysis = [];
  if (termOut) analysis.push({ tone: "danger", icon: "calendar", html: `تاريخ اليوم خارج نطاق <b>${term.label}</b> (${formatHijri(term.from)}هـ — ${formatHijri(term.to)}هـ). تبدأ العدادات الجديدة عند دخول الفترة، أو عدّل تواريخها من <a href="#/admin/settings">الإعدادات</a>.` });
  else if (!viewStats.recordedClasses) analysis.push({ tone: "warn", icon: "info", html: "لم يبدأ رصد اليوم بعد. ابدأ من زر <b>رصد الغياب</b> في الصفحة الرئيسية." });
  else {
    analysis.push({ tone: "", icon: "chart", html: `تم رصد <b>${fmt(viewStats.recordedClasses)}</b> من <b>${fmt(viewStats.totalClasses)}</b> فصلاً اليوم، ونسبة الغياب <b>${pct(viewStats.absent, viewStats.totalStudents)}%</b> من إجمالي الطلاب.` });
    if (topStage.n) analysis.push({ tone: "warn", icon: "users", html: `أعلى غياب في <b>${stageName(topStage.id)}</b> بواقع <b>${fmt(topStage.n)}</b> طالباً.` });
    if (topClasses[0]) analysis.push({ tone: "danger", icon: "alert", html: `الفصل الأكثر غياباً: <b>${classLabel(topClasses[0].classNo, topClasses[0].stageId)} — ${stageName(topClasses[0].stageId)}</b> (${fmt(topClasses[0].count)} طالباً).` });
    if (diff !== 0) analysis.push({ tone: diff > 0 ? "warn" : "", icon: diff > 0 ? "arrowUp" : "arrowDown", html: `الغياب ${diff > 0 ? "ارتفع" : "انخفض"} عن أمس بمقدار <b>${fmt(Math.abs(diff))}</b> طالباً.` });
  }
  if (!termOut && unrecorded.length) analysis.push({ tone: "warn", icon: "clipboard", html: `يوجد <b>${fmt(unrecorded.length)}</b> فصلاً لم يُرصد اليوم: ${unrecorded.slice(0, 5).map(x => classLabel(x.classNo, x.stageId)).join("، ")}${unrecorded.length > 5 ? "…" : ""}.` });
  if (pending) analysis.push({ tone: "warn", icon: "file", html: `يوجد <b>${fmt(pending)}</b> عذراً بانتظار المراجعة. <a href="#/admin/excuses">مراجعة الأعذار</a>` });
  if (cases.length) analysis.push({ tone: "danger", icon: "alert", html: `يوجد <b>${fmt(cases.length)}</b> طالباً بلغوا حد المتابعة (3 أيام غياب أو أكثر). <a href="#/admin/recurring">عرض الحالات</a>` });
  if (!analysis.length) analysis.push({ tone: "", icon: "check", html: "كل المؤشرات طبيعية اليوم." });

  root.innerHTML = `
    <div class="admin-head">
      <div><h1>النظرة العامة</h1><p>${weekdayName(today)} ${formatHijriLong(today)} — ${formatGregorianLong(today)} · ${activeTermRange(settings).label}</p></div>
      <div class="admin-head-actions">
        <a class="btn ghost" href="#/stage/absence">${icon("user", 20)} رصد اليوم</a>
        <button class="btn ghost" id="printDaily">${icon("print", 20)} طباعة كشف اليوم</button>
        <a class="btn primary" href="#/admin/reports">${icon("chart", 20)} التقارير</a>
      </div>
    </div>
    ${demo && !settings.demoDismissed ? `<div class="demo-banner"><span>${icon("info", 20)}</span><span class="grow">وضع العرض: البيانات الحالية تجريبية. يمكنك حذفها من الإعدادات والبدء الفعلي.</span><a class="btn sm ghost" href="#/admin/settings">الإعدادات</a></div>` : ""}
    ${hol ? `<div class="callout warn" style="margin-bottom:14px">اليوم إجازة: <b>${escapeHtml(hol.title)}</b> — لا يحتسب ضمن أيام الغياب.</div>` : ""}

    <div class="overview-cards">
      ${statCard({ label: "إجمالي الطلاب", value: fmt(viewStats.totalStudents), iconName: "users", tone: "green", sub: `${fmt(viewStats.totalClasses)} فصلاً` })}
      ${statCard({ label: "غائب اليوم", value: fmt(viewStats.absent), iconName: "user", tone: "red", sub: `${fmt(viewStats.unexcusedAbsent)} بدون عذر · ${fmt(viewStats.excusedAbsent)} بعذر` })}
      ${statCard({ label: "متأخر اليوم", value: fmt(viewStats.late), iconName: "clock", tone: "amber", sub: "حالات التأخر المسجلة" })}
      ${statCard({ label: "الفصول المرصودة", value: `${fmt(viewStats.recordedClasses)} / ${fmt(viewStats.totalClasses)}`, iconName: "clipboard", tone: "blue", sub: termOut ? "لم تبدأ الفترة النشطة" : unrecorded.length ? `${fmt(unrecorded.length)} فصلاً بانتظار الرصد` : "اكتمل الرصد" })}
      ${statCard({ label: "الحالات المتكررة", value: fmt(cases.length), iconName: "alert", tone: "red", sub: "بلغوا 3 أيام أو أكثر", href: "#/admin/recurring" })}
      ${statCard({ label: "أعذار بانتظار المراجعة", value: fmt(pending), iconName: "file", tone: "gold", sub: "واردة من أولياء الأمور", href: "#/admin/excuses" })}
    </div>

    <div class="overview-grid">
      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("chart", 22)}<div><h2>غياب اليوم حسب المرحلة</h2><p>عدد الطلاب الغائبين في كل مرحلة</p></div></div>
          <div class="section-action">${progressRing(viewStats.recordedClasses, viewStats.totalClasses, 72, 7)}</div></div>
        <div class="section-body">
          ${barChart(stageBars, { height: 150 })}
          <div class="chart-legend"><span class="key"><span class="sw" style="background:#0f6b4f"></span> الأول المتوسط</span><span class="key"><span class="sw" style="background:#0f766e"></span> الثاني المتوسط</span><span class="key"><span class="sw" style="background:#115e59"></span> الثالث المتوسط</span></div>
        </div>
      </section>
      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("alert", 22)}<div><h2>تحليل غياب اليوم</h2><p>قراءة سريعة لأهم المؤشرات</p></div></div></div>
        <div class="section-body"><div class="analysis-list">
          ${analysis.map(a => `<div class="analysis-item ${a.tone}"><span class="ai">${icon(a.icon, 18)}</span><div>${a.html}</div></div>`).join("")}
        </div></div>
      </section>
    </div>

    <div class="overview-grid equal" style="margin-top:18px">
      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("chart", 22)}<div><h2>اتجاه الغياب — آخر 7 أيام</h2><p>إجمالي الغائبين يومياً</p></div></div></div>
        <div class="section-body">${lineChart(dayStats.map(s => s.absent), days.map(d => weekdayName(d).replace("ال", "")), { height: 150 })}</div>
      </section>
      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("clipboard", 22)}<div><h2>الفصول الأكثر غياباً اليوم</h2></div></div><div class="section-action"><a class="btn ghost sm" href="#/admin/reports">تقرير مفصّل</a></div></div>
        <div class="section-body flush">
          ${topClasses.length ? `<div class="table-wrap" style="border:0"><table class="data-table" style="min-width:0"><tbody>
            ${topClasses.map((c, i) => `<tr><td style="width:42px" class="num">${i + 1}</td><td><b>${escapeHtml(classLabel(c.classNo, c.stageId))}</b> — ${escapeHtml(stageName(c.stageId))}</td><td style="width:90px"><span class="badge red">${fmt(c.count)} غائب</span></td></tr>`).join("")}
          </tbody></table></div>` : emptyState({ iconName: "check", title: "لا يوجد غياب مسجل", text: "جميع الطلاب حاضرون حتى الآن." })}
        </div>
      </section>
    </div>

    <div class="overview-grid equal" style="margin-top:18px">
      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("alert", 22)}<div><h2>أبرز الحالات المتكررة</h2><p>طلاب بلغوا 3 أيام أو أكثر</p></div></div><div class="section-action"><a class="btn ghost sm" href="#/admin/recurring">كل الحالات</a></div></div>
        <div class="section-body flush">
          ${cases.length ? `<div class="table-wrap" style="border:0"><table class="data-table" style="min-width:0"><tbody>
            ${cases.sort((a, b) => b.absent - a.absent).slice(0, 6).map(c => { const s = smap.get(c.sid); return s ? `<tr><td><div class="name-cell">${avatar(s.name, s.stageId)}<div><span class="nm">${escapeHtml(s.name)}</span><span class="sub">${escapeHtml(classLabel(s.classNo, s.stageId))} · ${escapeHtml(stageName(s.stageId))}</span></div></div></td><td style="width:100px"><span class="badge ${c.absent >= 10 ? "red" : c.absent >= 5 ? "amber" : "gray"}">${fmt(c.absent)} أيام</span></td><td style="width:80px"><a class="btn ghost sm" href="#/admin/recurring">إجراء</a></td></tr>` : ""; }).join("")}
          </tbody></table></div>` : emptyState({ iconName: "check", title: "لا توجد حالات متكررة", text: "لم يبلغ أي طالب حد المتابعة بعد." })}
        </div>
      </section>
      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("info", 22)}<div><h2>ملخص سريع</h2></div></div></div>
        <div class="section-body">
          <div class="analysis-list">
            <div class="analysis-item"><span class="ai">${icon("check", 18)}</span><div>نسبة الحضور اليوم: <b>${pct(viewStats.totalStudents - viewStats.absent, viewStats.totalStudents)}%</b></div></div>
            <div class="analysis-item"><span class="ai">${icon("users", 18)}</span><div>عدد الطلاب الحاضرين: <b>${fmt(viewStats.totalStudents - viewStats.absent)}</b> طالباً</div></div>
            <div class="analysis-item ${unrecorded.length && !termOut ? "warn" : ""}"><span class="ai">${icon("clipboard", 18)}</span><div>${termOut ? "لم تبدأ الفترة الدراسية النشطة بعد." : unrecorded.length ? `فصول لم تُرصد: <b>${fmt(unrecorded.length)}</b>` : "تم رصد جميع الفصول اليوم."}</div></div>
            <div class="analysis-item"><span class="ai">${icon("file", 18)}</span><div>سجلات اليوم: <b>${fmt(viewStats.absent + viewStats.late)}</b> حالة غياب وتأخر</div></div>
          </div>
        </div>
      </section>
    </div>

    <div style="text-align:center;margin-top:22px"><a class="btn ghost" href="#/">${icon("home", 20)} العودة للرئيسية</a></div>`;

  $("#printDaily")?.addEventListener("click", () => printDailyReport({ date: today, records: effectiveRecs, students, settings }));
}

/* ---------------- طلاب ذوي الأعذار ---------------- */
const excusedRosterState = { from: todayISO(), to: "", reason: "عذر مستمر", q: "", stage: "", classNo: "" };

async function renderExcusedRoster(root, settings) {
  const allStudents = await listStudents({ includeInactive: true });
  const smap = new Map(allStudents.map(s => [s.id, s]));
  const roster = await listExcusedRoster();
  const rosterIds = new Set(roster.map(r => r.studentId));
  const todayRecs = await getDayRecords(todayISO(), "absence");
  const todayMap = new Map(todayRecs.map(r => [r.studentId, r]));
  const q = normalizeArabic(excusedRosterState.q);

  let available = allStudents.filter(s => !rosterIds.has(s.id) && s.active !== false);
  if (excusedRosterState.stage) available = available.filter(s => Number(s.stageId) === Number(excusedRosterState.stage));
  if (excusedRosterState.classNo) available = available.filter(s => Number(s.classNo) === Number(excusedRosterState.classNo));
  if (q) available = available.filter(s => normalizeArabic(s.name).includes(q) || String(s.studentId).includes(q));
  available.sort((a, b) => a.stageId - b.stageId || a.classNo - b.classNo || a.name.localeCompare(b.name, "ar"));
  const shown = available.slice(0, 60);

  root.innerHTML = `
    <div class="admin-head">
      <div><h1>طلاب ذوي الأعذار</h1><p>اختر الطلاب الذين يُرصد غيابهم بعذر تلقائياً، مع تحديد مدة العذر.</p></div>
      <div class="admin-head-actions"><a class="btn ghost" href="#/admin/records">${icon("clipboard", 20)} سجل الغياب</a></div>
    </div>
    <div class="callout ok" style="margin-bottom:16px">
      بمجرد إضافة الطالب يُسجَّل <b>غائباً بعذر</b> لليوم تلقائياً، ويستمر رصده بعذر في الأيام التالية ضمن المدة المحددة، ويظهر أصفر في شاشة الرصد.
    </div>
    <section class="section-card">
      <div class="section-head"><div class="section-title">${icon("calendar", 22)}<div><h2>مدة العذر الافتراضية للطلاب الجدد</h2><p>تُطبق على الطالب عند إضافته، ويمكن ترك نهاية المدة فارغة لعذر مستمر.</p></div></div></div>
      <div class="section-body">
        <div class="form-grid">
          <label class="field"><span class="field-label">من تاريخ</span><input class="input" type="date" id="exr-from" value="${excusedRosterState.from}"></label>
          <label class="field"><span class="field-label">إلى تاريخ (اختياري)</span><input class="input" type="date" id="exr-to" value="${excusedRosterState.to}"></label>
          <label class="field span-2"><span class="field-label">سبب العذر</span><input class="input" id="exr-reason" value="${escapeHtml(excusedRosterState.reason)}" placeholder="مثال: عذر طبي / إعفاء"></label>
        </div>
        <div class="table-toolbar" style="padding:14px 0 0;border:0;background:transparent">
          <div class="search-box" style="min-width:250px">${icon("search", 18)}<input type="search" id="exr-search" placeholder="ابحث باسم الطالب لإضافته…" value="${escapeHtml(excusedRosterState.q)}"></div>
          <select class="input" id="exr-stage" style="max-width:180px"><option value="">كل المراحل</option>${STAGES.map(s => `<option value="${s.id}" ${String(excusedRosterState.stage) === String(s.id) ? "selected" : ""}>${s.name}</option>`).join("")}</select>
          <select class="input" id="exr-class" style="max-width:140px"><option value="">كل الفصول</option>${Array.from({ length: 9 }, (_, i) => i + 1).map(c => `<option value="${c}" ${String(excusedRosterState.classNo) === String(c) ? "selected" : ""}>${classLabel(c, excusedRosterState.stage)}</option>`).join("")}</select>
          <span class="badge gray">${fmt(shown.length)} من ${fmt(available.length)}</span>
        </div>
      </div>
    </section>

    <div class="section-gap"></div>
    <section class="section-card">
      <div class="section-head"><div class="section-title">${icon("heart", 22)}<div><h2>الطلاب المسجلون حالياً</h2><p>${fmt(roster.length)} طالباً — يُرصد غيابهم بعذر تلقائياً.</p></div></div></div>
      <div class="section-body flush">
        ${roster.length ? `<div class="table-wrap" style="border:0"><table class="data-table"><thead><tr><th>الطالب</th><th>الفصل</th><th>من</th><th>إلى</th><th>السبب</th><th>اليوم</th><th></th></tr></thead><tbody>
          ${roster.map(row => {
            const s = smap.get(row.studentId);
            if (!s) return "";
            const rec = todayMap.get(row.studentId);
            return `<tr>
              <td><div class="name-cell">${avatar(s.name, s.stageId)}<div><span class="nm">${escapeHtml(s.name)}</span><span class="sub">${escapeHtml(s.studentId)}</span></div></div></td>
              <td>${escapeHtml(classLabel(s.classNo, s.stageId))}</td>
              <td class="num">${formatHijri(row.from)}هـ</td>
              <td class="num">${row.to ? formatHijri(row.to) + "هـ" : "مستمر"}</td>
              <td>${escapeHtml(row.reason || "عذر مستمر")}</td>
              <td>${rec?.excused ? `<span class="badge gold">غائب بعذر</span>` : `<span class="badge gray">لم يُرصد بعد</span>`}</td>
              <td><button class="btn ghost sm" data-remove-excused="${row.studentId}">${icon("trash", 16)} إزالة</button></td>
            </tr>`;
          }).join("")}
        </tbody></table></div>` : emptyState({ iconName: "heart", title: "لا يوجد طلاب ذوو أعذار", text: "ابحث عن طالب من القائمة أدناه وأضفه ليُسجَّل بعذر تلقائياً." })}
      </div>
    </section>

    <div class="section-gap"></div>
    <section class="section-card">
      <div class="section-head"><div class="section-title">${icon("plus", 22)}<div><h2>إضافة طالب</h2><p>اضغط «إضافة» أمام اسم الطالب، وسيُسجَّل بعذر فوراً.</p></div></div></div>
      <div class="section-body flush">
        ${shown.length ? `<div class="table-wrap" style="border:0"><table class="data-table"><thead><tr><th>الطالب</th><th>المرحلة</th><th>الفصل</th><th>الجوال</th><th></th></tr></thead><tbody>
          ${shown.map(s => `<tr>
            <td><div class="name-cell">${avatar(s.name, s.stageId)}<div><span class="nm">${escapeHtml(s.name)}</span><span class="sub">${escapeHtml(s.studentId)}</span></div></div></td>
            <td>${escapeHtml(stageName(s.stageId))}</td>
            <td>${escapeHtml(classLabel(s.classNo, s.stageId))}</td>
            <td dir="ltr">${escapeHtml(displayPhone(s.phone))}</td>
            <td><button class="btn primary sm" data-add-excused="${s.id}">${icon("plus", 16)} إضافة</button></td>
          </tr>`).join("")}
        </tbody></table></div>
        ${available.length > 60 ? `<p class="legal" style="padding:10px 14px">تُعرض أول 60 نتيجة. استخدم البحث لتضييق القائمة.</p>` : ""}` : emptyState({ iconName: "check", title: "لا يوجد طلاب متاحون", text: "جميع الطلاب المطابقين مسجلون مسبقاً أو لا توجد نتائج." })}
      </div>
    </section>`;

  $("#exr-from").addEventListener("change", e => { excusedRosterState.from = e.target.value || todayISO(); });
  $("#exr-to").addEventListener("change", e => { excusedRosterState.to = e.target.value; });
  $("#exr-reason").addEventListener("input", e => { excusedRosterState.reason = e.target.value; });
  $("#exr-search").addEventListener("input", debounce(e => { excusedRosterState.q = e.target.value; renderExcusedRoster(root, settings); }, 250));
  $("#exr-stage").addEventListener("change", e => { excusedRosterState.stage = e.target.value; renderExcusedRoster(root, settings); });
  $("#exr-class").addEventListener("change", e => { excusedRosterState.classNo = e.target.value; renderExcusedRoster(root, settings); });
  $$("[data-add-excused]").forEach(b => b.addEventListener("click", async () => {
    if (excusedRosterState.to && excusedRosterState.to < excusedRosterState.from) { toast("تاريخ النهاية قبل البداية.", { type: "error" }); return; }
    await addExcusedStudent({ studentId: b.dataset.addExcused, from: excusedRosterState.from, to: excusedRosterState.to, reason: excusedRosterState.reason });
    toast("تمت إضافة الطالب إلى طلاب ذوي الأعذار، وسيُسجَّل بعذر في أيام الدراسة.");
    renderExcusedRoster(root, settings);
  }));
  $$("[data-remove-excused]").forEach(b => b.addEventListener("click", async () => {
    const s = smap.get(b.dataset.removeExcused);
    const ok = await confirmDialog({ title: "إزالة العذر التلقائي", message: `سيتم إيقاف الرصد التلقائي بعذر للطالب «${s?.name || ""}». إذا كان غياب اليوم قد سُجّل تلقائياً فسيُعاد حاضراً. هل تريد المتابعة؟`, confirmText: "إزالة", iconName: "trash" });
    if (!ok) return;
    await removeExcusedStudent(b.dataset.removeExcused);
    toast("تم إيقاف العذر التلقائي.");
    renderExcusedRoster(root, settings);
  }));
}

/* ---------------- سجل الغياب (تعديل نوع الغياب) ---------------- */
const recordsState = { date: todayISO(), mode: "absence", stage: "", classNo: "", q: "" };

async function renderRecords(root, settings) {
  const students = await listStudents({ includeInactive: true });
  const smap = new Map(students.map(s => [s.id, s]));
  const all = await getDayRecords(recordsState.date, recordsState.mode);
  let list = all.filter(r => r.status !== "present");
  if (recordsState.stage) list = list.filter(r => Number(r.stageId) === Number(recordsState.stage));
  if (recordsState.classNo) list = list.filter(r => Number(r.classNo) === Number(recordsState.classNo));
  const q = normalizeArabic(recordsState.q);
  if (q) list = list.filter(r => normalizeArabic(smap.get(r.studentId)?.name || "").includes(q));
  list.sort((a, b) => (a.stageId - b.stageId) || (a.classNo - b.classNo) || (smap.get(a.studentId)?.name || "").localeCompare(smap.get(b.studentId)?.name || "", "ar"));
  const excused = list.filter(r => r.excused).length;
  const unexcused = list.filter(r => !r.excused).length;

  root.innerHTML = `
    <div class="admin-head">
      <div><h1>سجل الغياب والتأخر</h1><p>يمكنك هنا تعديل نوع الغياب بين «بعذر» و«بدون عذر»، أو إعادة الطالب إلى «حاضر».</p></div>
      <div class="admin-head-actions">
        <a class="btn ghost" href="#/admin/reports">${icon("chart", 20)} التقارير</a>
        <a class="btn ghost" href="#/stage/${recordsState.mode}">${icon("user", 20)} رصد اليوم</a>
      </div>
    </div>
    <section class="section-card">
      <div class="table-toolbar">
        <label class="field" style="min-width:170px"><span class="field-label">التاريخ</span><input class="input" type="date" id="recDate" value="${recordsState.date}"></label>
        <label class="field" style="min-width:150px"><span class="field-label">النوع</span><select class="input" id="recMode"><option value="absence" ${recordsState.mode === "absence" ? "selected" : ""}>الغياب</option><option value="late" ${recordsState.mode === "late" ? "selected" : ""}>التأخر</option></select></label>
        <label class="field" style="min-width:170px"><span class="field-label">المرحلة</span><select class="input" id="recStage"><option value="">كل المراحل</option>${STAGES.map(s => `<option value="${s.id}" ${String(recordsState.stage) === String(s.id) ? "selected" : ""}>${s.name}</option>`).join("")}</select></label>
        <label class="field" style="min-width:140px"><span class="field-label">الفصل</span><select class="input" id="recClass"><option value="">كل الفصول</option>${Array.from({ length: 9 }, (_, i) => i + 1).map(c => `<option value="${c}" ${String(recordsState.classNo) === String(c) ? "selected" : ""}>${classLabel(c, recordsState.stage)}</option>`).join("")}</select></label>
        <div class="search-box" style="min-width:220px">${icon("search", 18)}<input type="search" id="recSearch" placeholder="ابحث باسم الطالب…" value="${escapeHtml(recordsState.q)}"></div>
        <span class="badge gray">${fmt(list.length)} سجل</span>
      </div>
      <div class="report-summary" style="padding:14px 16px 0;margin-bottom:0">
        <div class="cell"><b>${fmt(list.length)}</b><span>إجمالي الحالات</span></div>
        <div class="cell amber"><b>${fmt(excused)}</b><span>بعذر</span></div>
        <div class="cell red"><b>${fmt(unexcused)}</b><span>بدون عذر</span></div>
        <div class="cell"><b>${formatHijri(recordsState.date)}</b><span>التاريخ الهجري</span></div>
      </div>
      ${list.length ? `<div class="table-wrap" style="border:0;border-radius:0">
        <table class="data-table"><thead><tr><th>الطالب</th><th>المرحلة</th><th>الفصل</th><th>الحالة</th><th>نوع الغياب</th><th></th></tr></thead><tbody>
          ${list.map(r => {
            const s = smap.get(r.studentId);
            return `<tr>
              <td><div class="name-cell">${avatar(s?.name || "؟", s?.stageId || 1)}<div><span class="nm">${escapeHtml(s?.name || "طالب محذوف")}</span><span class="sub">${escapeHtml(s?.studentId || "")}</span></div></div></td>
              <td>${escapeHtml(stageName(r.stageId))}</td>
              <td>${escapeHtml(classLabel(r.classNo, r.stageId))}</td>
              <td>${recordsState.mode === "late" ? `<span class="badge amber">متأخر</span>` : r.excused ? `<span class="badge gold">بعذر</span>` : `<span class="badge red">بدون عذر</span>`}</td>
              <td>${recordsState.mode === "absence" ? `<div class="segmented">
                <button type="button" class="type-btn ${!r.excused ? "active-red" : ""}" data-exc="unexcused" data-sid="${r.studentId}">بدون عذر</button>
                <button type="button" class="type-btn ${r.excused ? "active-gold" : ""}" data-exc="excused" data-sid="${r.studentId}">بعذر</button>
              </div>` : `<span class="badge amber">تأخر</span>`}</td>
              <td><button class="btn ghost sm" data-rec-present="${r.studentId}">${icon("check", 16)} حاضر</button></td>
            </tr>`;
          }).join("")}
        </tbody></table>
      </div>` : emptyState({ iconName: "check", title: "لا توجد حالات", text: `لا توجد حالات ${recordsState.mode === "late" ? "تأخر" : "غياب"} في هذا اليوم.` })}
    </section>`;

  $("#recDate").addEventListener("change", e => { recordsState.date = e.target.value || todayISO(); renderRecords(root, settings); });
  $("#recMode").addEventListener("change", e => { recordsState.mode = e.target.value; renderRecords(root, settings); });
  $("#recStage").addEventListener("change", e => { recordsState.stage = e.target.value; renderRecords(root, settings); });
  $("#recClass").addEventListener("change", e => { recordsState.classNo = e.target.value; renderRecords(root, settings); });
  $("#recSearch").addEventListener("input", debounce(e => { recordsState.q = e.target.value; renderRecords(root, settings); }, 250));
  $$("[data-exc]").forEach(b => b.addEventListener("click", async () => {
    const sid = b.dataset.sid;
    await setExcused({ date: recordsState.date, studentId: sid, excused: b.dataset.exc === "excused" });
    toast(b.dataset.exc === "excused" ? "تم تحويل الغياب إلى «بعذر»." : "تم تحويل الغياب إلى «بدون عذر».");
    renderRecords(root, settings);
  }));
  $$("[data-rec-present]").forEach(b => b.addEventListener("click", async () => {
    const r = list.find(x => x.studentId === b.dataset.recPresent);
    if (!r) return;
    await setStatus({ date: recordsState.date, studentId: r.studentId, stageId: r.stageId, classNo: r.classNo, mode: recordsState.mode, status: "present" });
    toast("تم تسجيل الطالب حاضراً وإزالة الحالة.");
    renderRecords(root, settings);
  }));
}

/* ---------------- سجل التأخر ---------------- */
const lateLogState = { date: todayISO() };

async function renderLateLog(root, settings) {
  const students = await listStudents({ includeInactive: true });
  const smap = new Map(students.map(s => [s.id, s]));
  const records = await getDayRecords(lateLogState.date, "late");
  const rows = records
    .filter(r => r.status === "late")
    .map(r => ({ ...r, student: smap.get(r.studentId) }))
    .filter(r => r.student)
    .sort((a, b) => (a.lateAt || a.updatedAt || 0) - (b.lateAt || b.updatedAt || 0));
  const timeOf = r => r.lateTime || (r.lateAt ? new Date(r.lateAt).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }) : "—");
  const msgOf = s => buildMessage(s, lateLogState.date, "late", settings.lateMessage, settings);
  const linkOf = s => waLink(s.phone, msgOf(s));
  const count = rows.length;

  root.innerHTML = `
    <div class="admin-head">
      <div><h1>سجل التأخر</h1><p>وقت وصول كل طالب متأخر، مع إرسال إشعار واتساب لولي الأمر مباشرة.</p></div>
      <div class="admin-head-actions"><a class="btn ghost" href="#/admin/whatsapp">${icon("whatsapp", 20)} صفحة رسائل واتساب</a></div>
    </div>
    <div class="callout ${count ? "warn" : "ok"}" style="margin-bottom:16px">
      ${count
        ? `تم رصد <b>${fmt(count)}</b> طالباً متأخراً في ${escapeHtml(formatHijriLong(lateLogState.date, true))}. وقت التأخر يُسجَّل تلقائياً لحظة الضغط على زر التأخير.`
        : `لا يوجد تأخر مسجل في ${escapeHtml(formatHijriLong(lateLogState.date, true))}. انتقل إلى صفحة التأخر وسجّل الطلاب المتأخرين، وسيظهر وقت كل طالب هنا تلقائياً.`}
    </div>
    <section class="section-card">
      <div class="table-toolbar">
        <label class="field" style="margin:0;min-width:190px"><span class="field-label">اليوم</span><input class="input" type="date" id="lateLogDate" value="${lateLogState.date}"></label>
        <span class="badge amber">${icon("clock", 16)} ${fmt(count)} متأخر</span>
        <div class="btn-row" style="margin-inline-start:auto">
          <button class="btn ghost sm" id="lateCopyWa" ${count ? "" : "disabled"}>${icon("copy", 16)} نسخ روابط واتساب</button>
          <a class="btn ghost sm" href="#/attendance/late/1">${icon("clock", 16)} تسجيل تأخر</a>
        </div>
      </div>
      <div class="table-wrap" style="border:0;border-radius:0">
        ${count ? `<table class="data-table"><thead><tr><th>#</th><th>الطالب</th><th>الفصل</th><th>وقت التأخر</th><th>الجوال</th><th>الإجراء</th></tr></thead><tbody>
          ${rows.map((r, i) => {
            const s = r.student;
            const hasPhone = !!String(s.phone || "").trim();
            return `<tr>
              <td class="num">${fmt(i + 1)}</td>
              <td><div class="name-cell">${avatar(s.name, s.stageId)}<div><span class="nm">${escapeHtml(s.name)}</span><span class="sub">${escapeHtml(s.studentId || "")}</span></div></div></td>
              <td>${escapeHtml(classLabel(s.classNo, s.stageId))}</td>
              <td><span class="badge amber">${escapeHtml(timeOf(r))}</span></td>
              <td dir="ltr">${escapeHtml(displayPhone(s.phone) || "—")}</td>
              <td>${hasPhone
                ? `<a class="btn whatsapp sm" href="${escapeHtml(linkOf(s))}" target="_blank" rel="noopener">${icon("whatsapp", 16)} إرسال</a>`
                : `<span class="badge gray">لا يوجد جوال</span>`}</td>
            </tr>`;
          }).join("")}
        </tbody></table>` : emptyState({ iconName: "clock", title: "لا يوجد تأخر مسجل", text: "سجّل التأخر من صفحة الرصد ليظهر هنا مع الوقت تلقائياً." })}
      </div>
    </section>`;

  $("#lateLogDate").addEventListener("change", e => {
    lateLogState.date = e.target.value || todayISO();
    renderLateLog(root, settings);
  });
  $("#lateCopyWa")?.addEventListener("click", async () => {
    const lines = rows.filter(r => String(r.student.phone || "").trim()).map(r => `${r.student.name} — ${linkOf(r.student)}`).join("\n");
    if (!lines) { toast("لا توجد أرقام جوال لهؤلاء الطلاب.", { type: "warn" }); return; }
    try { await navigator.clipboard.writeText(lines); toast("تم نسخ روابط واتساب لجميع المتأخرين."); }
    catch (e) { toast("تعذر النسخ من المتصفح.", { type: "error" }); }
  });
}

/* ---------------- قاعدة الطلاب ---------------- */
const studentsState = { q: "", stage: "", classNo: "", status: "active", page: 0 };

async function renderStudents(root, settings) {
  const all = await listStudents({ includeInactive: true });
  const totals = await totalsByStudent(activeTermRange(settings).from, todayISO());
  let list = all.slice();
  if (studentsState.status === "active") list = list.filter(s => s.active !== false);
  if (studentsState.status === "inactive") list = list.filter(s => s.active === false);
  if (studentsState.stage) list = list.filter(s => Number(s.stageId) === Number(studentsState.stage));
  if (studentsState.classNo) list = list.filter(s => Number(s.classNo) === Number(studentsState.classNo));
  const q = normalizeArabic(studentsState.q);
  if (q) list = list.filter(s => normalizeArabic(s.name).includes(q) || String(s.studentId).includes(q) || String(s.phone).includes(q));
  list.sort((a, b) => a.stageId - b.stageId || a.classNo - b.classNo || a.name.localeCompare(b.name, "ar"));
  const perPage = 50;
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  if (studentsState.page >= pages) studentsState.page = pages - 1;
  const page = list.slice(studentsState.page * perPage, studentsState.page * perPage + perPage);

  root.innerHTML = `
    <div class="admin-head">
      <div><h1>قاعدة الطلاب</h1><p>${fmt(all.length)} طالباً في ${fmt(new Set(all.map(s => `${s.stageId}-${s.classNo}`)).size)} فصلاً — يمكنك التعديل والإضافة والاستيراد.</p></div>
      <div class="admin-head-actions">
        <button class="btn primary" id="addStudent">${icon("plus", 20)} إضافة طالب</button>
        <button class="btn ghost" id="importStudents">${icon("upload", 20)} استيراد</button>
        <button class="btn ghost" id="exportStudents">${icon("download", 20)} تصدير</button>
      </div>
    </div>
    <section class="section-card">
      <div class="table-toolbar">
        <div class="search-box" style="min-width:260px">${icon("search", 20)}<input id="stSearch" type="search" placeholder="ابحث بالاسم أو رقم الطالب…" value="${escapeHtml(studentsState.q)}"></div>
        <select class="input" id="stStage" style="max-width:190px"><option value="">كل المراحل</option>${STAGES.map(s => `<option value="${s.id}" ${String(studentsState.stage) === String(s.id) ? "selected" : ""}>${s.name}</option>`).join("")}</select>
        <select class="input" id="stClass" style="max-width:150px"><option value="">كل الفصول</option>${Array.from({ length: 9 }, (_, i) => i + 1).map(c => `<option value="${c}" ${String(studentsState.classNo) === String(c) ? "selected" : ""}>${classLabel(c, studentsState.stage)}</option>`).join("")}</select>
        <select class="input" id="stStatus" style="max-width:150px"><option value="active" ${studentsState.status === "active" ? "selected" : ""}>النشطون</option><option value="inactive" ${studentsState.status === "inactive" ? "selected" : ""}>غير النشطين</option><option value="all" ${studentsState.status === "all" ? "selected" : ""}>الكل</option></select>
        <span class="badge gray">${fmt(list.length)} نتيجة</span>
      </div>
      <div class="table-wrap" style="border:0;border-radius:0">
        <table class="data-table"><thead><tr><th>الطالب</th><th>المرحلة</th><th>الفصل</th><th>الجوال</th><th>الغياب</th><th>التأخر</th><th>الحالة</th><th></th></tr></thead><tbody>
          ${page.length ? page.map(s => {
            const t = totals.get(s.id) || { absent: 0, late: 0 };
            return `<tr>
              <td><div class="name-cell">${avatar(s.name, s.stageId)}<div><span class="nm">${escapeHtml(s.name)}</span><span class="sub">${escapeHtml(s.studentId || "")}</span></div></div></td>
              <td>${escapeHtml(stageName(s.stageId))}</td><td>${escapeHtml(classLabel(s.classNo, s.stageId))}</td>
              <td dir="ltr">${escapeHtml(displayPhone(s.phone))}</td>
              <td class="num">${fmt(t.absent)}</td><td class="num">${fmt(t.late)}</td>
              <td>${s.active === false ? `<span class="badge gray">غير نشط</span>` : `<span class="badge green">نشط</span>`}</td>
              <td><div class="row-actions"><button class="btn ghost sm" data-edit="${s.id}">${icon("edit", 16)} تعديل</button><button class="btn ghost sm" data-del="${s.id}" aria-label="حذف">${icon("trash", 16)}</button></div></td>
            </tr>`;
          }).join("") : `<tr><td colspan="8">${emptyState({ iconName: "search", title: "لا توجد نتائج", text: "جرّب تغيير الفلاتر أو كلمة البحث." })}</td></tr>`}
        </tbody></table>
      </div>
      <div class="table-toolbar" style="justify-content:space-between;border-top:1px solid var(--line)">
        <span class="legal">صفحة ${fmt(studentsState.page + 1)} من ${fmt(pages)} — تُعرض ${fmt(page.length)} من ${fmt(list.length)}</span>
        <div class="btn-row">
          <button class="btn ghost sm" id="prevPage" ${studentsState.page === 0 ? "disabled" : ""}>${icon("back", 16)} السابق</button>
          <button class="btn ghost sm" id="nextPage" ${studentsState.page >= pages - 1 ? "disabled" : ""}>التالي ${icon("back", 16)}</button>
        </div>
      </div>
    </section>`;

  const search = $("#stSearch");
  search.addEventListener("input", debounce(() => { studentsState.q = search.value; studentsState.page = 0; renderStudents(root, settings); }, 260));
  $("#stStage").addEventListener("change", e => { studentsState.stage = e.target.value; studentsState.page = 0; renderStudents(root, settings); });
  $("#stClass").addEventListener("change", e => { studentsState.classNo = e.target.value; studentsState.page = 0; renderStudents(root, settings); });
  $("#stStatus").addEventListener("change", e => { studentsState.status = e.target.value; studentsState.page = 0; renderStudents(root, settings); });
  $("#prevPage").addEventListener("click", () => { studentsState.page = Math.max(0, studentsState.page - 1); renderStudents(root, settings); });
  $("#nextPage").addEventListener("click", () => { studentsState.page = Math.min(pages - 1, studentsState.page + 1); renderStudents(root, settings); });
  $("#addStudent").addEventListener("click", () => openStudentModal(null, root, settings));
  $$("[data-edit]").forEach(b => b.addEventListener("click", async () => { const s = await getStudent(b.dataset.edit); openStudentModal(s, root, settings); }));
  $$("[data-del]").forEach(b => b.addEventListener("click", async () => {
    const s = await getStudent(b.dataset.del);
    const ok = await confirmDialog({ title: "حذف طالب", message: `سيتم تعطيل الطالب «${s?.name}» ولن يظهر في الرصد. يمكنك إعادة تفعيله من فلتر «غير النشطين».`, confirmText: "حذف", iconName: "trash" });
    if (!ok) return;
    await deleteStudent(b.dataset.del);
    toast("تم حذف الطالب.");
    renderStudents(root, settings);
  }));
  $("#exportStudents").addEventListener("click", () => {
    const rows = all.map(s => [s.name, s.studentId || "", s.phone || "", s.stageId, s.classNo, s.active === false ? "غير نشط" : "نشط"]);
    download(`rased-students-${todayISO()}.csv`, toCSV(["اسم الطالب", "رقم الطالب", "الجوال", "المرحلة", "الفصل", "الحالة"], rows), "text/csv;charset=utf-8");
    toast("تم تصدير قاعدة الطلاب.");
  });
  $("#importStudents").addEventListener("click", () => openImportModal(root, settings));
}

function openStudentModal(student, root, settings) {
  const isNew = !student;
  const bio = student || { name: "", studentId: "", phone: "", stageId: 1, classNo: 1, active: true };
  const m = modal({
    title: isNew ? "إضافة طالب" : "تعديل بيانات الطالب", iconName: "user", size: "lg",
    body: `<div class="form-grid">
      <label class="field span-2"><span class="field-label">اسم الطالب *</span><input class="input" id="sf-name" value="${escapeHtml(bio.name)}" required></label>
      <label class="field"><span class="field-label">رقم الطالب</span><input class="input" id="sf-id" value="${escapeHtml(bio.studentId || "")}" dir="ltr"></label>
      <label class="field"><span class="field-label">جوال ولي الأمر</span><input class="input" id="sf-phone" value="${escapeHtml(bio.phone || "")}" dir="ltr" placeholder="05xxxxxxxx"></label>
      <label class="field"><span class="field-label">المرحلة</span><select class="input" id="sf-stage">${STAGES.map(s => `<option value="${s.id}" ${Number(bio.stageId) === s.id ? "selected" : ""}>${s.name}</option>`).join("")}</select></label>
      <label class="field"><span class="field-label">الفصل</span><select class="input" id="sf-class">${Array.from({ length: 9 }, (_, i) => i + 1).map(c => `<option value="${c}" ${Number(bio.classNo) === c ? "selected" : ""}>${classLabel(c, bio.stageId)}</option>`).join("")}</select></label>
      <label class="field span-2" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="sf-active" ${bio.active !== false ? "checked" : ""} style="width:22px;height:22px;accent-color:#0f6b4f"><span class="field-label" style="margin:0">طالب نشط (يظهر في الرصد)</span></label>
    </div>`,
    actions: [
      { label: "إلغاء", kind: "ghost" },
      { label: isNew ? "إضافة" : "حفظ التعديلات", kind: "primary", icon: "save", onClick: async () => {
        const name = $("#sf-name").value.trim();
        if (!name) { toast("اسم الطالب مطلوب.", { type: "error" }); return false; }
        const row = {
          ...bio, id: bio.id || uid("st"), name, studentId: $("#sf-id").value.trim(), phone: $("#sf-phone").value.trim(),
          stageId: Number($("#sf-stage").value), classNo: Number($("#sf-class").value), active: $("#sf-active").checked
        };
        await saveStudent(row);
        toast(isNew ? "تمت إضافة الطالب." : "تم حفظ التعديلات.");
        renderStudents(root, settings);
      } }
    ]
  });
}

/* ---------------- استيراد الطلاب ---------------- */
function openImportModal(root, settings) {
  const m = modal({
    title: "استيراد قاعدة الطلاب", iconName: "upload", size: "lg",
    body: `<div class="callout info">الملف المدعوم: CSV بترميز UTF-8، أو لصق الصفوف مباشرة. الأعمدة: الاسم، رقم الطالب، الجوال، المرحلة، الفصل.</div>
      <div class="field" style="margin-top:12px"><span class="field-label">اختر ملف CSV</span><input class="input" type="file" id="impFile" accept=".csv,text/csv"></div>
      <label class="field" style="margin-top:10px"><span class="field-label">أو الصق الصفوف هنا</span><textarea class="input" id="impText" rows="8" placeholder="اسم الطالب,رقم الطالب,الجوال,المرحلة,الفصل"></textarea></label>
      <div id="impPreview" class="legal" style="margin-top:8px"></div>`,
    actions: [
      { label: "إلغاء", kind: "ghost" },
      { label: "استيراد", kind: "primary", icon: "upload", onClick: async () => {
        const text = $("#impText").value.trim();
        if (!text) { toast("ألصق البيانات أو اختر ملفاً أولاً.", { type: "warn" }); return false; }
        const rows = parseStudentCSV(text);
        if (!rows.length) { toast("لم يتم التعرف على صفوف صالحة. تأكد من الأعمدة.", { type: "error" }); return false; }
        const existing = await listStudents({ includeInactive: true });
        const byKey = new Map(existing.map(s => [(s.studentId || s.id) + "|" + s.name, s]));
        const toSave = [];
        for (const r of rows) {
          const key = (r.studentId || "") + "|" + r.name;
          const old = byKey.get(key);
          toSave.push({ ...(old || {}), ...r, id: old?.id || r.studentId || uid("st"), active: true, updatedAt: Date.now(), createdAt: old?.createdAt || Date.now() });
        }
        await bulkPutStudents(toSave);
        toast(`تم استيراد ${fmt(toSave.length)} طالباً.`);
        renderStudents(root, settings);
      } }
    ]
  });
  const file = $("#impFile");
  file.addEventListener("change", async () => {
    const f = file.files?.[0]; if (!f) return;
    const text = await readFileText(f);
    $("#impText").value = text;
    const rows = parseStudentCSV(text);
    $("#impPreview").innerHTML = `<b>${fmt(rows.length)}</b> صفاً تم التعرف عليه. مثال: ${escapeHtml(rows[0]?.name || "")}`;
  });
}

function parseStudentCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  let start = 0;
  const head = rows[0].map(h => normalizeArabic(h));
  const hasHeader = head.some(h => h.includes("اسم") || h.includes("name") || h.includes("جوال") || h.includes("phone"));
  if (hasHeader) start = 1;
  const idx = { name: 0, id: 1, phone: 2, stage: 3, class: 4 };
  if (hasHeader) {
    const find = arr => head.findIndex(h => arr.some(a => h.includes(a)));
    const n = find(["اسم", "name"]); if (n >= 0) idx.name = n;
    const i = find(["رقم الطالب", "id", "هوية"]); if (i >= 0) idx.id = i;
    const p = find(["جوال", "هاتف", "phone", "موبايل"]); if (p >= 0) idx.phone = p;
    const s = find(["مرحلة", "صف", "stage", "grade"]); if (s >= 0) idx.stage = s;
    const c = find(["فصل", "class", "شعبة"]); if (c >= 0) idx.class = c;
  }
  const stageMap = { "1": 1, "الاول": 1, "الأول": 1, "اول": 1, "2": 2, "الثاني": 2, "ثاني": 2, "3": 3, "الثالث": 3, "ثالث": 3 };
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[idx.name] || "").trim();
    if (!name) continue;
    let st = String(r[idx.stage] || "").trim();
    let stageId = 1;
    if (/^\d$/.test(st)) stageId = Number(st);
    else { const n = normalizeArabic(st); stageId = n.includes("ثاني") ? 2 : n.includes("ثالث") ? 3 : 1; }
    let cls = String(r[idx.class] || "").trim();
    let classNo = 1;
    if (/^\d+$/.test(cls)) classNo = Number(cls);
    else { const n = normalizeArabic(cls).replace(/[^\d]/g, ""); classNo = Number(n) || 1; }
    out.push({ name, studentId: String(r[idx.id] || "").trim(), phone: String(r[idx.phone] || "").trim(), stageId, classNo });
  }
  return out;
}

/* ---------------- أدوات مساعدة ---------------- */
function zeroStats(stats) {
  const perStage = {};
  for (const id of [1, 2, 3]) perStage[id] = { ...(stats.perStage?.[id] || {}), absent: 0, late: 0, recorded: 0 };
  return { ...stats, absent: 0, late: 0, excusedAbsent: 0, unexcusedAbsent: 0, recordedClasses: 0, perStage };
}
function parseCSV(text) {
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


