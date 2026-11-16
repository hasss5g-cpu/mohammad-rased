/* ============================================================
   راصد — إعدادات الموقع: المدرسة، الأمن، الإجازات، المزامنة، البيانات
   ============================================================ */
import {
  $, $$, icon, fmt, escapeHtml, todayISO, formatHijri, formatHijriLong, formatGregorianLong, parseHijriText,
  downloadJSON, readFileText, AR_WEEKDAYS, signToken, download
} from "./core.js";
import {
  getSettings, saveSettings, listHolidays, addHolidayRange, removeHoliday, exportAll, importAll,
  clearDemoData, resetAttendance, hasDemoData, listStudents, getResolvedCases, restoreCase, caseResolutionKey,
  getAutoBackups, saveAutoBackup, getAutoBackup, deleteAutoBackup, listExcusedRoster
} from "./db.js";
import { createCloud, connectCloud, disconnectCloud, copyCode, syncNow, getState } from "./sync.js";
import { SHARED_SYNC_CODE } from "./shared-cloud.js";
import { sectionCard, field, toast, confirmDialog, modal, copyText } from "./ui.js";

export async function renderSettings(root) {
  const settings = await getSettings();
  const holidays = await listHolidays();
  const resolvedCases = await getResolvedCases();
  const autoBackups = await getAutoBackups();
  const excusedCount = (await listExcusedRoster()).length;
  const st = getState();
  const demo = await hasDemoData();
  const school = settings.school || {};
  const upcoming = holidays.filter(h => h.date >= todayISO()).slice(0, 20);
  const past = holidays.filter(h => h.date < todayISO()).slice(-10).reverse();

  root.innerHTML = `
    <div class="admin-head"><div><h1>الإعدادات</h1><p>بيانات المدرسة، الأمن، أيام الإجازة، المزامنة السحابية، والنسخ الاحتياطي.</p></div>
      <div class="admin-head-actions"><a class="btn ghost" href="#/admin">${icon("back", 20)} لوحة الإدارة</a></div></div>

    <div class="settings-grid">
      <section class="section-card span-2">
        <div class="section-head"><div class="section-title">${icon("heart", 24)}<div><h2>طلاب ذوي الأعذار</h2><p>الطلاب الذين يُحوَّل غيابهم إلى «بعذر» تلقائياً عند تسجيله.</p></div></div></div>
        <div class="section-body">
          <div class="callout ${excusedCount ? "ok" : "info"}" style="margin:0">
            ${excusedCount ? `يوجد <b>${fmt(excusedCount)}</b> طالباً مسجلاً في قائمة ذوي الأعذار. لا يُسجَّل لهم غياب تلقائياً؛ فقط يُحوَّل الغياب المسجل إلى بعذر.` : "لا يوجد طلاب مسجلون حالياً. أضف الطالب ليُحوَّل غيابه المسجل إلى «بعذر» تلقائياً."}
          </div>
          <div class="btn-row" style="margin-top:12px">
            <a class="btn primary" href="#/admin/excused-roster">${icon("heart", 20)} فتح طلاب ذوي الأعذار</a>
          </div>
        </div>
      </section>

      <section class="section-card span-2">
        <div class="section-head"><div class="section-title">${icon("users", 24)}<div><h2>شكل شاشة الرصد</h2><p>طريقة عرض أسماء الطلاب أثناء إدخال الغياب.</p></div></div></div>
        <div class="section-body">
          <div class="switch-row">
            <div class="txt"><b>أزرار دائرية للطلاب</b><span>أسماء الطلاب وبياناتهم داخل دوائر، ويظهر طالبان متجاوران في السطر على الجوال لتوفير المساحة.</span></div>
            <label class="switch"><input type="checkbox" id="roundStudentCards" ${settings.roundStudentCards !== false ? "checked" : ""}><i></i></label>
          </div>
        </div>
      </section>

      <section class="section-card span-2">
        <div class="section-head"><div class="section-title">${icon("school", 24)}<div><h2>بيانات المدرسة</h2><p>تظهر في رأس الصفحات والمستندات الرسمية.</p></div></div></div>
        <div class="section-body">
          <form id="schoolForm" class="form-grid">
            <label class="field"><span class="field-label">اسم المدرسة</span><input class="input" name="name" value="${escapeHtml(school.name || "")}" required></label>
            <label class="field"><span class="field-label">المدينة</span><input class="input" name="city" value="${escapeHtml(school.city || "")}"></label>
            <label class="field"><span class="field-label">الإدارة التعليمية</span><input class="input" name="region" value="${escapeHtml(school.region || "")}"></label>
            <label class="field"><span class="field-label">قائد المدرسة</span><input class="input" name="principal" value="${escapeHtml(school.principal || "")}" placeholder="الاسم (اختياري)"></label>
            <label class="field"><span class="field-label">جوال المدير (لإحصائية واتساب)</span><input class="input" name="principalPhone" value="${escapeHtml(school.principalPhone || "")}" placeholder="05xxxxxxxx" dir="ltr"></label>
            <label class="field"><span class="field-label">جوال المدرسة</span><input class="input" name="phone" value="${escapeHtml(school.phone || "")}" placeholder="05xxxxxxxx" dir="ltr"></label>
            <label class="field"><span class="field-label">البريد الإلكتروني</span><input class="input" name="email" type="email" value="${escapeHtml(school.email || "")}" dir="ltr"></label>
            <label class="field"><span class="field-label">العام الدراسي</span><input class="input" name="academicYear" value="${escapeHtml(settings.academicYear || "1448")}"></label>
            <div class="span-2 btn-row"><button class="btn primary" type="submit">${icon("save", 20)} حفظ بيانات المدرسة</button></div>
          </form>
        </div>
      </section>

      <section class="section-card span-2">
        <div class="section-head"><div class="section-title">${icon("calendar", 24)}<div><h2>الفترة الدراسية</h2><p>اختر الفترة النشطة، وحدّد بدايتها ونهايتها بالتاريخ الهجري.</p></div></div></div>
        <div class="section-body">
          <div class="form-grid">
            <label class="field"><span class="field-label">الفترة النشطة حالياً</span>
              <select class="input" id="activeTerm">
                <option value="1" ${Number(settings.activeTerm) !== 2 ? "selected" : ""}>الفترة الدراسية الأولى</option>
                <option value="2" ${Number(settings.activeTerm) === 2 ? "selected" : ""}>الفترة الدراسية الثانية</option>
              </select>
            </label>
            <label class="field"><span class="field-label">الفترة الأولى — من (هجري)</span><input class="input" id="term1Start" value="${formatHijri(settings.term1Start || settings.termStart || todayISO())}"></label>
            <label class="field"><span class="field-label">الفترة الأولى — إلى (هجري)</span><input class="input" id="term1End" value="${formatHijri(settings.term1End || settings.termStart || todayISO())}"></label>
            <label class="field"><span class="field-label">الفترة الثانية — من (هجري)</span><input class="input" id="term2Start" value="${formatHijri(settings.term2Start || settings.termEnd || todayISO())}"></label>
            <label class="field"><span class="field-label">الفترة الثانية — إلى (هجري)</span><input class="input" id="term2End" value="${formatHijri(settings.term2End || settings.termEnd || todayISO())}"></label>
          </div>
          <div class="callout warn" style="margin-top:12px">
            عند اختيار <b>الفترة الدراسية الثانية</b> تبدأ فترة تسجيل وعدّادات جديدة، وتُصفَّر إحصاءات الحالات والتقارير الافتراضية للفترة الجديدة، مع <b>الاحتفاظ الكامل</b> بمدخلات الفترة الأولى في قاعدة البيانات (يمكن الرجوع إليها بتقرير مخصص أو بإعادة اختيار الفترة الأولى).
          </div>
          <div class="btn-row" style="margin-top:12px"><button class="btn primary" id="saveTerms">${icon("save", 20)} حفظ الفترة الدراسية</button></div>
        </div>
      </section>

      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("eye", 24)}<div><h2>الحالات المتكررة المخفية</h2><p>الحالات التي تم عمل الإجراء اللازم معها وتم إخفاؤها من قائمة المتابعة.</p></div></div></div>
        <div class="section-body">
          <p class="legal" style="margin:0 0 10px">عدد الحالات المخفية: <b>${fmt(Object.keys(resolvedCases).length)}</b>. يمكنك إعادة إظهار أي حالة لتعود إلى قائمة الحالات المتكررة.</p>
          <button class="btn ghost" id="showResolvedCases">${icon("eye", 20)} عرض الحالات المخفية</button>
        </div>
      </section>

      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("lock", 24)}<div><h2>بيانات دخول الإدارة</h2><p>اسم المستخدم وكلمة المرور المستخدمة في لوحة الإدارة.</p></div></div></div>
        <div class="section-body">
          <form id="pinForm" class="form-grid">
            <label class="field span-2"><span class="field-label">كلمة المرور الحالية</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
            <label class="field"><span class="field-label">اسم المستخدم الجديد</span><input class="input" name="username" value="${escapeHtml(settings.adminUsername || "admin")}" autocomplete="username" required></label>
            <label class="field"><span class="field-label">كلمة المرور الجديدة</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="4" required></label>
            <label class="field span-2"><span class="field-label">تأكيد كلمة المرور</span><input class="input" type="password" name="confirm" autocomplete="new-password" minlength="4" required></label>
            <div class="span-2"><button class="btn primary" type="submit">${icon("shield", 20)} حفظ بيانات الدخول</button></div>
          </form>
        </div>
      </section>

      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("clipboard", 24)}<div><h2>بيانات دخول الرصد</h2><p>اسم المستخدم وكلمة المرور لفتح صفحات الرصد فقط.</p></div></div></div>
        <div class="section-body">
          <form id="recorderForm" class="form-grid">
            <label class="field"><span class="field-label">اسم المستخدم</span><input class="input" name="username" value="${escapeHtml(settings.recorderUsername || "1")}" autocomplete="username" required></label>
            <label class="field"><span class="field-label">كلمة المرور الجديدة</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="4" required></label>
            <label class="field span-2"><span class="field-label">تأكيد كلمة المرور</span><input class="input" type="password" name="confirm" autocomplete="new-password" minlength="4" required></label>
            <div class="span-2"><button class="btn primary" type="submit">${icon("shield", 20)} حفظ بيانات دخول الرصد</button></div>
          </form>
        </div>
      </section>

      <section class="section-card">
        <div class="section-head"><div class="section-title">${icon("calendar", 24)}<div><h2>أيام الإجازة</h2><p>تُستبعد تلقائياً من الرصد والتقارير.</p></div></div></div>
        <div class="section-body">
          <div class="field"><span class="field-label">أيام نهاية الأسبوع</span>
            <div class="chips" id="weekendChips">
              ${AR_WEEKDAYS.map((d, i) => `<button type="button" class="chip ${(settings.weekend || [5, 6]).includes(i) ? "active" : ""}" data-weekday="${i}">${d}</button>`).join("")}
            </div>
          </div>
          <div class="switch-row" style="margin-top:10px">
            <div class="txt"><b>السماح بالرصد في أيام الإجازة</b><span>مفيد للاستثناءات فقط.</span></div>
            <label class="switch"><input type="checkbox" id="allowHoliday" ${settings.allowHolidayRecording ? "checked" : ""}><i></i></label>
          </div>
          <div class="divider"></div>
          <form id="holidayForm" class="form-grid">
            <label class="field"><span class="field-label">من تاريخ (هجري)</span><input class="input" name="from" placeholder="1448/6/6" required></label>
            <label class="field"><span class="field-label">إلى تاريخ (هجري)</span><input class="input" name="to" placeholder="1448/6/6"></label>
            <label class="field span-2"><span class="field-label">المناسبة</span><input class="input" name="title" placeholder="مثال: إجازة عيد الفطر" required></label>
            <div class="span-2"><button class="btn soft" type="submit">${icon("plus", 20)} إضافة إجازة</button></div>
          </form>
          <div class="divider"></div>
          <div class="holiday-list">
            ${[...upcoming, ...past].length ? [...upcoming, ...past].map(h => `<div class="holiday-item"><span class="h-date">${formatHijri(h.date)}</span><span class="grow">${escapeHtml(h.title)}<br><span style="font-size:.68rem;color:#5d6c64">${formatGregorianLong(h.date)}</span></span><button class="icon-btn" style="width:38px;height:38px" data-del-holiday="${h.date}" aria-label="حذف">${icon("trash", 18)}</button></div>`).join("") : `<p class="legal">لا توجد إجازات مضافة غير نهاية الأسبوع.</p>`}
          </div>
        </div>
      </section>

      <section class="section-card span-2">
        <div class="section-head"><div class="section-title">${icon("cloud", 24)}<div><h2>المزامنة السحابية</h2><p>تظهر البيانات على جميع الأجهزة، وتُرفع التغييرات فور عودة الاتصال.</p></div></div></div>
        <div class="section-body">
          ${st.shared ? `<div class="callout ok" style="margin-bottom:12px"><b>المزامنة المشتركة مفعّلة:</b> أي إدخال من أي جهاز يظهر لبقية الأجهزة خلال ثوانٍ. لا حاجة لإدخال رمز على الأجهزة الأخرى.</div>` : `<div class="callout info" style="margin-bottom:12px"><b>المزامنة المشتركة غير مفعّلة على هذا الجهاز.</b> فعّلها لتظهر بيانات أي جهاز على بقية الأجهزة تلقائياً.<div class="btn-row" style="margin-top:8px"><button class="btn primary" id="enableShared">${icon("cloud", 18)} تفعيل المزامنة المشتركة</button></div></div>`}
          ${st.configured ? cloudConfiguredHTML(settings, st) : cloudSetupHTML()}
          <div class="callout info" style="margin-top:14px;font-size:.76rem">
            المزامنة المجانية عبر BrewPage تحفظ نسخة غير معلنة (خاصة بالرابط) لمدة تصل إلى 30 يوماً، ويجب تجديدها قبل الانتهاء. بياناتك محفوظة دائماً على هذا الجهاز، ويمكنك تصدير نسخة احتياطية في أي وقت. للحصول على مزامنة دائمة يمكن ربط خادم خاص لاحقاً.
          </div>
          ${st.shared ? `<div class="callout warn" style="margin-top:10px;font-size:.76rem">
            <b>تنبيه للمزامنة المشتركة:</b> رمز المزامنة مضمّن في الموقع، لذلك أي زائر يستطيع قراءة بيانات الغياب والكتابة فيها. لا تضع بيانات حساسة خارج نطاق المدرسة، وتجنّب الرصد المتزامن لنفس الفصل من أكثر من جهاز في اللحظة نفسها. جدّد النسخة السحابية قبل 30 يوماً أو صدّر نسخة احتياطية.
          </div>` : ""}
        </div>
      </section>

      <section class="section-card span-2">
        <div class="section-head"><div class="section-title">${icon("download", 24)}<div><h2>النسخ الاحتياطي والبيانات</h2><p>صدّر نسخة كاملة أو استعدها على جهاز آخر.</p></div></div></div>
        <div class="section-body">
          <div class="btn-row">
            <button class="btn primary" id="exportBackup">${icon("download", 20)} تصدير نسخة احتياطية</button>
            <button class="btn ghost" id="importBackupBtn">${icon("upload", 20)} استيراد نسخة</button>
            <input type="file" id="importBackupFile" accept=".json,application/json" hidden>
            ${demo ? `<button class="btn ghost" id="clearDemo">${icon("trash", 20)} حذف البيانات التجريبية</button>` : ""}
            <button class="btn outline-danger" id="resetAttendance">${icon("trash", 20)} مسح سجلات الرصد</button>
          </div>
          <p class="legal" style="margin-top:12px">«مسح سجلات الرصد» يحذف الغياب والتأخر والأعذار والإجراءات، ويُبقي قاعدة الطلاب والإعدادات.</p>
        </div>
      </section>

      <section class="section-card span-2">
        <div class="section-head"><div class="section-title">${icon("refresh", 24)}<div><h2>النسخ الاحتياطية الدورية</h2><p>نسخة تلقائية كل 24 ساعة، محفوظة في سحابة راصد المشتركة.</p></div></div></div>
        <div class="section-body">
          <div class="callout ${autoBackups.length ? "ok" : "info"}" style="margin-bottom:12px">
            ${autoBackups.length ? `آخر نسخة: <b>${autoBackups[0].at ? formatHijri(new Date(autoBackups[0].at).toISOString().slice(0, 10)) + "هـ" : "—"}</b> — عدد النسخ المحفوظة: <b>${fmt(autoBackups.length)}</b> من 3.` : "لم تُنشأ نسخة تلقائية بعد. ستُنشأ أول نسخة بعد توفر بيانات الرصد."}
          </div>
          <p class="legal" style="margin:0 0 10px">تُحفظ آخر 3 نسخ تلقائياً، وتُرفع إلى سحابة راصد المشتركة لتظهر على الأجهزة. يمكنك تنزيل أي نسخة أو استعادتها من زر «عرض النسخ».</p>
          <div class="btn-row">
            <button class="btn primary" id="backupNow">${icon("save", 20)} إنشاء نسخة الآن</button>
            <button class="btn ghost" id="showAutoBackups" ${autoBackups.length ? "" : "disabled"}>${icon("eye", 20)} عرض النسخ (${fmt(autoBackups.length)})</button>
          </div>
        </div>
      </section>

      <section class="section-card span-2">
        <div class="section-head"><div class="section-title">${icon("link", 24)}<div><h2>روابط الدخول</h2><p>رابط الرصد للمعلمين، ورابط الإدارة المحمي بالرقم السري.</p></div></div></div>
        <div class="section-body">
          ${linkRow("رابط الرصد", `${location.origin}${location.pathname}#/`, "rec")}
          ${linkRow("رابط الإدخال المباشر", `${location.origin}/entry.html`, "entry")}
          ${linkRow("رابط الإدارة", `${location.origin}${location.pathname}#/admin`, "admin")}
          <p class="legal" style="margin-top:10px">يمكنك إرسال رابط الرصد أو رابط الإدخال المباشر للمعلمين. رابط الإدارة لا يفتح إلا بالرقم السري.</p>
        </div>
      </section>

      <section class="section-card span-2">
        <div class="section-head"><div class="section-title">${icon("info", 24)}<div><h2>عن النظام</h2></div></div></div>
        <div class="section-body">
          <p class="legal">راصد — نظام رصد الغياب والتأخر اليومي. يعمل دون إنترنت، ويحفظ فوراً في المتصفح. الإصدار 3.4.1 — العام الدراسي ${escapeHtml(settings.academicYear || "1448")}هـ.</p>
          <p class="legal">مبني وفق إجراءات وزارة التعليم للتعامل مع الطلبة المتغيبين (المادتان 33 و34) ودليل قواعد السلوك والمواظبة.</p>
          <div class="btn-row" style="margin-top:12px"><a class="btn ghost" href="./guide.html" target="_blank" rel="noopener">${icon("book", 20)} دليل الاستخدام الكامل</a><a class="btn ghost" href="./whatsapp-extension.zip" download>${icon("download", 20)} تحميل إضافة واتساب</a></div>
        </div>
      </section>
    </div>`;

  bindSchool(settings);
  bindDisplay(settings);
  bindTerms(settings);
  bindResolvedCases(root);
  bindPin(settings);
  bindRecorder(settings);
  bindHolidays(settings);
  bindCloud(settings, st);
  bindData(settings);
  bindAutoBackups(root);
}

function linkRow(label, url, key) {
  return `<div class="field" style="margin-bottom:10px"><span class="field-label">${label}</span>
    <div class="copy-row"><input class="input" readonly value="${escapeHtml(url)}" id="link-${key}"><button class="btn ghost" data-copy-link="${key}">${icon("copy", 18)} نسخ</button></div></div>`;
}

function cloudSetupHTML() {
  return `<div class="callout info" style="margin-bottom:14px">لم يتم تفعيل المزامنة بعد. أنشئ سحابة مجانية بضغطة واحدة، ثم شارك رمز المزامنة مع الأجهزة الأخرى.</div>
    <div class="btn-row">
      <button class="btn primary" id="createCloud">${icon("cloud", 20)} إنشاء سحابة جديدة</button>
      <button class="btn ghost" id="connectCloudBtn">${icon("link", 20)} ربط برمز موجود</button>
    </div>
    <div id="connectBox" class="hidden" style="margin-top:14px">
      <label class="field"><span class="field-label">رمز المزامنة</span><input class="input" id="syncCodeInput" placeholder="RASED1...." dir="ltr"></label>
      <div class="btn-row" style="margin-top:8px"><button class="btn primary" id="doConnect">ربط</button></div>
    </div>`;
}

function cloudConfiguredHTML(settings, st) {
  const exp = st.expiresAt ? new Date(st.expiresAt) : null;
  const daysLeft = exp ? Math.ceil((exp - Date.now()) / 86400000) : null;
  return `<div class="cloud-status ${st.error ? "off" : "on"}"><span class="dot"></span>
      <b>${st.error ? "تحقق من المزامنة" : "المزامنة مفعّلة"}</b>
      <span style="margin-inline-start:auto">${st.lastSync ? "آخر مزامنة: " + new Date(st.lastSync).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }) : "لم تتم المزامنة بعد"}</span>
    </div>
    ${st.error ? `<div class="callout warn" style="margin-top:10px">${escapeHtml(st.error)}</div>` : ""}
    ${daysLeft != null && daysLeft <= 7 ? `<div class="callout warn" style="margin-top:10px">تنتهي صلاحية السحابة خلال ${daysLeft} يوماً. أنشئ سحابة جديدة قبل الانتهاء للحفاظ على المزامنة.</div>` : ""}
    <div class="copy-row" style="margin-top:12px">
      <input class="input" id="syncCodeShow" readonly value="RASED1.…" dir="ltr">
      <button class="btn ghost" id="showCode">${icon("eye", 18)} إظهار الرمز</button>
      <button class="btn ghost" id="copyCodeBtn">${icon("copy", 18)} نسخ</button>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn primary" id="syncNowBtn">${icon("sync", 20)} مزامنة الآن</button>
      <button class="btn ghost" id="recreateCloud">${icon("refresh", 20)} إنشاء سحابة جديدة</button>
      <button class="btn outline-danger" id="disconnectCloud">${icon("cloudOff", 20)} قطع الاتصال</button>
    </div>`;
}

/* ---------------- ربط الأحداث ---------------- */
function bindSchool(settings) {
  $("#schoolForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    await saveSettings({
      school: { ...settings.school, name: f.get("name").trim(), city: f.get("city").trim(), region: f.get("region").trim(), principal: f.get("principal").trim(), principalPhone: f.get("principalPhone").trim(), phone: f.get("phone").trim(), email: f.get("email").trim() },
      academicYear: f.get("academicYear").trim()
    });
    toast("تم حفظ بيانات المدرسة.");
  });
}

function bindResolvedCases(root) {
  $("#showResolvedCases")?.addEventListener("click", async () => {
    const [resolved, students] = await Promise.all([getResolvedCases(), listStudents({ includeInactive: true })]);
    const smap = new Map(students.map(s => [s.id, s]));
    const entries = Object.entries(resolved).sort((a, b) => String(b[1].at || "").localeCompare(String(a[1].at || "")));
    if (!entries.length) { toast("لا توجد حالات مخفية حالياً.", { type: "info" }); return; }
    const labels = { unexcused: "غياب بدون عذر", excused: "غياب بعذر", late: "تأخر متكرر" };
    const body = `<div class="table-wrap" style="border:1px solid var(--line)"><table class="data-table"><thead><tr><th>الطالب</th><th>الفئة</th><th>عدد الأيام</th><th>تاريخ الإخفاء</th><th></th></tr></thead><tbody>
      ${entries.map(([key, r]) => {
        const s = smap.get(r.studentId);
        const at = r.at ? formatHijri(new Date(r.at).toISOString().slice(0, 10)) + "هـ" : "—";
        return `<tr><td>${escapeHtml(s?.name || "طالب محذوف")}</td><td>${escapeHtml(labels[r.category] || r.category)}</td><td>${fmt(r.count || 0)}</td><td>${at}</td><td><button class="btn ghost sm" data-restore-case="${escapeHtml(key)}">${icon("eye", 16)} إظهار</button></td></tr>`;
      }).join("")}
    </tbody></table></div><p class="legal" style="margin:10px 0 0">إظهار الحالة يعيدها إلى قائمة الحالات المتكررة، ولا يحذف سجل الإجراءات السابق.</p>`;
    const m = modal({
      title: "الحالات المتكررة المخفية", subtitle: `${fmt(entries.length)} حالة تم عمل الإجراء اللازم معها`, iconName: "eye", size: "lg", body,
      actions: [{ label: "إغلاق", kind: "ghost" }]
    });
    $$("[data-restore-case]").forEach(b => b.addEventListener("click", async () => {
      await restoreCase(b.dataset.restoreCase);
      toast("تمت إعادة إظهار الحالة.");
      m.close();
      renderSettings(root);
    }));
  });
}

function bindAutoBackups(root) {
  $("#backupNow")?.addEventListener("click", async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const old = btn.innerHTML; btn.innerHTML = `${icon("sync", 20)} جارٍ إنشاء النسخة…`;
    try {
      const b = await saveAutoBackup("manual");
      toast("تم إنشاء نسخة احتياطية ورفعها إلى سحابة راصد.");
      renderSettings(root);
    } catch (err) {
      toast("تعذر إنشاء النسخة: " + (err.message || err), { type: "error", duration: 7000 });
      btn.disabled = false; btn.innerHTML = old;
    }
  });
  $("#showAutoBackups")?.addEventListener("click", async () => {
    const list = await getAutoBackups();
    if (!list.length) { toast("لا توجد نسخ احتياطية بعد.", { type: "info" }); return; }
    const body = `<div class="table-wrap" style="border:1px solid var(--line)"><table class="data-table"><thead><tr><th>التاريخ</th><th>الحجم</th><th>النوع</th><th></th></tr></thead><tbody>
      ${list.map(b => `<tr><td>${b.at ? formatHijri(new Date(b.at).toISOString().slice(0, 10)) + "هـ" : "—"}</td><td>${fmt(Math.round((b.size || 0) / 1024))} ك.ب</td><td>${b.trigger === "manual" ? "يدوية" : "تلقائية"}</td><td>
        <div class="btn-row" style="margin:0"><button class="btn ghost sm" data-bkp-download="${b.id}">${icon("download", 16)} تنزيل</button><button class="btn soft sm" data-bkp-restore="${b.id}">${icon("refresh", 16)} استعادة</button><button class="btn outline-danger sm" data-bkp-delete="${b.id}">${icon("trash", 16)}</button></div>
      </td></tr>`).join("")}
    </tbody></table></div><p class="legal" style="margin:10px 0 0">النسخ محفوظة أيضاً في سحابة راصد المشتركة. الاستعادة تستبدل بيانات هذا الجهاز بالنسخة المختارة.</p>`;
    const m = modal({ title: "النسخ الاحتياطية الدورية", iconName: "refresh", size: "lg", body, actions: [{ label: "إغلاق", kind: "ghost" }] });
    $$("[data-bkp-download]").forEach(btn => btn.addEventListener("click", async () => {
      const full = await getAutoBackup(btn.dataset.bkpDownload);
      if (!full) return;
      const stamp = full.meta.at ? full.meta.at.slice(0, 10) : todayISO();
      download(`rased-backup-${stamp}.json`, JSON.stringify(full.data, null, 2), "application/json;charset=utf-8");
      toast("تم تنزيل النسخة الاحتياطية.");
    }));
    $$("[data-bkp-restore]").forEach(btn => btn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "استعادة نسخة احتياطية",
        message: "ستُستبدل بيانات هذا الجهاز بالنسخة المختارة. هل تريد المتابعة؟",
        confirmText: "استعادة", iconName: "refresh"
      });
      if (!ok) return;
      const full = await getAutoBackup(btn.dataset.bkpRestore);
      if (!full) { toast("النسخة غير موجودة.", { type: "error" }); return; }
      await importAll(full.data, "replace");
      toast("تمت استعادة النسخة. سيُحدَّث الموقع.");
      setTimeout(() => location.reload(), 900);
    }));
    $$("[data-bkp-delete]").forEach(btn => btn.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "حذف النسخة", message: "هل تريد حذف هذه النسخة الاحتياطية؟", confirmText: "حذف", iconName: "trash" });
      if (!ok) return;
      await deleteAutoBackup(btn.dataset.bkpDelete);
      m.close();
      toast("تم حذف النسخة.");
      renderSettings(root);
    }));
  });
}

function bindDisplay(settings) {
  $("#roundStudentCards")?.addEventListener("change", async e => {
    await saveSettings({ roundStudentCards: e.target.checked });
    toast(e.target.checked
      ? "تم تفعيل الأزرار الدائرية: سيظهر طالبان في السطر على الجوال."
      : "تم إيقاف الأزرار الدائرية: سيظهر طالب واحد في السطر على الجوال.");
  });
}

function bindTerms(settings) {
  $("#saveTerms").addEventListener("click", async () => {
    const t1s = parseHijriText($("#term1Start").value), t1e = parseHijriText($("#term1End").value);
    const t2s = parseHijriText($("#term2Start").value), t2e = parseHijriText($("#term2End").value);
    if (!t1s || !t1e || !t2s || !t2e) { toast("أدخل تواريخ الفترتين بالصيغة الهجرية 1448/3/10.", { type: "error" }); return; }
    if (t1s.iso > t1e.iso || t2s.iso > t2e.iso || t1e.iso > t2s.iso) { toast("تحقق من ترتيب التواريخ: الأولى تنتهي قبل بداية الثانية.", { type: "error" }); return; }
    const newTerm = Number($("#activeTerm").value) === 2 ? 2 : 1;
    if (newTerm !== Number(settings.activeTerm)) {
      const ok = await confirmDialog({
        title: newTerm === 2 ? "بدء الفترة الدراسية الثانية" : "الرجوع للفترة الدراسية الأولى",
        message: newTerm === 2
          ? "ستبدأ فترة تسجيل وعدّادات جديدة للفترة الثانية، وتبدأ الإحصائيات والتقارير الافتراضية من صفر لهذه الفترة. مدخلات الفترة الأولى ستبقى محفوظة كاملة. هل تريد المتابعة؟"
          : "سيتم تحويل العدادات والتقارير الافتراضية إلى الفترة الأولى. هل تريد المتابعة؟",
        confirmText: newTerm === 2 ? "بدء الفترة الثانية" : "تحويل للفترة الأولى",
        iconName: "calendar"
      });
      if (!ok) return;
    }
    await saveSettings({
      activeTerm: newTerm,
      term1Start: t1s.iso, term1End: t1e.iso,
      term2Start: t2s.iso, term2End: t2e.iso,
      termStart: t1s.iso, termEnd: t2e.iso
    });
    toast(newTerm === 2 ? "تم بدء الفترة الدراسية الثانية. العدادات الجديدة تبدأ من صفر." : "تم تفعيل الفترة الدراسية الأولى.");
    setTimeout(() => location.reload(), 900);
  });
}

function bindPin(settings) {
  $("#pinForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (signToken(String(f.get("current")), "admin-password") !== String(settings.adminPasswordHash)) {
      toast("كلمة المرور الحالية غير صحيحة.", { type: "error" }); return;
    }
    const username = String(f.get("username") || "").trim();
    const next = String(f.get("next") || "");
    if (!/^[A-Za-z0-9_\u0600-\u06FF]{2,32}$/.test(username)) { toast("اسم المستخدم يجب أن يكون 2–32 حرفاً.", { type: "error" }); return; }
    if (next.length < 4) { toast("كلمة المرور يجب أن تكون 4 أحرف على الأقل.", { type: "error" }); return; }
    if (next !== String(f.get("confirm"))) { toast("تأكيد كلمة المرور غير مطابق.", { type: "error" }); return; }
    await saveSettings({ adminUsername: username, adminPasswordHash: signToken(next, "admin-password") });
    try { localStorage.removeItem("rased_admin_remember"); } catch (e2) { }
    e.target.reset();
    $("#pinForm [name='username']").value = username;
    toast("تم حفظ بيانات الدخول. سجّل الدخول بكلمة المرور الجديدة في المرة القادمة.");
  });
}

function bindRecorder(settings) {
  $("#recorderForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const username = String(f.get("username") || "").trim();
    const next = String(f.get("next") || "");
    if (!/^[A-Za-z0-9_\u0600-\u06FF]{1,32}$/.test(username)) { toast("اسم مستخدم الرصد غير صالح.", { type: "error" }); return; }
    if (next.length < 4) { toast("كلمة مرور الرصد يجب أن تكون 4 أحرف على الأقل.", { type: "error" }); return; }
    if (next !== String(f.get("confirm"))) { toast("تأكيد كلمة المرور غير مطابق.", { type: "error" }); return; }
    await saveSettings({ recorderUsername: username, recorderPasswordHash: signToken(next, "recorder-password") });
    try { localStorage.removeItem("rased_recorder_remember"); } catch (e2) { }
    e.target.reset();
    $("#recorderForm [name='username']").value = username;
    toast("تم حفظ بيانات دخول الرصد.");
  });
}

function bindHolidays(settings) {
  $$("#weekendChips [data-weekday]").forEach(b => b.addEventListener("click", async () => {
    b.classList.toggle("active");
    const days = $$("#weekendChips .chip.active").map(x => Number(x.dataset.weekday));
    await saveSettings({ weekend: days });
    toast("تم تحديث أيام نهاية الأسبوع.");
  }));
  $("#allowHoliday").addEventListener("change", async e => {
    await saveSettings({ allowHolidayRecording: e.target.checked });
    toast(e.target.checked ? "سيُسمح بالرصد في أيام الإجازة." : "سيُستبعد الرصد في أيام الإجازة.");
  });
  $("#holidayForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const from = parseHijriText(f.get("from"));
    const to = parseHijriText(f.get("to") || f.get("from"));
    if (!from || !to || !from.iso || !to.iso) { toast("أدخل تاريخاً هجرياً صحيحاً.", { type: "error" }); return; }
    if (from.iso > to.iso) { toast("تاريخ البداية يجب أن يسبق النهاية.", { type: "error" }); return; }
    const n = await addHolidayRange(from.iso, to.iso, f.get("title").trim(), "custom");
    toast(`تمت إضافة ${fmt(n)} يوماً إلى الإجازات.`);
    location.reload();
  });
  rootQueryAll("[data-del-holiday]").forEach(b => b.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "حذف إجازة", message: "هل تريد حذف هذا اليوم من قائمة الإجازات؟", confirmText: "حذف", iconName: "trash" });
    if (!ok) return;
    await removeHoliday(b.dataset.delHoliday);
    location.reload();
  }));
  rootQueryAll("[data-copy-link]").forEach(b => b.addEventListener("click", async () => {
    const input = document.getElementById("link-" + b.dataset.copyLink);
    if (input) { await copyText(input.value); toast("تم نسخ الرابط."); }
  }));
}

function bindCloud(settings, st) {
  $("#enableShared")?.addEventListener("click", async e => {
    const ok = await confirmDialog({
      title: "تفعيل المزامنة المشتركة",
      message: "سيتم ربط هذا الجهاز بسحابة المدرسة المشتركة، وستظهر بيانات جميع الأجهزة خلال ثوانٍ. قد تُدمج البيانات المحلية مع السحابة. هل تريد المتابعة؟",
      confirmText: "تفعيل", iconName: "cloud"
    });
    if (!ok) return;
    const btn = e.currentTarget; btn.disabled = true;
    try {
      await connectCloud(SHARED_SYNC_CODE, { verify: true, shared: true, syncSettings: false });
      toast("تم تفعيل المزامنة المشتركة. سيُحدَّث الموقع.");
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      toast("تعذر تفعيل المزامنة المشتركة: " + (err.message || err), { type: "error", duration: 7000 });
      btn.disabled = false;
    }
  });
  if (!st.configured) {
    $("#createCloud")?.addEventListener("click", async e => {
      const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = `${icon("sync", 20)} جارٍ الإنشاء…`;
      try {
        const c = await createCloud();
        const code = await copyCode();
        modal({
          title: "تم إنشاء السحابة", iconName: "cloud", size: "lg",
          body: `<div class="callout ok">تم إنشاء المزامنة السحابية. احتفظ برمز المزامنة وأرسله للأجهزة الأخرى.</div>
            <label class="field" style="margin-top:12px"><span class="field-label">رمز المزامنة</span><textarea class="input" rows="4" readonly dir="ltr" id="newSyncCode">${escapeHtml(code)}</textarea></label>
            <div class="btn-row" style="margin-top:8px"><button class="btn primary" id="copyNewCode">${icon("copy", 18)} نسخ الرمز</button></div>`,
          actions: [{ label: "تم", kind: "ghost", onClick: () => location.reload() }]
        });
        $("#copyNewCode")?.addEventListener("click", async () => { await copyText(code); toast("تم نسخ رمز المزامنة."); });
      } catch (err) { toast("تعذر إنشاء السحابة: " + err.message, { type: "error" }); btn.disabled = false; btn.innerHTML = `${icon("cloud", 20)} إنشاء سحابة جديدة`; }
    });
    $("#connectCloudBtn")?.addEventListener("click", () => $("#connectBox")?.classList.toggle("hidden"));
    $("#doConnect")?.addEventListener("click", async () => {
      const code = $("#syncCodeInput").value.trim();
      if (!code) { toast("ألصق رمز المزامنة أولاً.", { type: "warn" }); return; }
      try {
        await connectCloud(code);
        toast("تم ربط السحابة وسحب البيانات.");
        location.reload();
      } catch (e) { toast("تعذر الربط: " + e.message, { type: "error" }); }
    });
  } else {
    $("#showCode")?.addEventListener("click", async () => {
      const code = await copyCode();
      const input = $("#syncCodeShow"); if (input) input.value = code;
    });
    $("#copyCodeBtn")?.addEventListener("click", async () => { const code = await copyCode(); await copyText(code); toast("تم نسخ رمز المزامنة."); });
    $("#syncNowBtn")?.addEventListener("click", async e => {
      const btn = e.currentTarget; btn.disabled = true;
      const ok = await syncNow();
      toast(ok ? "تمت المزامنة بنجاح." : "تعذر إتمام المزامنة. تحقق من الاتصال.", { type: ok ? "ok" : "error" });
      btn.disabled = false;
    });
    $("#recreateCloud")?.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "إنشاء سحابة جديدة", message: "سيتم إنشاء رابط مزامنة جديد، وستحتاج إلى إرسال الرمز الجديد للأجهزة الأخرى. بياناتك الحالية سترفع إلى السحابة الجديدة.", confirmText: "إنشاء", iconName: "cloud" });
      if (!ok) return;
      try {
        const c = await createCloud();
        const code = await copyCode();
        modal({ title: "السحابة الجديدة", iconName: "cloud", body: `<div class="callout ok">تم إنشاء سحابة جديدة. هذا رمز المزامنة الجديد:</div><textarea class="input" rows="4" readonly dir="ltr" style="margin-top:10px">${escapeHtml(code)}</textarea>`, actions: [{ label: "تم", kind: "ghost", onClick: () => location.reload() }] });
      } catch (e) { toast("تعذر الإنشاء: " + e.message, { type: "error" }); }
    });
    $("#disconnectCloud")?.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "قطع اتصال السحابة", message: "ستتوقف المزامنة، وتبقى البيانات على هذا الجهاز. هل تريد المتابعة؟", confirmText: "قطع", iconName: "cloudOff" });
      if (!ok) return;
      await disconnectCloud();
      toast("تم قطع اتصال السحابة.");
      location.reload();
    });
  }
}

function bindData(settings) {
  $("#exportBackup")?.addEventListener("click", async () => {
    const data = await exportAll();
    downloadJSON(`rased-backup-${todayISO()}.json`, data);
    toast("تم تصدير النسخة الاحتياطية.");
  });
  $("#importBackupBtn")?.addEventListener("click", () => $("#importBackupFile")?.click());
  $("#importBackupFile")?.addEventListener("change", async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await readFileText(file));
      const ok = await confirmDialog({ title: "استيراد نسخة احتياطية", message: "سيتم استبدال البيانات الحالية بالنسخة المستوردة. هل تريد المتابعة؟", confirmText: "استيراد", iconName: "upload" });
      if (!ok) return;
      await importAll(data, "replace");
      toast("تم استيراد النسخة الاحتياطية.");
      setTimeout(() => location.reload(), 800);
    } catch (err) { toast("ملف غير صالح: " + err.message, { type: "error" }); }
  });
  $("#clearDemo")?.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "حذف البيانات التجريبية", message: "سيتم حذف سجلات الغياب والتأخر والأعذار التجريبية فقط، مع الاحتفاظ بقاعدة الطلاب.", confirmText: "حذف", iconName: "trash" });
    if (!ok) return;
    await clearDemoData();
    toast("تم حذف البيانات التجريبية.");
    location.reload();
  });
  $("#resetAttendance")?.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "مسح سجلات الرصد", message: "سيتم حذف جميع سجلات الغياب والتأخر والأعذار والإجراءات نهائياً. لا يمكن التراجع. هل أنت متأكد؟", confirmText: "مسح نهائي", iconName: "alert" });
    if (!ok) return;
    await resetAttendance();
    toast("تم مسح سجلات الرصد.");
    location.reload();
  });
}

function rootQueryAll(sel) { return Array.from(document.querySelectorAll(sel)); }

