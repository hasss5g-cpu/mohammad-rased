/* ============================================================
   راصد — المخرجات الورقية والطباعة
   ============================================================ */
import { escapeHtml, formatHijri, formatHijriLong, formatGregorianLong, weekdayName, todayISO, fmt, classLabel, stageName, activeTermRange } from "./core.js";

export function schoolHeader(settings, title = "") {
  const s = settings?.school || {};
  return `<div class="official-head">
    <div class="side right">
      <div>المملكة العربية السعودية</div>
      <div>وزارة التعليم</div>
      <div>${escapeHtml(s.region || "الإدارة العامة للتعليم بمنطقة مكة المكرمة")}</div>
      <div>${escapeHtml(s.name || "")}</div>
    </div>
    <div class="center">
      <div class="moj">${escapeHtml(s.ministry || "وزارة التعليم")}</div>
      <div class="year">العام الدراسي ${escapeHtml(settings?.academicYear || "1448")}هـ — ${escapeHtml(activeTermRange(settings).short)}</div>
    </div>
    <div class="side left">
      <div>${escapeHtml(s.city || "مكة المكرمة")}</div>
      <div>${escapeHtml(s.phone || "")}</div>
      <div>${escapeHtml(s.email || "")}</div>
      <div>${escapeHtml(s.principal ? "قائد المدرسة: " + s.principal : "")}</div>
    </div>
  </div>`;
}

export function printDocument({ title = "", body = "", settings = {}, landscape = false, extraCSS = "", includeHeader = true } = {}) {
  const css = `
    @page { size: A4 portrait; margin: 12mm 10mm; }
    * { box-sizing: border-box; }
    body { font-family: "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif; color: #111; margin: 0; padding: 0; font-size: 10pt; line-height: 1.55; direction: rtl; }
    .official-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 5mm; border-bottom: 2px solid #0f6b4f; padding-bottom: 2.5mm; margin-bottom: 4mm; }
    .official-head .side { width: 33%; font-size: 8.5pt; line-height: 1.45; }
    .official-head .right { text-align: right; }
    .official-head .left { text-align: left; }
    .official-head .center { text-align: center; width: 34%; }
    .moj { font-weight: 800; font-size: 10pt; color: #0f6b4f; }
    .doc-title { font-size: 14pt; font-weight: 800; margin: 1.5mm 0 1mm; }
    .year { font-size: 8.5pt; color: #555; }
    h2 { font-size: 12pt; margin: 3mm 0 1.5mm; color: #0b513d; }
    h3 { font-size: 11pt; margin: 3mm 0 1.5mm; }
    p { margin: 0 0 2mm; }
    .lead { font-size: 11pt; line-height: 1.75; }
    .meta-line { display: flex; justify-content: space-between; font-size: 9pt; color: #333; margin: 2mm 0; gap: 4mm; }
    table { width: 100%; border-collapse: collapse; margin: 2mm 0; font-size: 8.2pt; table-layout: fixed; }
    th, td { border: 1px solid #888; padding: 1.2mm 1.4mm; text-align: right; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
    th { background: #edf3ee; font-weight: 800; font-size: 8pt; }
    .num { font-variant-numeric: tabular-nums; font-weight: 700; }
    .red { color: #b3261e; font-weight: 800; }
    .green { color: #0f6b4f; font-weight: 800; }
    .box { border: 1px solid #999; border-radius: 2mm; padding: 2mm 3mm; margin: 2mm 0; }
    .signatures { display: flex; justify-content: space-between; gap: 8mm; margin-top: 10mm; font-size: 9.5pt; }
    .signatures .sig { width: 30%; text-align: center; }
    .signatures .line { border-top: 1px dotted #555; margin-top: 11mm; padding-top: 1mm; }
    .footer { margin-top: 7mm; border-top: 1px solid #ccc; padding-top: 1.5mm; font-size: 7.5pt; color: #777; text-align: center; }
    .small { font-size: 8pt; color: #555; }
    .list { margin: 1.5mm 0; padding-inline-start: 5mm; }
    .list li { margin-bottom: 1mm; }
    .notice-title { text-align: center; font-size: 16pt; font-weight: 800; margin: 2mm 0 4mm; letter-spacing: -.3px; }
    ${extraCSS}
  `;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>
    ${includeHeader ? schoolHeader(settings, title) : ""}
    ${body}
    <div class="footer">أُنشئ هذا المستند من نظام «راصد» — ${formatHijri(todayISO())}هـ — ${escapeHtml(settings?.school?.name || "")}</div>
  </body></html>`;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;inset:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const run = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) { console.warn(e); }
    setTimeout(() => iframe.remove(), 2500);
  };
  if (doc.readyState === "complete") setTimeout(run, 250);
  else iframe.onload = () => setTimeout(run, 250);
  return iframe;
}

export function signatures(settings, roles = ["الموجه الطلابي", "قائد المدرسة"]) {
  return `<div class="signatures">
    ${roles.map(r => `<div class="sig"><div>${escapeHtml(r)}</div><div class="line">${r === "قائد المدرسة" ? escapeHtml(settings?.school?.principal || "") : ""}</div></div>`).join("")}
  </div>`;
}

export function printAbsenceByStage({ date, records = [], students = [], settings = {}, title = "تقرير الغياب التفصيلي" } = {}) {
  const smap = new Map(students.map(s => [s.id, s]));
  const byStage = { 1: [], 2: [], 3: [] };
  for (const r of records) {
    if (r.status !== "absent") continue;
    const s = smap.get(r.studentId);
    if (!s) continue;
    (byStage[s.stageId] || byStage[1]).push(s);
  }
  for (const st of [1, 2, 3]) {
    byStage[st].sort((a, b) => a.classNo - b.classNo || a.name.localeCompare(b.name, "ar"));
  }
  const maxRows = Math.max(byStage[1].length, byStage[2].length, byStage[3].length);
  const dense = maxRows > 42;
  const total = byStage[1].length + byStage[2].length + byStage[3].length;
  const col = st => {
    const list = byStage[st];
    return `<section class="stage-col">
      <h3><span>${escapeHtml(stageName(st))}</span><b>${fmt(list.length)}</b></h3>
      <div class="stage-rows">
        ${list.length ? list.map((s, i) => `<div class="sr"><span class="sr-i">${i + 1}</span><span class="sr-c">${escapeHtml(classLabel(s.classNo, s.stageId))}</span><span class="sr-n">${escapeHtml(s.name)}</span></div>`).join("") : `<div class="stage-empty">لا يوجد غياب</div>`}
      </div>
    </section>`;
  };
  const body = `
    <div class="notice-title">${escapeHtml(title)}</div>
    <div class="meta-line"><span>اليوم: ${escapeHtml(weekdayName(date))}</span><span>التاريخ: ${formatHijri(date)}هـ — ${formatGregorianLong(date)}</span><span>إجمالي الغياب: ${fmt(total)}</span></div>
    <div class="stage-report ${dense ? "dense" : ""}">
      ${col(1)}${col(2)}${col(3)}
    </div>
    ${signatures(settings, ["الموجه الطلابي", "قائد المدرسة"])}`;
  const extraCSS = `
    .stage-report { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3mm; align-items: start; margin-top: 3mm; }
    .stage-col { border: 1px solid #7d8d84; border-radius: 2mm; overflow: hidden; break-inside: avoid; }
    .stage-col h3 { margin: 0; padding: 1.6mm 2mm; background: #0f6b4f; color: #fff; display: flex; justify-content: space-between; align-items: center; font-size: 9pt; }
    .stage-col h3 b { background: rgba(255,255,255,.2); border-radius: 99px; min-width: 6mm; text-align: center; padding: 0 1.2mm; font-size: 8pt; }
    .stage-rows { padding: 1mm 1.2mm; }
    .sr { display: grid; grid-template-columns: 5.5mm 11mm minmax(0,1fr); gap: 1mm; align-items: center; padding: .85mm 0; border-bottom: 1px dotted #c9d2cc; font-size: 7.2pt; line-height: 1.2; }
    .sr:last-child { border-bottom: 0; }
    .sr-i { text-align: center; color: #4c5d54; font-weight: 700; }
    .sr-c { font-weight: 700; white-space: nowrap; color: #073b2d; }
    .sr-n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stage-empty { padding: 4mm 1mm; text-align: center; color: #7a8a81; font-size: 7.5pt; }
    .stage-report.dense { gap: 2mm; }
    .stage-report.dense .sr { font-size: 6.2pt; padding: .45mm 0; grid-template-columns: 5mm 10mm minmax(0,1fr); }
    .stage-report.dense .stage-col h3 { padding: 1.1mm 1.5mm; font-size: 8pt; }
    @media print { .stage-report { break-inside: avoid; } }
  `;
  return printDocument({ title, body, settings, extraCSS });
}

export function printDailyReport({ date, records, students, settings, mode = "absence" }) {
  if (mode === "absence") return printAbsenceByStage({ date, records, students, settings });
  const rows = records.map((r, i) => {
    const s = students.find(x => x.id === r.studentId);
    return `<tr><td class="num">${i + 1}</td><td>${escapeHtml(s?.name || "")}</td><td>${escapeHtml(stageName(s?.stageId || r.stageId))}</td><td>${escapeHtml(classLabel(s?.classNo || r.classNo, s?.stageId || r.stageId))}</td><td>${escapeHtml(s?.studentId || "")}</td><td>${r.excused ? "بعذر" : "بدون عذر"}</td></tr>`;
  }).join("");
  const body = `
    <div class="notice-title">كشف ${mode === "late" ? "التأخر" : "الغياب"} اليومي</div>
    <div class="meta-line"><span>اليوم: ${weekdayName(date)}</span><span>التاريخ: ${formatHijri(date)}هـ — ${formatGregorianLong(date)}</span><span>عدد الحالات: ${fmt(records.length)}</span></div>
    <table><thead><tr><th>م</th><th>اسم الطالب</th><th>المرحلة</th><th>الفصل</th><th>رقم الطالب</th><th>الحالة</th></tr></thead><tbody>
      ${rows || `<tr><td colspan="6" style="text-align:center">لا توجد حالات</td></tr>`}
    </tbody></table>
    ${signatures(settings, ["الموجه الطلابي", "قائد المدرسة"])}`;
  return printDocument({ title: `كشف ${mode === "late" ? "التأخر" : "الغياب"} اليومي`, body, settings });
}

export function printRangeReport({ title, from, to, rows, summary, settings, columns }) {
  const head = columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join("");
  const bodyRows = rows.map((r, i) => `<tr>${columns.map((c, j) => `<td class="${j === 0 ? "num" : ""}">${c.render ? c.render(r, i) : escapeHtml(r[c.key] ?? "")}</td>`).join("")}</tr>`).join("");
  const body = `
    <div class="notice-title">${escapeHtml(title)}</div>
    <div class="meta-line"><span>من: ${formatHijri(from)}هـ</span><span>إلى: ${formatHijri(to)}هـ</span><span>عدد السجلات: ${fmt(rows.length)}</span></div>
    ${summary ? `<div class="box">${summary}</div>` : ""}
    <table><thead><tr>${head}</tr></thead><tbody>${bodyRows || `<tr><td colspan="${columns.length}" style="text-align:center">لا توجد بيانات</td></tr>`}</tbody></table>
    ${signatures(settings)}`;
  return printDocument({ title, body, settings });
}

export function printGuardianNotice({ student, stats, settings, level = 3, mode = "absence" }) {
  const days = stats.absent || stats.late || 0;
  const procedures = level >= 10
    ? ["مخاطبة الجهات ذات الاختصاص حيال تطبيق ما ورد في نظام حماية الطفل ونظام الحماية من الإيذاء ولائحتهما التنفيذية.", "إشعار إدارة التعليم بذلك.", "متابعة الإجراءات والتنسيق مع الجهات ذات الاختصاص."]
    : level >= 5
      ? ["استدعاء ولي الأمر لمناقشة أسباب الغياب.", "إحالة الطالب إلى لجنة التوجيه الطلابي لمراجعة الخطة التربوية والعلاجية.", "تنبيه ولي الأمر بالإجراءات التربوية المترتبة على استمرار الغياب."]
      : ["تحويل الطالب إلى الموجه الطلابي لدراسة الحالة وتقديم الخدمات التربوية المناسبة.", "استدعاء ولي الأمر وعقد اجتماع لتقييم الخدمات والخطة العلاجية.", "أخذ التعهد الخطي بالالتزام بالخطة."];
  const body = `
    <div class="notice-title">إشعار ولي أمر الطالب</div>
    <p class="lead">السلام عليكم ورحمة الله وبركاته،</p>
    <p class="lead">ولي أمر الطالب: <b>${escapeHtml(student.name)}</b> — ${escapeHtml(stageName(student.stageId))} / ${escapeHtml(classLabel(student.classNo, student.stageId))} — رقم الطالب: ${escapeHtml(student.studentId)}</p>
    <p class="lead">نفيدكم بأن ابنكم تغيب عن المدرسة <span class="red">${fmt(days)} ${mode === "late" ? "مرة تأخر" : "أيام"}</span> خلال الفترة من ${formatHijri(activeTermRange(settings).from)}هـ إلى ${formatHijri(todayISO())}هـ، ونظراً لتجاوزه حد المتابعة النظامي (${level} أيام) فقد تم اتخاذ الإجراءات التربوية التالية:</p>
    <div class="box"><ol class="list">${procedures.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ol></div>
    <p class="lead">نأمل منكم التعاون ومتابعة انتظام ابنكم، ومراجعة المدرسة في أقرب وقت لمناقشة الخطة التربوية والعلاجية، وتوقيع التعهد اللازم.</p>
    <p class="lead">وتقبلوا تحياتنا.</p>
    ${signatures(settings, ["الموجه الطلابي", "قائد المدرسة"])}`;
  return printDocument({ title: "إشعار ولي الأمر", body, settings });
}

export function printReferral({ student, stats, settings, level = 3 }) {
  const body = `
    <div class="notice-title">إحالة إلى الموجه الطلابي</div>
    <p class="lead">إلى: الموجه الطلابي / لجنة التوجيه الطلابي بمدرسة ${escapeHtml(settings?.school?.name || "")}</p>
    <p class="lead">السلام عليكم ورحمة الله وبركاته،</p>
    <p class="lead">نحيل إليكم الطالب: <b>${escapeHtml(student.name)}</b> — ${escapeHtml(stageName(student.stageId))} / ${escapeHtml(classLabel(student.classNo, student.stageId))} — رقم الطالب: ${escapeHtml(student.studentId)}، وذلك لتكرار غيابه <span class="red">${fmt(stats.absent || stats.late || 0)}</span> ${stats.late ? "مرة تأخر" : "يوماً"} خلال العام الدراسي، وتجاوزه حد ${level} أيام.</p>
    <p class="lead">آملين دراسة الحالة وتقديم الخدمات التربوية المناسبة، وعقد الاجتماع اللازم مع ولي الأمر، وإفادتنا بما يتم من إجراءات.</p>
    <div class="box"><b>المرفقات:</b> كشف الغياب التفصيلي للطالب — ${formatHijri(todayISO())}هـ</div>
    ${signatures(settings, ["راصد الحضور", "قائد المدرسة"])}`;
  return printDocument({ title: "إحالة إلى الموجه الطلابي", body, settings });
}

export function printPledge({ student, stats, settings }) {
  const body = `
    <div class="notice-title">تعهد خطي</div>
    <p class="lead">أقر أنا ولي أمر الطالب: <b>${escapeHtml(student.name)}</b> — ${escapeHtml(stageName(student.stageId))} / ${escapeHtml(classLabel(student.classNo, student.stageId))}، بأن ابني قد تغيب عن المدرسة ${fmt(stats.absent || 0)} أيام، وأتعهد بالالتزام بانتظامه في المدرسة واتباع الخطة التربوية والعلاجية المتفق عليها مع المدرسة.</p>
    <div class="box"><b>عدد أيام الغياب:</b> ${fmt(stats.absent || 0)} — <b>بعذر:</b> ${fmt(stats.excused || 0)} — <b>بدون عذر:</b> ${fmt(stats.unexcused || 0)}</div>
    <p class="lead">والله على ما أقول شهيد.</p>
    <div class="signatures">
      <div class="sig"><div>اسم ولي الأمر</div><div class="line"></div></div>
      <div class="sig"><div>التوقيع</div><div class="line"></div></div>
      <div class="sig"><div>التاريخ</div><div class="line">${formatHijri(todayISO())}هـ</div></div>
    </div>
    ${signatures(settings, ["الموجه الطلابي", "قائد المدرسة"])}`;
  return printDocument({ title: "تعهد خطي", body, settings });
}

export function printStudentReport({ student, stats, records, settings }) {
  const rows = records.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${formatHijri(r.date)}هـ</td><td>${weekdayName(r.date)}</td><td>${r.mode === "late" ? "تأخر" : "غياب"}</td><td>${r.excused ? "بعذر" : "بدون عذر"}</td><td>${escapeHtml(stageName(r.stageId))}</td><td>${escapeHtml(classLabel(r.classNo, r.stageId))}</td></tr>`).join("");
  const body = `
    <div class="notice-title">تقرير الطالب</div>
    <div class="meta-line"><span>الطالب: ${escapeHtml(student.name)}</span><span>رقم الطالب: ${escapeHtml(student.studentId)}</span><span>${escapeHtml(stageName(student.stageId))} / ${escapeHtml(classLabel(student.classNo, student.stageId))}</span></div>
    <div class="box"><b>ملخص:</b> الغياب ${fmt(stats.absent)} — بعذر ${fmt(stats.excused)} — بدون عذر ${fmt(stats.unexcused)} — التأخر ${fmt(stats.late)}</div>
    <table><thead><tr><th>م</th><th>التاريخ الهجري</th><th>اليوم</th><th>النوع</th><th>العذر</th><th>المرحلة</th><th>الفصل</th></tr></thead><tbody>${rows || `<tr><td colspan="7" style="text-align:center">لا توجد حالات</td></tr>`}</tbody></table>
    ${signatures(settings)}`;
  return printDocument({ title: "تقرير الطالب", body, settings });
}

/* ---------------- الحالات المتكررة: الإجراءات والطباعة ---------------- */
function actionWhen(at) {
  if (!at) return "—";
  try {
    const d = new Date(at);
    return `${formatHijri(d.toISOString().slice(0, 10))}هـ — ${d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" })}`;
  } catch (e) { return "—"; }
}
function actionRowsHTML(actions) {
  const rows = (actions || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0)).map((a, i) =>
    `<tr><td class="num">${i + 1}</td><td>${escapeHtml(a.label || a.type || "")}</td><td class="num">${escapeHtml(actionWhen(a.at))}</td><td>${escapeHtml(a.note || "")}</td></tr>`
  ).join("");
  return rows || `<tr><td colspan="4" style="text-align:center">لا توجد إجراءات مسجلة</td></tr>`;
}

export function printCaseActions({ student, stats = {}, caseCount = 0, level = 3, categoryLabel = "", actions = [], procedures = [], settings = {} }) {
  const body = `
    <div class="notice-title">إجراءات الحالة المتكررة</div>
    <div class="meta-line">
      <span>الطالب: ${escapeHtml(student.name)}</span>
      <span>رقم الطالب: ${escapeHtml(student.studentId || "")}</span>
      <span>${escapeHtml(stageName(student.stageId))} / ${escapeHtml(classLabel(student.classNo, student.stageId))}</span>
    </div>
    <div class="box">
      <b>الفئة:</b> ${escapeHtml(categoryLabel)} —
      <b>عدد الحالات:</b> ${fmt(caseCount)} —
      <b>مستوى الإجراء:</b> ${fmt(level)} أيام<br>
      <b>ملخص الغياب:</b> الغياب ${fmt(stats.absent || 0)} — بعذر ${fmt(stats.excused || 0)} — بدون عذر ${fmt(stats.unexcused || 0)} — التأخر ${fmt(stats.late || 0)}
    </div>
    <h2>الإجراءات المسجلة</h2>
    <table class="action-table"><thead><tr><th style="width:8%">م</th><th style="width:32%">الإجراء</th><th style="width:22%">التاريخ</th><th>الملاحظات</th></tr></thead><tbody>${actionRowsHTML(actions)}</tbody></table>
    <h2>الإجراءات النظامية المطلوبة عند بلوغ ${fmt(level)} أيام</h2>
    ${procedures.length ? `<ol class="list">${procedures.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ol>` : `<p>—</p>`}
    ${signatures(settings, ["الموجه الطلابي", "قائد المدرسة", "ولي الأمر"])}`;
  return printDocument({ title: "إجراءات الحالة المتكررة — " + student.name, body, settings });
}

export function printRecurringCases({ cases = [], hiddenCases = [], settings = {}, categoryLabel = "", reference = "", from = "", to = "" }) {
  const levelCount = (arr, lv) => arr.filter(c => c.level === lv).length;
  const block = (c, hidden) => `
    <div class="case-block">
      <div class="case-block-head">
        <div><b>${escapeHtml(c.student.name)}</b><span>${escapeHtml(stageName(c.student.stageId))} / ${escapeHtml(classLabel(c.student.classNo, c.student.stageId))}</span></div>
        <div class="case-block-badges">
          <span>${fmt(c.count)} ${categoryLabel.includes("تأخر") ? "مرة" : "أيام"}</span>
          <span>حد ${fmt(c.level)}</span>
          ${hidden ? `<span>تم الإجراء</span>` : ""}
        </div>
      </div>
      <div class="meta-line"><span>رقم الطالب: ${escapeHtml(c.student.studentId || "")}</span><span>بعذر ${fmt(c.totals.excused || 0)}</span><span>بدون عذر ${fmt(c.totals.unexcused || 0)}</span><span>التأخر ${fmt(c.totals.late || 0)}</span></div>
      <table class="action-table"><thead><tr><th style="width:8%">م</th><th style="width:34%">الإجراء</th><th style="width:24%">التاريخ</th><th>الملاحظات</th></tr></thead><tbody>${actionRowsHTML(c.actionList || [])}</tbody></table>
    </div>`;
  const body = `
    <div class="notice-title">تقرير الحالات المتكررة</div>
    <div class="meta-line"><span>${escapeHtml(reference)} — ${escapeHtml(categoryLabel)}</span><span>الفترة: ${formatHijri(from)}هـ — ${formatHijri(to)}هـ</span></div>
    <div class="box"><b>عدد الحالات الظاهرة:</b> ${fmt(cases.length)} — <b>حد 10:</b> ${fmt(levelCount(cases, 10))} — <b>حد 5:</b> ${fmt(levelCount(cases, 5))} — <b>حد 3:</b> ${fmt(levelCount(cases, 3))}${hiddenCases.length ? ` — <b>حالات تم الإجراء:</b> ${fmt(hiddenCases.length)}` : ""}</div>
    <h2>الحالات المتكررة (${fmt(cases.length)})</h2>
    ${cases.length ? cases.map(c => block(c, false)).join("") : `<p>لا توجد حالات ظاهرة في هذه الفترة.</p>`}
    ${hiddenCases.length ? `<h2>حالات تم عمل الإجراء اللازم معها (${fmt(hiddenCases.length)})</h2>${hiddenCases.map(c => block(c, true)).join("")}` : ""}
    <div class="footer">تم إنشاء هذا التقرير من نظام راصد — ${escapeHtml(settings?.school?.name || "")} — ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</div>`;
  return printDocument({
    title: "تقرير الحالات المتكررة", body, settings,
    extraCSS: `
      .case-block { border: 1px solid #999; border-radius: 2mm; padding: 2.5mm 3mm; margin: 3mm 0; break-inside: avoid; }
      .case-block-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 4mm; border-bottom: 1px solid #ddd; padding-bottom: 1.5mm; margin-bottom: 1.5mm; }
      .case-block-head b { font-size: 11pt; }
      .case-block-head span { display: block; font-size: 8pt; color: #555; margin-top: 1mm; }
      .case-block-badges { display: flex; gap: 2mm; flex-wrap: wrap; }
      .case-block-badges span { background: #f1f3ed; border: 1px solid #ddd; border-radius: 2mm; padding: .7mm 1.5mm; font-size: 7.5pt; color: #333; white-space: nowrap; }
      .action-table { font-size: 8pt; margin: 1.5mm 0; }
      .action-table td, .action-table th { padding: 1mm 1.4mm; }
    `
  });
}

/* ---------------- ملف الحالة: غلاف + جميع الوثائق ---------------- */
const CASE_DOCS = [
  { key: "referral", title: "إحالة إلى الموجه الطلابي" },
  { key: "notice", title: "إشعار ولي الأمر" },
  { key: "meeting", title: "اجتماع مع ولي الأمر" },
  { key: "pledge", title: "أخذ تعهد خطي" },
  { key: "committee", title: "إحالة لجنة التوجيه الطلابي" }
];
function docsFor(c) {
  return [...CASE_DOCS];
}
function docValue(c, key) {
  return (c.actionList || []).some(a => a.type === key);
}
function studentDocLine(c) {
  return `<div class="doc-box"><b>الطالب:</b> ${escapeHtml(c.student.name)} — <b>رقم الطالب:</b> ${escapeHtml(c.student.studentId || "")} — <b>الصف:</b> ${escapeHtml(stageName(c.student.stageId))} / ${escapeHtml(classLabel(c.student.classNo, c.student.stageId))}${c.student.phone ? ` — <b>جوال ولي الأمر:</b> ${escapeHtml(c.student.phone)}` : ""}</div>`;
}
function docHead(title, c, settings) {
  return `${schoolHeader(settings)}<div class="doc-title">${escapeHtml(title)}</div>
    <div class="doc-meta"><span>التاريخ: ${formatHijri(todayISO())}هـ</span><span>ملف الحالة: ${escapeHtml(c.student.studentId || c.student.id)}</span></div>
    ${studentDocLine(c)}`;
}
function caseStatsTable(c) {
  return `<table class="doc-table"><thead><tr><th>البند</th><th>القيمة</th></tr></thead><tbody>
    <tr><td>إجمالي أيام الغياب</td><td class="num">${fmt(c.totals.absent || c.count || 0)}</td></tr>
    <tr><td>بعذر</td><td class="num">${fmt(c.totals.excused || 0)}</td></tr>
    <tr><td>بدون عذر</td><td class="num">${fmt(c.totals.unexcused || 0)}</td></tr>
    <tr><td>التأخر</td><td class="num">${fmt(c.totals.late || 0)}</td></tr>
    <tr><td>مستوى الإجراء</td><td class="num">${fmt(c.level)} أيام</td></tr>
    <tr><td>آخر حالة</td><td>${c.totals.last ? formatHijri(c.totals.last) + "هـ" : "—"}</td></tr>
  </tbody></table>`;
}
function monthsTable(records) {
  const map = new Map();
  for (const r of records || []) {
    const h = formatHijri(r.date).split("/");
    const key = `${h[0]}/${h[1]}`;
    const row = map.get(key) || { key, total: 0, excused: 0, unexcused: 0, late: 0 };
    row.total++;
    if (r.mode === "late") row.late++;
    else if (r.excused) row.excused++;
    else row.unexcused++;
    map.set(key, row);
  }
  const rows = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key, "ar", { numeric: true }));
  return `<table class="doc-table"><thead><tr><th>الشهر الهجري</th><th>أيام الغياب</th><th>بعذر</th><th>بدون عذر</th><th>تأخر</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${escapeHtml(r.key)}</td><td class="num">${fmt(r.total)}</td><td class="num">${fmt(r.excused)}</td><td class="num">${fmt(r.unexcused)}</td><td class="num">${fmt(r.late)}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center">لا توجد أيام مسجلة</td></tr>`}
  </tbody></table>`;
}
function datesTable(records) {
  const rows = (records || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map((r, i) =>
    `<tr><td class="num">${i + 1}</td><td>${formatHijri(r.date)}هـ</td><td>${weekdayName(r.date)}</td><td>${r.mode === "late" ? "تأخر" : r.excused ? "غياب بعذر" : "غياب بدون عذر"}</td></tr>`
  ).join("");
  return `<table class="doc-table"><thead><tr><th>م</th><th>التاريخ</th><th>اليوم</th><th>النوع</th></tr></thead><tbody>${rows || `<tr><td colspan="4" style="text-align:center">لا توجد أيام مسجلة</td></tr>`}</tbody></table>`;
}
function coverHTML(c, settings, categoryLabel, reference, from, to) {
  const docs = docsFor(c);
  return `<section class="case-section case-cover">
    ${schoolHeader(settings)}
    <div class="doc-title">ملف الحالة المتكررة</div>
    <div class="doc-meta"><span>الفئة: ${escapeHtml(categoryLabel)} — ${escapeHtml(reference)}</span><span>الفترة: ${formatHijri(from)}هـ — ${formatHijri(to)}هـ</span></div>
    ${studentDocLine(c)}
    <h3>جدول إحصائي بأيام الغياب</h3>
    ${caseStatsTable(c)}
    <h3>ملخص شهري</h3>
    ${monthsTable(c.records)}
    <h3>أيام الغياب بالتواريخ</h3>
    ${datesTable(c.records)}
    <h3>الوثائق المرفقة</h3>
    <table class="doc-table"><thead><tr><th>الوثيقة</th><th>الحالة</th></tr></thead><tbody>
      ${docs.map(d => `<tr><td>${escapeHtml(d.title)}</td><td>${docValue(c, d.key) ? "منفذة / مسجلة" : "للتوقيع"}</td></tr>`).join("")}
    </tbody></table>
    ${signatures(settings, ["الموجه الطلابي", "قائد المدرسة"])}
  </section>`;
}
function docSection(c, settings, title, body, roles = ["الموجه الطلابي", "قائد المدرسة", "ولي الأمر"]) {
  return `<section class="case-section case-doc">
    ${docHead(title, c, settings)}
    ${body}
    ${signatures(settings, roles)}
  </section>`;
}
function referralBody(c, reference) {
  return `<p class="lead">إلى: الموجه الطلابي / لجنة التوجيه الطلابي بالمدرسة</p>
    <p class="lead">السلام عليكم ورحمة الله وبركاته،</p>
    <p>نحيل إليكم الطالب الموضح أعلاه؛ نظراً لتكرار ${escapeHtml(reference)}، حيث بلغ مجموع أيام الغياب <b>${fmt(c.count)}</b> يوماً، وقد بلغ مستوى الإجراء <b>${fmt(c.level)}</b> أيام.</p>
    <h3>بيانات الحالة</h3>${caseStatsTable(c)}
    <h3>الإجراءات المطلوبة</h3>
    <ol class="list"><li>دراسة الحالة والاجتماع بولي الأمر.</li><li>إعداد خطة تربوية علاجية ومتابعة تنفيذها.</li><li>توثيق الإجراءات في ملف الحالة.</li></ol>
    <p>وتفضلوا بقبول فائق الاحترام والتقدير.</p>`;
}
function noticeBody(c) {
  return `<p class="lead">ولي الأمر المحترم / والد الطالب ${escapeHtml(c.student.name)}</p>
    <p class="lead">السلام عليكم ورحمة الله وبركاته،</p>
    <p>نفيدكم بأن ابنكم تغيب عن المدرسة <b>${fmt(c.count)}</b> يوماً، وقد بلغ مستوى المتابعة <b>${fmt(c.level)}</b> أيام، وذلك وفق ما ورد في ${escapeHtml(referenceText(c))}.</p>
    ${caseStatsTable(c)}
    <p>نأمل منكم الحضور إلى المدرسة خلال <b>ثلاثة أيام دراسية</b> من تاريخ هذا الإشعار للاجتماع مع الموجه الطلابي، ومناقشة أسباب الغياب ووضع الخطة التربوية المناسبة.</p>
    <p>في حال عدم التعاون، ستُتخذ الإجراءات النظامية المنصوص عليها في لائحة السلوك والمواظبة.</p>
    <p>وتفضلوا بقبول فائق الاحترام والتقدير.</p>`;
}
function referenceText(c) { return c.level >= 10 ? "المادة (34) من لائحة السلوك والمواظبة" : "لائحة السلوك والمواظبة"; }
function meetingBody(c) {
  return `<p class="lead">محضر اجتماع مع ولي الأمر</p>
    <table class="doc-table"><tbody>
      <tr><th>التاريخ</th><td>${formatHijri(todayISO())}هـ</td><th>المكان</th><td>المدرسة</td></tr>
      <tr><th>الحضور</th><td colspan="3">الموجه الطلابي / قائد المدرسة / ولي الأمر / الطالب</td></tr>
      <tr><th>سبب الاجتماع</th><td colspan="3">تكرار غياب الطالب ${fmt(c.count)} يوماً — ${fmt(c.level)} أيام.</td></tr>
    </tbody></table>
    <h3>محاور الاجتماع</h3>
    <ol class="list"><li>مناقشة أسباب الغياب.</li><li>مراجعة الخطة التربوية والعلاجية.</li><li>تحديد الالتزامات والمتابعة.</li></ol>
    <h3>التوصيات والالتزامات</h3>
    <div class="blank-box">${"<div class='blank-line'></div>".repeat(4)}</div>`;
}
function pledgeBody(c) {
  return `<p class="lead">أقر أنا ولي أمر الطالب: <b>${escapeHtml(c.student.name)}</b> — ${escapeHtml(stageName(c.student.stageId))} / ${escapeHtml(classLabel(c.student.classNo, c.student.stageId))}، بأن ابني قد تغيب عن المدرسة <b>${fmt(c.count)}</b> يوماً، وأتعهد بالالتزام بانتظامه في المدرسة واتباع الخطة التربوية والعلاجية المتفق عليها مع المدرسة.</p>
    <div class="doc-box"><b>عدد أيام الغياب:</b> ${fmt(c.count)} — <b>بعذر:</b> ${fmt(c.totals.excused || 0)} — <b>بدون عذر:</b> ${fmt(c.totals.unexcused || 0)}</div>
    <h3>التزامات ولي الأمر</h3>
    <ol class="list"><li>متابعة حضور الطالب يومياً.</li><li>إبلاغ المدرسة بأي عذر خلال المدة النظامية.</li><li>حضور الاجتماعات والمتابعة المدرسية.</li></ol>
    <div class="blank-box"><div class="blank-line"></div><div class="blank-line"></div></div>`;
}
function committeeBody(c, reference) {
  return `<p class="lead">إلى: لجنة التوجيه الطلابي بالمدرسة</p>
    <p>السلام عليكم ورحمة الله وبركاته،</p>
    <p>نرفع إليكم حالة الطالب الموضح أعلاه للنظر في تكرار الغياب، حيث بلغ مجموع الغياب <b>${fmt(c.count)}</b> يوماً، وبلغ مستوى الإجراء <b>${fmt(c.level)}</b> أيام، وفق ${escapeHtml(reference)}.</p>
    ${caseStatsTable(c)}
    <h3>التوصيات المقترحة</h3>
    <ol class="list"><li>دراسة الحالة واتخاذ الإجراء التربوي المناسب.</li><li>إعداد خطة علاجية ومتابعة تنفيذها.</li><li>توثيق قرارات اللجنة في ملف الطالب.</li></ol>`;
}
function followupBody(c) {
  const rows = (c.actionList || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0)).map((a, i) =>
    `<tr><td class="num">${i + 1}</td><td>${escapeHtml(a.label || a.type || "")}</td><td>${formatHijri(new Date(a.at).toISOString().slice(0, 10))}هـ</td><td></td></tr>`
  ).join("");
  return `<p class="lead">نموذج متابعة الحالة</p>
    ${studentDocLine(c)}
    <table class="doc-table"><thead><tr><th>م</th><th>الإجراء</th><th>التاريخ</th><th>النتيجة / الملاحظات</th></tr></thead><tbody>
      ${rows || `<tr><td colspan="4" style="text-align:center">لا توجد إجراءات مسجلة</td></tr>`}
      ${`<tr><td class="num">${(c.actionList || []).length + 1}</td><td>متابعة لاحقة</td><td>${formatHijri(todayISO())}هـ</td><td></td></tr>`}
      ${`<tr><td class="num">${(c.actionList || []).length + 2}</td><td>متابعة لاحقة</td><td></td><td></td></tr>`}
    </tbody></table>
    <p>الخطوة التالية: <span class="blank-inline"></span></p>`;
}
function protectionBody(c) {
  return `<p class="lead">إلى: الجهات ذات الاختصاص — حماية الطفل</p>
    <p>السلام عليكم ورحمة الله وبركاته،</p>
    <p>نرفع إليكم حالة الطالب الموضح أعلاه، وذلك بعد بلوغ غيابه <b>${fmt(c.count)}</b> يوماً، وتطبيق الإجراءات التربوية المقررة، وحاجة الحالة إلى متابعة وفق الأنظمة ذات الصلة.</p>
    ${caseStatsTable(c)}
    <p>نأمل اتخاذ ما يلزم من إجراءات ومتابعة الحالة.</p>`;
}
function educationBody(c) {
  return `<p class="lead">إلى: إدارة التعليم بمنطقة مكة المكرمة</p>
    <p>السلام عليكم ورحمة الله وبركاته،</p>
    <p>نشعركم بحالة الطالب الموضح أعلاه، بعد بلوغ غيابه <b>${fmt(c.count)}</b> يوماً، وتطبيق الإجراءات التربوية، وذلك وفق ما تقتضيه المصلحة التعليمية.</p>
    ${caseStatsTable(c)}
    <p>وتفضلوا بقبول فائق الاحترام.</p>`;
}
function packageHTML(c, settings, categoryLabel, reference, from, to) {
  const docs = docsFor(c);
  const body = docs.map(d => {
    let inner = "";
    if (d.key === "referral") inner = referralBody(c, reference);
    else if (d.key === "notice") inner = noticeBody(c);
    else if (d.key === "meeting") inner = meetingBody(c);
    else if (d.key === "pledge") inner = pledgeBody(c);
    else if (d.key === "committee") inner = committeeBody(c, reference);
    else if (d.key === "followup") inner = followupBody(c);
    else if (d.key === "protection") inner = protectionBody(c);
    else if (d.key === "education") inner = educationBody(c);
    return docSection(c, settings, d.title, inner);
  }).join("");
  return coverHTML(c, settings, categoryLabel, reference, from, to) + body;
}
const PACKAGE_CSS = `
  .case-section { page-break-before: always; break-before: page; }
  .case-section:first-of-type { page-break-before: auto; break-before: auto; }
  .doc-title { text-align: center; font-size: 16pt; font-weight: 800; margin: 2mm 0 2mm; color: #0b3d2e; }
  .doc-meta { display: flex; justify-content: space-between; gap: 4mm; font-size: 8.5pt; color: #444; margin-bottom: 2mm; }
  .doc-box { border: 1px solid #999; border-radius: 2mm; padding: 2mm 3mm; margin: 2mm 0; background: #fafafa; }
  .doc-table { font-size: 8.3pt; }
  .doc-table th { width: auto; }
  .doc-table th[colspan], .doc-table td[colspan] { text-align: center; }
  .case-doc h3 { margin: 3mm 0 1.5mm; font-size: 10.5pt; color: #0b513d; }
  .case-doc .lead { font-size: 10.5pt; }
  .blank-box { border: 1px dashed #999; border-radius: 2mm; padding: 2mm; min-height: 18mm; }
  .blank-line { border-bottom: 1px dotted #777; height: 7mm; }
  .blank-inline { display: inline-block; border-bottom: 1px dotted #777; min-width: 60mm; }
`;
export function printCaseFile({ caseData, settings, categoryLabel, reference, from, to }) {
  return printDocument({
    title: "ملف الحالة المتكررة — " + caseData.student.name,
    body: packageHTML(caseData, settings, categoryLabel, reference, from, to),
    settings, includeHeader: false, extraCSS: PACKAGE_CSS
  });
}
export function printCaseFiles({ cases = [], settings, categoryLabel, reference, from, to }) {
  const body = cases.map(c => packageHTML(c, settings, categoryLabel, reference, from, to)).join("");
  return printDocument({
    title: "ملفات الحالات المتكررة", body, settings, includeHeader: false, extraCSS: PACKAGE_CSS
  });
}

