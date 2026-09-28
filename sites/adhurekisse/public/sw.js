// Adhure Kisse service worker — PWA shell only.
//
// Deliberately NOT a playback engine and NOT a media cache:
//  • audio is streamed directly by the page's HTMLAudioElement
//  • /api/* responses (presigned URLs, permissions) are never cached
//  • cross-origin media (R2 presigned GETs) is never intercepted
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never touch privileged or media traffic
  if (
    event.request.method !== "GET" ||
    url.origin === "https://adhurekisse-audio" ||
    url.pathname.startsWith("/api/") ||
    event.request.headers.get("range")
  ) {
    return;
  }

  // Pass-through for everything else (future: offline shell for navigations)
  return;
});
