/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// keeps the app and pdf.js offline, a page always gets chunks of its own build

import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const APP_PREFIX = 'brainotes-app-';
const APP_CACHE = `${APP_PREFIX}${version}`;
// these outlive builds: last good copies of everything else, and the fonts
const CACHE_NAME = 'brainotes-v1';
const FONT_CACHE = 'brainotes-fonts-v1';

const PRECACHE = [
  ...build,
  ...prerendered,
  ...files.filter((f) => /^\/(favicon\.svg|manifest\.json)$/.test(f) || (f.startsWith('/pdfjs/') && !/LICENSE|version\.txt$/.test(f)))
];

// caches can be missing (private windows in some browsers)
async function openCache(name: string): Promise<Cache | null> {
  try {
    return await caches.open(name);
  } catch {
    return null;
  }
}

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await openCache(APP_CACHE);
      if (!cache) return;
      // one missing file must not stop the rest from being cached
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url).catch(() => {})));
    })()
  );
  sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        // the build before stays for tabs still on it, keys() lists oldest first
        const older = names.filter((n) => n.startsWith(APP_PREFIX) && n !== APP_CACHE);
        const keep = [APP_CACHE, CACHE_NAME, FONT_CACHE, older[older.length - 1]];
        await Promise.all(names.filter((n) => !keep.includes(n)).map((n) => caches.delete(n)));
      } catch {
        // no cache storage, nothing to clean
      }
      await sw.clients.claim();
    })()
  );
});

// hard reloads bypass the worker, the app asks to be taken back
sw.addEventListener('message', (event) => {
  if (event.data?.type === 'claim') event.waitUntil(sw.clients.claim());
});

async function put(name: string, request: Request, response: Response) {
  const cache = await openCache(name);
  if (!cache) return;
  try {
    await cache.put(request, response);
  } catch {
    // storage full or unavailable
  }
}

// an app file never changes under its name, the copy of its own build wins
async function handleImmutable(request: Request): Promise<Response> {
  const hit = await caches.match(request).catch(() => undefined);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await put(APP_CACHE, request, response.clone());
  return response;
}

// a font file never changes under its address, the stylesheet may
async function handleFont(request: Request, url: URL): Promise<Response> {
  if (url.hostname === 'fonts.gstatic.com') {
    const hit = await caches.match(request).catch(() => undefined);
    if (hit) return hit;
  }
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') await put(FONT_CACHE, request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request).catch(() => undefined);
    if (cached) return cached;
    throw err;
  }
}

// network first, then this build's page for a navigation or the last good copy
async function handleDefault(request: Request, url: URL): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.status === 200) await put(CACHE_NAME, request, response.clone());
    return response;
  } catch (err) {
    // a page comes from this build, the kept older build must not win
    if (request.mode === 'navigate') {
      const app = await openCache(APP_CACHE);
      const page = (await app?.match(url.pathname).catch(() => undefined)) || (await app?.match('/').catch(() => undefined));
      if (page) return page;
    }
    const cached = await caches.match(request).catch(() => undefined);
    if (cached) return cached;
    throw err;
  }
}

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(handleFont(request, url).catch(() => fetch(request)));
    return;
  }
  if (url.origin !== sw.location.origin) return;

  if (url.pathname.startsWith('/_app/immutable/')) {
    event.respondWith(handleImmutable(request).catch(() => fetch(request)));
    return;
  }

  // the browser always gets a real answer, never a broken interception
  event.respondWith(handleDefault(request, url).catch(() => fetch(request)));
});
