/*
 * Spotter service worker. Generated into out/sw.js by scripts/build-sw.mjs.
 *
 * Every file of the static build is precached on install, so the app opens
 * and navigates with no connection. Requests to Supabase are never touched:
 * data goes through the app's own offline queue (IndexedDB).
 */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `spotter-${VERSION}`;
const KEEP_CACHES = 2; // keep the previous build too, for pages still running it

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          const res = await fetch(url, { cache: "reload" });
          if (!res.ok) throw new Error(`Precache failed for ${url}: ${res.status}`);
          // A redirected response can't be used to answer a navigation, so store a clean copy.
          const clean = res.redirected
            ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers })
            : res;
          await cache.put(url, clean);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = (await caches.keys()).filter((n) => n.startsWith("spotter-"));
      // Cache names sort by build time because VERSION starts with a timestamp.
      const stale = names.sort().reverse().slice(KEEP_CACHES);
      await Promise.all(stale.map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** Lookup keys for a request: the clean URL, ignoring ?_rsc and other query params. */
function candidates(url) {
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.endsWith(".html")) return [path.slice(0, -".html".length) || "/", path];
  return [path];
}

async function fromCache(request) {
  const url = new URL(request.url);
  const current = await caches.open(CACHE);
  for (const path of candidates(url)) {
    const hit = await current.match(path, { ignoreSearch: true });
    if (hit) return hit;
  }
  // A page still running the previous build may ask for its own chunks.
  return caches.match(url.pathname, { ignoreSearch: true });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  event.respondWith(
    (async () => {
      const cached = await fromCache(request);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch (err) {
        if (request.mode === "navigate") {
          const fallback = await (await caches.open(CACHE)).match("/today");
          if (fallback) return fallback;
        }
        throw err;
      }
    })(),
  );
});
