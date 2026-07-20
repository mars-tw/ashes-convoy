"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative));
const readText = (relative) => read(relative).toString("utf8");
const readJson = (relative) => JSON.parse(readText(relative));
const sha256 = (relative) => crypto.createHash("sha256").update(read(relative)).digest("hex");
const pngInfo = (relative) => {
  const buffer = read(relative);
  assert.strictEqual(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${relative} must be a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bitDepth: buffer[24], colorType: buffer[25] };
};

const version = require("../src/version.js");
const shelter = require("../src/shelter-scene.js");
const room = readJson("assets/shelter/trailer/room-art-manifest.json");
const promos = readJson("docs/promo/manifest.json");
const c2pa = readJson("docs/evidence/R80/c2pa-validation.json");
const sw = readText("sw.js");
const ui = readText("src/ui.js");

assert.strictEqual(version.APP_VERSION, "R83");
assert.strictEqual(version.CACHE_VERSION, "ashes-convoy-r83-v1");
assert.strictEqual(room.release, "R80");
assert.strictEqual(room.model_slug, "gpt-image-2");
assert.strictEqual(room.master.c2pa.softwareAgent, "gpt-image 2.0");
assert.strictEqual(sha256(room.master.path), room.master.sha256, "room master SHA-256 must match manifest");
assert.strictEqual(c2pa.pass, true);
assert.strictEqual(c2pa.results.length, 5, "R80 must retain five C2PA masters");
c2pa.results.forEach((entry) => {
  assert.strictEqual(entry.pass, true, `${entry.path} C2PA must pass`);
  assert.strictEqual(entry.softwareAgent.name, "gpt-image");
  assert(/^2\./.test(entry.softwareAgent.version), `${entry.path} must use gpt-image 2.x`);
});

const expectedRoomDimensions = { high: [780, 900], medium: [650, 750], low: [520, 600] };
room.artifacts.forEach((artifact) => {
  const info = pngInfo(artifact.path);
  assert.deepStrictEqual([info.width, info.height], expectedRoomDimensions[artifact.quality]);
  assert.strictEqual(info.bitDepth, 8);
  assert.strictEqual(info.colorType, 2, `${artifact.path} must be intentionally opaque RGB`);
  assert.strictEqual(sha256(artifact.path), artifact.runtime_sha256);
  assert.strictEqual(artifact.master_sha256, room.master.sha256);
  assert.strictEqual(artifact.runtime_url, `${artifact.path}?v=${artifact.runtime_sha256.slice(0, 8)}`);
  assert.strictEqual(shelter.TRAILER_ROOM_ASSETS.baseQuality[artifact.quality], artifact.runtime_url);
  assert(sw.includes(`"${artifact.runtime_url}"`), `${artifact.runtime_url} must be in the offline cache`);
});
assert(ui.includes("quality: meta.settings && meta.settings.performanceMode"), "room quality must follow the saved performance mode");
assert(readText("src/shelter-scene.js").includes("contentRect.w / 780"), "room anchors must remain in the 780px coordinate space");
assert(!Object.prototype.hasOwnProperty.call(shelter.TRAILER_ROOM_ASSETS, "character"), "room must not layer a duplicate Xi");

assert.strictEqual(promos.release, "R80");
assert.strictEqual(promos.model_slug, "gpt-image-2");
assert.strictEqual(promos.runtime, false);
assert.strictEqual(promos.artifacts.length, 4);
const runtimeText = ["index.html", "sw.js", "manifest.webmanifest", ...fs.readdirSync(path.join(root, "src")).filter((file) => file.endsWith(".js")).map((file) => `src/${file}`)]
  .map(readText)
  .join("\n");
promos.artifacts.forEach((artifact) => {
  assert.strictEqual(sha256(artifact.master), artifact.master_sha256);
  assert.strictEqual(sha256(artifact.path), artifact.sha256);
  const info = pngInfo(artifact.path);
  assert.deepStrictEqual([info.width, info.height], [2048, 1152]);
  assert.strictEqual(info.colorType, 2, `${artifact.path} must be opaque RGB`);
  assert(!runtimeText.includes(path.basename(artifact.path)), `${artifact.path} must stay out of runtime references`);
});

const decodedDesktop = 2048 * 1152 * 4 + 192 * 405 * 4 + 780 * 900 * 4;
const decodedMobile = 1024 * 576 * 4 + 192 * 405 * 4 + 520 * 600 * 4;
assert(decodedDesktop <= 64 * 1024 * 1024, "desktop decoded Wave 2 textures must stay <=64 MiB");
assert(decodedMobile <= 32 * 1024 * 1024, "mobile decoded Wave 2 textures must stay <=32 MiB");

console.log(`R80 art governance PASS (C2PA ${c2pa.results.length}/5, desktop ${(decodedDesktop / 1048576).toFixed(2)}MiB, mobile ${(decodedMobile / 1048576).toFixed(2)}MiB)`);
