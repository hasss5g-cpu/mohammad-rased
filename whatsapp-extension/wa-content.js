/* ============================================================
   يعمل داخل صفحة واتساب ويب: ينتظر فتح المحادثة، يرسل الرسالة،
   ويتأكد من خروجها، ثم يبلّغ الخدمة الخلفية بالنتيجة.
   ============================================================ */
(function () {
  'use strict';

  let port = null;
  let busy = false;

  function connect() {
    try {
      port = chrome.runtime.connect({ name: 'rasid-wa' });
      port.onMessage.addListener(onMsg);
      port.onDisconnect.addListener(() => { port = null; setTimeout(connect, 800); });
      port.postMessage({ cmd: 'ready' });
    } catch (e) {
      setTimeout(connect, 1000);
    }
  }

  function say(message, kind) { if (port) port.postMessage({ cmd: 'log', message: message, kind: kind }); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function nowTime() {
    const d = new Date();
    let h = d.getHours();
    const ap = h < 12 ? 'ص' : 'م';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
  }

  function onMsg(m) {
    if (!m) return;
    if (m.type === 'task') {
      if (!m.task) return;
      handleTask(m.task);
    }
  }

  /* ---------- عناصر واجهة واتساب ---------- */
  function composer() {
    const sel = [
      'footer div[contenteditable="true"][data-lexical-editor="true"]',
      'footer div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][data-tab="6"]',
      'footer div[contenteditable="true"]'
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }
  function sendButton() {
    const sel = [
      'button[aria-label="Send"]', 'button[aria-label="إرسال"]',
      'span[data-icon="send"]', 'button[data-testid="send"]',
      'div[role="button"][aria-label="Send"]', 'div[role="button"][aria-label="إرسال"]'
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el) {
        const btn = el.closest('button') || el.closest('div[role="button"]') || el;
        if (btn && btn.offsetParent !== null) return btn;
      }
    }
    return null;
  }
  function dialogText() {
    const d = document.querySelector('div[role="dialog"]');
    return d ? (d.innerText || '') : '';
  }
  function loggedIn() {
    return !document.querySelector('canvas[aria-label*="Scan"]') &&
      !document.querySelector('div[data-ref] canvas') &&
      (!!composer() || !!document.querySelector('#side') || !!document.querySelector('[data-testid="chat-list"]'));
  }

  async function waitFor(fn, timeout, step) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { const v = fn(); if (v) return v; } catch (e) { }
      await sleep(step || 300);
    }
    return null;
  }

  /* ---------- تنفيذ الإرسال ---------- */
  async function handleTask(task) {
    if (busy) return;
    busy = true;
    try {
      /* 1) انتظار تحميل واتساب ويب */
      const ready = await waitFor(loggedIn, 45000, 400);
      if (!ready) {
        if (document.querySelector('canvas')) {
          reply(task, false, 'يلزم تسجيل الدخول إلى واتساب ويب أولًا (امسح رمز QR)');
        } else {
          reply(task, false, 'لم تُحمّل صفحة واتساب ويب خلال 45 ثانية');
        }
        return;
      }
      await sleep(1200);

      /* 2) التأكد من صحة الرقم */
      const bad = await waitFor(() => {
        const t = dialogText();
        return /invalid|غير صالح|رقم الهاتف|phone number shared/i.test(t) ? t : null;
      }, 4000, 250);
      if (bad) { reply(task, false, 'الرقم غير مسجل في واتساب'); return; }

      /* 3) انتظار صندوق الكتابة */
      const box = await waitFor(composer, 30000, 300);
      if (!box) { reply(task, false, 'لم يتم العثور على صندوق كتابة الرسالة'); return; }

      /* 4) وقفة قصيرة عشوائية داخل المحادثة (تبدو بشرية) */
      await sleep(1200 + Math.random() * 3000);

      /* 5) تجهيز النص: النص يأتي جاهزًا من رابط المحادثة، وإن لم يصل نكتبه */
      const wanted = (task.text || '').replace(/\r/g, '');
      let current = (box.innerText || '').replace(/\u200b/g, '').trim();
      if (!current && wanted) {
        box.focus();
        await sleep(200);
        document.execCommand('insertText', false, wanted);
        await sleep(400);
        current = (box.innerText || '').replace(/\u200b/g, '').trim();
      }
      if (!current) { reply(task, false, 'لم تُكتب الرسالة في صندوق المحادثة'); return; }

      /* 6) الإرسال: زر الإرسال إن وُجد، وإلا مفتاح Enter */
      const btn = sendButton();
      if (btn) { btn.click(); }
      else {
        box.focus();
        const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        box.dispatchEvent(new KeyboardEvent('keydown', opts));
        box.dispatchEvent(new KeyboardEvent('keypress', opts));
        box.dispatchEvent(new KeyboardEvent('keyup', opts));
      }

      /* 7) التأكد من الإرسال (فراغ الصندوق أو ظهور رسالة صادرة) */
      const ok = await waitFor(() => {
        const c = composer();
        const empty = !c || !(c.innerText || '').replace(/\u200b/g, '').trim();
        const out = document.querySelectorAll('div.message-out, [data-id*="true_"], [data-pre-plain-text]');
        return (empty && out.length > 0) || empty ? true : null;
      }, 12000, 400);

      if (ok) reply(task, true, '');
      else reply(task, false, 'لم يتم تأكيد الإرسال من واتساب');
    } catch (e) {
      reply(task, false, 'خطأ: ' + (e && e.message ? e.message : e));
    } finally {
      busy = false;
    }
  }

  function reply(task, ok, detail) {
    if (!port) return;
    port.postMessage({ cmd: 'result', result: { sid: task.sid, ok: ok, detail: detail, time: ok ? nowTime() : '' } });
  }

  connect();
})();
