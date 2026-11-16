/* راصد — Service Worker (عمل كامل دون إنترنت) */
const VERSION = "rased-v3.2.0";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/recorder-auth.js",
  "./js/realtime.js",
  "./vendor/mqtt.min.js",
  "./js/core.js",
  "./js/db.js",
  "./js/shared-cloud.js",
  "./js/sync.js",
  "./js/ui.js",
  "./js/attendance.js",
  "./js/admin.js",
  "./js/admin-cases.js",
  "./js/admin-import.js",
  "./js/reports.js",
  "./js/public-reports.js",
  "./js/public-cases.js",
  "./js/settings.js",
  "./js/whatsapp.js",
  "./js/excuse.js",
  "./js/print.js",
  "./data/seed.js",
  "./assets/fonts/tajawal-400.woff2",
  "./assets/fonts/tajawal-500.woff2",
  "./assets/fonts/tajawal-700.woff2",
  "./assets/fonts/tajawal-800.woff2",
  "./assets/icons/favicon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./guide.html",
  "./entry.html",
  "./vendor/xlsx.full.min.js",
  "./whatsapp-extension.zip"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
