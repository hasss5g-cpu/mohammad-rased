/* ============================================================
   جسر التواصل بين صفحة البرنامج (رصد التأخر / الغياب) والإضافة
   يعمل في أي صفحة عادية بما فيها ملفات سطح المكتب file://
   ============================================================ */
(function () {
  'use strict';

  let port = null;

  function connect() {
    try {
      port = chrome.runtime.connect({ name: 'rasid-bridge' });
      port.onMessage.addListener(msg => {
        if (!msg) return;
        window.postMessage({ __rasidExt: true, type: msg.type, progress: msg.progress, summary: msg.summary, message: msg.message, kind: msg.kind }, '*');
      });
      port.onDisconnect.addListener(() => { port = null; setTimeout(connect, 1000); });
    } catch (e) {
      port = null;
      setTimeout(connect, 1500);
    }
  }

  window.addEventListener('message', ev => {
    const d = ev.data;
    if (!d || !d.__rasidApp) return;
    if (!port) connect();
    const send = () => { try { port.postMessage({ cmd: d.__rasidApp, payload: d.payload || {} }); } catch (e) { } };
    if (d.__rasidApp === 'ping') {
      window.postMessage({ __rasidExt: true, type: 'pong' }, '*');
      if (port) send();
      return;
    }
    send();
  });

  connect();
  window.postMessage({ __rasidExt: true, type: 'pong' }, '*');
})();
