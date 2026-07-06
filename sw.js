"use strict";

const CACHE_VERSION = "ashes-convoy-r34-v1";
const HTML_CACHE = `${CACHE_VERSION}:html`;
const ASSET_CACHE = `${CACHE_VERSION}:assets`;
const ASSET_PATHS = [
  "assets/ui/start.png",
  "assets/vehicles/land.png",
  "assets/vehicles/air.png",
  "assets/vehicles/sea.png",
  "assets/vehicles/space.png",
  "assets/zombies/shambler.png",
  "assets/zombies/runner.png",
  "assets/zombies/bloater.png",
  "assets/zombies/titan.png",
  "assets/shelter/bunker.png",
  "assets/shelter/greenhouse.png",
  "assets/shelter/snow.png",
  "assets/shelter/workshop.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png"
];

function sameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (error) {
    return false;
  }
}

function isHtmlRequest(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

function isManagedAsset(request) {
  if (!sameOrigin(request)) return false;
  const pathname = new URL(request.url).pathname.replace(/^\/+/, "");
  return ASSET_PATHS.includes(pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) => {
      return cache.addAll(ASSET_PATHS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !sameOrigin(request)) return;
  if (isHtmlRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isManagedAsset(request)) {
    event.respondWith(cacheFirst(request));
  }
});
