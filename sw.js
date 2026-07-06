"use strict";

const CACHE_VERSION = "ashes-convoy-r38-v1";
const APP_CACHE = `${CACHE_VERSION}:app`;
const OFFLINE_URL = "offline.html";
const APP_SHELL_PATHS = [
  "./",
  "index.html",
  OFFLINE_URL,
  "manifest.webmanifest",
  "src/sprites.js",
  "src/sprite-renderer.js",
  "src/shelter-scene.js",
  "src/config.js",
  "src/rules.js",
  "src/game.js",
  "src/ui.js"
];
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
const CACHE_FIRST_PATHS = APP_SHELL_PATHS.concat(ASSET_PATHS);

function sameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (error) {
    return false;
  }
}

function pathKey(requestOrPath) {
  const url = typeof requestOrPath === "string" ? new URL(requestOrPath, self.location.href) : new URL(requestOrPath.url);
  const scopePath = new URL(self.registration.scope).pathname;
  let pathname = url.pathname;
  if (pathname.startsWith(scopePath)) pathname = pathname.slice(scopePath.length);
  return pathname.replace(/^\/+/, "") || "./";
}

function isHtmlRequest(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

function isCacheFirstRequest(request) {
  if (!sameOrigin(request)) return false;
  return CACHE_FIRST_PATHS.includes(pathKey(request));
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstHtml(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await cache.match("index.html");
    if (shell) return shell;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      return cache.addAll(CACHE_FIRST_PATHS);
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

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !sameOrigin(request)) return;
  if (isHtmlRequest(request)) {
    event.respondWith(networkFirstHtml(request));
    return;
  }
  if (isCacheFirstRequest(request)) {
    event.respondWith(cacheFirst(request));
  }
});
