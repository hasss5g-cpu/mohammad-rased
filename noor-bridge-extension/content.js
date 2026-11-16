/* ============================================================
   راصد — جسر نور
   يطابق بيانات الغياب من راصد مع صفوف الطلاب في صفحة نور،
   ويعبّئ الغياب بعد معاينة. لا يحفظ تلقائياً في نور.
   ============================================================ */
(function () {
  "use strict";
  if (window.top !== window) return;

  const state = { payload: null, matches: [], unmatched: [], busy: false };
  let panel = null;

  const normalize = (s) => String(s || "")
    .replace(/[\u0617-\u061A\u064B-\u0652\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();

  function visible(el) {
    try { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); } catch (e) { return false; }
  }
  function collectDocs(doc = document, out = []) {
    out.push(doc);
    try {
      for (const f of doc.querySelectorAll("iframe")) {
        try {
          const d = f.contentDocument;
          if (d) collectDocs(d, out);
        } catch (e) { /* cross-origin */ }
      }
    } catch (e) { }
    return out;
  }
  function allRows() {
    const docs = collectDocs();
    const rows = [];
    for (const doc of docs) {
      let list = [];
      try { list = Array.from(doc.querySelectorAll("tr")); } catch (e) { }
      for (const row of list) {
        if (!visible(row)) continue;
        if (!row.querySelector("input, select, textarea")) continue;
        const text = normalize(row.innerText || row.textContent || "");
        if (text.length < 4) continue;
        rows.push({ row, doc, text });
      }
    }
    return rows;
  }
  function rowLabel(el) {
    const bits = [];
    for (const a of ["id", "name", "title", "aria-label", "data-label"]) bits.push(el.getAttribute(a) || "");
    try {
      if (el.id) {
        const lab = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) bits.push(lab.innerText || "");
      }
      const parentLab = el.closest("label");
      if (parentLab) bits.push(parentLab.innerText || "");
      const td = el.closest("td,th");
      if (td) bits.push(td.innerText || "");
    } catch (e) { }
    return normalize(bits.join(" "));
  }
  function isAbsenceControl(el) {
    const t = rowLabel(el);
    return /غائب|غياب|absent|absence|مواظبة/.test(t);
  }
  function findTypeSelect(row, exclude = null) {
    const selects = Array.from(row.querySelectorAll("select")).filter(visible);
    for (const sel of selects) {
      if (sel === exclude) continue;
      const opts = Array.from(sel.options || []);
      if (opts.some(o => /بعذر|بدون عذر|عذر/i.test(o.textContent || ""))) return sel;
    }
    return null;
  }
  function fire(el) {
    for (const ev of ["input", "change", "blur"]) {
      try { el.dispatchEvent(new Event(ev, { bubbles: true })); } catch (e) { }
    }
  }
  function applyRow(match) {
    const { row, item } = match;
    const controls = Array.from(row.querySelectorAll("input, select")).filter(visible);
    const selects = controls.filter(el => el.tagName === "SELECT");
    const boxes = controls.filter(el => el.tagName === "INPUT" && el.type === "checkbox");
    const radios = controls.filter(el => el.tagName === "INPUT" && el.type === "radio");
    let acted = false;

    // مربعات الغياب: المخصصة للغياب، أو المربع الوحيد في الصف.
    let chosenBoxes = boxes.filter(isAbsenceControl);
    if (!chosenBoxes.length && boxes.length === 1) chosenBoxes = [boxes[0]];
    for (const box of chosenBoxes) {
      try {
        if (!box.checked) { box.checked = true; fire(box); }
        acted = true;
      } catch (e) { }
    }

    // قائمة الحالة التي تحتوي خيار «غائب».
    let statusSel = null;
    for (const sel of selects) {
      const opt = Array.from(sel.options || []).find(o => /غائب|absent|غياب/i.test(o.textContent || ""));
      if (opt) { statusSel = sel; try { sel.value = opt.value; fire(sel); acted = true; } catch (e) { } break; }
    }

    // راديو «غائب» إن لم يوجد مربع/قائمة.
    if (!acted && radios.length) {
      const r = radios.find(isAbsenceControl) || radios[0];
      try { r.checked = true; fire(r); acted = true; } catch (e) { }
    }

    // نوع الغياب (بعذر / بدون عذر).
    const typeSel = findTypeSelect(row, statusSel);
    if (typeSel) {
      const wanted = item.excused ? /بعذر/i : /بدون عذر|بدون/i;
      const opt = Array.from(typeSel.options).find(o => wanted.test(o.textContent || "") && !(item.excused && /بدون/.test(o.textContent || "")));
      if (opt) {
        try { typeSel.value = opt.value; fire(typeSel); acted = true; } catch (e) { }
      }
    }
    return { ok: acted, reason: acted ? "" : "لم أجد خانة غياب قابلة للتعبئة" };
  }
  function clearPreview() {
    for (const doc of collectDocs()) {
      try {
        doc.querySelectorAll("[data-rased-preview]").forEach(el => {
          el.style.outline = "";
          el.style.backgroundColor = "";
          el.style.outlineOffset = "";
          delete el.dataset.rasedPreview;
        });
      } catch (e) { }
    }
  }
  function highlight(match, color = "#d4a63a", bg = "#fff8dc") {
    try {
      match.row.style.outline = `3px solid ${color}`;
      match.row.style.outlineOffset = "-3px";
      match.row.style.backgroundColor = bg;
      match.row.dataset.rasedPreview = "1";
    } catch (e) { }
  }
  function findMatch(item, rows, used) {
    const id = normalize(item.studentId || "");
    if (id) {
      for (const r of rows) {
        if (used.has(r.row) || !r.text.includes(id)) continue;
        return r;
      }
    }
    const name = normalize(item.name || "");
    if (name) {
      for (const r of rows) {
        if (used.has(r.row) || !r.text.includes(name)) continue;
        return r;
      }
      const tokens = name.split(" ").filter(t => t.length > 2);
      if (tokens.length >= 2) {
        const need = Math.max(2, Math.ceil(tokens.length * 0.7));
        for (const r of rows) {
          if (used.has(r.row)) continue;
          const hit = tokens.filter(t => r.text.includes(t)).length;
          if (hit >= need) return r;
        }
      }
    }
    return null;
  }

  function parsePayload(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error("النص ليس JSON صالحاً. انسخ «بيانات نور» من راصد مرة أخرى."); }
    if (!data || data.app !== "rased-noor" || !Array.isArray(data.items)) throw new Error("هذه ليست بيانات نور الصادرة من راصد.");
    if (!data.items.length) throw new Error("ملف البيانات لا يحتوي أي طالب غائب.");
    return data;
  }

  function renderResults() {
    const box = panel.querySelector("#rased-noor-results");
    const rows = [];
    for (const m of state.matches) {
      rows.push(`<div class="rased-noor-item"><span class="ok">✓</span><span class="nm">${escapeHtml(m.item.name)}</span><span>${m.item.excused ? "بعذر" : "بدون عذر"}</span></div>`);
    }
    for (const u of state.unmatched) {
      rows.push(`<div class="rased-noor-item"><span class="no">✕</span><span class="nm">${escapeHtml(u.item.name)}</span><span>${escapeHtml(u.reason)}</span></div>`);
    }
    box.innerHTML = rows.join("");
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function preview() {
    clearPreview();
    state.matches = []; state.unmatched = [];
    let payload;
    try { payload = parsePayload(panel.querySelector("#rased-noor-input").value); }
    catch (e) { setStatus(e.message, true); return; }
    state.payload = payload;
    const rows = allRows();
    if (!rows.length) {
      setStatus("لم أجد جدول طلاب في الصفحة. تأكد من فتح صفحة إدخال المواظبة في نور، ثم أعد المحاولة.", true);
      return;
    }
    const used = new Set();
    for (const item of payload.items) {
      const r = findMatch(item, rows, used);
      if (r) {
        used.add(r.row);
        state.matches.push({ item, row: r.row, doc: r.doc });
        highlight({ row: r.row });
      } else {
        state.unmatched.push({ item, reason: "لم يُطابق اسم/رقم في الصفحة" });
      }
    }
    renderResults();
    setStatus(`تمت معاينة ${payload.items.length} طالباً:\nمطابق: ${state.matches.length} — غير مطابق: ${state.unmatched.length}\n${state.matches.length ? "راجع الصفوف المظللة بالأصفر، ثم اضغط «تنفيذ الرصد»." : "لم يتم العثور على أي مطابقة."}`, !state.matches.length);
    panel.querySelector("#rased-noor-exec").disabled = !state.matches.length;
  }

  function execute() {
    if (!state.matches.length) { preview(); return; }
    if (!confirm(`سيتم تعبئة الغياب لـ ${state.matches.length} طالباً في الصفحة.\nلن يتم الحفظ في نور تلقائياً؛ ستراجع ثم تضغط حفظ بنفسك.\nهل تريد المتابعة؟`)) return;
    let applied = 0;
    const failed = [];
    for (const m of state.matches) {
      const res = applyRow(m);
      if (res.ok) { applied++; highlight(m, "#0f6b4f", "#eef9f3"); }
      else failed.push(`${m.item.name}: ${res.reason}`);
    }
    const unmatched = state.unmatched.length;
    setStatus(`تمت تعبئة ${applied} من ${state.matches.length} طالباً.\n${unmatched ? `يوجد ${unmatched} طالباً غير مطابق — راجعهم يدوياً.\n` : ""}${failed.length ? `تعذر تعبئة: ${failed.join(" — ")}\n` : ""}الآن راجع الصفحة في نور واضغط «حفظ» بنفسك. لم يتم الحفظ تلقائياً.`, failed.length > 0);
    panel.querySelector("#rased-noor-exec").disabled = true;
  }

  function setStatus(text, error) {
    const el = panel.querySelector("#rased-noor-status");
    el.textContent = text;
    el.style.color = error ? "#8f1d17" : "#334155";
    el.style.background = error ? "#ffe9e6" : "#f6f8f3";
  }

  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "rased-noor-panel";
    panel.innerHTML = `
      <div class="rased-noor-head">
        <div><b>راصد — جسر نور</b><br><span>تعبئة الغياب من بيانات راصد</span></div>
        <button type="button" id="rased-noor-close" aria-label="إغلاق">×</button>
      </div>
      <div class="rased-noor-body">
        <p>افتح صفحة إدخال المواظبة في نور، ثم ألصق بيانات نور التي نسختها من راصد.</p>
        <textarea id="rased-noor-input" placeholder='{"app":"rased-noor", ...}'></textarea>
        <div class="rased-noor-btns">
          <button type="button" id="rased-noor-paste">لصق من الحافظة</button>
          <button type="button" class="primary" id="rased-noor-preview">معاينة</button>
          <button type="button" class="gold" id="rased-noor-exec" disabled>تنفيذ الرصد</button>
          <button type="button" id="rased-noor-scan">فحص الصفحة</button>
          <button type="button" id="rased-noor-clear">مسح</button>
        </div>
        <div id="rased-noor-status">لم يتم تحميل بيانات بعد. الصق بيانات نور ثم اضغط «معاينة».</div>
        <div id="rased-noor-results"></div>
      </div>
      <div class="rased-noor-foot">لا يحفظ الجسر أي شيء في نور؛ الحفظ النهائي يتم بضغطك على «حفظ» داخل نور.</div>`;
    document.documentElement.appendChild(panel);

    const fab = document.createElement("button");
    fab.id = "rased-noor-fab";
    fab.type = "button";
    fab.textContent = "راصد — جسر نور";
    document.documentElement.appendChild(fab);

    const open = () => panel.classList.add("open");
    const close = () => panel.classList.remove("open");
    fab.addEventListener("click", open);
    panel.querySelector("#rased-noor-close").addEventListener("click", close);
    panel.querySelector("#rased-noor-paste").addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        panel.querySelector("#rased-noor-input").value = text;
        setStatus("تم لصق البيانات. اضغط «معاينة».");
      } catch (e) {
        setStatus("تعذر الوصول إلى الحافظة. الصق النص يدوياً في المربع.", true);
      }
    });
    panel.querySelector("#rased-noor-preview").addEventListener("click", preview);
    panel.querySelector("#rased-noor-exec").addEventListener("click", execute);
    panel.querySelector("#rased-noor-scan").addEventListener("click", () => {
      const docs = collectDocs();
      const rows = allRows();
      const inputs = docs.reduce((n, d) => n + d.querySelectorAll("input, select").length, 0);
      setStatus(`فحص الصفحة:\nالإطارات المتاحة: ${docs.length}\nصفوف الطلاب: ${rows.length}\nخانات الإدخال: ${inputs}\n${rows.length ? "الصفحة تبدو قابلة للمطابقة. الصق البيانات ثم اضغط معاينة." : "لم أجد جدولاً يحتوي خانات إدخال. تأكد من فتح صفحة إدخال المواظبة وليس صفحة أخرى."}`, !rows.length);
    });
    panel.querySelector("#rased-noor-clear").addEventListener("click", () => {
      clearPreview();
      state.matches = []; state.unmatched = [];
      panel.querySelector("#rased-noor-input").value = "";
      panel.querySelector("#rased-noor-results").innerHTML = "";
      panel.querySelector("#rased-noor-exec").disabled = true;
      setStatus("تم المسح.");
    });
    return panel;
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg && msg.cmd === "openPanel") {
      buildPanel().classList.add("open");
      reply({ ok: true });
    }
  });

  if (/ManageAttendance|Attendance|المواظبة|السلوك/i.test(location.href)) {
    setTimeout(() => buildPanel().classList.add("open"), 800);
  } else {
    setTimeout(buildPanel, 800);
  }
})();
