/* 오늘도 금주 PWA service worker + Firebase Cloud Messaging */
const CACHE_NAME = 'oneuldo-geumju-v3';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDT_gTnwBSghvmPQ2s0hcmW9XNqYjV7Pqg",
  authDomain: "family-61367.firebaseapp.com",
  projectId: "family-61367",
  storageBucket: "family-61367.firebasestorage.app",
  messagingSenderId: "706014426399",
  appId: "1:706014426399:web:91c71df0996a6568e32c2a",
  measurementId: "G-18J12SNNX3"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  const title = data.title || '오늘도 금주';
  self.registration.showNotification(title, {
    body: data.body || '정신 차리고 오늘도 금주!',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: data.url || './' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./', self.location).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ('focus' in client) return client.focus();
    }
    return clients.openWindow(target);
  }));
});

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('oneuldo-geumju-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // 앱 화면(index.html)은 온라인일 때 항상 최신 파일을 먼저 가져온다.
  const isAppPage = event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  if (isAppPage) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const freshRequest = new Request(event.request, { cache: 'no-store' });
        const response = await fetch(freshRequest);
        if (response && response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        return (await cache.match(event.request)) || (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
