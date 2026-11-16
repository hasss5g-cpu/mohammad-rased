/* ============================================================
   حسابات التوقيت العشوائي (مشتركة بين الإضافة والاختبارات)
   الهدف: فواصل غير منتظمة — تنقص وتزيد — حتى لا يبدو الإرسال آليًا.
   ============================================================ */
(function (root) {
  'use strict';

  function rand(min, max) { return min + Math.random() * (max - min); }

  /* فاصل زمني متفاوت قبل الانتقال للطالب التالي (بالمللي ثانية) */
  function nextDelay(opts) {
    const o = opts || {};
    const min = Math.max(3, Number(o.min) || 8);
    const max = Math.max(min + 1, Number(o.max) || 25);
    let sec = rand(min, max);

    /* تنويع إضافي: أحيانًا رسالة سريعة، وأحيانًا وقفة أطول */
    const r = Math.random();
    if (r < 0.22) sec = sec * rand(0.45, 0.7);        /* دفعة أسرع */
    else if (r > 0.78) sec = sec * rand(1.3, 1.9);    /* وقفة أطول */

    /* وقفة كبيرة كل عدد معيّن من الرسائل */
    const every = Number(o.every) || 0;
    const extra = Number(o.extra) || 0;
    const index = Number(o.index) || 0;
    if (every > 0 && extra > 0 && index > 0 && index % every === 0) {
      sec += rand(extra * 0.6, extra * 1.4);
    }

    return Math.max(3000, Math.round(sec * 1000));
  }

  /* وقفة قصيرة عشوائية داخل المحادثة (قبل الضغط على إرسال) */
  function readDelay(minSec, maxSec) {
    return Math.round(rand(minSec || 1.5, maxSec || 5) * 1000);
  }

  const api = { nextDelay: nextDelay, readDelay: readDelay, rand: rand };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RasidScheduler = api;
})(typeof self !== 'undefined' ? self : this);
