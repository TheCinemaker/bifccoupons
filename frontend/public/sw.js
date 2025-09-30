self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => self.clients.claim());

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API SWR
  if (url.pathname.startsWith("/.netlify/functions/coupons")) {
    event.respondWith((async () => {
      const cache = await caches.open("api-coupons");
      const cached = await cache.match(req);
      const network = fetch(req).then(res => { cache.put(req, res.clone()); return res; })
        .catch(() => cached || new Response(JSON.stringify({ items: [] }), { headers: { "content-type": "application/json" } }));
      return cached || network;
    })());
    return;
  }

  // Képek SWR
  if (req.destination === "image") {
    event.respondWith((async () => {
      const cache = await caches.open("img");
      const cached = await cache.match(req);
      const network = fetch(req).then(res => { cache.put(req, res.clone()); return res; })
        .catch(() => cached || fetch(req));
      return cached || network;
    })());
  }
});
