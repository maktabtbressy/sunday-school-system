/* Service Worker — تفعيل "تثبيت التطبيق" (PWA) + فتح التطبيق أوفلاين من نسخة مخزّنة للقشرة الثابتة (App Shell).
   البيانات نفسها (Firestore) ليها آلية أوفلاين خاصة بيها (enableIndexedDbPersistence) ومش بتتخزن هنا.

   الإصدار v2 — إصلاح مشكلة "النسخة القديمة العالقة":
   النسخة الأولى (v1) كانت بتخدم الملفات من الكاش أولًا دايمًا، فبعد أي `firebase deploy` كان اللي مثبّت التطبيق
   يفضل شايف app.js/index.html القديمة لحد ما يمسح بيانات الموقع يدويًا.
   دلوقتي الاستراتيجية: "الشبكة أولًا" (network-first) — دايمًا نحاول نجيب أحدث نسخة من السيرفر،
   ولو النت مقطوع نرجع للنسخة المخزّنة. فمابقاش لازم ترفع رقم النسخة (CACHE_NAME) مع كل نشر. */
const CACHE_NAME = 'sunday-school-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // نخزّن كل ملف لوحده: لو ملف واحد مش موجود، الباقي يتخزّن عادي
      // (cache.addAll القديمة كانت بتفشل كلها لو ملف واحد بس 404، وكان الخطأ بيتبلع بصمت)
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

async function networkFirst(event) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  try {
    // cache:'no-cache' = نتأكد من السيرفر (طلب شرطي رخيص، 304 لو ما اتغيرش) بدل ما نصدّق كاش المتصفح
    // (Firebase Hosting بيحط max-age=3600 افتراضيًا، فكان ممكن نشوف نسخة عمرها ساعة)
    const fresh = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (fresh && fresh.ok && fresh.type === 'basic') {
      event.waitUntil(cache.put(req.url, fresh.clone()));
    }
    return fresh;
  } catch (err) {
    // أوفلاين: أحدث نسخة مخزّنة عندنا
    const cached = await cache.match(req.url, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    return Response.error();
  }
}

async function cacheFirst(event) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req.url);
  if (cached) return cached;
  const fresh = await fetch(req.url, { credentials: 'same-origin' });
  if (fresh && fresh.ok && fresh.type === 'basic') {
    event.waitUntil(cache.put(req.url, fresh.clone()));
  }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // أي حاجة مش من نفس موقعنا (Firebase/Firestore/Google Fonts/CDN...) تروح للنت زي ما هي — منخزنش رد منها هنا
  if (url.origin !== self.location.origin) return;
  // مسارات Firebase Hosting المحجوزة (/__/auth/..., /__/firebase/init.json) — ماتتدخلش فيها
  if (url.pathname.startsWith('/__/')) return;

  // الأيقونات ما بتتغيرش كتير: الكاش أولًا أسرع وأوفر
  if (url.pathname.includes('/icons/')) {
    event.respondWith(cacheFirst(event).catch(() => Response.error()));
    return;
  }
  // باقي القشرة (HTML/JS/CSS/manifest): الشبكة أولًا عشان التحديثات توصل فورًا
  event.respondWith(networkFirst(event));
});
