// No caching at all. This app always needs a live Supabase connection anyway,
// so there's no real offline benefit to caching the shell - and caching it
// caused repeated stale-version bugs (new HTML paired with old CSS/JS).
// This worker's only job now is to self-activate and wipe out any caches
// left behind by earlier versions of this file.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
