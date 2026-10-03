// Adhure Kisse service worker — PWA shell only.
//
// Deliberately NOT a playback engine and NOT a media cache:
//  • audio is streamed directly by the page's HTMLAudioElement
//  • /api/* responses (presigned URLs, permissions) are never cached
//  • cross-origin traffic (R2 presigned GETs, YouTube) is never intercepted
self.addEventListener("install", () => {
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

  // Same-origin static assets pass through untouched (future: offline shell)
  return;
});
