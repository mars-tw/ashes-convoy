"use strict";

importScripts("src/version.js");

const CACHE_VERSION = self.DSVersion.CACHE_VERSION;
const APP_CACHE = `${CACHE_VERSION}:app`;
const OFFLINE_URL = "offline.html";
const APP_SHELL_PATHS = [
  "./",
  "index.html",
  "offline.html",
  "manifest.webmanifest?v=R76",
  "src/version.js?v=R76",
  "src/sprites.js?v=R76",
  "src/sprite-renderer.js?v=R76",
  "src/shelter-scene.js?v=R76",
  "src/config.js?v=R76",
  "src/rules.js?v=R76",
  "src/fx.js?v=R76",
  "src/audio.js?v=R76",
  "src/game.js?v=R76",
  "src/ui.js?v=R76"
];
const ASSET_PATHS = [
  "assets/ui/start.png",
  "assets/env/land.png",
  "assets/env/air.png",
  "assets/env/sea.png",
  "assets/env/space.png",
  "assets/vehicles/land.png",
  "assets/vehicles/air.png",
  "assets/vehicles/sea.png",
  "assets/vehicles/space.png",
  "assets/vehicles/trailer.png",
  "assets/vehicles/xi_gunner.png",
  "assets/zombies/shambler.png",
  "assets/zombies/runner.png",
  "assets/zombies/bloater.png",
  "assets/zombies/spore_spitter.png",
  "assets/zombies/shield_husk.png",
  "assets/zombies/swarm_mite.png",
  "assets/zombies/tar_brute.png",
  "assets/zombies/void_wraith.png",
  "assets/zombies/titan.png",
  "assets/enemies/oga_shambler_walk.png",
  "assets/enemies/oga_runner_walk.png",
  "assets/enemies/oga_spitter_walk.png",
  "assets/enemies/bloater_walk.png",
  "assets/enemies/shield_husk_walk.png",
  "assets/enemies/swarm_mite_walk.png",
  "assets/enemies/tar_brute_walk.png",
  "assets/enemies/void_wraith_walk.png",
  "assets/enemies/titan_walk.png",
  "assets/enemies/oga_shambler_hurt.png",
  "assets/enemies/oga_shambler_death.png",
  "assets/enemies/oga_runner_hurt.png",
  "assets/enemies/oga_runner_death.png",
  "assets/enemies/bloater_hurt.png",
  "assets/enemies/bloater_death.png",
  "assets/enemies/oga_spitter_hurt.png",
  "assets/enemies/oga_spitter_death.png",
  "assets/enemies/shield_husk_hurt.png",
  "assets/enemies/shield_husk_death.png",
  "assets/enemies/swarm_mite_hurt.png",
  "assets/enemies/swarm_mite_death.png",
  "assets/enemies/tar_brute_hurt.png",
  "assets/enemies/tar_brute_death.png",
  "assets/enemies/void_wraith_hurt.png",
  "assets/enemies/void_wraith_death.png",
  "assets/enemies/titan_hurt.png",
  "assets/enemies/titan_death.png",
  "assets/env/kenney_road_debris.png",
  "assets/fx/kenney_smoke.png",
  "assets/fx/kenney_fire.png",
  "assets/fx/kenney_debris.png",
  "assets/fx/kenney_flash.png",
  "assets/shelter/bunker.png",
  "assets/shelter/greenhouse.png",
  "assets/shelter/snow.png",
  "assets/shelter/workshop.png",
  "assets/shelter/trailer/base_escape_pod.png",
  "assets/shelter/trailer/supply_shelf.png",
  "assets/shelter/trailer/solar_radio.png",
  "assets/shelter/trailer/patched_lights.png",
  "assets/shelter/trailer/hydro_planter.png",
  "assets/shelter/trailer/water_filter.png",
  "assets/shelter/trailer/folding_workbench.png",
  "assets/shelter/trailer/blueprint_board.png",
  "assets/shelter/trailer/battery_bank.png",
  "assets/shelter/trailer/field_medkit.png",
  "assets/shelter/trailer/mycelium_rack.png",
  "assets/shelter/trailer/reload_bench.png",
  "assets/shelter/trailer/welding_kit.png",
  "assets/shelter/trailer/crayon_drawing.png",
  "assets/shelter/trailer/star_telescope.png",
  "assets/shelter/trailer/photo_frame.png",
  "assets/story/xi.png",
  "assets/story/xi.png?v=R76",
  "assets/shelter/trailer/crayon_drawing.png?v=R76",
  "assets/shelter/trailer/star_telescope.png?v=R76",
  "assets/shelter/trailer/photo_frame.png?v=R76",
  "assets/icons/icon-192.png?v=R76",
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
  const key = pathname.replace(/^\/+/, "") || "./";
  return url.search ? `${key}${url.search}` : key;
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
  const cached = await cache.match(request);
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
