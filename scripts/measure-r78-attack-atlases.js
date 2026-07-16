"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const threshold = 0.08;
const atlases = [
  ["shambler", "assets/enemies/oga_shambler_attack.png", 40, 40],
  ["runner", "assets/enemies/oga_runner_attack.png", 40, 40],
  ["bloater", "assets/enemies/bloater_attack.png", 52, 52],
  ["spore_spitter / ash_screamer", "assets/enemies/oga_spitter_attack.png", 40, 40],
  ["shield_husk / mirror_husk", "assets/enemies/shield_husk_attack.png", 48, 64],
  ["swarm_mite / ember_tick", "assets/enemies/swarm_mite_attack.png", 44, 44],
  ["tar_brute / chain_tether", "assets/enemies/tar_brute_attack.png", 56, 68],
  ["void_wraith", "assets/enemies/void_wraith_attack.png", 48, 64],
  ["boss_hive_titan", "assets/enemies/titan_attack.png", 88, 80],
  ["xi_gunner", "assets/vehicles/xi_gunner_attack.png", 256, 384]
];

function readAlpha(relativePath) {
  const png = fs.readFileSync(path.join(root, relativePath));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 4 ? 2 : 0;
  if (!bytesPerPixel) throw new Error(`${relativePath} must preserve alpha`);
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
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
      } else if (filter !== 0) {
        throw new Error(`${relativePath} uses unsupported PNG filter ${filter}`);
      }
      pixels[y * stride + x] = value & 0xff;
    }
    sourceOffset += stride;
  }
  const alpha = Buffer.alloc(width * height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = pixels[index * bytesPerPixel + bytesPerPixel - 1];
  return { width, height, alpha };
}

function measureAtlas(entry) {
  const [id, image, frameWidth, frameHeight] = entry;
  const png = readAlpha(image);
  const frames = png.width / frameWidth;
  if (frames !== 4 || png.height !== frameHeight) throw new Error(`${image} does not match its four-frame interface`);
  const pairs = [];
  for (let left = 0; left < frames; left += 1) {
    for (let right = left + 1; right < frames; right += 1) {
      let total = 0;
      for (let y = 0; y < frameHeight; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          total += Math.abs(
            png.alpha[y * png.width + left * frameWidth + x] -
            png.alpha[y * png.width + right * frameWidth + x]
          );
        }
      }
      pairs.push({ frames: [left, right], difference: total / (255 * frameWidth * frameHeight) });
    }
  }
  const minimumDifference = Math.min(...pairs.map((pair) => pair.difference));
  return {
    id,
    image,
    frameWidth,
    frameHeight,
    frames,
    phaseFrames: { anticipation: [0, 1], impact: 2, recovery: 3 },
    minimumDifference,
    pairs,
    pass: minimumDifference > threshold
  };
}

const results = atlases.map(measureAtlas);
const report = {
  release: "R78",
  metric: "normalized mean absolute alpha difference over each full runtime frame",
  threshold,
  results,
  minimumDifference: Math.min(...results.map((entry) => entry.minimumDifference)),
  pass: results.every((entry) => entry.pass)
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes("--write")) {
  const output = path.join(root, "docs", "evidence", "R78", "attack-alpha-metrics.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, json);
  console.log(`Wrote ${path.relative(root, output)} (${results.length} atlases, min ${report.minimumDifference.toFixed(3)})`);
} else {
  process.stdout.write(json);
}
if (!report.pass) process.exitCode = 1;
