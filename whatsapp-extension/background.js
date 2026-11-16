/* ============================================================
   مُرسل واتساب التلقائي — الخدمة الخلفية (MV3 service worker)
   • يستقبل قائمة الطلاب من صفحة البرنامج
   • يفتح واتساب ويب للطالب، يرسل، يغلق، وينتقل للذي بعده
   • بفواصل زمنية عشوائية متفاوتة
   ============================================================ */
importScripts('scheduler.js');

const WA_URL = 'https://web.whatsapp.com/';
const WA_SEND = 'https://web.whatsapp.com/send?phone=';
const S = self.RasidScheduler;

let run = null;            /* { items, index, sent, failed, opts, stopped, tabId, waiting } */
let bridgePorts = new Set();
let waPort = null;
let waitTimer = null;

/* ---------- أدوات ---------- */
function nowTime() {
  const d = new Date();
  let h = d.getHours();
  const ap = h < 12 ? 'ص' : 'م';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
}
function broadcast(msg) {
  bridgePorts.forEach(p => { try { p.postMessage(msg); } catch (e) { } });
}
function log(message, kind) { broadcast({ type: 'log', message: message, kind: kind || '' }); }
function progress(p) {
  p.time = p.status === 'sent' ? nowTime() : p.time;
  broadcast({ type: 'progress', progress: p });
}
function persist() {
  try {
    chrome.storage.local.set({
      lastRun: run ? { sent: run.sent, failed: run.failed, index: run.index, total: run.items.length, at: Date.now() } : null
    });
  } catch (e) { }
}

/* ---------- دورة الإرسال ---------- */
function startRun(payload) {
  const items = (payload && payload.items || []).filter(x => x && x.wa);
  if (!items.length) { log('لا توجد أرقام صالحة للإرسال', 'err'); return; }
  if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
  run = {
    items: items, index: 0, sent: 0, failed: 0, stopped: false, tabId: null, waiting: 0,
    opts: {
      min: Number(payload.min) || 8, max: Number(payload.max) || 25,
      every: Number(payload.every) || 0, extra: Number(payload.extra) || 0,
      closeTab: payload.closeTab !== false
    }
  };
  log('بدأ الإرسال التلقائي لـ ' + items.length + ' طالبًا', 'ok');
  sendCurrent();
}

function sendCurrent() {
  if (!run || run.stopped) return;
  if (run.index >= run.items.length) return finish('تم الانتهاء');
  const it = run.items[run.index];
  const url = WA_SEND + it.wa + (it.text ? '&text=' + encodeURIComponent(it.text) : '');
  progress({ index: run.index + 1, total: run.items.length, sid: it.sid, name: it.name, status: 'sending' });

  const open = (tabId) => {
    if (tabId != null) {
      run.tabId = tabId;
      chrome.tabs.update(tabId, { url: url, active: true });
    } else {
      chrome.tabs.create({ url: url, active: true }, t => { run.tabId = t.id; });
    }
  };
  if (run.tabId != null) {
    chrome.tabs.get(run.tabId, t => {
      if (chrome.runtime.lastError || !t) { run.tabId = null; open(null); }
      else open(run.tabId);
    });
  } else {
    open(null);
  }
}

/* تُستدعى من صفحة واتساب بعد محاولة الإرسال */
function taskResult(res) {
  if (!run) return;
  const it = run.items[run.index];
  if (!it) return;
  if (it.sid !== res.sid) return;         /* نتيجة قديمة */

  if (res.ok) {
    run.sent++;
    progress({ index: run.index + 1, total: run.items.length, sid: it.sid, name: it.name, status: 'sent', time: res.time || nowTime() });
  } else {
    run.failed++;
    progress({ index: run.index + 1, total: run.items.length, sid: it.sid, name: it.name, status: 'failed', detail: res.detail || 'لم يتم الإرسال' });
  }
  persist();
  run.index++;

  if (run.stopped) return;
  if (run.index >= run.items.length) return finish('تم الانتهاء');

  /* فاصل عشوائي متفاوت ثم نغلق النافذة وننتقل للطالب التالي */
  const wait = S.nextDelay({
    min: run.opts.min, max: run.opts.max, every: run.opts.every,
    extra: run.opts.extra, index: run.index
  });
  run.waiting = Math.round(wait / 1000);
  broadcast({ type: 'progress', progress: { index: run.index, total: run.items.length, sid: it.sid, status: 'waiting', wait: run.waiting } });
  closeWaTab();
  waitTimer = setTimeout(() => {
    waitTimer = null;
    if (!run || run.stopped) return;
    run.waiting = 0;
    sendCurrent();
  }, wait);
}

function closeWaTab() {
  if (!run || !run.opts.closeTab || run.tabId == null) return;
  const id = run.tabId;
  run.tabId = null;
  try { chrome.tabs.remove(id, () => void chrome.runtime.lastError); } catch (e) { }
}

function finish(reason) {
  if (!run) return;
  const summary = { total: run.items.length, sent: run.sent, failed: run.failed, reason: reason };
  closeWaTab();
  if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
  broadcast({ type: 'done', summary: summary });
  log('انتهى الإرسال — نجح ' + summary.sent + ' وفشل ' + summary.failed, summary.failed ? 'warn' : 'ok');
  run = null;
}

function stopRun() {
  if (!run) { broadcast({ type: 'done', summary: { sent: 0, failed: 0, total: 0, reason: 'متوقف' } }); return; }
  run.stopped = true;
  if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
  closeWaTab();
  broadcast({ type: 'done', summary: { total: run.items.length, sent: run.sent, failed: run.failed, reason: 'أُوقف يدويًا' } });
  log('تم إيقاف الإرسال التلقائي', 'warn');
  run = null;
}

/* ---------- الاتصال بصفحة البرنامج ---------- */
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'rasid-bridge') {
    bridgePorts.add(port);
    port.onMessage.addListener(msg => {
      if (!msg) return;
      if (msg.cmd === 'ping') port.postMessage({ type: 'pong' });
      else if (msg.cmd === 'start') startRun(msg.payload);
      else if (msg.cmd === 'stop') stopRun();
      else if (msg.cmd === 'status') {
        port.postMessage({
          type: 'status',
          running: !!run,
          summary: run ? { index: run.index, total: run.items.length, sent: run.sent, failed: run.failed } : null
        });
      }
    });
    port.onDisconnect.addListener(() => bridgePorts.delete(port));
    return;
  }
  if (port.name === 'rasid-wa') {
    waPort = port;
    port.onMessage.addListener(msg => {
      if (!msg) return;
      if (msg.cmd === 'ready') {
        /* صفحة واتساب جاهزة: أعطها المهمة الحالية */
        const it = run ? run.items[run.index] : null;
        port.postMessage({
          type: 'task',
          task: it ? { sid: it.sid, name: it.name, wa: it.wa, text: it.text, index: run.index + 1, total: run.items.length } : null
        });
      } else if (msg.cmd === 'result') {
        taskResult(msg.result || {});
      } else if (msg.cmd === 'log') {
        log(msg.message || '', msg.kind || '');
      }
    });
    port.onDisconnect.addListener(() => { if (waPort === port) waPort = null; });
  }
});

/* ---------- منبثقة الإضافة ---------- */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.cmd === 'popup-status') {
    reply({
      running: !!run,
      index: run ? run.index : 0,
      total: run ? run.items.length : 0,
      sent: run ? run.sent : 0,
      failed: run ? run.failed : 0
    });
    return true;
  }
  if (msg.cmd === 'popup-start') {
    startRun(msg.payload);
    reply({ ok: true });
    return true;
  }
  if (msg.cmd === 'popup-stop') {
    stopRun();
    reply({ ok: true });
    return true;
  }
});

/* تنظيف عند الإغلاق */
chrome.runtime.onInstalled.addListener(() => { log('تم تثبيت إضافة راصد — مُرسل واتساب', 'ok'); });

