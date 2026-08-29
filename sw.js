const CACHE = "d9-gestion-v041-dev-ofertas-desktop";
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./config.js", "./manifest.json", "./icons/logo_d9.png", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request, {cache:"no-store"}).then(response => { const copy=response.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return response; }).catch(()=>caches.match(event.request)));
});
