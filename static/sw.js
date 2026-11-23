// Minimal service worker.
//
// Its only job is to make the site installable ("Add to Home Screen") in
// Chrome/Edge/Android. It deliberately does NOT cache responses: every
// request goes straight to the network, so a new deploy is always served
// immediately and there is no stale-cache failure mode.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // No respondWith(): let the browser handle the request normally.
});
