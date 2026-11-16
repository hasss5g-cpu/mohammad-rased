/* نافذة إضافة جسر نور */
const NOOR_URL = "https://noor.moe.gov.sa/Noor/EduWaveSMS/ManageAttendance.aspx?EKME-sZ-qgdJhYZtXdsecQ2=CbAaLvlaYI41";
const status = document.getElementById("status");
const openPanel = document.getElementById("openPanel");
const openNoor = document.getElementById("openNoor");

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const ok = !!(tab && tab.url && /noor\.moe\.gov\.sa/i.test(tab.url));
  status.textContent = ok ? "صفحة نور مفتوحة" : "ليست صفحة نور";
  status.className = "pill" + (ok ? " on" : "");
  openPanel.disabled = !ok;
});

openPanel.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { cmd: "openPanel" }, () => {
      if (chrome.runtime.lastError) {
        status.textContent = "حدّث صفحة نور أولاً";
        status.className = "pill";
      }
    });
  });
});

openNoor.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: NOOR_URL });
});
