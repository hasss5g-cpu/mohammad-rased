/* نافذة الإضافة: عرض الحالة والتحكم السريع */
const $ = id => document.getElementById(id);
let timer = null;

function refresh() {
  chrome.runtime.sendMessage({ cmd: 'popup-status' }, res => {
    if (!res) return;
    $('state').textContent = res.running ? 'جارٍ الإرسال' : 'غير مُشغّل';
    $('state').className = 'pill' + (res.running ? ' on' : '');
    $('sent').textContent = res.sent || 0;
    $('failed').textContent = res.failed || 0;
    $('prog').textContent = (res.index || 0) + ' / ' + (res.total || 0);
  });
}

$('open').onclick = () => {
  chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
};
$('stop').onclick = () => {
  chrome.runtime.sendMessage({ cmd: 'popup-stop' }, refresh);
};

refresh();
timer = setInterval(refresh, 1500);
window.addEventListener('unload', () => clearInterval(timer));
