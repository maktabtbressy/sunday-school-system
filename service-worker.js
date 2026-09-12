/* Service Worker بسيط — الهدف الأساسي هو تفعيل خاصية "تثبيت التطبيق" (PWA)،
   مع تخزين مبدئي بسيط للقشرة الثابتة (App Shell) فقط. البيانات نفسها (Firestore)
   ليها آلية أوفلاين خاصة بيها (enableIndexedDbPersistence) ومش بتتخزن هنا. */
const CACHE_NAME = 'sunday-school-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Firebase/Firestore وأي طلبات API: خليها تروح للنت زي ما هي دايمًا، منخزنش رد منها هنا خالص
  if (req.method !== 'GET' || req.url.includes('firestore.googleapis.com') || req.url.includes('googleapis.com') || req.url.includes('gstatic.com')) {
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => cached))
  );
});
