// اسم الكيش بتاعنا، لو غيرت أي ملفات أساسية، غيّر الرقم ده عشان تجبره يحدث
const CACHE_NAME = 'ab-control-hub-v1';

// الملفات الأساسية اللي عاوزينها تشتغل أوفلاين
const urlsToCache = [
  './', // <-- *** تم تعديل السطر ده ***
  'index.html',
  'site.webmanifest',
  'favicon.ico',
  'background.png',
  // ملفات الـ CSS والـ JS اللي بيعملها Gulp هتتكـيـّش تلقائي في الخطوة الجاية
];

// 1. حدث التثبيت (Install) - بيخزن الملفات الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. حدث الجلب (Fetch) - بيجيب الملفات من الكيش لو موجودة
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // لو الملف موجود في الكيش، رجّعه
        if (response) {
          return response;
        }

        // لو مش موجود، روح هاته من النت
        return fetch(event.request).then(
          (networkResponse) => {
            // لو جبته، خزنه في الكيش للمرة الجاية ورجّعه
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          }
        );
      })
  );
});

// 3. حدث التفعيل (Activate) - بيمسح الكيش القديم لو عملنا إصدار جديد
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});