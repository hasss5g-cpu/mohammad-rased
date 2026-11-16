/* ============================================================
   راصد — مكوّنات الواجهة المشتركة
   ============================================================ */
import { icon, el, $, escapeHtml, fmt, pct, clamp, relativeTime, nowClock, formatHijri, weekdayName, todayISO } from "./core.js";

/* ---------------- الشعار ---------------- */
export function brandMark(size = 56) {
  return `<svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="شعار راصد">
    <defs>
      <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0f766e"/><stop offset=".55" stop-color="#0f6b4f"/><stop offset="1" stop-color="#0b4f3b"/>
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="17" fill="url(#brandGrad)"/>
    <path d="M17 22.5c0-2 1.6-3.5 3.5-3.5h23c2 0 3.5 1.6 3.5 3.5v22c0 2-1.6 3.5-3.5 3.5h-23c-2 0-3.5-1.6-3.5-3.5z" fill="none" stroke="#fff" stroke-width="2.4" opacity=".95"/>
    <path d="M17 27h30" stroke="#fff" stroke-width="2.4" opacity=".95"/>
    <path d="M23 18v5M41 18v5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
    <path d="m23.5 38 5.2 5.2L41 33" fill="none" stroke="#f4d77a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="48.5" cy="15.5" r="4.2" fill="#f4d77a"/>
  </svg>`;
}

/* ---------------- الشريط العلوي ---------------- */
export function headerHTML({ compact = false, title = "", subtitle = "", back = false, admin = true } = {}) {
  return `<header class="site-header ${compact ? "compact" : ""}">
    <div class="header-inner">
      <div class="header-right">
        ${back ? `<button class="icon-btn back-btn" data-nav="back" aria-label="رجوع">${icon("back", 28)}</button>` : ""}
        <a class="brand" href="#/" aria-label="راصد — الرئيسية">
          ${brandMark(compact ? 46 : 56)}
          <span class="brand-text">
            <span class="brand-name">راصد</span>
            <span class="brand-sub">لرصد غياب الطلاب</span>
          </span>
        </a>
      </div>
      <div class="header-center">
        <div class="header-date" id="headerDate">
          <strong>${formatHijri(todayISO())}</strong>
          <span>${weekdayName(todayISO())} · ${nowClock()}</span>
        </div>
      </div>
      <div class="header-left">
        <button class="sync-chip" id="syncChip" type="button" aria-label="حالة الاتصال والمزامنة">
          <span class="sync-dot"></span>
          <span class="sync-label" id="syncLabel">جارٍ الفحص…</span>
          <span class="sync-pending" id="syncPending" hidden></span>
        </button>
        ${admin ? `<a class="admin-link" href="#/admin" aria-label="لوحة الإدارة">${icon("shield", 24)}<span>إدارة</span></a>` : ""}
      </div>
    </div>
    ${title ? `<div class="page-title-bar">
      <div class="page-title-inner">
        <div>
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p>${subtitle}</p>` : ""}
        </div>
        <div class="page-title-side" id="pageTitleSide"></div>
      </div>
    </div>` : ""}
  </header>`;
}

export function syncChipHTML(state) {
  const online = state?.online !== false;
  const configured = !!state?.configured;
  const syncing = !!state?.syncing;
  let label = online ? "متصل" : "غير متصل";
  let mode = online ? "online" : "offline";
  if (syncing) { label = "جارٍ الحفظ…"; mode = "syncing"; }
  else if (!online) { label = "غير متصل — حفظ محلي"; mode = "offline"; }
  else if (configured && state.realtime) { label = "مزامنة لحظية"; mode = "synced"; }
  else if (configured && state.shared) { label = "مزامنة مشتركة"; mode = "synced"; }
  else if (configured && state.pending > 0) { label = `بانتظار المزامنة (${fmt(state.pending)})`; mode = "pending"; }
  else if (configured && state.shared) { label = state.lastSync ? `مزامنة مشتركة · ${relativeTime(state.lastSync)}` : "مزامنة مشتركة"; mode = "synced"; }
  else if (configured && state.lastSync) { label = `متصل · ${relativeTime(state.lastSync)}`; mode = "synced"; }
  else if (!configured) { label = "متصل · حفظ محلي"; mode = "local"; }
  return { label, mode };
}

export function applySyncChip(state) {
  const chip = $("#syncChip");
  if (!chip) return;
  const { label, mode } = syncChipHTML(state);
  chip.dataset.state = mode;
  const l = $("#syncLabel"); if (l) l.textContent = label;
  const p = $("#syncPending");
  if (p) { p.hidden = !(state?.configured && !state?.shared && !state?.realtime && state?.pending > 0); p.textContent = state?.pending > 0 ? fmt(state.pending) : ""; }
  chip.title = state?.error || label;
}

/* ---------------- التنبيهات ---------------- */
let toastCounter = 0;
export function toast(message, opts = {}) {
  const root = $("#toast-root");
  if (!root) return;
  const id = `toast-${++toastCounter}`;
  const node = el("div", { class: `toast ${opts.type || "ok"}`, id, role: "status" });
  node.innerHTML = `<span class="toast-ic">${icon(opts.type === "error" ? "alert" : opts.type === "warn" ? "alert" : opts.type === "info" ? "info" : "check", 24)}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>`;
  if (opts.action) {
    const b = el("button", { class: "toast-action", type: "button", text: opts.action.label });
    b.onclick = () => { try { opts.action.onClick?.(); } finally { node.remove(); } };
    node.appendChild(b);
  }
  const close = el("button", { class: "toast-close", type: "button", "aria-label": "إغلاق", html: icon("x", 18) });
  close.onclick = () => node.remove();
  node.appendChild(close);
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => { node.classList.remove("show"); setTimeout(() => node.remove(), 250); }, opts.duration || 3600);
  return node;
}

/* ---------------- النوافذ المنبثقة ---------------- */
export function modal({ title = "", subtitle = "", body = "", actions = [], size = "md", closable = true, onClose = null, iconName = "" } = {}) {
  const root = $("#modal-root");
  const overlay = el("div", { class: "modal-overlay", role: "presentation" });
  const dialog = el("div", { class: `modal modal-${size}`, role: "dialog", "aria-modal": "true", "aria-label": title || "نافذة" });
  dialog.innerHTML = `
    <div class="modal-head">
      <div class="modal-title-wrap">
        ${iconName ? `<span class="modal-icon">${icon(iconName, 26)}</span>` : ""}
        <div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>
      </div>
      ${closable ? `<button class="icon-btn modal-close" type="button" aria-label="إغلاق">${icon("x", 24)}</button>` : ""}
    </div>
    <div class="modal-body"></div>
    ${actions.length ? `<div class="modal-actions"></div>` : ""}`;
  const bodyEl = dialog.querySelector(".modal-body");
  if (typeof body === "string") bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const actionsEl = dialog.querySelector(".modal-actions");
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  (actions || []).forEach(a => {
    const b = el("button", { class: `btn ${a.kind || "ghost"} ${a.class || ""}`, type: "button" });
    b.innerHTML = `${a.icon ? icon(a.icon, 20) : ""}<span>${escapeHtml(a.label)}</span>`;
    b.onclick = async () => {
      if (a.onClick) {
        const r = await a.onClick();
        if (r === false) return;
      }
      if (a.close !== false) close();
    };
    actionsEl.appendChild(b);
  });
  dialog.querySelector(".modal-close")?.addEventListener("click", close);
  overlay.addEventListener("mousedown", e => { if (e.target === overlay && closable) close(); });
  const onKey = e => { if (e.key === "Escape" && closable) close(); };
  document.addEventListener("keydown", onKey);
  overlay.appendChild(dialog);
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  setTimeout(() => dialog.querySelector("button, input, select, textarea, a")?.focus(), 80);
  return { close, dialog, body: bodyEl };
}

export function confirmDialog({ title = "تأكيد", message = "", confirmText = "تأكيد", cancelText = "إلغاء", kind = "danger", iconName = "alert" } = {}) {
  return new Promise(resolve => {
    let result = false;
    const m = modal({
      title, iconName, size: "sm", closable: true,
      body: `<p class="confirm-text">${escapeHtml(message)}</p>`,
      actions: [
        { label: cancelText, kind: "ghost", onClick: () => { result = false; } },
        { label: confirmText, kind, onClick: () => { result = true; } }
      ],
      onClose: () => resolve(result)
    });
    m.dialog.classList.add("modal-confirm");
  });
}

/* ---------------- بطاقات وإحصاءات ---------------- */
export function statCard({ label, value, sub = "", iconName = "chart", tone = "green", href = "", extra = "" }) {
  const tag = href ? "a" : "div";
  return `<${tag} class="stat-card tone-${tone}" ${href ? `href="${href}"` : ""}>
    <span class="stat-ic">${icon(iconName, 28)}</span>
    <span class="stat-body"><span class="stat-value">${value}</span><span class="stat-label">${escapeHtml(label)}</span>${sub ? `<span class="stat-sub">${sub}</span>` : ""}</span>
    ${extra}
  </${tag}>`;
}

export function progressRing(value, total, size = 92, stroke = 9, color = "var(--green-600)") {
  const v = clamp(total ? value / total : 0, 0, 1);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <span class="ring-label"><strong>${pct(value, total)}%</strong><small>${fmt(value)} / ${fmt(total)}</small></span>
  </div>`;
}

export function barChart(items, { height = 170, color = "var(--green-600)", suffix = "" } = {}) {
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="bar-chart" style="height:${height}px">
    ${items.map(i => `<div class="bar-col" title="${escapeHtml(i.label)}: ${fmt(i.value)}${suffix}">
      <span class="bar-value">${fmt(i.value)}</span>
      <span class="bar" style="height:${Math.max(4, (i.value / max) * 100)}%;background:${i.color || color}"></span>
      <span class="bar-label">${escapeHtml(i.label)}</span>
    </div>`).join("")}
  </div>`;
}

export function lineChart(values, labels = [], { height = 120, color = "var(--green-600)", fill = "rgba(15,107,79,.12)" } = {}) {
  const w = 640, h = height, pad = 18;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${pts.at(-1)?.[0] || pad},${h - pad} L${pts[0]?.[0] || pad},${h - pad} Z`;
  return `<div class="line-chart-wrap">
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="line-chart" role="img" aria-label="مخطط اتجاه">
      <path d="${area}" fill="${fill}" stroke="none"></path>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
      ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#fff" stroke="${color}" stroke-width="2.5"><title>${escapeHtml(labels[i] || "")}: ${values[i]}</title></circle>`).join("")}
    </svg>
    <div class="line-labels">${labels.map(l => `<span>${escapeHtml(l)}</span>`).join("")}</div>
  </div>`;
}

export function emptyState({ iconName = "file", title = "لا توجد بيانات", text = "", action = "" } = {}) {
  return `<div class="empty-state"><span class="empty-ic">${icon(iconName, 46)}</span><h3>${escapeHtml(title)}</h3>${text ? `<p>${text}</p>` : ""}${action}</div>`;
}

export function sectionCard({ title, subtitle = "", iconName = "", action = "", body = "", class: cls = "" }) {
  return `<section class="section-card ${cls}">
    ${title ? `<div class="section-head"><div class="section-title">${iconName ? icon(iconName, 24) : ""}<div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div></div>${action}</div>` : ""}
    <div class="section-body">${body}</div>
  </section>`;
}

export function chips(items, active, { name = "chip", className = "" } = {}) {
  return `<div class="chips ${className}">${items.map(i => `<button type="button" class="chip ${String(i.value) === String(active) ? "active" : ""}" data-chip="${name}" data-value="${escapeHtml(i.value)}">${escapeHtml(i.label)}${i.count != null ? `<span class="chip-count">${fmt(i.count)}</span>` : ""}</button>`).join("")}</div>`;
}

export function field({ label, name, type = "text", value = "", placeholder = "", required = false, hint = "", options = null, rows = 3, min = "", max = "", cls = "" }) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  let control = "";
  if (type === "select") {
    control = `<select id="${id}" name="${name}" class="input" ${required ? "required" : ""}>${(options || []).map(o => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(value) ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>`;
  } else if (type === "textarea") {
    control = `<textarea id="${id}" name="${name}" class="input" rows="${rows}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""}>${escapeHtml(value)}</textarea>`;
  } else {
    control = `<input id="${id}" name="${name}" class="input" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} ${min !== "" ? `min="${min}"` : ""} ${max !== "" ? `max="${max}"` : ""}>`;
  }
  return `<label class="field ${cls}" for="${id}"><span class="field-label">${escapeHtml(label)}${required ? " *" : ""}</span>${control}${hint ? `<span class="field-hint">${escapeHtml(hint)}</span>` : ""}</label>`;
}

export function avatar(name, stageId = 1) {
  const parts = String(name || "").trim().split(/\s+/);
  const text = (parts[0]?.[0] || "؟") + (parts[1]?.[0] || "");
  return `<span class="avatar stage-${stageId}">${escapeHtml(text)}</span>`;
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text; document.body.appendChild(ta); ta.select();
  document.execCommand("copy"); ta.remove();
  return Promise.resolve();
}

export function esc(s) { return escapeHtml(s); }
