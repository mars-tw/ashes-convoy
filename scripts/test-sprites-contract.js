"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { PALETTES, SPRITES, SPRITE_SPECS } = require("../src/sprites.js");
const { SHELTER_HOTSPOTS } = require("../src/shelter-scene.js");

const rootDir = path.resolve(__dirname, "..");
const errors = [];

function fail(message) {
  errors.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

function readPng(relativePath) {
  const buffer = fs.readFileSync(path.join(rootDir, relativePath));
  const signature = buffer.subarray(0, 8).toString("hex");
  check(signature === "89504e470d0a1a0a", `${relativePath} must be a PNG file`);
  let offset = 8;
  const idat = [];
  const png = { relativePath, width: 0, height: 0, bitDepth: 0, colorType: 0, idat };
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      png.width = data.readUInt32BE(0);
      png.height = data.readUInt32BE(4);
      png.bitDepth = data[8];
      png.colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  check(png.width > 0 && png.height > 0, `${relativePath} must have a valid IHDR`);
  check(idat.length > 0, `${relativePath} must contain IDAT data`);
  return png;
}

function pngBytesPerPixel(png) {
  if (png.bitDepth !== 8) return 0;
  if (png.colorType === 2) return 3;
  if (png.colorType === 6) return 4;
  return 0;
}

function inflatePngRows(png) {
  const bpp = pngBytesPerPixel(png);
  check(bpp > 0, `${png.relativePath} must be 8-bit RGB/RGBA PNG`);
  const stride = png.width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(png.idat));
  const out = Buffer.alloc(png.height * stride);
  let src = 0;
  for (let y = 0; y < png.height; y += 1) {
    const filter = raw[src];
    src += 1;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      else check(filter === 0, `${png.relativePath} uses unsupported PNG filter ${filter}`);
      out[y * stride + x] = (raw[src] + predictor) & 255;
      src += 1;
    }
  }
  return out;
}

function checkPngContract(asset) {
  const png = readPng(asset.path);
  check(png.width === asset.width && png.height === asset.height, `${asset.path} must be ${asset.width}x${asset.height}, got ${png.width}x${png.height}`);
  if (!asset.alphaBinary) return;
  check(png.colorType === 6, `${asset.path} must be RGBA for transparent sprite rendering`);
  const rows = inflatePngRows(png);
  let transparent = 0;
  let opaque = 0;
  let invalid = 0;
  for (let i = 3; i < rows.length; i += 4) {
    if (rows[i] === 0) transparent += 1;
    else if (rows[i] === 255) opaque += 1;
    else invalid += 1;
  }
  check(invalid === 0, `${asset.path} alpha must be binary 0/255, got ${invalid} antialiased pixels`);
  check(transparent > 0 && opaque > 0, `${asset.path} should contain both transparent padding and opaque subject pixels`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function frameSignature(rows) {
  return rows.join("\n");
}

function checkPalette(name, palette) {
  check(isObject(palette), `palette ${name} must be an object`);
  check(Object.prototype.hasOwnProperty.call(palette, "."), `palette ${name} must define transparent "."`);
  check(palette["."] === null, `palette ${name} "." must be null`);
  Object.entries(palette).forEach(([key, value]) => {
    check(key.length === 1, `palette ${name} key "${key}" must be one character`);
    check(value === null || /^#[0-9a-fA-F]{6}$/.test(value), `palette ${name}.${key} must be null or 6-digit hex`);
  });
}

function checkBounds(spriteName, sprite) {
  const { pivot, hitbox, w, h } = sprite;
  check(isObject(pivot), `${spriteName} pivot must be an object`);
  check(Number.isFinite(pivot.x) && Number.isFinite(pivot.y), `${spriteName} pivot must contain finite x/y`);
  check(pivot.x >= 0 && pivot.x <= w && pivot.y >= 0 && pivot.y <= h, `${spriteName} pivot must be inside ${w}x${h}`);

  check(isObject(hitbox), `${spriteName} hitbox must be an object`);
  ["x", "y", "w", "h"].forEach((key) => check(Number.isFinite(hitbox[key]), `${spriteName} hitbox.${key} must be finite`));
  check(hitbox.w > 0 && hitbox.h > 0, `${spriteName} hitbox must have positive size`);
  check(hitbox.x >= 0 && hitbox.y >= 0, `${spriteName} hitbox must start inside sprite`);
  check(hitbox.x + hitbox.w <= w && hitbox.y + hitbox.h <= h, `${spriteName} hitbox must fit inside ${w}x${h}`);
}

function checkFrameMatrix(spriteName, frameName, rows, sprite, palette) {
  check(/^[a-z]+_[0-9]+$/.test(frameName), `${spriteName}.${frameName} must use state_index naming`);
  check(Array.isArray(rows), `${spriteName}.${frameName} must be an array of strings`);
  check(rows.length === sprite.h, `${spriteName}.${frameName} must have ${sprite.h} rows, got ${rows.length}`);

  rows.forEach((row, y) => {
    check(typeof row === "string", `${spriteName}.${frameName}[${y}] must be a string`);
    check(row.length === sprite.w, `${spriteName}.${frameName}[${y}] must be ${sprite.w} chars, got ${row.length}`);
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      check(Object.prototype.hasOwnProperty.call(palette, ch), `${spriteName}.${frameName}[${y}][${x}] uses palette key "${ch}" not in ${sprite.palette}`);
    }
  });
}

function checkAnimations(spriteName, sprite, spec) {
  check(isObject(sprite.anims), `${spriteName} anims must be an object`);
  Object.entries(spec.anims).forEach(([animName, expectedCount]) => {
    const anim = sprite.anims[animName];
    check(isObject(anim), `${spriteName} missing required animation "${animName}"`);
    if (!anim) return;
    check(Array.isArray(anim.frames), `${spriteName}.${animName} frames must be an array`);
    check(anim.frames.length === expectedCount, `${spriteName}.${animName} must have ${expectedCount} frames, got ${anim.frames.length}`);
    check(Number.isFinite(anim.fps) && anim.fps > 0, `${spriteName}.${animName} fps must be positive`);
    check(typeof anim.loop === "boolean", `${spriteName}.${animName} loop must be boolean`);

    const signatures = [];
    anim.frames.forEach((frameName) => {
      check(Object.prototype.hasOwnProperty.call(sprite.frames, frameName), `${spriteName}.${animName} references missing frame "${frameName}"`);
      if (sprite.frames[frameName]) signatures.push(frameSignature(sprite.frames[frameName]));
    });
    if (anim.frames.length > 1) {
      check(new Set(signatures).size === anim.frames.length, `${spriteName}.${animName} multi-frame animation must have unique frames`);
    }
  });

  Object.keys(sprite.anims).forEach((animName) => {
    check(Object.prototype.hasOwnProperty.call(spec.anims, animName), `${spriteName} has non-contract animation "${animName}"`);
  });
}

Object.entries(PALETTES).forEach(([name, palette]) => checkPalette(name, palette));

["sortie", "upgrades", "vehicle", "series"].forEach((name) => {
  const hotspot = SHELTER_HOTSPOTS[name];
  check(isObject(hotspot), `SHELTER_HOTSPOTS must include ${name}`);
  if (!hotspot) return;
  ["x", "y", "w", "h"].forEach((key) => check(Number.isFinite(hotspot[key]), `SHELTER_HOTSPOTS.${name}.${key} must be finite`));
  check(hotspot.x >= 0 && hotspot.x <= 1, `SHELTER_HOTSPOTS.${name}.x must be 0..1`);
  check(hotspot.y >= 0 && hotspot.y <= 1, `SHELTER_HOTSPOTS.${name}.y must be 0..1`);
  check(hotspot.w > 0 && hotspot.w <= 1, `SHELTER_HOTSPOTS.${name}.w must be 0..1`);
  check(hotspot.h > 0 && hotspot.h <= 1, `SHELTER_HOTSPOTS.${name}.h must be 0..1`);
  check(hotspot.x + hotspot.w <= 1, `SHELTER_HOTSPOTS.${name} must fit horizontally`);
  check(hotspot.y + hotspot.h <= 1, `SHELTER_HOTSPOTS.${name} must fit vertically`);
});

const requiredStage1 = Object.entries(SPRITE_SPECS)
  .filter(([, spec]) => spec.stage === 1)
  .map(([name]) => name);

const requiredStage3 = Object.entries(SPRITE_SPECS)
  .filter(([, spec]) => spec.stage === 3)
  .map(([name]) => name);

requiredStage1.forEach((name) => {
  check(Object.prototype.hasOwnProperty.call(SPRITES, name), `missing Stage 1 sprite "${name}"`);
});

requiredStage3.forEach((name) => {
  check(Object.prototype.hasOwnProperty.call(SPRITES, name), `missing Stage 3 sprite "${name}"`);
});

let frameCount = 0;
Object.entries(SPRITES).forEach(([spriteName, sprite]) => {
  const spec = SPRITE_SPECS[spriteName];
  check(isObject(sprite), `${spriteName} must be an object`);
  check(!!spec, `${spriteName} must have SPRITE_SPECS entry`);
  if (!spec) return;

  check(sprite.id === spriteName, `${spriteName} id must equal object key`);
  check(sprite.type === spec.type, `${spriteName} type must be ${spec.type}`);
  check(sprite.w === spec.w && sprite.h === spec.h, `${spriteName} size must be ${spec.w}x${spec.h}`);
  check(Object.prototype.hasOwnProperty.call(PALETTES, sprite.palette), `${spriteName} palette "${sprite.palette}" must exist`);
  check(Array.isArray(sprite.tags) && sprite.tags.includes(`stage${spec.stage}`), `${spriteName} must include stage${spec.stage} tag`);
  checkBounds(spriteName, sprite);

  const palette = PALETTES[sprite.palette];
  check(isObject(sprite.frames), `${spriteName} frames must be an object`);
  Object.entries(sprite.frames).forEach(([frameName, rows]) => {
    frameCount += 1;
    checkFrameMatrix(spriteName, frameName, rows, sprite, palette);
  });
  checkAnimations(spriteName, sprite, spec);
});

const expectedFrameCount = Object.values(SPRITE_SPECS)
  .reduce((sum, spec) => sum + Object.values(spec.anims).reduce((inner, count) => inner + count, 0), 0);

check(Object.keys(SPRITES).length === Object.keys(SPRITE_SPECS).length, `SPRITES must contain exactly ${Object.keys(SPRITE_SPECS).length} spec sprites, got ${Object.keys(SPRITES).length}`);
check(frameCount === expectedFrameCount, `frame count must be ${expectedFrameCount}, got ${frameCount}`);

[
  { path: "assets/shelter/trailer/base_escape_pod.png", width: 780, height: 900 },
  { path: "assets/shelter/trailer/supply_shelf.png", width: 260, height: 210, alphaBinary: true },
  { path: "assets/shelter/trailer/solar_radio.png", width: 180, height: 140, alphaBinary: true },
  { path: "assets/shelter/trailer/patched_lights.png", width: 300, height: 110, alphaBinary: true },
  { path: "assets/shelter/trailer/hydro_planter.png", width: 300, height: 160, alphaBinary: true },
  { path: "assets/shelter/trailer/water_filter.png", width: 180, height: 170, alphaBinary: true },
  { path: "assets/shelter/trailer/folding_workbench.png", width: 300, height: 210, alphaBinary: true },
  { path: "assets/shelter/trailer/blueprint_board.png", width: 200, height: 210, alphaBinary: true },
  { path: "assets/shelter/trailer/battery_bank.png", width: 220, height: 150, alphaBinary: true },
  { path: "assets/vehicles/trailer.png", width: 709, height: 1291, alphaBinary: true }
].forEach(checkPngContract);

if (errors.length > 0) {
  console.error("Sprite contract FAIL");
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("Sprite contract PASS");
console.log(`Sprites checked: ${Object.keys(SPRITES).length}`);
console.log(`Frames checked: ${frameCount}`);
console.log(`Stage 3 sprites checked: ${requiredStage3.length}`);
