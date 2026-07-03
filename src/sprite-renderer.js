"use strict";

let spriteBundle =
  typeof window !== "undefined" && window.DSSprites
    ? window.DSSprites
    : typeof require !== "undefined"
      ? require("./sprites.js")
      : null;

let cacheOptions = { pixelRatio: 1, smoothing: false };
let frameCache = Object.create(null);
let tintedCache = Object.create(null);

function getBundle() {
  const bundle = typeof window !== "undefined" && window.DSSprites ? window.DSSprites : spriteBundle;
  if (!bundle || !bundle.SPRITES || !bundle.PALETTES) {
    throw new Error("DSSpriteRenderer: DSSprites is not loaded.");
  }
  spriteBundle = bundle;
  return bundle;
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined" && document.createElement) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("DSSpriteRenderer: Canvas API is not available in this environment.");
}

function setSmoothing(ctx, enabled) {
  ctx.imageSmoothingEnabled = !!enabled;
  ctx.mozImageSmoothingEnabled = !!enabled;
  ctx.webkitImageSmoothingEnabled = !!enabled;
  ctx.msImageSmoothingEnabled = !!enabled;
}

function cacheKey(name, frameName) {
  return `${name}::${frameName}`;
}

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function cloneBox(box) {
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

function getSprite(name) {
  const { SPRITES } = getBundle();
  const sprite = SPRITES[name];
  if (!sprite) throw new Error(`DSSpriteRenderer: sprite "${name}" was not found.`);
  return sprite;
}

function renderFrame(name, frameName, sprite) {
  const { PALETTES } = getBundle();
  const matrix = sprite.frames[frameName];
  if (!matrix) throw new Error(`DSSpriteRenderer: frame "${frameName}" was not found on sprite "${name}".`);

  const pixelRatio = cacheOptions.pixelRatio;
  const canvas = createCanvas(sprite.w * pixelRatio, sprite.h * pixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("DSSpriteRenderer: failed to acquire 2D canvas context.");
  setSmoothing(ctx, cacheOptions.smoothing);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const palette = PALETTES[sprite.palette];
  for (let y = 0; y < sprite.h; y += 1) {
    const row = matrix[y];
    for (let x = 0; x < sprite.w; x += 1) {
      const color = palette[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * pixelRatio, y * pixelRatio, pixelRatio, pixelRatio);
    }
  }

  const rendered = {
    canvas,
    w: sprite.w,
    h: sprite.h,
    pivot: clonePoint(sprite.pivot),
    hitbox: cloneBox(sprite.hitbox)
  };
  frameCache[cacheKey(name, frameName)] = rendered;
  return rendered;
}

function preRenderSprites({ pixelRatio = 1, smoothing = false, names = null } = {}) {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new Error("DSSpriteRenderer: pixelRatio must be a positive number.");
  }
  const { SPRITES } = getBundle();
  const nameList = names == null ? Object.keys(SPRITES) : Array.isArray(names) ? names : [names];

  cacheOptions = {
    pixelRatio: Math.max(1, Math.floor(pixelRatio)),
    smoothing: !!smoothing
  };
  frameCache = Object.create(null);
  tintedCache = Object.create(null);

  let count = 0;
  nameList.forEach((name) => {
    const sprite = getSprite(name);
    Object.keys(sprite.frames).forEach((frameName) => {
      renderFrame(name, frameName, sprite);
      count += 1;
    });
  });

  return { cache: frameCache, count };
}

function getSpriteFrame(name, frameName) {
  const sprite = getSprite(name);
  if (!sprite.frames[frameName]) {
    throw new Error(`DSSpriteRenderer: frame "${frameName}" was not found on sprite "${name}".`);
  }
  const key = cacheKey(name, frameName);
  return frameCache[key] || renderFrame(name, frameName, sprite);
}

function measureSprite(name, scale = 1) {
  const sprite = getSprite(name);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("DSSpriteRenderer: scale must be a positive number.");
  return {
    w: sprite.w * scale,
    h: sprite.h * scale,
    pivot: { x: sprite.pivot.x * scale, y: sprite.pivot.y * scale },
    hitbox: {
      x: sprite.hitbox.x * scale,
      y: sprite.hitbox.y * scale,
      w: sprite.hitbox.w * scale,
      h: sprite.hitbox.h * scale
    }
  };
}

function originOffset(frame, origin) {
  if (origin === "top-left" || origin === "topleft") return { x: 0, y: 0 };
  if (origin === "center") return { x: -frame.w / 2, y: -frame.h / 2 };
  if (origin && origin !== "pivot") throw new Error(`DSSpriteRenderer: unsupported origin "${origin}".`);
  return { x: -frame.pivot.x, y: -frame.pivot.y };
}

function getTintedCanvas(frame, tint, tintKey) {
  const key = `${tintKey}::${tint}`;
  if (tintedCache[key]) return tintedCache[key];
  const canvas = createCanvas(frame.canvas.width, frame.canvas.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("DSSpriteRenderer: failed to acquire tint canvas context.");
  setSmoothing(ctx, false);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(frame.canvas, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  tintedCache[key] = canvas;
  return canvas;
}

function drawSprite(ctx, name, frameName, x, y, scale = 1, options = {}) {
  if (!ctx || typeof ctx.drawImage !== "function") {
    throw new Error("DSSpriteRenderer: drawSprite requires a 2D canvas context.");
  }
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("DSSpriteRenderer: scale must be a positive number.");

  const frame = getSpriteFrame(name, frameName);
  const {
    flipX = false,
    flipY = false,
    rotation = 0,
    alpha = 1,
    origin = "pivot",
    tint = null,
    debug = false
  } = options;

  const offset = originOffset(frame, origin);
  ctx.save();
  setSmoothing(ctx, false);
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.scale(scale * (flipX ? -1 : 1), scale * (flipY ? -1 : 1));
  ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));

  const image = tint ? getTintedCanvas(frame, tint, cacheKey(name, frameName)) : frame.canvas;
  ctx.drawImage(image, offset.x, offset.y, frame.w, frame.h);

  if (debug) {
    ctx.strokeStyle = "#ffcc66";
    ctx.lineWidth = 1 / scale;
    ctx.strokeRect(offset.x + frame.hitbox.x, offset.y + frame.hitbox.y, frame.hitbox.w, frame.hitbox.h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(offset.x + frame.pivot.x - 1 / scale, offset.y + frame.pivot.y - 1 / scale, 2 / scale, 2 / scale);
  }

  ctx.restore();
}

function drawSpriteAnim(ctx, name, anim, timeMs, x, y, scale = 1, options = {}) {
  const sprite = getSprite(name);
  const animation = sprite.anims[anim];
  if (!animation) throw new Error(`DSSpriteRenderer: animation "${anim}" was not found on sprite "${name}".`);
  if (!animation.frames || animation.frames.length === 0) {
    throw new Error(`DSSpriteRenderer: animation "${anim}" on sprite "${name}" has no frames.`);
  }
  const fps = animation.fps > 0 ? animation.fps : 1;
  const frameTime = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
  const rawIndex = Math.floor((frameTime / 1000) * fps);
  const frameIndex = animation.loop ? rawIndex % animation.frames.length : Math.min(rawIndex, animation.frames.length - 1);
  const frameName = animation.frames[frameIndex];
  drawSprite(ctx, name, frameName, x, y, scale, options);
  return frameName;
}

const DSSpriteRenderer = {
  preRenderSprites,
  getSprite,
  getSpriteFrame,
  measureSprite,
  drawSprite,
  drawSpriteAnim
};

if (typeof window !== "undefined") window.DSSpriteRenderer = DSSpriteRenderer;
if (typeof module !== "undefined" && module.exports) module.exports = DSSpriteRenderer;
