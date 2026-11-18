/* ============================================================
   راصد — نقطة الدخول والتوجيه
   ============================================================ */
import { $, fmt, todayISO, formatHijri, weekdayName, icon } from "./core.js";
import { initDB, getSettings, hasDemoData, applyExcusedRoster, autoBackupIfDue, events as dbEvents } from "./db.js";
import { initSync, getState, syncNow, state as syncState } from "./sync.js";
import { applySyncChip, toast, modal, headerHTML } from "./ui.js";
import { renderHome, renderStagePicker, renderAttendance } from "./attendance.js";
import { renderAdmin } from "./admin.js";
import { renderExcuseForm } from "./excuse.js";
import { renderSummary, renderAbsentees } from "./public-reports.js";
import { renderPublicCases } from "./public-cases.js";
import { requireRecorder } from "./recorder-auth.js";
import { initRealtime } from "./realtime.js";

const app = $("#app");

const routes = [
  { re: /^\/?$/, run: () => renderHome(app) },
  { re: /^\/stage\/(absence|late)\/?$/, run: async m => { if (await requireRecorder(app)) await renderStagePicker(app, m[1]); } },
  { re: /^\/entry(?:\/(absence|late))?\/?$/, run: async m => { if (await requireRecorder(app)) await renderStagePicker(app, m[1] || "absence"); } },
  { re: /^\/attendance\/(absence|late)\/([123])\/?$/, run: async m => { if (await requireRecorder(app)) await renderAttendance(app, m[1], Number(m[2])); } },
  { re: /^\/admin(?:\/([a-z-]+))?\/?$/, run: m => renderAdmin(app, m[1] || "overview") },
  { re: /^\/summary\/?$/, run: () => renderSummary(app) },
  { re: /^\/absentees\/?$/, run: () => renderAbsentees(app) },
  { re: /^\/recurring\/?$/, run: () => renderPublicCases(app) },
  { re: /^\/excuse\/?$/, run: () => renderExcuseForm(app) }
];

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const path = raw.split("?")[0];
  return path.startsWith("/") ? path : "/" + path;
}

async function route() {
  const path = parseHash();
  document.querySelectorAll(".modal-overlay").forEach(m => m.remove());
  document.body.classList.remove("modal-open");
  window.scrollTo({ top: 0, behavior: "auto" });
  // إغلاق أي مؤقتات سابقة
  clearInterval(window.__dateTimer);
  try {
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        await r.run(m);
        applySyncChip(window.__rasedSync || {});
        document.title = documentTitle(path);
        return;
      }
    }
    app.innerHTML = `${headerHTML()}<main class="page mid">${notFound()}</main>`;
    applySyncChip(syncState);
  } catch (e) {
    console.error(e);
    app.innerHTML = `${headerHTML()}<main class="page mid">
      <div class="empty-state"><span class="empty-ic">${icon("alert", 46)}</span>
      <h3>حدث خطأ غير متوقع</h3><p>${String(e.message || e)}</p>
      <a class="btn primary" href="#/">العودة للرئيسية</a></div></main>`;
    applySyncChip(syncState);
  }
}

function documentTitle(path) {
  if (path.startsWith("/admin")) return "الإدارة — راصد";
  if (path.startsWith("/attendance")) return "الرصد — راصد";
  if (path.startsWith("/stage")) return "اختيار المرحلة — راصد";
  if (path.startsWith("/entry")) return "الإدخال المباشر — راصد";
  if (path.startsWith("/summary")) return "ملخص الغياب — راصد";
  if (path.startsWith("/absentees")) return "قائمة الغائبين — راصد";
  if (path.startsWith("/recurring")) return "الحالات المتكررة — راصد";
  if (path.startsWith("/excuse")) return "تقديم عذر الغياب — راصد";
  return "راصد — لرصد غياب الطلاب";
}
function notFound() {
  return `<div class="empty-state"><span class="empty-ic">${icon("search", 46)}</span><h3>الصفحة غير موجودة</h3><p>تحقق من الرابط أو عد إلى الصفحة الرئيسية.</p><a class="btn primary" href="#/">الرئيسية</a></div>`;
}

/* ---------------- المزامنة والشبكة ---------------- */
function bindSyncUI() {
  document.addEventListener("rased:sync", e => {
    window.__rasedSync = e.detail;
    applySyncChip(e.detail);
  });
  window.addEventListener("online", () => { syncState.online = true; setTimeout(() => applySyncChip(syncState), 400); });
  window.addEventListener("offline", () => {
    syncState.online = false;
    applySyncChip(syncState);
    toast("انقطع الاتصال — سيستمر الحفظ على هذا الجهاز، وستُرفع البيانات فور عودة الاتصال.", { type: "warn", duration: 5200 });
  });
}

function openSyncModal() {
  const st = syncState;
  const body = `
    <div class="cloud-status ${st.online ? "on" : "off"}" style="margin-bottom:14px"><span class="dot"></span>
      <b>${st.online ? "متصل بالإنترنت" : "غير متصل بالإنترنت"}</b>
      <span style="margin-inline-start:auto">${st.configured ? (st.error ? "خطأ في المزامنة" : "المزامنة السحابية مفعّلة") : "المزامنة السحابية غير مفعّلة"}</span>
    </div>
    <div class="callout ${st.configured ? (st.error ? "warn" : "ok") : "info"}" style="margin-bottom:14px">
      ${st.configured
        ? `آخر مزامنة: ${st.lastSync ? new Date(st.lastSync).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }) : "لم تتم بعد"}<br>
           ${st.pending ? `يوجد ${fmt(st.pending)} تغيير بانتظار الرفع.` : "جميع التغييرات محفوظة."}
           ${st.error ? `<br><b>ملاحظة:</b> ${st.error}` : ""}`
        : `البيانات تُحفظ على هذا الجهاز فقط. يمكنك تفعيل مزامنة سحابية مجانية من إعدادات الإدارة لتظهر على جميع الأجهزة.`}
    </div>
    <p class="legal">الحفظ يتم فوراً في متصفحك حتى بدون إنترنت. عند تفعيل السحابة تُرفع التغييرات تلقائياً عند عودة الاتصال.</p>`;
  const m = modal({
    title: "حالة الاتصال والمزامنة", iconName: "sync", size: "sm",
    body,
    actions: [
      { label: "إغلاق", kind: "ghost" },
      ...(st.configured ? [{ label: "مزامنة الآن", kind: "primary", icon: "sync", onClick: async () => { const ok = await syncNow(); toast(ok ? "تمت المزامنة بنجاح." : "تعذر إكمال المزامنة. تحقق من الاتصال.", { type: ok ? "ok" : "error" }); } }] : []),
      { label: "إعدادات المزامنة", kind: "soft", icon: "settings", onClick: () => { location.hash = "#/admin/settings"; } }
    ]
  });
  m.dialog.querySelector(".modal-actions")?.classList.add("not-print");
}

/* ---------------- التثبيت ---------------- */
let deferredInstall = null;
function bindInstall() {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; });
  window.addEventListener("appinstalled", () => { deferredInstall = null; toast("تم تثبيت التطبيق على جهازك."); });
}
function showInstallBanner() {
  if (document.querySelector(".install-banner") || sessionStorage.getItem("rased_install_hide")) return;
  const b = document.createElement("div");
  b.className = "install-banner";
  b.innerHTML = `<span>${icon("download", 22)}</span><span style="flex:1">ثبّت «راصد» على جهازك للوصول السريع دون إنترنت.</span><button type="button" id="installBtn">تثبيت</button><button type="button" class="x" aria-label="إخفاء">${icon("x", 16)}</button>`;
  document.body.appendChild(b);
  b.querySelector("#installBtn").onclick = async () => {
    if (!deferredInstall) { toast("لتثبيت التطبيق: من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».", { type: "info", duration: 6000 }); return; }
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null; b.remove();
  };
  b.querySelector(".x").onclick = () => { sessionStorage.setItem("rased_install_hide", "1"); b.remove(); };
}

/* ---------------- الخدمة ---------------- */
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  let refreshing = false;
  const hadController = !!navigator.serviceWorker.controller;
  const applyUpdate = () => {
    if (refreshing) return;
    refreshing = true;
    try { sessionStorage.setItem("rased_updating", "1"); } catch (e) { }
    toast("جارٍ تحديث راصد تلقائياً…", { type: "info", duration: 2500 });
    setTimeout(() => {
      try { location.reload(); } catch (e) { }
    }, 900);
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) applyUpdate();
  });
  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    const activateWaiting = () => {
      if (!hadController) return;
      if (reg.waiting) { reg.waiting.postMessage("SKIP_WAITING"); applyUpdate(); }
    };
    activateWaiting();
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          nw.postMessage("SKIP_WAITING");
          applyUpdate();
        }
      });
    });
    setTimeout(() => reg.update().catch(() => { }), 8000);
    setInterval(() => { if (document.visibilityState === "visible") reg.update().catch(() => { }); }, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => { });
    });
  } catch (e) { console.warn("SW", e); }
}

/* ---------------- الإقلاع ---------------- */
async function boot() {
  bindSyncUI();
  bindInstall();
  try {
    await initDB();
    const settings = await getSettings();
    try { await applyExcusedRoster(todayISO()); } catch (e) { console.warn("excused auto", e); }
    document.documentElement.lang = "ar";
    if (settings.school?.name) document.title = `راصد — ${settings.school.name}`;
  } catch (e) {
    app.innerHTML = `<main class="page mid"><div class="empty-state"><span class="empty-ic">${icon("alert", 46)}</span><h3>تعذر فتح قاعدة البيانات</h3><p>${String(e.message || e)}</p></div></main>`;
    return;
  }
  await route();
  let remoteRefreshTimer = null;
  let remotePending = false;
  let remoteObserver = null;
  let remoteFocusBound = false;
  const remoteBusy = () => !!document.querySelector(".modal-overlay") ||
    (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
  const watchRemote = () => {
    if (remoteObserver) return;
    remoteObserver = new MutationObserver(() => {
      if (remotePending && !remoteBusy()) {
        remoteObserver.disconnect();
        remoteObserver = null;
        scheduleRemoteRefresh();
      }
    });
    remoteObserver.observe(document.body, { childList: true, subtree: true });
    if (!remoteFocusBound) {
      remoteFocusBound = true;
      document.addEventListener("focusout", () => {
        setTimeout(() => { if (remotePending && !remoteBusy()) scheduleRemoteRefresh(); }, 80);
      }, true);
    }
  };
  const applyRemoteRefresh = async () => {
    if (!remotePending) return;
    if (remoteBusy()) { watchRemote(); return; }
    remotePending = false;
    if (remoteObserver) { remoteObserver.disconnect(); remoteObserver = null; }
    const y = window.scrollY;
    const path = parseHash();
    if (/^\/attendance\/(?:absence|late)\/[123]\/?$/.test(path) && typeof window.__rasedAttendanceSync === "function") {
      try { await window.__rasedAttendanceSync(); } catch (e) { console.warn("attendance sync", e); }
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
      return;
    }
    try { await route(); } catch (e) { console.warn("remote refresh", e); }
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  };
  const scheduleRemoteRefresh = () => {
    clearTimeout(remoteRefreshTimer);
    remotePending = true;
    if (remoteBusy()) { watchRemote(); return; }
    remoteRefreshTimer = setTimeout(applyRemoteRefresh, 300);
  };
  window.addEventListener("rased:remote", e => {
    if (!e.detail?.changed) return;
    scheduleRemoteRefresh();
  });
  // الصفحات للقراءة فقط تتحدث أيضاً عند أي تغيير محلي مباشر.
  dbEvents.addEventListener("changed", e => {
    if (e.detail?.store === "settings") return;
    const path = parseHash();
    if (/^\/(?:$|summary|absentees|recurring)/.test(path)) scheduleRemoteRefresh();
  });
  initSync().then(st => {
    window.__rasedSync = st;
    applySyncChip(st);
    initRealtime();
    if (st?.configured) setTimeout(() => window.dispatchEvent(new CustomEvent("rased:remote", { detail: { changed: 1 } })), 250);
  }).catch(e => console.warn(e));
  setTimeout(() => autoBackupIfDue().catch(e => console.warn("backup", e)), 12000);
  setInterval(() => autoBackupIfDue().catch(e => console.warn("backup", e)), 6 * 60 * 60 * 1000);
  registerSW();
  $("#syncChip")?.addEventListener("click", openSyncModal);
  document.addEventListener("click", e => {
    const back = e.target.closest("[data-nav='back']");
    if (back) {
      e.preventDefault();
      if (history.length > 1) history.back();
      else location.hash = "#/";
    }
  });
  window.addEventListener("hashchange", () => {
    route();
    setTimeout(() => $("#syncChip")?.addEventListener("click", openSyncModal), 50);
  });
  // تحديث شريط الحالة عند تغيّر الاتصال
  setInterval(() => applySyncChip(syncState), 15000);
}

boot();
