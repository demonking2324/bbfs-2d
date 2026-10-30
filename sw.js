// Offline support: the game shell is cached on install; Google Fonts are cached as they are first used.
// Bump VERSION whenever a cached file changes so players get the update.
const VERSION = "bbfs2d-v14";
const FONT_CACHE = "bbfs2d-fonts";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "game.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "assets/aircraft/a320/a320-gear-up.png",
  "assets/aircraft/a320/a320-gear-down.png",
  "assets/aircraft/b744/b744-gear-up.png",
  "assets/aircraft/b744/b744-gear-down.png",
  "assets/aircraft/b722/b722-gear-up.png",
  "assets/aircraft/b722/b722-gear-down.png",
  "assets/aircraft/b733/b733-gear-up.png",
  "assets/aircraft/b733/b733-gear-down.png",
  "assets/aircraft/a343/a343-gear-up.png",
  "assets/aircraft/a343/a343-gear-down.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION && key !== FONT_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.open(FONT_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok || response.type === "opaque") cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || network;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Network first so a deployed update shows up straight away; the cache covers offline play.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match("index.html"))),
  );
});
