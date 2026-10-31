/* Offline shell. No image files or user portfolio data are cached. */
const CACHE = 'portfolio-compass-/*__CACHE_REVISION__*/';
const SHELL = /*__OFFLINE_ASSETS__*/;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./', ...SHELL])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('portfolio-compass-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request;
  if (request.method !== 'GET') return;
  const url=new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/') || url.pathname.includes('/cdn-cgi/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put('./',copy)));
      }
      return response;
    }).catch(() => caches.match('./')));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && response.type === 'basic' && (
      SHELL.some(path => new URL(path,self.registration.scope).pathname === url.pathname) ||
      url.pathname.startsWith(new URL('./vendor/',self.registration.scope).pathname)
    )) {
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request,copy)));
    }
    return response;
  })));
});
