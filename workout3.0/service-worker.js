// Kill switch: undoes the earlier caching service worker, which was causing
// stale pages to stick around. This claims open tabs, force-reloads them,
// wipes caches, then unregisters itself.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    (async () => {
      await self.clients.claim();
      const clientsList = await self.clients.matchAll({ type: "window" });
      clientsList.forEach((client) => client.navigate(client.url));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
    })()
  );
});
