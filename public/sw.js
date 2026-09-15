const CACHE_NAME = 'reminders-shell-v2';
const SHELL_FILES = ['/', '/manifest.json'];
const DB_NAME = 'reminders-app';
const STORE_NAME = 'kv';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
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

// Offline-friendly: try network, fall back to cache for the app shell.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// --- Tiny IndexedDB helper, used to read the access code saved by the page,
// so the service worker can call the API on its own (e.g. when you tap a
// snooze button on a notification, with the app not even open).
function idbGet(key) {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction(STORE_NAME, 'readonly');
        const getReq = tx.objectStore(STORE_NAME).get(key);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

// Show a system notification when a push arrives from the server.
// Chrome/desktop/Android render the action buttons below; iOS Safari does not
// support notification action buttons at all, so on iOS this just becomes a
// plain tappable notification (tapping it opens the app - see notificationclick).
self.addEventListener('push', (event) => {
  let data = { title: 'Reminder', body: '' };
  try {
    data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Reminder', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { id: data.id },
      actions: [
        { action: 'snooze-15', title: 'Snooze 15m' },
        { action: 'snooze-60', title: 'Snooze 1h' },
        { action: 'snooze-1440', title: 'Tomorrow' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  const id = event.notification.data && event.notification.data.id;
  event.notification.close();

  if (event.action && event.action.startsWith('snooze-') && id) {
    const minutes = Number(event.action.split('-')[1]);
    event.waitUntil(
      idbGet('app_secret').then((token) => {
        if (!token) return; // app was never opened/logged in on this device - nothing we can do
        return fetch(`/api/reminders/${id}/snooze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ minutes }),
        });
      })
    );
    return;
  }

  // Plain tap (or iOS, which has no action buttons): just open/focus the app.
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
