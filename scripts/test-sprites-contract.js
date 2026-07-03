"use strict";

const { PALETTES, SPRITES, SPRITE_SPECS } = require("../src/sprites.js");

const errors = [];

function fail(message) {
  errors.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
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

const requiredStage1 = Object.entries(SPRITE_SPECS)
  .filter(([, spec]) => spec.stage === 1)
  .map(([name]) => name);

requiredStage1.forEach((name) => {
  check(Object.prototype.hasOwnProperty.call(SPRITES, name), `missing Stage 1 sprite "${name}"`);
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
  check(Array.isArray(sprite.tags) && sprite.tags.includes("stage1"), `${spriteName} must include stage1 tag`);
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
  .filter((spec) => spec.stage === 1)
  .reduce((sum, spec) => sum + Object.values(spec.anims).reduce((inner, count) => inner + count, 0), 0);

check(Object.keys(SPRITES).length === requiredStage1.length, `SPRITES must contain exactly ${requiredStage1.length} Stage 1 sprites, got ${Object.keys(SPRITES).length}`);
check(frameCount === expectedFrameCount, `Stage 1 frame count must be ${expectedFrameCount}, got ${frameCount}`);

if (errors.length > 0) {
  console.error("Sprite contract FAIL");
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("Sprite contract PASS");
console.log(`Sprites checked: ${Object.keys(SPRITES).length}`);
console.log(`Frames checked: ${frameCount}`);
