"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const version = require("../src/version.js");
const config = require("../src/config.js");
const packageJson = require("../package.json");
const { TRAILER_ROOM_ASSETS } = require("../src/shelter-scene.js");

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function listFiles(relativeDir, ext) {
  return fs
    .readdirSync(path.join(rootDir, relativeDir))
    .filter((file) => file.endsWith(ext))
    .map((file) => `${relativeDir}/${file}`.replace(/\\/g, "/"));
}

function parseSwArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  assert(match, `service worker should define ${name}`);
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
}

function localResource(value, options) {
  if (!value || value.startsWith("#") || value.startsWith("data:") || value.startsWith("mailto:")) return null;
  if (/^[a-z]+:\/\//i.test(value)) return null;
  const normalized = value.replace(/^\.\//, "");
  return options && options.keepSearch ? normalized.split("#")[0] : normalized.split(/[?#]/)[0] || null;
}

function indexLocalResources(indexHtml) {
  const resources = new Set();
  for (const match of indexHtml.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) {
    const resource = localResource(match[1], { keepSearch: true });
    if (resource) resources.add(resource);
  }
  return resources;
}

function fileExists(cachePath) {
  const cleanPath = cachePath.split(/[?#]/)[0];
  if (cleanPath === "./") return fs.existsSync(path.join(rootDir, "index.html"));
  return fs.existsSync(path.join(rootDir, cleanPath));
}

const swText = readText("sw.js");
const indexHtml = readText("index.html");
const manifest = JSON.parse(readText("manifest.webmanifest"));
const appShell = parseSwArray(swText, "APP_SHELL_PATHS");
const assets = parseSwArray(swText, "ASSET_PATHS");
const cached = new Set([...appShell, ...assets]);

const indexResources = indexLocalResources(indexHtml);
indexResources.forEach((resource) => {
  const url = new URL(resource, "https://example.test/");
  const token = url.searchParams.get("v");
  assert(
    token === version.APP_VERSION || /^[0-9a-f]{8}$/.test(token || ""),
    `${resource} should use ?v=${version.APP_VERSION} or a content-hash prefix`
  );
});

const expectedCached = new Set(["./", "index.html", "offline.html"]);
indexResources.forEach((resource) => expectedCached.add(resource));
manifest.icons.forEach((icon) => expectedCached.add(icon.src));
listFiles("src", ".js").forEach((resource) => {
  assert(indexResources.has(`${resource}?v=${version.APP_VERSION}`), `index.html should version ${resource}`);
});
expectedCached.add(config.START_SCREEN.image);
if (config.START_SCREEN.atmosphere) expectedCached.add(config.START_SCREEN.atmosphere);
if (config.START_SCREEN.manifest) expectedCached.add(config.START_SCREEN.manifest);
listFiles("assets/env", ".png").forEach((resource) => expectedCached.add(resource));
Object.values(config.VEHICLES).forEach((vehicle) => expectedCached.add(vehicle.spriteImage));
Object.values((config.RUN_TRAILER && config.RUN_TRAILER.byEnvironment) || {}).forEach((trailer) => {
  if (trailer.spriteImage) expectedCached.add(trailer.spriteImage);
});
Object.values(config.ENEMIES).forEach((enemy) => {
  if (enemy.spriteImage) expectedCached.add(enemy.spriteImage);
});
Object.values((config.FX && config.FX.textures) || {}).forEach((resource) => expectedCached.add(resource));
["assets/shelter/bunker.png", "assets/shelter/greenhouse.png", "assets/shelter/snow.png", "assets/shelter/workshop.png"].forEach((resource) => expectedCached.add(resource));
listFiles("assets/shelter/trailer", ".png")
  .filter((resource) => !resource.includes("base_escape_pod"))
  .forEach((resource) => expectedCached.add(resource));
Object.values(TRAILER_ROOM_ASSETS.baseQuality).forEach((resource) => expectedCached.add(resource));
expectedCached.add("assets/shelter/trailer/room-art-manifest.json");
expectedCached.add("assets/story/xi.png");
["assets/icons/icon-192.png", "assets/icons/icon-512.png"].forEach((resource) => expectedCached.add(resource));

expectedCached.forEach((resource) => {
  assert(cached.has(resource), `service worker cache list is missing ${resource}`);
});

[...cached].forEach((resource) => {
  assert(fileExists(resource), `service worker cache entry does not exist: ${resource}`);
});

assert.strictEqual(version.APP_VERSION, "R85");
assert.strictEqual(version.CACHE_VERSION, `ashes-convoy-${version.APP_VERSION.toLowerCase()}-v1`);
const appVersionSegments = version.APP_VERSION.slice(1).split(".");
assert.strictEqual(packageJson.version, `0.${appVersionSegments[0]}.${appVersionSegments[1] || "0"}`, "package version should match APP_VERSION");
assert.strictEqual(config.APP_VERSION, version.APP_VERSION, "config APP_VERSION should use src/version.js");
assert.strictEqual(config.CACHE_VERSION, version.CACHE_VERSION, "config CACHE_VERSION should use src/version.js");
assert(swText.includes('importScripts("src/version.js")'), "service worker should import the shared version source");
assert(swText.includes("DSVersion.CACHE_VERSION"), "service worker cache version should derive from DSVersion");
assert(swText.includes("self.skipWaiting()"), "service worker should skip waiting during install");
assert(swText.includes("self.clients.claim()"), "service worker should claim clients during activate");
assert(swText.includes("cache.match(request);"), "service worker cache-first requests should preserve URL query versions");
assert(!/ashes-convoy-r\d+-v\d+/i.test(swText), "service worker should not hard-code release cache versions");
const uiText = readText("src/ui.js");
const gameText = readText("src/game.js");
assert(uiText.includes("config.APP_VERSION"), "settings version text should render config.APP_VERSION");
assert(gameText.includes("state.vehicle.followX = state.vehicle.aimX"), "touch aiming must keep vehicle movement synchronized");
assert(gameText.includes('pointerType === "touch"') && gameText.includes("point.y - touchOffsetY"), "touch aiming must keep the reticle above the finger");
assert(gameText.includes('performanceState.quality !== "low"'), "low quality must skip per-enemy canvas filters");
assert(indexHtml.includes('id="reducedFlashToggle"'), "settings must expose the existing reducedFlash flag");
assert(indexHtml.includes("safe-area-inset-left") && indexHtml.includes("safe-area-inset-right"), "mobile shell must respect horizontal safe areas");
assert(uiText.includes("controllerchange"), "page should listen for service worker controller changes");
assert(uiText.includes("SW_AUTO_RELOAD_WINDOW_MS") && uiText.includes("15000"), "page should gate service worker auto reload to 15 seconds");
assert(uiText.includes("SW_AUTO_RELOAD_SESSION_KEY") && uiText.includes("sessionStorage"), "page should guard service worker auto reload by session");
assert(uiText.includes("root.location.reload()"), "page should auto reload after a fresh service worker takes control");
assert(indexHtml.includes("ashes_convoy_html_boot_reload_R85"), "HTML boot guard should cover pre-JS service worker skew");

const userVisibleFiles = ["index.html", ...listFiles("src", ".js")];
const mojibakePatterns = [
  /\uFFFD/,
  /(?:Ã|Â|â€|â€™|â€œ|â€�|ï¿½)/,
  /[\uE000-\uF8FF]/
];
userVisibleFiles.forEach((file) => {
  const source = readText(file);
  mojibakePatterns.forEach((pattern) => {
    assert(!pattern.test(source), `${file} contains suspected mojibake: ${pattern}`);
  });
});

const sentinels = {
  "index.html": ["\u7070\u71fc\u8b77\u822a", "\u51fa\u52e4", "\u8a2d\u5b9a", "\u6aa2\u67e5\u66f4\u65b0"],
  "src/config.js": ["\u7070\u71fc\u8b77\u822a"],
  "src/ui.js": ["\u7070\u71fc\u8b77\u822a", "\u8a2d\u5b9a", "\u54c1\u8cea", "\u7a69\u5b9a", "\u6aa2\u67e5"]
};
Object.entries(sentinels).forEach(([file, required]) => {
  const source = readText(file);
  required.forEach((text) => {
    assert(source.includes(text), `${file} is missing readable Traditional Chinese sentinel: ${text}`);
  });
});

console.log("Automation guard tests PASS");
