"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
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

function readPngAlpha(relativePath) {
  const png = fs.readFileSync(path.join(root, relativePath));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  assert.strictEqual(bitDepth, 8, `${relativePath} must use 8-bit channels`);
  assert([4, 6].includes(colorType), `${relativePath} must use grayscale-alpha or RGBA pixels`);
  const bytesPerPixel = colorType === 6 ? 4 : 2;
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === "IEND") break;
  }
  const encoded = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = encoded[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = encoded[sourceOffset + x];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const upDistance = Math.abs(estimate - up);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        value += leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance
            ? up
            : upperLeft;
      } else {
        assert.strictEqual(filter, 0, `${relativePath} uses unsupported PNG filter ${filter}`);
      }
      pixels[y * stride + x] = value & 0xff;
    }
    sourceOffset += stride;
  }
  const alpha = Buffer.alloc(width * height);
  for (let index = 0; index < width * height; index += 1) {
    alpha[index] = pixels[index * bytesPerPixel + bytesPerPixel - 1];
  }
  return { width, height, alpha };
}

function minimumFrameAlphaDifference(relativePath, frameWidth, frameHeight, frames) {
  const png = readPngAlpha(relativePath);
  const differences = [];
  for (let left = 0; left < frames; left += 1) {
    for (let right = left + 1; right < frames; right += 1) {
      let total = 0;
      for (let y = 0; y < frameHeight; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          const leftIndex = y * png.width + left * frameWidth + x;
          const rightIndex = y * png.width + right * frameWidth + x;
          total += Math.abs(png.alpha[leftIndex] - png.alpha[rightIndex]);
        }
      }
      differences.push(total / (255 * frameWidth * frameHeight));
    }
  }
  return Math.min(...differences);
}

function selectedFrameAlphaDifference(relativePath, frameWidth, frameHeight, left, right) {
  const png = readPngAlpha(relativePath);
  let total = 0;
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const leftIndex = y * png.width + left * frameWidth + x;
      const rightIndex = y * png.width + right * frameWidth + x;
      total += Math.abs(png.alpha[leftIndex] - png.alpha[rightIndex]);
    }
  }
  return total / (255 * frameWidth * frameHeight);
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
  const lowPairDifference = selectedFrameAlphaDifference(animation.image, animation.frameWidth, animation.frameHeight, 0, 2);
  assert(lowPairDifference > 0.08, `${enemyId} low-quality walk frames 0/2 must visibly differ, got ${lowPairDifference.toFixed(3)}`);
  assert(SPRITES[enemy.sprite], `${enemyId} must keep a code-sprite fallback`);
  assert(swSource.includes(`"${animation.image}"`), `${animation.image} must be in the offline app cache`);
  assert(enemy.spriteActions, `${enemyId} must define raster hurt/death action atlases`);
  Object.entries(enemy.spriteActions).forEach(([actionName, action]) => {
    assert.strictEqual(action.frameWidth, animation.frameWidth, `${enemyId} ${actionName} must match walk frame width`);
    assert.strictEqual(action.frameHeight, animation.frameHeight, `${enemyId} ${actionName} must match walk frame height`);
    assert.strictEqual(action.frames, actionName === "hurt" ? 2 : 3, `${enemyId} ${actionName} frame count mismatch`);
    assert(action.fps > 0 && action.fps <= 12, `${enemyId} ${actionName} cadence must stay lightweight`);
    const actionPng = readPngHeader(action.image);
    assert.strictEqual(actionPng.width, action.frameWidth * action.frames, `${enemyId} ${actionName} sheet width mismatch`);
    assert.strictEqual(actionPng.height, action.frameHeight, `${enemyId} ${actionName} sheet height mismatch`);
    assert(swSource.includes(`"${action.image}"`), `${action.image} must be in the offline app cache`);
    const minimumDifference = minimumFrameAlphaDifference(action.image, action.frameWidth, action.frameHeight, action.frames);
    assert(minimumDifference > 0.08, `${enemyId} ${actionName} any-frame alpha difference must exceed 0.08, got ${minimumDifference.toFixed(3)}`);
  });
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

const regeneratedR72 = {
  tar_brute: { width: 190, height: 190, walk: "assets/enemies/tar_brute_walk.png", minBytes: 20000 },
  shield_husk: { width: 160, height: 240, walk: "assets/enemies/shield_husk_walk.png", minBytes: 20000 },
  swarm_mite: { width: 140, height: 170, walk: "assets/enemies/swarm_mite_walk.png", minBytes: 9000 }
};
Object.entries(regeneratedR72).forEach(([enemyId, expected]) => {
  const enemy = config.ENEMIES[enemyId];
  const png = readPngHeader(enemy.spriteImage);
  const bytes = fs.statSync(path.join(root, enemy.spriteImage)).size;
  assert.deepStrictEqual({ width: png.width, height: png.height }, { width: expected.width, height: expected.height }, `${enemyId} must preserve its R72 static sprite interface`);
  assert(bytes >= expected.minBytes, `${enemyId} R72 sprite appears stale or over-compressed: ${bytes} bytes`);
  assert.strictEqual(enemy.spriteAnimation.image, expected.walk, `${enemyId} must use its R72 true-pose atlas`);
  assert.strictEqual(enemy.spriteAnimation.frames, 4, `${enemyId} must preserve the four-frame R72 animation pipe`);
  assert(!enemy.spriteAnimation.armored, `${enemyId} must not fall back to the Kenney tank silhouette`);
});
assert.strictEqual(config.ENEMIES.chain_tether.spriteAnimation.image, "assets/enemies/tar_brute_walk.png", "chain tether must inherit the humanoid brute atlas instead of the Kenney tank");
assert(config.ROAD_DETAIL_ATLAS && config.ROAD_DETAIL_ATLAS.density <= 0.25, "road debris density must remain decorative and sparse");
const roadPng = readPngHeader(config.ROAD_DETAIL_ATLAS.image);
assert.strictEqual(roadPng.width, config.ROAD_DETAIL_ATLAS.frames * config.ROAD_DETAIL_ATLAS.frameWidth, "road debris atlas width mismatch");
assert.strictEqual(roadPng.height, config.ROAD_DETAIL_ATLAS.frameHeight, "road debris atlas height mismatch");
assert(swSource.includes(`"${config.ROAD_DETAIL_ATLAS.image}"`), "road debris atlas must be available offline");
assert(shippedBytes < 1.5 * 1024 * 1024, `R71 derived asset budget exceeded: ${shippedBytes} bytes`);

assert(gameSource.includes("buildEnemyAnimationTint") && gameSource.includes("record.tintCanvas"), "enemy tint must be pre-rendered and shared");
assert(gameSource.includes('performanceState.quality === "low"') && gameSource.includes('tier: low ? "low-two"'), "low quality must alternate two authored walk frames");
assert(gameSource.includes('tier: low ? "low-two" : reduced ? "reduced" : "full"'), "low, reduced and full animation tiers must be explicit");
assert(gameSource.includes("Math.hypot(enemy.vx || 0, enemy.vy || 0) > 1"), "walk frames must only advance while moving");
assert(gameSource.includes("const faceLeft = (enemy.vx || 0) < -0.5"), "enemy animation must flip with lateral movement");
assert(gameSource.includes("buildEnemyActionTint") && gameSource.includes('tier: "hurt"'), "hurt reactions must use pre-tinted raster action frames");
assert(!gameSource.includes('drawSprite(enemy.sprite, "hit"'), "raster hurt may not switch to the code-sprite art style");
const enemyEntitySource = gameSource.slice(gameSource.indexOf("function drawEnemyEntity"), gameSource.indexOf("function drawEnemyCorpse"));
assert(!/ctx\.(?:rotate|scale)\(/.test(enemyEntitySource), "enemy raster locomotion may not fake poses with rotate/scale transforms");
assert(!/\b(?:lift|wobble|squashX|squashY)\b/.test(enemyEntitySource), "enemy raster locomotion may not fake poses with bob/squash variables");
const enemyCorpseSource = gameSource.slice(gameSource.indexOf("function drawEnemyCorpse"), gameSource.indexOf("function drawHazard"));
assert(enemyCorpseSource.includes("spriteActions.death") && enemyCorpseSource.includes("ctx.drawImage"), "enemy corpses must draw their raster death atlas");
assert(!enemyCorpseSource.includes("drawSprite(") && !enemyCorpseSource.includes("effect.sprite"), "drawEnemyCorpse may not reference the code-sprite path");
assert(gameSource.includes("drawRoadDebrisAtlas") && gameSource.includes("roadDebrisDrawn"), "road debris must expose render diagnostics");
assert(credits.includes("R73 image-generated action atlases") && credits.includes("Top-down Tanks Remastered"), "R73 image-gen and CC0 support provenance must be documented");

console.log(`Animation asset guards PASS (${shipped.size} files, ${shippedBytes} bytes)`);
