/* ============================================================
   راصد — مركز رسائل واتساب + ربط إضافة كروم
   ============================================================ */
import {
  $, $$, icon, fmt, escapeHtml, todayISO, formatHijri, formatHijriLong, formatGregorianLong, weekdayName,
  waLink, normalizePhone, displayPhone, signToken, modeLabel, modeNoun, stageName, classLabel, downloadJSON
} from "./core.js";
import { getSettings, saveSettings, listStudents, getDayRecords, addLog, listLogs, DEFAULT_SETTINGS } from "./db.js";
import { sectionCard, emptyState, modal, confirmDialog, field, toast } from "./ui.js";

let extensionDetected = false;
let progressHandler = null;

function templateFor(mode, template) {
  if (mode === "late" && !String(template || "").includes("{lateTime}")) return DEFAULT_SETTINGS.lateMessage;
  return String(template || "");
}
function directLink(student, text, channel = "web") {
  const phone = normalizePhone(student.phone);
  if (channel === "app") return `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`;
  return `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;
}

export async function renderWhatsApp(root) {
  const settings = await getSettings();
  const students = await listStudents();
  const smap = new Map(students.map(s => [s.id, s]));
  const state = {
    mode: "absence", date: todayISO(), selected: new Set(), template: settings.excuseMessage,
    detected: extensionDetected, sending: false, lateTimes: new Map(), channel: "web"
  };
  const render = async () => {
    state.template = state.mode === "late" ? templateFor("late", settings.lateMessage) : settings.excuseMessage;
    const records = (await getDayRecords(state.date, state.mode)).filter(r => r.status !== "present");
    const rows = records.map(r => ({ ...r, student: smap.get(r.studentId) })).filter(r => r.student);
    state.lateTimes = new Map(rows.map(r => [r.studentId, r.lateTime || ""]));
    state.selected = new Set(rows.map(r => r.studentId));
    root.innerHTML = `
      <div class="admin-head">
        <div><h1>رسائل واتساب</h1><p>إرسال إشعارات الغياب والتأخر لأولياء الأمور مع رابط تقديم العذر.</p></div>
        <div class="admin-head-actions">
          <span class="badge ${state.detected ? "green" : "gray"}" id="extBadge">${state.detected ? "الإضافة متصلة" : "الإضافة غير متصلة"}</span>
          <a class="btn ghost" href="#/admin/whatsapp-help">${icon("info", 20)} تركيب الإضافة</a>
        </div>
      </div>
      <div class="settings-grid">
        <div class="section-card">
          <div class="section-head"><div class="section-title">${icon("whatsapp", 24)}<div><h2>قائمة الإرسال</h2><p>${formatHijriLong(state.date, true)} — ${fmt(rows.length)} حالة</p></div></div></div>
          <div class="section-body">
            <div class="form-grid">
              <label class="field"><span class="field-label">نوع الرسالة</span>
                <select class="input" id="waMode"><option value="absence" ${state.mode === "absence" ? "selected" : ""}>إشعار غياب</option><option value="late" ${state.mode === "late" ? "selected" : ""}>إشعار تأخر</option></select></label>
              <label class="field"><span class="field-label">التاريخ</span><input class="input" type="date" id="waDate" value="${state.date}"></label>
              <label class="field span-2"><span class="field-label">طريقة الإرسال</span>
                <select class="input" id="waChannel">
                  <option value="web" ${state.channel === "web" ? "selected" : ""}>واتساب ويب — إرسال تلقائي عبر الإضافة</option>
                  <option value="app" ${state.channel === "app" ? "selected" : ""}>تطبيق واتساب — فتح المحادثة</option>
                </select></label>
            </div>
            <div class="copy-row" style="margin-top:10px">
              <button class="btn ghost sm" id="selectAll">تحديد الكل</button>
              <button class="btn ghost sm" id="selectNone">إلغاء التحديد</button>
              <button class="btn ghost sm" id="copyLinks">${icon("copy", 16)} نسخ روابط واتساب</button>
            </div>
            <div class="mini-list" style="max-height:420px;overflow:auto;margin-top:12px">
              ${rows.length ? rows.map(r => {
                const text = buildMessage(r.student, state.date, state.mode, state.template, settings, r.lateTime || "");
                const hasPhone = !!normalizePhone(r.student.phone);
                const href = directLink(r.student, text, state.channel);
                return `<div class="mini-row" data-wa-row="${r.studentId}">
                <label class="wa-check"><input type="checkbox" data-wa-student="${r.studentId}" checked style="width:20px;height:20px;accent-color:#0f6b4f"></label>
                <span class="grow"><b>${escapeHtml(r.student.name)}</b><br><span style="font-size:.72rem;color:#5d6c64">${escapeHtml(classLabel(r.student.classNo, r.student.stageId))} · ${displayPhone(r.student.phone)}</span></span>
                <span class="badge ${state.mode === "late" ? "amber" : "red"}">${state.mode === "late" ? (r.lateTime ? `متأخر ${escapeHtml(r.lateTime)}` : "متأخر") : (r.excused ? "بعذر" : "بدون عذر")}</span>
                ${hasPhone
                  ? `<a class="btn whatsapp sm" data-wa-send="${r.studentId}" href="${escapeHtml(href)}" ${state.channel === "web" ? 'target="_blank" rel="noopener"' : ""}>${icon("whatsapp", 16)} ${state.channel === "app" ? "فتح التطبيق" : "إرسال"}</a>`
                  : `<span class="badge gray">لا يوجد جوال</span>`}
              </div>`;
              }).join("") : emptyState({ iconName: "check", title: "لا توجد حالات", text: "لم يتم رصد أي حالة في هذا اليوم." })}
            </div>
          </div>
        </div>

        <div class="section-card">
          <div class="section-head"><div class="section-title">${icon("message", 24)}<div><h2>نص الرسالة</h2><p>يُرسل لكل ولي أمر برابط عذر خاص بابنه.</p></div></div></div>
          <div class="section-body">
            <textarea class="input" id="waTemplate" rows="9">${escapeHtml(state.template)}</textarea>
            <div class="callout info" style="margin-top:10px;font-size:.76rem">
              المتغيرات: <b>{name}</b> اسم الطالب · <b>{hijri}</b> التاريخ الهجري · <b>{gregorian}</b> الميلادي · <b>{weekday}</b> اليوم · <b>{link}</b> رابط العذر · <b>{school}</b> اسم المدرسة
            </div>
            <div class="btn-row" style="margin-top:14px">
              <button class="btn primary" id="autoSend" ${state.channel === "web" && !state.detected ? "disabled" : ""}>${icon("whatsapp", 20)} ${state.channel === "app" ? "فتح المحادثات في التطبيق" : "إرسال تلقائي عبر الإضافة"}</button>
              <button class="btn ghost" id="manualSend">${icon("external", 20)} إرسال يدوي</button>
            </div>
            ${state.channel === "web" && !state.detected ? `<div class="callout warn" style="margin-top:12px">الإضافة غير مثبتة أو لم تُفعّل بعد. راجع <a href="#/admin/whatsapp-help">تعليمات تركيب الإضافة</a>، أو اختر <b>تطبيق واتساب</b>، أو استخدم الإرسال اليدوي.</div>` : ""}
            <div class="callout info" style="margin-top:10px;font-size:.76rem">
              ${state.channel === "app"
                ? "سيُفتح تطبيق واتساب على جهازك لكل طالب مع نص الرسالة جاهزاً. الإرسال النهائي يتم من داخل التطبيق."
                : "يتم الإرسال التلقائي في <b>نفس تبويب واتساب</b> دون فتح صفحة جديدة لكل طالب، بفاصل عشوائي من <b>2 إلى 5 ثوانٍ</b> بين الرسائل."}
            </div>
            <div class="callout ok" style="margin-top:12px;font-size:.72rem">استخدم فواصل مريحة لتقليل احتمال تقييد رقم واتساب. الإرسال الآلي للرسائل الجماعية قد يخالف شروط واتساب.</div>
          </div>
        </div>
      </div>
      <div class="section-gap"></div>
      <div class="section-card">
        <div class="section-head"><div class="section-title">${icon("clock", 22)}<div><h2>آخر عمليات الإرسال</h2></div></div><div class="section-action"><button class="btn ghost sm" id="reloadLogs">${icon("refresh", 16)} تحديث</button></div></div>
        <div class="section-body flush"><div id="waLogs"></div></div>
      </div>`;
    bindUI();
    await renderLogs();
    detectExtension();
  };

  async function renderLogs() {
    const box = $("#waLogs");
    if (!box) return;
    const logs = await listLogs(30);
    if (!logs.length) { box.innerHTML = `<div class="empty-state" style="padding:26px"><p>لا توجد عمليات إرسال مسجلة بعد.</p></div>`; return; }
    box.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>الطالب</th><th>الجوال</th><th>النوع</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>
      ${logs.map(l => `<tr><td>${escapeHtml(l.name || "")}</td><td dir="ltr">${escapeHtml(displayPhone(l.phone))}</td><td>${l.mode === "late" ? "تأخر" : "غياب"}</td><td>${l.status === "sent" ? `<span class="badge green">تم</span>` : l.status === "failed" ? `<span class="badge red">فشل</span>` : `<span class="badge gray">يدوي</span>`}</td><td>${new Date(l.at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function bindUI() {
    const rows = () => Array.from(root.querySelectorAll("[data-wa-student]")).map(c => ({ id: c.dataset.waStudent, checked: c.checked }));
    $("#waMode").addEventListener("change", async e => { state.mode = e.target.value; state.template = state.mode === "late" ? settings.lateMessage : settings.excuseMessage; await render(); });
    $("#waChannel").addEventListener("change", async e => { state.channel = e.target.value; await render(); });
    $("#waDate").addEventListener("change", async e => { state.date = e.target.value; await render(); });
    $("#selectAll").addEventListener("click", () => { root.querySelectorAll("[data-wa-student]").forEach(c => c.checked = true); });
    $("#selectNone").addEventListener("click", () => { root.querySelectorAll("[data-wa-student]").forEach(c => c.checked = false); });
    $("#waTemplate").addEventListener("input", e => { state.template = e.target.value; });
    $("#copyLinks").addEventListener("click", async () => {
      const list = rows().filter(x => x.checked);
      if (!list.length) { toast("حدد طالباً واحداً على الأقل.", { type: "warn" }); return; }
      const lines = list.map(x => {
        const s = smap.get(x.id); if (!s) return "";
        return `${s.name} — ${directLink(s, buildMessage(s, state.date, state.mode, state.template, settings, state.lateTimes?.get(s.id) || ""), state.channel)}`;
      }).join("\n");
      await navigator.clipboard.writeText(lines);
      toast("تم نسخ روابط واتساب إلى الحافظة.");
    });
    $("#autoSend").addEventListener("click", async () => {
      const selected = rows().filter(x => x.checked);
      if (state.channel === "app") { openManual(selected, state, settings, smap, "app"); return; }
      await startAuto(selected, state, settings, smap);
    });
    $("#manualSend").addEventListener("click", () => openManual(rows().filter(x => x.checked), state, settings, smap, state.channel));
    $("#reloadLogs").addEventListener("click", renderLogs);
    root.querySelectorAll("[data-wa-student]").forEach(c => c.addEventListener("change", () => {
      if (c.checked) state.selected.add(c.dataset.waStudent); else state.selected.delete(c.dataset.waStudent);
    }));
    root.querySelectorAll("[data-wa-send]").forEach(a => a.addEventListener("click", async () => {
      const s = smap.get(a.dataset.waSend);
      if (s) await addLog({ studentId: s.id, name: s.name, phone: s.phone, mode: state.mode, date: state.date, status: "manual" });
      a.closest("[data-wa-row]")?.remove();
      state.selected.delete(a.dataset.waSend);
      toast("تم فتح واتساب لولي الأمر وإزالة الطالب من القائمة.", { type: "ok" });
    }));
  }

  await render();
}

/* ---------------- بناء الرسالة والرابط ---------------- */
export function buildExcuseLink(student, date, settings) {
  const payload = `${student.id}|${date}`;
  const token = signToken(payload, settings.excuseSecret || "rased");
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/excuse?sid=${encodeURIComponent(student.id)}&d=${date}&t=${token}`;
}
export function buildMessage(student, date, mode, template, settings, lateTime = "") {
  const link = buildExcuseLink(student, date, settings);
  const tpl = templateFor(mode, template);
  return String(tpl || "")
    .replaceAll("{name}", student.name)
    .replaceAll("{hijri}", formatHijri(date))
    .replaceAll("{gregorian}", formatGregorianLong(date))
    .replaceAll("{weekday}", weekdayName(date))
    .replaceAll("{lateTime}", lateTime || "غير محدد")
    .replaceAll("{time}", lateTime || "غير محدد")
    .replaceAll("{link}", link)
    .replaceAll("{school}", settings.school?.name || "")
    .replaceAll("{id}", student.studentId || "")
    .replaceAll("{class}", classLabel(student.classNo, student.stageId));
}

/* ---------------- كشف الإضافة ---------------- */
function detectExtension() {
  const onMsg = ev => {
    const d = ev.data;
    if (!d || !d.__rasidExt) return;
    if (d.type === "pong") {
      extensionDetected = true;
      const b = $("#extBadge");
      if (b) { b.className = "badge green"; b.textContent = "الإضافة متصلة"; }
      const auto = $("#autoSend"); if (auto) auto.disabled = false;
    }
    if (d.type === "progress" && progressHandler) progressHandler(d.progress);
    if (d.type === "done" && progressHandler) progressHandler({ done: true, summary: d.summary });
    if (d.type === "log" && progressHandler) progressHandler({ log: d.message, kind: d.kind });
  };
  window.addEventListener("message", onMsg);
  for (let i = 0; i < 3; i++) setTimeout(() => window.postMessage({ __rasidApp: "ping" }, "*"), 300 + i * 600);
  setTimeout(() => {
    if (!extensionDetected) {
      const b = $("#extBadge");
      if (b) { b.className = "badge gray"; b.textContent = "الإضافة غير متصلة"; }
    }
  }, 2200);
}

/* ---------------- الإرسال التلقائي ---------------- */
async function startAuto(selected, state, settings, smap) {
  if (!extensionDetected) { toast("ثبّت إضافة كروم أولاً، أو استخدم الإرسال اليدوي.", { type: "warn" }); return; }
  const items = selected.map(x => {
    const s = smap.get(x.id);
    return { sid: s.id, name: s.name, wa: normalizePhone(s.phone), text: buildMessage(s, state.date, state.mode, state.template, settings, state.lateTimes?.get(s.id) || "") };
  }).filter(x => x.wa);
  if (!items.length) { toast("لا توجد أرقام صالحة.", { type: "warn" }); return; }
  const min = 2, max = 5;
  await saveSettings({ whatsapp: { ...settings.whatsapp, min, max } });
  const listEl = items.map((it, i) => `<div class="log-row" data-row="${it.sid}"><span class="ic">${icon("clock", 18)}</span><span class="grow">${escapeHtml(it.name)}</span><span class="badge gray" data-status="${it.sid}">بانتظار الدور</span></div>`).join("");
  const m = modal({
    title: "الإرسال التلقائي عبر واتساب", iconName: "whatsapp", size: "lg", closable: true,
    body: `<div class="callout warn" style="margin-bottom:12px">سيتم فتح واتساب ويب وإرسال الرسائل بالتتابع. لا تغلق المتصفح، وتأكد من تسجيل الدخول إلى واتساب ويب.</div>
      <div class="action-log" id="sendList">${listEl}</div>
      <div id="sendLog" class="legal" style="margin-top:10px"></div>`,
    actions: [
      { label: "إيقاف", kind: "danger", close: false, onClick: () => { window.postMessage({ __rasidApp: "stop" }, "*"); } },
      { label: "إغلاق", kind: "ghost" }
    ]
  });
  progressHandler = async p => {
    if (!p) return;
    if (p.done) {
      const s = p.summary || {};
      $("#sendLog") && ($("#sendLog").innerHTML = `<div class="callout ok">انتهى الإرسال — نجح ${fmt(s.sent || 0)} وفشل ${fmt(s.failed || 0)}.</div>`);
      toast(`انتهى الإرسال: ${fmt(s.sent || 0)} نجاح، ${fmt(s.failed || 0)} فشل.`, { type: s.failed ? "warn" : "ok" });
      progressHandler = null;
      return;
    }
    if (p.log) { const l = $("#sendLog"); if (l) l.innerHTML += `<div>${escapeHtml(p.log)}</div>`; return; }
    const badge = rootQuery(`[data-status="${p.sid}"]`);
    if (badge) {
      if (p.status === "sending") { badge.className = "badge blue"; badge.textContent = "جارٍ الإرسال"; }
      if (p.status === "sent") { badge.className = "badge green"; badge.textContent = "تم"; }
      if (p.status === "failed") { badge.className = "badge red"; badge.textContent = "فشل"; }
      if (p.status === "waiting") { badge.className = "badge amber"; badge.textContent = `انتظار ${p.wait || ""}ث`; }
    }
    if (p.status === "sent") {
      const s = smap.get(p.sid);
      if (s) await addLog({ studentId: s.id, name: s.name, phone: s.phone, mode: state.mode, date: state.date, status: "sent" });
    }
    if (p.status === "failed") {
      const s = smap.get(p.sid);
      if (s) await addLog({ studentId: s.id, name: s.name, phone: s.phone, mode: state.mode, date: state.date, status: "failed", detail: p.detail });
      const l = $("#sendLog");
      if (l) l.innerHTML += `<div style="color:#b3261e">${escapeHtml(s?.name || "")}: ${escapeHtml(p.detail || "فشل الإرسال")}</div>`;
      const skipped = /ليس عليه واتساب/.test(p.detail || "");
      toast(`${skipped ? "تم التخطي" : "فشل إرسال"} ${s?.name || "طالب"}: ${p.detail || "راجع واتساب ويب"}`, { type: skipped ? "warn" : "error", duration: skipped ? 2600 : 6000 });
    }
  };
  window.postMessage({ __rasidApp: "start", payload: { items, min: 2, max: 5, every: 0, extra: 0, closeTab: false } }, "*");
  toast(`بدأ إرسال ${fmt(items.length)} رسالة.`);
}

function rootQuery(sel) { return document.querySelector(sel); }

/* ---------------- الإرسال اليدوي ---------------- */
function openManual(selected, state, settings, smap, channel = "web") {
  if (!selected.length) { toast("حدد طالباً واحداً على الأقل.", { type: "warn" }); return; }
  const list = selected.map(x => {
    const s = smap.get(x.id); if (!s) return "";
    const text = buildMessage(s, state.date, state.mode, state.template, settings, state.lateTimes?.get(s.id) || "");
    const href = directLink(s, text, channel);
    return `<div class="mini-row"><span class="grow"><b>${escapeHtml(s.name)}</b><br><span style="font-size:.72rem;color:#5d6c64">${displayPhone(s.phone)}</span></span>
      <a class="btn primary sm" ${channel === "web" ? 'target="_blank" rel="noopener"' : ""} href="${escapeHtml(href)}" data-manual="${s.id}">${icon("whatsapp", 16)} ${channel === "app" ? "فتح التطبيق" : "فتح"}</a></div>`;
  }).join("");
  const m = modal({
    title: channel === "app" ? "الإرسال عبر تطبيق واتساب" : "الإرسال اليدوي",
    subtitle: channel === "app" ? "افتح محادثة ولي الأمر في تطبيق واتساب، ثم اضغط إرسال داخل التطبيق." : "افتح محادثة كل ولي أمر وأرسل الرسالة الجاهزة.",
    iconName: "whatsapp", size: "lg",
    body: `<div class="mini-list">${list}</div>`,
    actions: [{ label: "إغلاق", kind: "ghost" }]
  });
  m.dialog.querySelectorAll("[data-manual]").forEach(a => a.addEventListener("click", async () => {
    const s = smap.get(a.dataset.manual);
    if (s) await addLog({ studentId: s.id, name: s.name, phone: s.phone, mode: state.mode, date: state.date, status: "manual" });
    a.closest(".mini-row")?.remove();
    toast("تم فتح واتساب لولي الأمر وإزالة الطالب من القائمة.", { type: "ok" });
  }));
}

/* ---------------- صفحة تعليمات الإضافة ---------------- */
export async function renderWhatsAppHelp(root) {
  const settings = await getSettings();
  root.innerHTML = `
    <div class="admin-head"><div><h1>تركيب إضافة واتساب</h1><p>إضافة كروم ترسل الرسائل تلقائياً بالتتابع مع فواصل زمنية آمنة.</p></div>
      <div class="admin-head-actions"><a class="btn ghost" href="#/admin/whatsapp">${icon("back", 20)} رجوع</a></div></div>
    <div class="section-card"><div class="section-body">
      <div class="callout info" style="margin-bottom:16px">حمّل ملف الإضافة من الرابط التالي، ثم اتبع الخطوات. تعمل الإضافة مع كروم وإيدج.</div>
      <div class="btn-row" style="margin-bottom:20px">
        <a class="btn primary" href="./whatsapp-extension.zip" download>${icon("download", 20)} تحميل الإضافة (ZIP)</a>
        <a class="btn ghost" href="https://web.whatsapp.com" target="_blank" rel="noopener">${icon("whatsapp", 20)} فتح واتساب ويب</a>
      </div>
      <ol class="list" style="font-size:1rem;line-height:2">
        <li>فك ضغط الملف في مجلد ثابت على جهازك.</li>
        <li>افتح <b>chrome://extensions</b> أو <b>edge://extensions</b>.</li>
        <li>شغّل <b>وضع المطوّر (Developer mode)</b> أعلى الصفحة.</li>
        <li>اضغط <b>تحميل غير مضغوط (Load unpacked)</b> واختر مجلد الإضافة.</li>
        <li>سجّل الدخول إلى <b>web.whatsapp.com</b> بمسح رمز QR مرة واحدة.</li>
        <li>ارجع إلى صفحة الرسائل هنا، وستظهر لك عبارة «الإضافة متصلة».</li>
      </ol>
      <div class="callout warn" style="margin-top:16px">الإرسال الآلي الجماعي قد يخالف شروط واتساب ويؤدي إلى تقييد الرقم. استخدم فواصل مريحة، ولا ترسل أعداداً كبيرة في وقت قصير.</div>
    </div></div>`;
}
