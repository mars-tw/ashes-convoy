"use strict";

const SHELTER_HOTSPOTS = {
  sortie: { x: 0.78, y: 0.69, w: 0.19, h: 0.21, label: "出勤" },
  upgrades: { x: 0.04, y: 0.17, w: 0.27, h: 0.25, label: "升級" },
  vehicle: { x: 0.07, y: 0.82, w: 0.26, h: 0.12, label: "載具" },
  series: { x: 0.70, y: 0.34, w: 0.24, h: 0.16, label: "系列" }
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

const DSShelterScene = {
  drawShelterScene,
  SHELTER_HOTSPOTS
};

if (typeof window !== "undefined") window.DSShelterScene = DSShelterScene;
if (typeof module !== "undefined" && module.exports) module.exports = DSShelterScene;
