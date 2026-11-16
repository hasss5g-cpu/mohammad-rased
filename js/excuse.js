/* ============================================================
   راصد — نموذج عذر الغياب لأولياء الأمور (رابط عام)
   ============================================================ */
import {
  $, icon, escapeHtml, formatHijri, formatHijriLong, formatGregorianLong, weekdayName, todayISO,
  verifyToken, displayPhone, waLink, readFileDataURL
} from "./core.js";
import { getSettings, getStudent, saveExcuse } from "./db.js";
import { brandMark, toast } from "./ui.js";
import { headerHTML } from "./ui.js";

function hashParams() {
  const q = (location.hash.split("?")[1] || "");
  return Object.fromEntries(new URLSearchParams(q));
}

export async function renderExcuseForm(root) {
  const settings = await getSettings();
  const p = hashParams();
  const sid = p.sid, date = p.d || todayISO(), token = p.t || "";
  const student = sid ? await getStudent(sid) : null;
  const valid = student && date && verifyToken(`${student.id}|${date}`, token, settings.excuseSecret || "rased");
  if (!valid) {
    root.innerHTML = `${headerHTML({ compact: true })}<main class="page mid">
      <div class="empty-state"><span class="empty-ic">${icon("alert", 46)}</span>
        <h3>رابط العذر غير صالح</h3><p>تأكد من فتح الرابط المرسل من المدرسة، أو تواصل مع إدارة المدرسة.</p>
        <a class="btn primary" href="#/">الرئيسية</a></div></main>`;
    return;
  }
  const school = settings.school || {};
  root.innerHTML = `
    ${headerHTML({ compact: true, admin: false })}
    <main class="page mid">
      <div class="public-excuse">
        <div class="public-head">
          ${brandMark(64)}
          <div>
            <span class="badge green">${escapeHtml(school.name || "")}</span>
            <h1>تقديم عذر الغياب</h1>
            <p>${escapeHtml(student.name)} — ${escapeHtml(formatHijriLong(date, true))}</p>
          </div>
        </div>
        <form id="excuseForm" class="section-card" style="margin-top:18px">
          <div class="section-body">
            <div class="callout info" style="margin-bottom:16px">عبّر عن سبب غياب ابنكم، وسيصل العذر إلى إدارة المدرسة. الحقول المعلّمة بـ * مطلوبة.</div>
            <div class="form-grid">
              <label class="field"><span class="field-label">نوع العذر *</span>
                <select class="input" id="ex-type" required>
                  <option value="">اختر نوع العذر</option>
                  <option>مرض</option><option>موعد طبي</option><option>ظرف عائلي</option><option>سفر</option><option>أخرى</option>
                </select>
              </label>
              <label class="field"><span class="field-label">تاريخ الغياب</span><input class="input" value="${formatHijri(date)}هـ — ${formatGregorianLong(date)}" readonly></label>
              <label class="field span-2"><span class="field-label">تفصيل العذر *</span><textarea class="input" id="ex-reason" rows="4" placeholder="اذكر سبب الغياب بإيجاز…" required></textarea></label>
              <label class="field"><span class="field-label">اسم ولي الأمر *</span><input class="input" id="ex-guardian" placeholder="الاسم الكامل" required></label>
              <label class="field"><span class="field-label">جوال ولي الأمر</span><input class="input" id="ex-phone" value="${escapeHtml(displayPhone(student.phone))}" dir="ltr"></label>
              <label class="field span-2"><span class="field-label">مرفق (اختياري)</span><input class="input" type="file" id="ex-file" accept="image/*,.pdf"><span class="field-hint">تقرير طبي أو ما يثبت العذر — بحد أقصى 2 ميجابايت.</span></label>
            </div>
            <div class="btn-row" style="margin-top:18px">
              <button class="btn primary lg" type="submit">${icon("check", 22)} إرسال العذر</button>
              <a class="btn ghost" href="#/">إلغاء</a>
            </div>
            <p class="legal" style="margin-top:12px">بإرسال العذر تقرّ بصحة البيانات، ويحق للمدرسة طلب المستندات الأصلية عند الحاجة.</p>
          </div>
        </form>
        <div id="excuseDone" class="hidden"></div>
      </div>
    </main>`;

  $("#excuseForm").addEventListener("submit", async e => {
    e.preventDefault();
    const type = $("#ex-type").value;
    const reason = $("#ex-reason").value.trim();
    const guardian = $("#ex-guardian").value.trim();
    const phone = $("#ex-phone").value.trim();
    if (!type || !reason || !guardian) { toast("أكمل الحقول المطلوبة.", { type: "error" }); return; }
    let attachment = "";
    const file = $("#ex-file").files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { toast("حجم المرفق أكبر من 2 ميجابايت.", { type: "error" }); return; }
      attachment = await readFileDataURL(file);
    }
    const rec = await saveExcuse({
      studentId: student.id, date, mode: "absence", type, reason, guardianName: guardian,
      guardianPhone: phone, attachment, status: "pending", source: "guardian"
    });
    const text = `عذر غياب — ${school.name || ""}\nالطالب: ${student.name}\nالتاريخ: ${formatHijri(date)}هـ (${date})\nنوع العذر: ${type}\nالتفصيل: ${reason}\nولي الأمر: ${guardian}\nالجوال: ${phone}`;
    const schoolPhone = settings.schoolWhatsApp || school.phone || "";
    const wa = schoolPhone ? waLink(schoolPhone, text) : "";
    $("#excuseForm").classList.add("hidden");
    $("#excuseDone").classList.remove("hidden");
    $("#excuseDone").innerHTML = `<div class="section-card"><div class="section-body" style="text-align:center;padding:34px 22px">
      <div class="empty-ic" style="background:var(--green-50);color:var(--green-700)">${icon("check", 46)}</div>
      <h2 style="font-size:1.5rem;font-weight:800;color:var(--green-900)">تم تجهيز العذر</h2>
      <p style="color:var(--muted);margin-top:6px">شكراً لتعاونكم. أرسل العذر عبر واتساب المدرسة ليصل إلى الإدارة وتتم مراجعته.</p>
      <div class="btn-row" style="justify-content:center;margin-top:18px">
        ${wa ? `<a class="btn primary lg" target="_blank" rel="noopener" href="${wa}">${icon("whatsapp", 22)} إرسال عبر واتساب</a>` : ""}
        <button class="btn ghost" id="copyExcuse">${icon("copy", 20)} نسخ نص العذر</button>
        <a class="btn ghost" href="#/">الرئيسية</a>
      </div>
      ${!wa ? `<div class="callout warn" style="margin-top:16px;text-align:start">لم يُسجَّل رقم واتساب للمدرسة. انسخ نص العذر وأرسله لإدارة المدرسة.</div>` : ""}
      <p class="legal" style="margin-top:16px">رقم العذر: ${escapeHtml(rec.id)}</p>
    </div></div>`;
    $("#copyExcuse").addEventListener("click", async () => { await navigator.clipboard.writeText(text); toast("تم نسخ نص العذر."); });
  });
}
