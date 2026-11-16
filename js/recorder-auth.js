/* ============================================================
   راصد — تسجيل دخول الرصد (منفصل عن الإدارة)
   ============================================================ */
import { $, icon, escapeHtml, signToken } from "./core.js";
import { getSettings } from "./db.js";
import { headerHTML, applySyncChip } from "./ui.js";

const REMEMBER_KEY = "rased_recorder_remember";
const SESSION_VERSION = "1";
const SESSION_KEY = "rased_recorder";
const VERSION_KEY = "rased_recorder_version";
const rememberToken = (settings) => signToken(`${settings.recorderUsername || "1"}|${settings.recorderPasswordHash || ""}`, "recorder-remember");

function isAuthed(settings) {
  if (sessionStorage.getItem("rased_admin") === "1") return true;
  if (sessionStorage.getItem(SESSION_KEY) === "1" && sessionStorage.getItem(VERSION_KEY) === SESSION_VERSION) return true;
  try {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved && saved === rememberToken(settings)) {
      sessionStorage.setItem(SESSION_KEY, "1");
      sessionStorage.setItem(VERSION_KEY, SESSION_VERSION);
      return true;
    }
  } catch (e) { }
  return false;
}

export async function requireRecorder(root) {
  const settings = await getSettings();
  if (isAuthed(settings)) return true;
  renderRecorderLogin(root, settings);
  return false;
}

export function renderRecorderLogin(root, settings) {
  let attempts = Number(sessionStorage.getItem("rased_rec_attempts") || 0);
  let lockedUntil = Number(sessionStorage.getItem("rased_rec_locked") || 0);
  root.innerHTML = `
    ${headerHTML({ compact: true, back: true, admin: false })}
    <main class="page mid">
      <div class="admin-login">
        <div class="pin-card" style="max-width:460px;width:100%">
          <div class="pin-icon">${icon("clipboard", 38)}</div>
          <h1>دخول الرصد</h1>
          <p>سجّل الدخول للبدء في رصد الغياب والتأخر.</p>
          <form id="recLoginForm" class="form-grid" autocomplete="on" style="text-align:start;margin-top:14px">
            <label class="field span-2"><span class="field-label">اسم المستخدم</span><input class="input" name="username" id="recUser" autocomplete="username" value="${escapeHtml(settings.recorderUsername || "1")}" required></label>
            <label class="field span-2"><span class="field-label">كلمة المرور</span><input class="input" type="password" name="password" id="recPass" autocomplete="current-password" required></label>
            <label class="mini-row span-2" style="cursor:pointer"><input type="checkbox" name="remember" id="recRemember" checked style="width:20px;height:20px;accent-color:#0f6b4f"><span class="grow">تذكرني للدخول المباشر في المرات القادمة</span></label>
            <div class="span-2"><button class="btn primary lg" type="submit" style="width:100%">${icon("check", 20)} دخول الرصد</button></div>
          </form>
          <div class="pin-error" id="recError" style="margin-top:10px"></div>
          <div class="pin-hint">اسم المستخدم الافتراضي: <b>1</b> — كلمة المرور: <b>0000</b>. الدخول مخصص للرصد فقط، ولا يفتح لوحة الإدارة.</div>
          <div class="btn-row" style="justify-content:center;margin-top:10px"><a class="btn ghost sm" href="#/">${icon("back", 16)} الرئيسية</a></div>
        </div>
      </div>
    </main>`;
  applySyncChip(window.__rasedSync || {});
  const err = $("#recError");
  function fail(msg) {
    err.textContent = msg;
    attempts++;
    sessionStorage.setItem("rased_rec_attempts", attempts);
    if (attempts >= 5) {
      lockedUntil = Date.now() + 30000;
      sessionStorage.setItem("rased_rec_locked", lockedUntil);
      err.textContent = "تم إيقاف المحاولات 30 ثانية لحماية النظام.";
    }
  }
  $("#recLoginForm").addEventListener("submit", e => {
    e.preventDefault();
    if (Date.now() < lockedUntil) { err.textContent = "يرجى الانتظار قبل المحاولة مجدداً."; return; }
    const username = String($("#recUser").value || "").trim();
    const password = String($("#recPass").value || "");
    const expectedUser = String(settings.recorderUsername || "1");
    const expectedHash = String(settings.recorderPasswordHash || "");
    if (username === expectedUser && signToken(password, "recorder-password") === expectedHash) {
      sessionStorage.setItem(SESSION_KEY, "1");
      sessionStorage.setItem(VERSION_KEY, SESSION_VERSION);
      sessionStorage.removeItem("rased_rec_attempts");
      sessionStorage.removeItem("rased_rec_locked");
      try {
        if ($("#recRemember")?.checked) localStorage.setItem(REMEMBER_KEY, rememberToken(settings));
        else localStorage.removeItem(REMEMBER_KEY);
      } catch (e2) { }
      location.reload();
    } else {
      fail("اسم المستخدم أو كلمة المرور غير صحيحة.");
    }
  });
}
