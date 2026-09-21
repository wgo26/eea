/**
 * Phase 4 — offline reading service worker (hand-rolled, no dependency).
 *
 * Strategy (built for the data-plan audience):
 *  - Navigations: network-first, falling back to the Cache API copy of the
 *    page; when neither exists, the locale offline fallback page.
 *  - `/_next/image`: cache-first (images are the bytes that matter).
 *  - Visited story pages: opportunistically cached (stale-while-revalidate,
 *    trimmed to the freshest 50) so "read it later" works even without an
 *    explicit tap; explicit saves go through the SAVE message below.
 *  - Everything else (API, admin, app shell mutations): network-only.
 *
 * Version the caches by hand on strategy changes (CACHE_VERSION).
 */
const CACHE_VERSION = "eea-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const ARTICLES_CACHE = `${CACHE_VERSION}-articles`;
const MAX_ARTICLES = 50;
const OFFLINE_PAGES = ["/en/offline", "/fr/offline"];

function localeFromPath(pathname) {
  const first = pathname.split("/")[1];
  return first === "fr" ? "fr" : "en";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.addAll(OFFLINE_PAGES);
      } catch {
        /* offline at install — the runtime fallback still works */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("eea-v") && k !== STATIC_CACHE && k !== ARTICLES_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Explicit "Save offline" from the article page. */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "SAVE" || typeof data.url !== "string") return;
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(ARTICLES_CACHE);
        await cache.add(new Request(data.url, { credentials: "same-origin" }));
        await trimArticles(cache);
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const client of clients) client.postMessage({ type: "SAVED", url: data.url });
      } catch {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const client of clients) client.postMessage({ type: "SAVE_FAILED", url: data.url });
      }
    })(),
  );
});

async function trimArticles(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ARTICLES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ARTICLES).map((r) => cache.delete(r)));
}

function isContentPage(url) {
  return /^\/(en|fr)\/(news|photo-stories|culture|notices|buy-sell|street)\//.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Mutations, auth, uploads and the admin/account shells stay online-only.
  if (/^\/(api|auth)\//.test(url.pathname)) return;

  // Optimized images: cache-first, then network (and cache the result).
  if (url.pathname.startsWith("/_next/image")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res.ok) void cache.put(request, res.clone());
          return res;
        } catch {
          return hit ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Navigations: network-first so developing stories stay live; fall back to
  // the cached page, then the locale offline shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok && isContentPage(url)) {
            const cache = await caches.open(ARTICLES_CACHE);
            void cache.put(request, res.clone()).then(() => trimArticles(cache));
          }
          return res;
        } catch {
          const cached =
            (await caches.match(request, { cacheName: ARTICLES_CACHE })) ??
            (await caches.match(request, { cacheName: STATIC_CACHE }));
          if (cached) return cached;
          const fallback =
            (await caches.match(`/${localeFromPath(url.pathname)}/offline`)) ??
            (await caches.match("/en/offline"));
          if (fallback) return fallback;
          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })(),
    );
    return;
  }

  // Visited story pages (non-navigation subresources hit here only for
  // same-document prefetches): stale-while-revalidate from the articles cache.
  if (isContentPage(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ARTICLES_CACHE);
        const hit = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) void cache.put(request, res.clone()).then(() => trimArticles(cache));
            return res;
          })
          .catch(() => hit);
        return hit ?? network;
      })(),
    );
  }
});
