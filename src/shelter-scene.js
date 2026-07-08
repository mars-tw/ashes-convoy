"use strict";

const SHELTER_HOTSPOTS = {
  sortie: { x: 0.78, y: 0.69, w: 0.19, h: 0.21, label: "出勤" },
  upgrades: { x: 0.04, y: 0.17, w: 0.27, h: 0.25, label: "升級" },
  vehicle: { x: 0.07, y: 0.82, w: 0.26, h: 0.12, label: "載具" },
  series: { x: 0.70, y: 0.34, w: 0.24, h: 0.16, label: "系列" },
  trailer: { x: 0.46, y: 0.79, w: 0.21, h: 0.12, label: "拖車" }
};

const BASE_W = 390;
const BASE_H = 844;

function getRenderer(renderer) {
  if (renderer) return renderer;
  if (typeof window !== "undefined" && window.DSSpriteRenderer) return window.DSSpriteRenderer;
  if (typeof require !== "undefined") return require("./sprite-renderer.js");
  throw new Error("DSShelterScene: sprite renderer is not available.");
}

function setSmoothing(ctx, enabled) {
  ctx.imageSmoothingEnabled = !!enabled;
  ctx.mozImageSmoothingEnabled = !!enabled;
  ctx.webkitImageSmoothingEnabled = !!enabled;
  ctx.msImageSmoothingEnabled = !!enabled;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeLayout(width, height) {
  const scale = Math.min(width / BASE_W, height / BASE_H);
  const contentRect = {
    x: (width - BASE_W * scale) / 2,
    y: (height - BASE_H * scale) / 2,
    w: BASE_W * scale,
    h: BASE_H * scale
  };
  return { contentRect, scale };
}

function drawRadial(ctx, x, y, radius, inner, outer, alpha) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawLine(ctx, x0, y0, x1, y1, color, width) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawCabinShell(ctx, r, s, warmth) {
  const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  bg.addColorStop(0, "#141116");
  bg.addColorStop(0.32, "#2a1a16");
  bg.addColorStop(0.68, "#3a2117");
  bg.addColorStop(1, "#171113");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const x = (v) => r.x + v * s;
  const y = (v) => r.y + v * s;
  ctx.fillStyle = "#2d1c16";
  ctx.fillRect(x(0), y(64), BASE_W * s, 448 * s);
  ctx.fillStyle = "#1b1718";
  ctx.fillRect(x(0), y(512), BASE_W * s, 332 * s);

  for (let i = 0; i < 9; i += 1) {
    const px = x(22 + i * 44);
    drawLine(ctx, px, y(72), px - 74 * s, y(512), "rgba(255,166,82,0.18)", 1.2 * s);
    drawLine(ctx, px, y(512), px + 38 * s, y(844), "rgba(255,204,128,0.22)", 1.1 * s);
  }

  for (let row = 0; row < 8; row += 1) {
    const py = y(548 + row * 38);
    drawLine(ctx, x(0), py, x(BASE_W), py + row * 7 * s, "rgba(238,165,84,0.18)", 1.5 * s);
  }

  ctx.fillStyle = `rgba(255,142,53,${0.14 * warmth})`;
  ctx.fillRect(x(0), y(430), BASE_W * s, 166 * s);
  ctx.fillStyle = "rgba(10,12,16,0.46)";
  ctx.fillRect(x(0), y(0), BASE_W * s, 72 * s);

  // 出勤口只畫成環境結構，互動按鈕由遊戲端 DOM 對齊 hotspot。
  ctx.strokeStyle = "rgba(116,155,180,0.38)";
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(x(306), y(594), 68 * s, 154 * s);
  ctx.strokeStyle = "rgba(255,178,82,0.20)";
  ctx.lineWidth = 2 * s;
  ctx.strokeRect(x(313), y(608), 54 * s, 126 * s);
  drawLine(ctx, x(340), y(734), x(340), y(804), "rgba(255,170,80,0.24)", 3 * s);
}

function drawWindowCold(ctx, r, s, timeMs, theme) {
  const x = (v) => r.x + v * s;
  const y = (v) => r.y + v * s;
  const wx = x(169);
  const wy = y(108);
  const ww = 202 * s;
  const wh = 166 * s;
  const gradient = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gradient.addColorStop(0, "#152c3f");
  gradient.addColorStop(0.55, "#5a98b8");
  gradient.addColorStop(1, "#101923");
  ctx.fillStyle = gradient;
  ctx.fillRect(wx, wy, ww, wh);

  ctx.save();
  ctx.globalAlpha = 0.38;
  for (let i = 0; i < 8; i += 1) {
    const drift = ((timeMs / 90 + i * 31) % 190) * s;
    ctx.fillStyle = i % 2 ? "#c4eef4" : "#7fb7d0";
    ctx.fillRect(wx + ((i * 31) % 188) * s, wy + (18 + i * 14) * s + drift * 0.04, (18 + i * 4) * s, 2 * s);
  }
  if (theme === "winter") {
    for (let i = 0; i < 42; i += 1) {
      const px = wx + ((i * 17 + timeMs / 70) % 198) * s;
      const py = wy + ((i * 29 + timeMs / 45) % 158) * s;
      ctx.fillRect(px, py, Math.max(1, s), Math.max(1, s));
    }
  }
  ctx.restore();
}

function drawWallClutter(ctx, r, s) {
  const x = (v) => r.x + v * s;
  const y = (v) => r.y + v * s;
  ctx.save();
  ctx.fillStyle = "rgba(255,211,123,0.72)";
  ctx.fillRect(x(16), y(94), 42 * s, 5 * s);
  ctx.fillRect(x(64), y(96), 34 * s, 4 * s);
  ctx.fillStyle = "rgba(240,192,118,0.82)";
  for (let i = 0; i < 7; i += 1) {
    ctx.fillRect(x(20 + i * 13), y(103 + (i % 2) * 4), 7 * s, 9 * s);
    ctx.fillStyle = i % 2 ? "rgba(255,146,66,0.80)" : "rgba(245,226,160,0.88)";
  }

  ctx.strokeStyle = "rgba(214,154,88,0.58)";
  ctx.lineWidth = 2 * s;
  drawLine(ctx, x(38), y(356), x(138), y(356), "rgba(214,154,88,0.58)", 2 * s);
  for (let i = 0; i < 5; i += 1) {
    const px = x(48 + i * 21);
    drawLine(ctx, px, y(356), px, y(380 + (i % 2) * 9), "rgba(236,191,124,0.72)", 1.5 * s);
    ctx.fillStyle = i % 2 ? "rgba(177,96,51,0.84)" : "rgba(174,182,181,0.78)";
    ctx.fillRect(px - 4 * s, y(380 + (i % 2) * 9), 9 * s, 18 * s);
  }

  ctx.fillStyle = "rgba(248,222,155,0.80)";
  ctx.fillRect(x(138), y(292), 46 * s, 54 * s);
  ctx.fillStyle = "rgba(179,63,51,0.88)";
  ctx.fillRect(x(145), y(302), 12 * s, 3 * s);
  ctx.fillRect(x(145), y(314), 26 * s, 3 * s);
  ctx.fillRect(x(145), y(326), 18 * s, 3 * s);
  ctx.fillStyle = "rgba(255,152,62,0.32)";
  ctx.fillRect(x(132), y(286), 59 * s, 66 * s);
  ctx.restore();
}

function drawSceneSprite(renderer, ctx, name, anim, timeMs, x, y, scale, options) {
  return renderer.drawSpriteAnim(ctx, name, anim, timeMs, x, y, scale, Object.assign({ origin: "top-left" }, options || {}));
}

function drawWarmLights(ctx, r, s, timeMs, warmth, reducedFlash) {
  const x = (v) => r.x + v * s;
  const y = (v) => r.y + v * s;
  const pulse = reducedFlash ? 1 : 0.9 + Math.sin(timeMs / 700) * 0.1;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  drawRadial(ctx, x(292), y(430), 224 * s, "rgba(255,190,88,0.88)", "rgba(255,116,35,0)", 0.58 * warmth * pulse);
  drawRadial(ctx, x(177), y(535), 286 * s, "rgba(255,154,70,0.50)", "rgba(255,116,35,0)", 0.42 * warmth);
  drawRadial(ctx, x(214), y(410), 220 * s, "rgba(255,178,90,0.36)", "rgba(255,116,35,0)", 0.34 * warmth);
  drawRadial(ctx, x(278), y(210), 195 * s, "rgba(255,172,82,0.36)", "rgba(255,116,35,0)", 0.42 * warmth);

  const bulbs = [
    [74, 112],
    [112, 121],
    [151, 112],
    [196, 100],
    [241, 111],
    [286, 124],
    [326, 112]
  ];
  bulbs.forEach(([bx, by], index) => {
    const localPulse = reducedFlash ? 1 : 0.65 + Math.sin(timeMs / 260 + index * 1.7) * 0.35;
    drawRadial(ctx, x(bx), y(by), 34 * s, "rgba(255,219,103,0.88)", "rgba(255,148,56,0)", 0.52 * warmth * localPulse);
  });
  ctx.restore();

  const floor = ctx.createLinearGradient(x(0), y(562), x(0), y(844));
  floor.addColorStop(0, `rgba(255,160,72,${0.20 * warmth})`);
  floor.addColorStop(0.55, `rgba(206,106,45,${0.10 * warmth})`);
  floor.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = floor;
  ctx.fillRect(x(0), y(520), BASE_W * s, 324 * s);
}

function drawColdOverWindow(ctx, r, s) {
  const x = (v) => r.x + v * s;
  const y = (v) => r.y + v * s;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  drawRadial(ctx, x(270), y(184), 154 * s, "rgba(124,201,230,0.58)", "rgba(20,43,61,0)", 0.72);
  ctx.restore();
}

function drawVignette(ctx, width, height) {
  const radius = Math.max(width, height) * 0.78;
  const gradient = ctx.createRadialGradient(width * 0.48, height * 0.58, radius * 0.12, width * 0.48, height * 0.58, radius);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.66, "rgba(0,0,0,0.12)");
  gradient.addColorStop(1, "rgba(0,0,0,0.64)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawHotspots(ctx, r) {
  ctx.save();
  Object.values(SHELTER_HOTSPOTS).forEach((hotspot) => {
    const x = r.x + hotspot.x * r.w;
    const y = r.y + hotspot.y * r.h;
    const w = hotspot.w * r.w;
    const h = hotspot.h * r.h;
    ctx.fillStyle = "rgba(255,216,106,0.12)";
    ctx.strokeStyle = "rgba(255,216,106,0.78)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  });
  ctx.restore();
}

function drawShelterScene(ctx, opts = {}) {
  if (!ctx || typeof ctx.fillRect !== "function") {
    throw new Error("DSShelterScene: drawShelterScene requires a 2D canvas context.");
  }
  const width = opts.width || (ctx.canvas && ctx.canvas.width) || BASE_W;
  const height = opts.height || (ctx.canvas && ctx.canvas.height) || BASE_H;
  const timeMs = Number.isFinite(opts.timeMs) ? opts.timeMs : 0;
  const warmth = clamp(opts.warmth == null ? 1 : opts.warmth, 0, 1.5);
  const reducedFlash = !!opts.reducedFlash;
  const theme = opts.theme || "winter";
  const renderer = getRenderer(opts.renderer);
  const { contentRect, scale } = makeLayout(width, height);
  const s = scale;
  const r = contentRect;
  const x = (v) => r.x + v * s;
  const y = (v) => r.y + v * s;

  ctx.save();
  setSmoothing(ctx, false);
  ctx.clearRect(0, 0, width, height);

  drawCabinShell(ctx, r, s, warmth);
  drawWallClutter(ctx, r, s);
  drawWindowCold(ctx, r, s, timeMs, theme);
  drawColdOverWindow(ctx, r, s);

  drawSceneSprite(renderer, ctx, "scene_zombie_silhouette", "walk", timeMs / 2, x(259), y(143), 1.78 * s, { alpha: 0.98 });
  drawSceneSprite(renderer, ctx, "scene_zombie_silhouette", "walk", timeMs / 2 + 900, x(317), y(158), 1.12 * s, { alpha: 0.72 });
  drawSceneSprite(renderer, ctx, "scene_zombie_silhouette", "idle", timeMs, x(206), y(157), 1.08 * s, { alpha: 0.64 });
  drawSceneSprite(renderer, ctx, "scene_window_frame", "idle", timeMs, x(171), y(100), 2.08 * s);

  drawSceneSprite(renderer, ctx, "scene_shelf_supplies", "idle", timeMs, x(14), y(150), 1.45 * s);
  drawSceneSprite(renderer, ctx, "scene_shelf_supplies", "idle", timeMs, x(18), y(328), 0.88 * s);
  drawSceneSprite(renderer, ctx, "scene_plant_shelf", "sway", timeMs, x(280), y(300), 1.02 * s);
  drawSceneSprite(renderer, ctx, "scene_props", "idle", timeMs, x(121), y(356), 0.92 * s);
  drawSceneSprite(renderer, ctx, "scene_radio", reducedFlash ? "idle" : "blink", timeMs, x(88), y(412), 1.32 * s);

  drawSceneSprite(renderer, ctx, "scene_string_lights", reducedFlash ? "idle" : "twinkle", timeMs, x(22), y(86), 2.72 * s);
  drawSceneSprite(renderer, ctx, "scene_string_lights", reducedFlash ? "idle" : "twinkle", timeMs + 700, x(34), y(248), 1.88 * s, { alpha: 0.88 });

  drawSceneSprite(renderer, ctx, "scene_bed_sleeper", "breathe", timeMs, x(40), y(420), 2.78 * s);
  drawSceneSprite(renderer, ctx, "scene_props", "idle", timeMs, x(214), y(590), 1.24 * s);
  drawSceneSprite(renderer, ctx, "scene_teddy", "idle", timeMs, x(134), y(660), 1.94 * s);
  drawSceneSprite(renderer, ctx, "scene_lamp_bulb", reducedFlash ? "idle" : "glow", timeMs, x(291), y(394), 2.16 * s);
  drawSceneSprite(renderer, ctx, "scene_props", "idle", timeMs, x(20), y(748), 0.96 * s, { alpha: 0.78 });

  drawWarmLights(ctx, r, s, timeMs, warmth, reducedFlash);
  drawVignette(ctx, width, height);

  if (opts.debugHotspots) drawHotspots(ctx, r);

  ctx.restore();
  return { contentRect, scale, hotspots: SHELTER_HOTSPOTS };
}

function drawTrailerRoomShell(ctx, r, s, timeMs) {
  const x = (v) => r.x + v * s;
  const y = (v) => r.y + v * s;
  const wall = ctx.createLinearGradient(0, y(74), 0, y(656));
  wall.addColorStop(0, "#16191d");
  wall.addColorStop(0.42, "#302820");
  wall.addColorStop(1, "#171515");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = "#211b17";
  ctx.fillRect(x(22), y(78), 346 * s, 548 * s);
  ctx.fillStyle = "#111316";
  ctx.fillRect(x(22), y(626), 346 * s, 144 * s);
  ctx.strokeStyle = "rgba(236,197,126,0.18)";
  ctx.lineWidth = 2 * s;
  ctx.strokeRect(x(22), y(78), 346 * s, 692 * s);
  for (let i = 0; i < 8; i += 1) {
    drawLine(ctx, x(36 + i * 45), y(88), x(18 + i * 48), y(628), "rgba(255,210,142,0.08)", 1 * s);
  }
  for (let i = 0; i < 7; i += 1) {
    drawLine(ctx, x(26), y(646 + i * 17), x(366), y(640 + i * 20), "rgba(238,166,96,0.18)", 1.2 * s);
  }

  const wx = x(128);
  const wy = y(118);
  const ww = 134 * s;
  const wh = 102 * s;
  const sky = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  sky.addColorStop(0, "#20394b");
  sky.addColorStop(1, "#101821");
  ctx.fillStyle = sky;
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = "rgba(113,148,154,0.38)";
  for (let i = 0; i < 5; i += 1) {
    const px = wx + ((timeMs / 120 + i * 27) % 128) * s;
    ctx.fillRect(px, wy + (22 + i * 13) * s, (20 + i * 3) * s, 2 * s);
  }
  [[161, 175, 11], [211, 183, 8], [236, 171, 7]].forEach(([zx, zy, scale]) => {
    ctx.fillStyle = "rgba(18,25,23,0.74)";
    ctx.fillRect(x(zx), y(zy), scale * 0.55 * s, scale * 1.55 * s);
    ctx.fillRect(x(zx - 2), y(zy + 7), scale * 0.35 * s, scale * 0.35 * s);
    ctx.fillRect(x(zx + 5), y(zy + 7), scale * 0.35 * s, scale * 0.35 * s);
  });
  ctx.strokeStyle = "#17120f";
  ctx.lineWidth = 6 * s;
  ctx.strokeRect(wx, wy, ww, wh);
  drawLine(ctx, wx + ww * 0.5, wy, wx + ww * 0.5, wy + wh, "#17120f", 3 * s);

  ctx.fillStyle = "#3d3027";
  ctx.fillRect(x(78), y(468), 190 * s, 55 * s);
  ctx.fillStyle = "#18181b";
  ctx.fillRect(x(68), y(512), 214 * s, 28 * s);
  ctx.fillStyle = "#75684f";
  ctx.fillRect(x(88), y(454), 118 * s, 38 * s);
  ctx.fillStyle = "#463d37";
  ctx.fillRect(x(166), y(438), 62 * s, 52 * s);
  ctx.fillStyle = "#d7a87a";
  ctx.fillRect(x(191), y(430), 20 * s, 13 * s);
  ctx.fillStyle = "#2d2322";
  ctx.fillRect(x(183), y(441), 46 * s, 18 * s);
  ctx.fillStyle = "rgba(255,220,150,0.18)";
  ctx.fillRect(x(96), y(455), 102 * s, 7 * s);

  ctx.fillStyle = "#8c7f61";
  ctx.fillRect(x(48), y(574), 48 * s, 29 * s);
  ctx.fillStyle = "#24211c";
  ctx.fillRect(x(52), y(581), 38 * s, 2 * s);
  ctx.fillRect(x(52), y(590), 28 * s, 2 * s);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x(30), y(621), 326 * s, 15 * s);
}

const TRAILER_ROOM_ASSETS = {
  base: "assets/shelter/trailer/base_escape_pod.png",
  furniture: {
    supply_shelf: "assets/shelter/trailer/supply_shelf.png",
    solar_radio: "assets/shelter/trailer/solar_radio.png",
    patched_lights: "assets/shelter/trailer/patched_lights.png",
    hydro_planter: "assets/shelter/trailer/hydro_planter.png",
    water_filter: "assets/shelter/trailer/water_filter.png",
    folding_workbench: "assets/shelter/trailer/folding_workbench.png",
    blueprint_board: "assets/shelter/trailer/blueprint_board.png",
    battery_bank: "assets/shelter/trailer/battery_bank.png"
  },
  anchors: {
    wall_left: { x: 92, y: 138, w: 138, h: 120 },
    wall_right: { x: 548, y: 145, w: 126, h: 136 },
    window_sill: { x: 246, y: 304, w: 292, h: 114 },
    bedside: { x: 560, y: 506, w: 112, h: 92 },
    floor_left: { x: 94, y: 548, w: 132, h: 136 },
    floor_right: { x: 526, y: 694, w: 168, h: 102 },
    desk: { x: 380, y: 632, w: 268, h: 168 },
    ceiling: { x: 160, y: 78, w: 460, h: 86 }
  }
};

const trailerImageCache = new Map();

function isImageReady(image) {
  return !!(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

function getTrailerImage(src) {
  if (!src || typeof window === "undefined" || typeof window.Image !== "function") return null;
  if (trailerImageCache.has(src)) return trailerImageCache.get(src);
  const image = new window.Image();
  image.decoding = "async";
  image.onload = () => {
    if (typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
      window.dispatchEvent(new window.CustomEvent("ashes-trailer-asset-ready", { detail: { src } }));
    }
  };
  image.src = src;
  trailerImageCache.set(src, image);
  return image;
}

function fitContain(srcW, srcH, dstW, dstH) {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    x: (dstW - w) / 2,
    y: (dstH - h) / 2,
    w,
    h,
    scale
  };
}

function drawImageInRect(ctx, image, rect) {
  if (!isImageReady(image) || !rect) return false;
  const scale = Math.min(rect.w / image.naturalWidth, rect.h / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  const x = rect.x + (rect.w - w) / 2;
  const y = rect.y + (rect.h - h) / 2;
  ctx.drawImage(image, x, y, w, h);
  return true;
}

function drawEmptyTrailerHints(ctx, r, s) {
  const x = (v) => r.x + v * s;
  const y = (v) => r.y + v * s;
  ctx.save();
  ctx.strokeStyle = "rgba(236,197,126,0.16)";
  ctx.lineWidth = 1.4 * s;
  [[48, 158, 62, 72], [282, 154, 54, 70], [58, 346, 64, 44], [274, 356, 60, 46]].forEach(([px, py, w, h]) => {
    ctx.strokeRect(x(px), y(py), w * s, h * s);
  });
  ctx.fillStyle = "rgba(229,195,132,0.18)";
  ctx.fillRect(x(51), y(172), 54 * s, 4 * s);
  ctx.fillRect(x(286), y(177), 46 * s, 4 * s);
  ctx.restore();
}

function drawTrailerFurniture(ctx, r, s, id, timeMs) {
  const x = (v) => r.x + v * s;
  const y = (v) => r.y + v * s;
  ctx.save();
  if (id === "supply_shelf") {
    ctx.fillStyle = "#574333";
    ctx.fillRect(x(42), y(146), 88 * s, 8 * s);
    ctx.fillRect(x(42), y(200), 88 * s, 8 * s);
    ctx.fillStyle = "#82714d";
    for (let i = 0; i < 6; i += 1) ctx.fillRect(x(48 + i * 13), y(162 + (i % 2) * 25), 8 * s, 20 * s);
    ctx.fillStyle = "#49594b";
    ctx.fillRect(x(105), y(159), 15 * s, 25 * s);
    ctx.strokeStyle = "#7d6b46";
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(x(60), y(210), 24 * s, 24 * s);
  } else if (id === "solar_radio") {
    ctx.fillStyle = "#1b2021";
    ctx.fillRect(x(274), y(441), 52 * s, 28 * s);
    ctx.fillStyle = "#a07b46";
    ctx.fillRect(x(280), y(447), 18 * s, 12 * s);
    ctx.fillStyle = "#67746a";
    ctx.fillRect(x(302), y(445), 14 * s, 14 * s);
    ctx.strokeStyle = "#c7a966";
    ctx.lineWidth = 2 * s;
    drawLine(ctx, x(316), y(440), x(333), y(417), "#c7a966", 2 * s);
  } else if (id === "patched_lights") {
    ctx.strokeStyle = "#5c4632";
    ctx.lineWidth = 2 * s;
    drawLine(ctx, x(58), y(118), x(338), y(136), "#5c4632", 2 * s);
    for (let i = 0; i < 9; i += 1) {
      const pulse = 0.65 + Math.sin(timeMs / 320 + i) * 0.25;
      ctx.fillStyle = `rgba(231,181,91,${pulse})`;
      ctx.fillRect(x(66 + i * 31), y(119 + (i % 2) * 7), 6 * s, 8 * s);
    }
  } else if (id === "hydro_planter") {
    ctx.fillStyle = "#3c4735";
    ctx.fillRect(x(126), y(236), 136 * s, 20 * s);
    ctx.fillStyle = "#80906a";
    for (let i = 0; i < 8; i += 1) {
      ctx.fillRect(x(138 + i * 14), y(220 - (i % 3) * 4), 9 * s, 17 * s);
      ctx.fillStyle = i % 2 ? "#6f7a51" : "#9a7f4a";
    }
    ctx.strokeStyle = "#6e7b72";
    drawLine(ctx, x(134), y(254), x(250), y(254), "#6e7b72", 2 * s);
  } else if (id === "water_filter") {
    ctx.fillStyle = "#4b4637";
    ctx.fillRect(x(48), y(538), 68 * s, 16 * s);
    ctx.fillStyle = "rgba(122,164,174,0.52)";
    ctx.fillRect(x(54), y(506), 17 * s, 32 * s);
    ctx.fillRect(x(78), y(494), 21 * s, 44 * s);
    ctx.fillStyle = "#8b7652";
    ctx.fillRect(x(55), y(523), 15 * s, 7 * s);
    ctx.fillRect(x(80), y(516), 18 * s, 10 * s);
  } else if (id === "folding_workbench") {
    ctx.fillStyle = "#5f4535";
    ctx.fillRect(x(218), y(518), 105 * s, 35 * s);
    ctx.fillStyle = "#8b7057";
    ctx.fillRect(x(226), y(506), 92 * s, 18 * s);
    ctx.fillStyle = "#22282b";
    ctx.fillRect(x(238), y(493), 34 * s, 12 * s);
    ctx.fillStyle = "#b89c6a";
    ctx.fillRect(x(278), y(493), 30 * s, 20 * s);
    ctx.fillStyle = "#4d6b64";
    ctx.fillRect(x(231), y(513), 22 * s, 12 * s);
  } else if (id === "blueprint_board") {
    ctx.fillStyle = "#66523b";
    ctx.fillRect(x(282), y(145), 58 * s, 72 * s);
    ctx.fillStyle = "#c2b488";
    ctx.fillRect(x(289), y(154), 44 * s, 24 * s);
    ctx.fillRect(x(294), y(185), 35 * s, 21 * s);
    ctx.strokeStyle = "#574b39";
    drawLine(ctx, x(294), y(166), x(326), y(166), "#574b39", 1.5 * s);
    drawLine(ctx, x(302), y(191), x(323), y(202), "#574b39", 1.5 * s);
  } else if (id === "battery_bank") {
    ctx.fillStyle = "#2a2f2c";
    ctx.fillRect(x(275), y(574), 66 * s, 42 * s);
    ctx.fillStyle = "#6d5d3f";
    ctx.fillRect(x(282), y(582), 19 * s, 25 * s);
    ctx.fillRect(x(307), y(582), 19 * s, 25 * s);
    ctx.fillStyle = "#c99a52";
    ctx.fillRect(x(286), y(577), 7 * s, 5 * s);
    ctx.fillRect(x(312), y(577), 7 * s, 5 * s);
    drawLine(ctx, x(300), y(589), x(307), y(589), "#c99a52", 2 * s);
  }
  ctx.restore();
}

function drawTrailerRoom(ctx, opts = {}) {
  if (!ctx || typeof ctx.fillRect !== "function") {
    throw new Error("DSShelterScene: drawTrailerRoom requires a 2D canvas context.");
  }
  const width = opts.width || (ctx.canvas && ctx.canvas.width) || BASE_W;
  const height = opts.height || (ctx.canvas && ctx.canvas.height) || BASE_H;
  const state = opts.roomState && typeof opts.roomState === "object" ? opts.roomState : {};
  const room = state.room && typeof state.room === "object" ? state.room : {};
  const slots = room.slots && typeof room.slots === "object" ? room.slots : {};
  const equipped = Object.keys(slots).map((slotId) => slots[slotId]).filter(Boolean);
  const baseImage = getTrailerImage(TRAILER_ROOM_ASSETS.base);
  const baseReady = isImageReady(baseImage);
  let assetsReady = baseReady;
  let contentRect = { x: 0, y: 0, w: width, h: height };

  ctx.save();
  setSmoothing(ctx, false);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#07090d";
  ctx.fillRect(0, 0, width, height);
  if (baseReady) {
    contentRect = fitContain(baseImage.naturalWidth, baseImage.naturalHeight, width, height);
    ctx.drawImage(baseImage, contentRect.x, contentRect.y, contentRect.w, contentRect.h);
    Object.keys(slots).forEach((slotId) => {
      const furnitureId = slots[slotId];
      if (!furnitureId) return;
      const src = TRAILER_ROOM_ASSETS.furniture[furnitureId];
      const image = getTrailerImage(src);
      const anchor = TRAILER_ROOM_ASSETS.anchors[slotId];
      if (!anchor || !src) return;
      const ready = isImageReady(image);
      assetsReady = assetsReady && ready;
      if (!ready) return;
      drawImageInRect(ctx, image, {
        x: contentRect.x + anchor.x * contentRect.scale,
        y: contentRect.y + anchor.y * contentRect.scale,
        w: anchor.w * contentRect.scale,
        h: anchor.h * contentRect.scale
      });
    });
  } else {
    assetsReady = false;
  }
  ctx.restore();

  return {
    contentRect,
    scale: contentRect.scale || 1,
    starterState: equipped.length === 0,
    equipped,
    itemsDrawn: baseReady ? equipped.filter((id) => isImageReady(getTrailerImage(TRAILER_ROOM_ASSETS.furniture[id]))).length : 0,
    assetsReady,
    baseReady,
    renderMode: "raster"
  };
}

const DSShelterScene = {
  drawShelterScene,
  drawTrailerRoom,
  TRAILER_ROOM_ASSETS,
  SHELTER_HOTSPOTS
};

if (typeof window !== "undefined") window.DSShelterScene = DSShelterScene;
if (typeof module !== "undefined" && module.exports) module.exports = DSShelterScene;
