"use strict";

/*
 * DSFx —— 灰燼護航特效核心（純函式、固定粒子池）。
 * 鐵則：本檔不可觸碰 DOM、計時器與全域亂數；時間（time / dt / elapsed）
 * 與亂數（rng：回傳 0..1 的函式）一律由呼叫端注入。
 * 渲染端（game.js）只讀取本模組回傳的資料，繪圖行為不在此處。
 * 發射器規格（burst spec）與各環境參數掛在 DSConfig.FX，本模組以參數 fxConfig 接收。
 */

const TAU = Math.PI * 2;
const EMPTY_ARRAY = [];

// 無 fxConfig 時的保底品質分級（與 DSConfig.FX.quality 對齊）。
const DEFAULT_QUALITY = {
  high: { maxParticles: 96, emitRateMul: 1, vignette: true, trailEvery: 1, envDensityMul: 1 },
  low: { maxParticles: 48, emitRateMul: 0.5, vignette: false, trailEvery: 2, envDensityMul: 0.5 }
};

const DEFAULT_MUZZLE = { scale: 1, brightness: 1, frames: 2, flickerHz: 0, offset: 0 };

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clampInt(value, min, max) {
  const number = Math.floor(finiteOr(value, min));
  if (number < min) return min;
  if (number > max) return max;
  return number;
}

function assertRng(rng) {
  if (typeof rng !== "function") throw new TypeError("DSFx 需要注入 rng 函式（回傳 0..1）");
  return rng;
}

// 確定性種子亂數（mulberry32）：同 seed 必產生同序列，供呼叫端建立可注入的 rng。
function createSeededRng(seed) {
  let a = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0;
  return function seededRng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function qualityProfile(fxConfig, quality) {
  const key = quality === "low" ? "low" : "high";
  const table = fxConfig && fxConfig.quality;
  return (table && table[key]) || DEFAULT_QUALITY[key];
}

function createParticle() {
  return {
    active: false,
    shape: "spark",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 0,
    drag: 0,
    life: 0,
    maxLife: 0,
    delay: 0,
    size: 0,
    sizeStart: 0,
    sizeEnd: 0,
    stretch: 1,
    color: "#ffffff",
    alpha: 0,
    rotation: 0,
    spin: 0
  };
}

// 建立固定大小粒子池；之後所有發射/回收皆重複使用同一批物件，零逐幀配置。
function createFxState(opts) {
  const options = opts || {};
  const quality = options.quality === "low" ? "low" : "high";
  const profile = qualityProfile(options.fxConfig, quality);
  const maxParticles = clampInt(
    options.maxParticles != null ? options.maxParticles : profile.maxParticles,
    1,
    4096
  );
  const pool = new Array(maxParticles);
  const freeIndices = new Array(maxParticles);
  for (let i = 0; i < maxParticles; i += 1) {
    pool[i] = createParticle();
    freeIndices[i] = maxParticles - 1 - i;
  }
  return {
    quality,
    maxParticles,
    emitRateMul: finiteOr(profile.emitRateMul, 1),
    envDensityMul: finiteOr(profile.envDensityMul, 1),
    trailEvery: Math.max(1, Math.floor(finiteOr(profile.trailEvery, 1))),
    vignetteEnabled: profile.vignette !== false,
    pool,
    freeIndices,
    freeCount: maxParticles,
    activeCount: 0,
    trailTick: 0,
    envAccum: {}
  };
}

function resetFxState(fxState) {
  if (!fxState) return fxState;
  for (let i = 0; i < fxState.pool.length; i += 1) {
    fxState.pool[i].active = false;
    fxState.pool[i].alpha = 0;
    fxState.freeIndices[i] = fxState.pool.length - 1 - i;
  }
  fxState.freeCount = fxState.pool.length;
  fxState.activeCount = 0;
  fxState.trailTick = 0;
  const keys = Object.keys(fxState.envAccum);
  for (let i = 0; i < keys.length; i += 1) fxState.envAccum[keys[i]] = 0;
  return fxState;
}

// 依品質係數換算實際發射數量（低品質減發射率，但至少 1 顆以保留回饋）。
function effectiveCount(fxState, baseCount) {
  const count = Math.max(0, Math.floor(finiteOr(baseCount, 0)));
  if (count === 0) return 0;
  const mul = fxState ? finiteOr(fxState.emitRateMul, 1) : 1;
  return Math.max(1, Math.round(count * mul));
}

// 核心發射：ox/oy/angleOverride 為 NaN 時退回 spec 內建值；colorOverride 為 null 時抽 spec.colors。
function spawnBurstCore(fxState, spec, rng, ox, oy, angleOverride, colorOverride) {
  assertRng(rng);
  if (!fxState || !spec) return 0;
  const want = effectiveCount(fxState, spec.count != null ? spec.count : 1);
  const baseX = Number.isFinite(ox) ? ox : finiteOr(spec.x, 0);
  const baseY = Number.isFinite(oy) ? oy : finiteOr(spec.y, 0);
  const angleCenter = Number.isFinite(angleOverride) ? angleOverride : finiteOr(spec.angleCenter, -Math.PI / 2);
  const angleSpread = finiteOr(spec.angleSpread, TAU);
  const speedMin = finiteOr(spec.speedMin, 0);
  const speedMax = Math.max(speedMin, finiteOr(spec.speedMax, speedMin));
  const lifeMin = Math.max(0.01, finiteOr(spec.lifeMin, 0.3));
  const lifeMax = Math.max(lifeMin, finiteOr(spec.lifeMax, lifeMin));
  const sizeMin = finiteOr(spec.sizeMin, 1);
  const sizeMax = Math.max(sizeMin, finiteOr(spec.sizeMax, sizeMin));
  const colors = colorOverride ? null : Array.isArray(spec.colors) && spec.colors.length > 0 ? spec.colors : null;
  const jitterX = finiteOr(spec.jitterX, 0);
  const jitterY = finiteOr(spec.jitterY, 0);
  const delay = Math.max(0, finiteOr(spec.delay, 0));
  let spawned = 0;
  for (let i = 0; i < want; i += 1) {
    if (fxState.freeCount <= 0) break;
    const index = fxState.freeIndices[fxState.freeCount - 1];
    fxState.freeCount -= 1;
    const p = fxState.pool[index];
    const angle = angleCenter + (rng() - 0.5) * angleSpread;
    const speed = speedMin + (speedMax - speedMin) * rng();
    p.active = true;
    p.shape = spec.shape || "spark";
    p.x = baseX + (rng() - 0.5) * 2 * jitterX;
    p.y = baseY + (rng() - 0.5) * 2 * jitterY;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.gravity = finiteOr(spec.gravity, 0);
    p.drag = finiteOr(spec.drag, 0);
    p.maxLife = lifeMin + (lifeMax - lifeMin) * rng();
    p.life = p.maxLife;
    p.delay = delay;
    p.sizeStart = sizeMin + (sizeMax - sizeMin) * rng();
    p.size = p.sizeStart;
    p.sizeEnd = Number.isFinite(spec.sizeEnd) ? spec.sizeEnd : p.sizeStart;
    p.stretch = finiteOr(spec.stretch, 1);
    p.color = colorOverride || (colors ? colors[Math.min(colors.length - 1, Math.floor(rng() * colors.length))] : "#ffffff");
    p.alpha = delay > 0 ? 0 : 1;
    p.rotation = rng() * TAU;
    p.spin = (rng() - 0.5) * 2 * finiteOr(spec.spin, 0);
    fxState.activeCount += 1;
    spawned += 1;
  }
  return spawned;
}

// 通用爆發發射器：位置/數量/速度範圍/角度扇區/壽命/尺寸/顏色/重力/阻力/形狀皆由 spec 決定。
function spawnBurst(fxState, spec, rng) {
  return spawnBurstCore(fxState, spec, rng, NaN, NaN, NaN, null);
}

// 曳光取樣點：每 trailEvery 次呼叫實際落一顆（低品質自動抽疏）；rng 可省略（省略時無抖動）。
function spawnTrailPoint(fxState, spec, rng) {
  if (!fxState || !spec) return 0;
  fxState.trailTick += 1;
  if (fxState.trailTick % fxState.trailEvery !== 0) return 0;
  if (fxState.freeCount <= 0) return 0;
  const jitter = rng != null ? assertRng(rng) : null;
  const index = fxState.freeIndices[fxState.freeCount - 1];
  fxState.freeCount -= 1;
  const p = fxState.pool[index];
  p.active = true;
  p.shape = spec.shape || "spark";
  p.x = finiteOr(spec.x, 0) + (jitter ? (jitter() - 0.5) * 2 * finiteOr(spec.jitterX, 0) : 0);
  p.y = finiteOr(spec.y, 0) + (jitter ? (jitter() - 0.5) * 2 * finiteOr(spec.jitterY, 0) : 0);
  p.vx = finiteOr(spec.vx, 0);
  p.vy = finiteOr(spec.vy, 0);
  p.gravity = finiteOr(spec.gravity, 0);
  p.drag = finiteOr(spec.drag, 0);
  p.maxLife = Math.max(0.01, finiteOr(spec.life, 0.25));
  p.life = p.maxLife;
  p.delay = 0;
  p.sizeStart = finiteOr(spec.size, 1.5);
  p.size = p.sizeStart;
  p.sizeEnd = Number.isFinite(spec.sizeEnd) ? spec.sizeEnd : p.sizeStart * 0.4;
  p.stretch = finiteOr(spec.stretch, 1);
  p.color = spec.color || "#ffd76a";
  p.alpha = 1;
  p.rotation = 0;
  p.spin = 0;
  fxState.activeCount += 1;
  return 1;
}

// 推進所有活粒子：延遲倒數、壽命衰減、重力/阻力積分、尺寸插值、壽命歸零即回收入池。
function updateParticles(fxState, dt) {
  if (!fxState) return 0;
  if (!(dt > 0)) return fxState.activeCount;
  const pool = fxState.pool;
  for (let i = 0; i < pool.length; i += 1) {
    const p = pool[i];
    if (!p.active) continue;
    if (p.delay > 0) {
      p.delay -= dt;
      if (p.delay > 0) continue;
      p.delay = 0;
      p.alpha = 1;
    }
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      p.alpha = 0;
      fxState.freeIndices[fxState.freeCount] = i;
      fxState.freeCount += 1;
      fxState.activeCount -= 1;
      continue;
    }
    if (p.gravity !== 0) p.vy += p.gravity * dt;
    if (p.drag !== 0) {
      const keep = 1 - p.drag * dt;
      const factor = keep > 0 ? keep : 0;
      p.vx *= factor;
      p.vy *= factor;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.spin * dt;
    const t = 1 - p.life / p.maxLife;
    p.size = p.sizeStart + (p.sizeEnd - p.sizeStart) * t;
    p.alpha = p.life / p.maxLife;
  }
  return fxState.activeCount;
}

// 供渲染端走訪可見粒子（延遲中的多段爆發粒子先跳過），零配置。
function forEachActive(fxState, fn) {
  if (!fxState || typeof fn !== "function") return;
  const pool = fxState.pool;
  for (let i = 0; i < pool.length; i += 1) {
    const p = pool[i];
    if (p.active && p.delay <= 0) fn(p, i);
  }
}

// 依敵種定義推導擊殺爆發類型：boss > fxKind 指定 > tags 含 mech/machine > zombie。
function enemyFxKind(enemyDef) {
  if (!enemyDef) return "zombie";
  if (enemyDef.fxKind) return enemyDef.fxKind;
  if (enemyDef.boss) return "boss";
  const tags = Array.isArray(enemyDef.tags) ? enemyDef.tags : EMPTY_ARRAY;
  if (tags.indexOf("mech") >= 0 || tags.indexOf("machine") >= 0) return "mech";
  return "zombie";
}

function getKillBurstSpecs(fxConfig, kind) {
  const table = fxConfig && fxConfig.killBurst;
  if (!table) return EMPTY_ARRAY;
  return table[kind] || table.zombie || EMPTY_ARRAY;
}

// 擊殺演出：依敵種類型套多段規格（boss 規格自帶 delay 形成分段大爆發）。
function spawnKillBurst(fxState, fxConfig, kind, x, y, rng) {
  const specs = getKillBurstSpecs(fxConfig, kind);
  let total = 0;
  for (let i = 0; i < specs.length; i += 1) {
    total += spawnBurstCore(fxState, specs[i], rng, x, y, NaN, null);
  }
  return total;
}

// 命中點小火花：opts = { x, y, angle?, vehicleId?, color? }；顏色依載具彈色表。
function spawnHitSpark(fxState, fxConfig, opts, rng) {
  const table = fxConfig && fxConfig.hitSpark;
  if (!table || !table.base || !opts) return 0;
  const byVehicle = table.colorsByVehicle || {};
  const color = opts.color || (opts.vehicleId && byVehicle[opts.vehicleId]) || table.defaultColor || "#ffd76a";
  const angle = Number.isFinite(opts.angle) ? opts.angle : NaN;
  return spawnBurstCore(fxState, table.base, rng, opts.x, opts.y, angle, color);
}

function environmentLayers(fxConfig, environment) {
  const env = fxConfig && fxConfig.environments && fxConfig.environments[environment];
  return env && Array.isArray(env.layers) ? env.layers : EMPTY_ARRAY;
}

// 環境動態層逐幀發射：以 ratePerSec × envDensityMul 累積，累積滿 1 才落一發（確定性、零配置）。
// parallax 層（星塵視差）不佔粒子池，由渲染端以確定性函式直接繪製，回傳 0。
function spawnEnvironmentLayer(fxState, layer, dt, anchorX, anchorY, rng) {
  if (!fxState || !layer || !(dt > 0)) return 0;
  if (Array.isArray(layer.parallax)) return 0;
  const rate = finiteOr(layer.ratePerSec, 0) * finiteOr(fxState.envDensityMul, 1);
  if (rate <= 0) return 0;
  const key = layer.id || "layer";
  let acc = (fxState.envAccum[key] || 0) + rate * dt;
  let spawned = 0;
  while (acc >= 1) {
    acc -= 1;
    spawned += spawnBurstCore(fxState, layer, rng, anchorX, anchorY, NaN, null);
  }
  fxState.envAccum[key] = acc;
  return spawned;
}

// 砲口閃焰參數：settings.reducedFlash 開啟時退回保守子規格並強制 flickerHz = 0。
function muzzleFlashParams(fxConfig, settings, out) {
  const base = (fxConfig && fxConfig.muzzleFlash) || DEFAULT_MUZZLE;
  const reduced = !!(settings && settings.reducedFlash);
  const src = reduced && base.reducedFlash ? base.reducedFlash : base;
  const target = out || {};
  target.scale = finiteOr(src.scale, finiteOr(base.scale, 1));
  target.brightness = finiteOr(src.brightness, finiteOr(base.brightness, 1));
  target.frames = Math.max(1, Math.floor(finiteOr(src.frames, finiteOr(base.frames, 2))));
  target.flickerHz = reduced ? 0 : finiteOr(src.flickerHz, 0);
  target.offset = finiteOr(src.offset, finiteOr(base.offset, 0));
  target.reduced = reduced;
  return target;
}

// 震屏守門：reducedFlash 或 screenShake=false 一律回 0，並以 FX.shake.max 封頂。
function resolveShake(fxConfig, baseAmp, settings) {
  if (settings && (settings.reducedFlash || settings.screenShake === false)) return 0;
  const amp = Math.max(0, finiteOr(baseAmp, 0));
  const cap = fxConfig && fxConfig.shake ? finiteOr(fxConfig.shake.max, 6) : 6;
  return Math.min(amp, cap);
}

// vignette 色彩分級：low 品質（profile.vignette=false）回傳 null 表示整層關閉。
function vignetteParams(fxConfig, environment, quality) {
  const profile = qualityProfile(fxConfig, quality);
  if (profile.vignette === false) return null;
  const table = fxConfig && fxConfig.vignette;
  return (table && table[environment]) || null;
}

// 載具生命感：怠速浮動（bobY）、移動傾斜（tiltRad，依 moveX 夾限）、影子與排氣規格。
function vehicleMotion(fxConfig, environment, time, moveX, out) {
  const table = (fxConfig && fxConfig.vehicle) || null;
  const target = out || {};
  const idle = (table && table.idle && (table.idle[environment] || table.idle.land)) || null;
  const tilt = (table && table.tilt && (table.tilt[environment] || table.tilt.land)) || null;
  target.bobY = idle ? Math.sin(finiteOr(time, 0) * finiteOr(idle.hz, 1) * TAU) * finiteOr(idle.amp, 0) : 0;
  if (tilt) {
    const raw = finiteOr(moveX, 0) * finiteOr(tilt.perUnit, 0);
    const maxRad = finiteOr(tilt.maxRad, 0);
    target.tiltRad = raw > maxRad ? maxRad : raw < -maxRad ? -maxRad : raw;
    target.tiltEase = finiteOr(tilt.ease, 8);
  } else {
    target.tiltRad = 0;
    target.tiltEase = 8;
  }
  target.shadow = (table && table.shadow && (table.shadow[environment] || table.shadow.land)) || null;
  target.exhaust = (table && table.exhaust && table.exhaust[environment]) || null;
  return target;
}

// 補給箱重繪：像素木箱樣式 + 浮動位移 + 光暈脈動（全由注入的 time 推導）。
function supplyCrateVisual(fxConfig, time, out) {
  const crate = (fxConfig && fxConfig.supplyCrate) || null;
  const target = out || {};
  if (!crate) {
    target.bobY = 0;
    target.glowAlpha = 0;
    target.glowRadius = 0;
    target.glowColor = "#ffffff";
    target.style = null;
    target.size = 0;
    return target;
  }
  const t = finiteOr(time, 0);
  target.bobY = Math.sin(t * finiteOr(crate.float.hz, 1) * TAU) * finiteOr(crate.float.amp, 0);
  target.glowAlpha = finiteOr(crate.glow.alphaMax, 0) * (0.65 + 0.35 * Math.sin(t * finiteOr(crate.glow.pulseHz, 1) * TAU));
  target.glowRadius = finiteOr(crate.glow.radius, 0);
  target.glowColor = crate.glow.color || "#ffd76a";
  target.style = crate.body;
  target.size = finiteOr(crate.size, 16);
  return target;
}

function formatBannerText(template, n) {
  const text = typeof template === "string" ? template : "";
  if (text.indexOf("{n}") < 0) return text;
  return text.split("{n}").join(n == null ? "" : String(n));
}

// 波次開場 / Boss 警告演出：以 elapsed（波次開始至今秒數）推導 in→hold→out 動畫曲線。
// reducedFlash 時 flash 恆為 0；reducedFlash 或 screenShake=false 時 shake 恆為 0。
function waveBanner(fxConfig, kind, waveNumber, elapsed, settings, out) {
  const table = fxConfig && fxConfig.waveBanner;
  const cfg = (table && (table[kind] || table.wave)) || null;
  const target = out || {};
  target.active = false;
  target.alpha = 0;
  target.scale = 1;
  target.offsetY = 0;
  target.flash = 0;
  target.shake = 0;
  target.text = "";
  target.color = cfg ? cfg.color || "#ffffff" : "#ffffff";
  target.edge = cfg ? cfg.edge || "#000000" : "#000000";
  if (!cfg || !(elapsed >= 0)) return target;
  const inTime = Math.max(0.001, finiteOr(cfg.inTime, 0.3));
  const holdTime = Math.max(0, finiteOr(cfg.holdTime, 1));
  const outTime = Math.max(0.001, finiteOr(cfg.outTime, 0.3));
  const total = inTime + holdTime + outTime;
  if (elapsed >= total) return target;
  const reduced = !!(settings && settings.reducedFlash);
  const shakeOff = reduced || !!(settings && settings.screenShake === false);
  const maxScale = finiteOr(cfg.maxScale, 1.15);
  target.active = true;
  target.offsetY = finiteOr(cfg.offsetY, -46);
  if (elapsed < inTime) {
    const t = elapsed / inTime;
    target.alpha = t;
    target.scale = maxScale - (maxScale - 1) * t;
    target.shake = shakeOff ? 0 : finiteOr(cfg.shake, 0) * (1 - t);
  } else if (elapsed < inTime + holdTime) {
    target.alpha = 1;
    target.scale = 1;
  } else {
    const t = (elapsed - inTime - holdTime) / outTime;
    target.alpha = 1 - t;
    target.scale = 1;
    target.offsetY = finiteOr(cfg.offsetY, -46) - finiteOr(cfg.riseBy, 0) * t;
  }
  const flashHz = reduced ? 0 : finiteOr(cfg.flashHz, 0);
  target.flash = flashHz > 0 ? 0.5 + 0.5 * Math.sin(elapsed * flashHz * TAU) : 0;
  target.text = formatBannerText(cfg.textTemplate, waveNumber);
  return target;
}

const DSFx = {
  createSeededRng,
  qualityProfile,
  createFxState,
  resetFxState,
  effectiveCount,
  spawnBurst,
  spawnTrailPoint,
  updateParticles,
  forEachActive,
  enemyFxKind,
  getKillBurstSpecs,
  spawnKillBurst,
  spawnHitSpark,
  environmentLayers,
  spawnEnvironmentLayer,
  muzzleFlashParams,
  resolveShake,
  vignetteParams,
  vehicleMotion,
  supplyCrateVisual,
  waveBanner
};

if (typeof window !== "undefined") window.DSFx = DSFx;
if (typeof module !== "undefined" && module.exports) module.exports = DSFx;
