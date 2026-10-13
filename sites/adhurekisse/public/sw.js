// Adhure Kisse service worker — a deliberately small PWA shell.
//
// Deliberately NOT a playback engine and NOT a media cache:
//  • audio is streamed directly by the page's HTMLAudioElement
//  • /api/* responses (presigned URLs, permissions) are never cached
//  • cross-origin traffic (R2 presigned GETs, YouTube) is never intercepted
const SHELL_CACHE = "adhurekisse-shell-v1";
const SHELL = ["/", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Pass through everything privileged, ranged, or cross-origin
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    event.request.headers.get("range")
  ) {
    return;
  }

  // Only the public app shell is cached. Private metadata, signed URLs, and
  // audio bytes never enter Cache Storage.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request).then((response) => {
          if (response.ok) {
            void caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => cached ?? Response.error());
        return cached ?? network;
      }),
    );
  }
});
