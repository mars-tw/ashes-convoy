"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const config = require("../src/config.js");
const { SPRITES } = require("../src/sprites.js");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "src/game.js"), "utf8");
const swSource = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const credits = fs.readFileSync(path.join(root, "CREDITS.md"), "utf8");
const shipped = new Set();
let shippedBytes = 0;

function readPngHeader(relativePath) {
  const absolute = path.join(root, relativePath);
  assert(fs.existsSync(absolute), `missing animation asset: ${relativePath}`);
  const png = fs.readFileSync(absolute);
  assert.strictEqual(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${relativePath} must be PNG`);
  assert([4, 6].includes(png[25]), `${relativePath} must preserve an alpha channel`);
  if (!shipped.has(relativePath)) {
    shipped.add(relativePath);
    shippedBytes += png.length;
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

Object.entries(config.ENEMIES).forEach(([enemyId, enemy]) => {
  const animation = enemy.spriteAnimation;
  assert(animation, `${enemyId} must define a raster walk animation`);
  assert(animation.frames >= 2 && animation.frames <= 4, `${enemyId} must use 2-4 walk frames`);
  assert(animation.fps > 0 && animation.fps <= 12, `${enemyId} animation cadence must stay lightweight`);
  assert(animation.warmTint && animation.warmTint.startsWith("rgba("), `${enemyId} must define a wasteland warm tint`);
  const png = readPngHeader(animation.image);
  assert.strictEqual(png.width, animation.frameWidth * animation.frames, `${enemyId} sheet width must match frame contract`);
  assert.strictEqual(png.height, animation.frameHeight, `${enemyId} sheet height must match frame contract`);
  assert(SPRITES[enemy.sprite], `${enemyId} must keep a code-sprite fallback`);
  assert(swSource.includes(`"${animation.image}"`), `${animation.image} must be in the offline app cache`);
});

const regeneratedR71 = {
  shambler: { width: 160, height: 249, minBytes: 30000 },
  runner: { width: 160, height: 242, minBytes: 30000 },
  spore_spitter: { width: 160, height: 240, minBytes: 30000 },
  boss_hive_titan: { width: 256, height: 234, minBytes: 80000 }
};
Object.entries(regeneratedR71).forEach(([enemyId, expected]) => {
  const enemy = config.ENEMIES[enemyId];
  const png = readPngHeader(enemy.spriteImage);
  const bytes = fs.statSync(path.join(root, enemy.spriteImage)).size;
  assert.deepStrictEqual({ width: png.width, height: png.height }, { width: expected.width, height: expected.height }, `${enemyId} must preserve its R71 static sprite interface`);
  assert(bytes >= expected.minBytes, `${enemyId} high-detail sprite appears over-compressed or stale: ${bytes} bytes`);
  assert.strictEqual(enemy.spriteAnimation.frames, 4, `${enemyId} must preserve the four-frame R71 animation pipe`);
});

assert(config.ENEMIES.tar_brute.spriteAnimation.armored, "tar brute must use the layered Kenney armored visual");
assert(config.ENEMIES.chain_tether.spriteAnimation.armored, "chain tether must use the layered Kenney armored visual");
assert(config.ROAD_DETAIL_ATLAS && config.ROAD_DETAIL_ATLAS.density <= 0.25, "road debris density must remain decorative and sparse");
const roadPng = readPngHeader(config.ROAD_DETAIL_ATLAS.image);
assert.strictEqual(roadPng.width, config.ROAD_DETAIL_ATLAS.frames * config.ROAD_DETAIL_ATLAS.frameWidth, "road debris atlas width mismatch");
assert.strictEqual(roadPng.height, config.ROAD_DETAIL_ATLAS.frameHeight, "road debris atlas height mismatch");
assert(swSource.includes(`"${config.ROAD_DETAIL_ATLAS.image}"`), "road debris atlas must be available offline");
assert(shippedBytes < 1.5 * 1024 * 1024, `R71 derived asset budget exceeded: ${shippedBytes} bytes`);

assert(gameSource.includes("buildEnemyAnimationTint") && gameSource.includes("record.tintCanvas"), "enemy tint must be pre-rendered and shared");
assert(gameSource.includes('performanceState.quality === "low"') && gameSource.includes('tier: "single"'), "low quality must use a single animation frame");
assert(gameSource.includes('tier: reduced ? "reduced" : "full"'), "reduced and full animation tiers must be explicit");
assert(gameSource.includes("Math.hypot(enemy.vx || 0, enemy.vy || 0) > 1"), "walk frames must only advance while moving");
assert(gameSource.includes("const faceLeft = (enemy.vx || 0) < -0.5"), "enemy animation must flip with lateral movement");
assert(gameSource.includes("drawRoadDebrisAtlas") && gameSource.includes("roadDebrisDrawn"), "road debris must expose render diagnostics");
assert(credits.includes("R71 image-generated production art") && credits.includes("Top-down Tanks Remastered"), "R71 image-gen and CC0 support provenance must be documented");

console.log(`Animation asset guards PASS (${shipped.size} files, ${shippedBytes} bytes)`);
