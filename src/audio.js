"use strict";

/*
 * DSAudio —— 灰燼護航程序合成音效核心（Web Audio API，零音檔）。
 * 分兩層：
 *   參數層：純資料配方（RECIPES：波形／頻率曲線／噪聲濾波／ADSR 包絡／時長／音量）
 *           ＋純函式（getRecipe / shouldPlay），可在 node 直接測試。
 *   引擎層：AudioContext 單例、oscillator / noise buffer / gain / filter 節點圖、
 *           首次使用者互動（pointerdown / keydown）resume 解鎖、master gain、
 *           同音效 50ms 內重複觸發合併（節流）。
 * 鐵則：本檔不得直用系統時鐘、全域亂數與計時器；引擎時間一律取
 * AudioContext.currentTime，抖動一律用注入 rng 或確定性種子 rng（createSeededRng）。
 * 音色方向：低調沉穩的末日像素風，短促、悶、不刺耳。
 */

const GLOBAL_ROOT = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null;

const THROTTLE_MS = 50;
const MASTER_VOLUME = 0.8;
const NOISE_SECONDS = 1;
const NOISE_SEED = 1337;
const DEFAULT_RNG_SEED = 20260707;

const OSC_WAVES = ["sine", "triangle", "square", "sawtooth"];
const NOISE_FILTERS = ["lowpass", "highpass", "bandpass"];

const EVENT_NAMES = ["shoot", "hit", "kill", "bossWarn", "bossKill", "pickup", "hurt", "gateChoice", "gateBreak", "alarm", "ui", "waveStart"];

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  const number = finiteOr(value, 0);
  if (number < 0) return 0;
  if (number > 1) return 1;
  return number;
}

// 確定性種子亂數（mulberry32）：同 seed 必產生同序列（與 DSFx 同款）。
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

/* ──────────────────────────── 參數層：音效配方（純資料） ────────────────────────────
 * recipe = { duration（秒，<= 2）, volume（0..1）, layers: [layer...] }
 * layer  = {
 *   kind: "osc" | "noise",
 *   wave / freqStart / freqEnd / freqCurve（osc）,
 *   filterType / filterFreq / filterQ（noise）,
 *   delay / duration（相對配方起點的秒數）,
 *   attack / decay / sustain / release（ADSR；sustain 為 0..1 相對電平）,
 *   gain（0..1 層音量）, detuneJitter（±cents，由注入 rng 決定；0 = 無抖動）
 * }
 */
const RECIPES = {
  // 射擊：每載具一種音色（land 沉悶槍響／sea 厚重炮聲／air 快速氣槍／space 電漿嗶）。
  shoot: {
    defaultVariant: "land_rig",
    variants: {
      land_rig: {
        duration: 0.14,
        volume: 0.3,
        layers: [
          { kind: "noise", filterType: "lowpass", filterFreq: 520, filterQ: 0.8, delay: 0, duration: 0.12, attack: 0.002, decay: 0.05, sustain: 0.25, release: 0.05, gain: 0.7, detuneJitter: 0 },
          { kind: "osc", wave: "triangle", freqStart: 150, freqEnd: 70, freqCurve: "exp", delay: 0, duration: 0.12, attack: 0.002, decay: 0.06, sustain: 0.2, release: 0.04, gain: 0.55, detuneJitter: 6 }
        ]
      },
      sea_ark: {
        duration: 0.34,
        volume: 0.34,
        layers: [
          { kind: "osc", wave: "sine", freqStart: 96, freqEnd: 44, freqCurve: "exp", delay: 0, duration: 0.3, attack: 0.004, decay: 0.14, sustain: 0.3, release: 0.1, gain: 0.8, detuneJitter: 4 },
          { kind: "noise", filterType: "lowpass", filterFreq: 300, filterQ: 0.7, delay: 0, duration: 0.22, attack: 0.003, decay: 0.09, sustain: 0.2, release: 0.08, gain: 0.5, detuneJitter: 0 }
        ]
      },
      sky_barge: {
        duration: 0.09,
        volume: 0.22,
        layers: [
          { kind: "noise", filterType: "bandpass", filterFreq: 1900, filterQ: 1, delay: 0, duration: 0.07, attack: 0.001, decay: 0.03, sustain: 0.15, release: 0.02, gain: 0.6, detuneJitter: 0 },
          { kind: "osc", wave: "triangle", freqStart: 420, freqEnd: 250, freqCurve: "exp", delay: 0, duration: 0.07, attack: 0.001, decay: 0.03, sustain: 0.15, release: 0.02, gain: 0.4, detuneJitter: 8 }
        ]
      },
      void_runner: {
        duration: 0.11,
        volume: 0.2,
        layers: [
          { kind: "osc", wave: "square", freqStart: 640, freqEnd: 320, freqCurve: "exp", delay: 0, duration: 0.09, attack: 0.001, decay: 0.04, sustain: 0.2, release: 0.03, gain: 0.42, detuneJitter: 10 },
          { kind: "osc", wave: "sine", freqStart: 320, freqEnd: 160, freqCurve: "exp", delay: 0, duration: 0.09, attack: 0.001, decay: 0.04, sustain: 0.2, release: 0.03, gain: 0.3, detuneJitter: 0 }
        ]
      }
    }
  },
  // 命中：短促悶擊。
  hit: {
    duration: 0.08,
    volume: 0.24,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFreq: 720, filterQ: 0.8, delay: 0, duration: 0.06, attack: 0.001, decay: 0.025, sustain: 0.2, release: 0.02, gain: 0.6, detuneJitter: 0 },
      { kind: "osc", wave: "triangle", freqStart: 210, freqEnd: 120, freqCurve: "lin", delay: 0, duration: 0.06, attack: 0.001, decay: 0.025, sustain: 0.2, release: 0.02, gain: 0.4, detuneJitter: 6 }
    ]
  },
  // 擊殺：碎裂噗聲＋低頻 thump。
  kill: {
    duration: 0.3,
    volume: 0.34,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFreq: 880, filterQ: 0.8, delay: 0, duration: 0.16, attack: 0.002, decay: 0.07, sustain: 0.18, release: 0.05, gain: 0.6, detuneJitter: 0 },
      { kind: "osc", wave: "sine", freqStart: 130, freqEnd: 42, freqCurve: "exp", delay: 0, duration: 0.26, attack: 0.003, decay: 0.12, sustain: 0.25, release: 0.08, gain: 0.8, detuneJitter: 5 }
    ]
  },
  // Boss 警告：雙音低鳴警報＋底鳴。
  bossWarn: {
    duration: 1,
    volume: 0.38,
    layers: [
      { kind: "osc", wave: "sine", freqStart: 108, freqEnd: 108, freqCurve: "lin", delay: 0, duration: 0.4, attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.12, gain: 0.7, detuneJitter: 0 },
      { kind: "osc", wave: "sine", freqStart: 81, freqEnd: 81, freqCurve: "lin", delay: 0.46, duration: 0.5, attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.14, gain: 0.7, detuneJitter: 0 },
      { kind: "osc", wave: "triangle", freqStart: 54, freqEnd: 54, freqCurve: "lin", delay: 0, duration: 0.96, attack: 0.08, decay: 0.2, sustain: 0.5, release: 0.2, gain: 0.25, detuneJitter: 0 }
    ]
  },
  // Boss 死亡：多層爆炸轟鳴（分段噪聲＋雙低頻下滑）。
  bossKill: {
    duration: 1.8,
    volume: 0.5,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFreq: 420, filterQ: 0.8, delay: 0, duration: 0.5, attack: 0.003, decay: 0.22, sustain: 0.3, release: 0.15, gain: 0.85, detuneJitter: 0 },
      { kind: "noise", filterType: "bandpass", filterFreq: 950, filterQ: 0.9, delay: 0.05, duration: 0.3, attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.08, gain: 0.5, detuneJitter: 0 },
      { kind: "noise", filterType: "lowpass", filterFreq: 240, filterQ: 0.7, delay: 0.18, duration: 0.8, attack: 0.01, decay: 0.35, sustain: 0.25, release: 0.25, gain: 0.7, detuneJitter: 0 },
      { kind: "osc", wave: "sine", freqStart: 90, freqEnd: 28, freqCurve: "exp", delay: 0, duration: 1.4, attack: 0.004, decay: 0.6, sustain: 0.25, release: 0.4, gain: 0.9, detuneJitter: 0 },
      { kind: "osc", wave: "sine", freqStart: 60, freqEnd: 24, freqCurve: "exp", delay: 0.3, duration: 1.4, attack: 0.01, decay: 0.6, sustain: 0.2, release: 0.4, gain: 0.6, detuneJitter: 0 }
    ]
  },
  // 拾取：明亮三音上行（C5 → E5 → G5）。
  pickup: {
    duration: 0.4,
    volume: 0.26,
    layers: [
      { kind: "osc", wave: "triangle", freqStart: 523.25, freqEnd: 523.25, freqCurve: "lin", delay: 0, duration: 0.1, attack: 0.004, decay: 0.04, sustain: 0.4, release: 0.04, gain: 0.55, detuneJitter: 0 },
      { kind: "osc", wave: "triangle", freqStart: 659.25, freqEnd: 659.25, freqCurve: "lin", delay: 0.11, duration: 0.1, attack: 0.004, decay: 0.04, sustain: 0.4, release: 0.04, gain: 0.55, detuneJitter: 0 },
      { kind: "osc", wave: "triangle", freqStart: 783.99, freqEnd: 783.99, freqCurve: "lin", delay: 0.22, duration: 0.14, attack: 0.004, decay: 0.05, sustain: 0.45, release: 0.06, gain: 0.6, detuneJitter: 0 }
    ]
  },
  // 受傷：低沉受擊 thud。
  hurt: {
    duration: 0.22,
    volume: 0.32,
    layers: [
      { kind: "osc", wave: "sine", freqStart: 110, freqEnd: 48, freqCurve: "exp", delay: 0, duration: 0.2, attack: 0.002, decay: 0.09, sustain: 0.25, release: 0.06, gain: 0.8, detuneJitter: 4 },
      { kind: "noise", filterType: "lowpass", filterFreq: 260, filterQ: 0.7, delay: 0, duration: 0.14, attack: 0.002, decay: 0.06, sustain: 0.2, release: 0.05, gain: 0.5, detuneJitter: 0 }
    ]
  },
  // 閘門選擇：正向確認聲（G4 → C5 上行雙音）。
  gateChoice: {
    duration: 0.26,
    volume: 0.24,
    layers: [
      { kind: "osc", wave: "triangle", freqStart: 392, freqEnd: 392, freqCurve: "lin", delay: 0, duration: 0.1, attack: 0.004, decay: 0.04, sustain: 0.4, release: 0.04, gain: 0.55, detuneJitter: 0 },
      { kind: "osc", wave: "triangle", freqStart: 523.25, freqEnd: 523.25, freqCurve: "lin", delay: 0.1, duration: 0.14, attack: 0.004, decay: 0.05, sustain: 0.45, release: 0.06, gain: 0.6, detuneJitter: 0 }
    ]
  },
  // 破門：金屬核心裂開，低頻撞擊加短促亮音。
  gateBreak: {
    duration: 0.46,
    volume: 0.36,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFreq: 980, filterQ: 1, delay: 0, duration: 0.16, attack: 0.002, decay: 0.07, sustain: 0.2, release: 0.06, gain: 0.6, detuneJitter: 0 },
      { kind: "osc", wave: "triangle", freqStart: 220, freqEnd: 82, freqCurve: "exp", delay: 0, duration: 0.28, attack: 0.002, decay: 0.12, sustain: 0.22, release: 0.08, gain: 0.72, detuneJitter: 4 },
      { kind: "osc", wave: "sine", freqStart: 659.25, freqEnd: 523.25, freqCurve: "lin", delay: 0.1, duration: 0.16, attack: 0.004, decay: 0.05, sustain: 0.35, release: 0.05, gain: 0.34, detuneJitter: 0 }
    ]
  },
  // 警報：短促雙脈衝，不覆蓋 Boss 長警告。
  alarm: {
    duration: 0.5,
    volume: 0.3,
    layers: [
      { kind: "osc", wave: "sine", freqStart: 740, freqEnd: 740, freqCurve: "lin", delay: 0, duration: 0.14, attack: 0.006, decay: 0.04, sustain: 0.58, release: 0.04, gain: 0.45, detuneJitter: 0 },
      { kind: "osc", wave: "sine", freqStart: 740, freqEnd: 740, freqCurve: "lin", delay: 0.22, duration: 0.14, attack: 0.006, decay: 0.04, sustain: 0.58, release: 0.04, gain: 0.45, detuneJitter: 0 },
      { kind: "noise", filterType: "highpass", filterFreq: 1200, filterQ: 0.8, delay: 0, duration: 0.42, attack: 0.004, decay: 0.12, sustain: 0.12, release: 0.08, gain: 0.18, detuneJitter: 0 }
    ]
  },
  // UI：低調確認 tick。
  ui: {
    duration: 0.12,
    volume: 0.18,
    layers: [
      { kind: "osc", wave: "triangle", freqStart: 660, freqEnd: 520, freqCurve: "lin", delay: 0, duration: 0.09, attack: 0.002, decay: 0.03, sustain: 0.22, release: 0.03, gain: 0.45, detuneJitter: 0 }
    ]
  },
  // 波次開始：短小軍鼓感 tick（雙擊噪聲）。
  waveStart: {
    duration: 0.18,
    volume: 0.2,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFreq: 1700, filterQ: 1.3, delay: 0, duration: 0.06, attack: 0.001, decay: 0.025, sustain: 0.15, release: 0.02, gain: 0.6, detuneJitter: 0 },
      { kind: "noise", filterType: "bandpass", filterFreq: 1500, filterQ: 1.3, delay: 0.08, duration: 0.08, attack: 0.001, decay: 0.03, sustain: 0.15, release: 0.03, gain: 0.5, detuneJitter: 0 }
    ]
  }
};

// 取配方：帶 variants 的事件（shoot）以 variant 取音色，缺席時退回 defaultVariant。
function getRecipe(name, variant) {
  const entry = RECIPES[name];
  if (!entry) return null;
  if (entry.variants) {
    if (variant && entry.variants[variant]) return entry.variants[variant];
    return entry.variants[entry.defaultVariant] || null;
  }
  return entry;
}

// 節流（純函式）：同 key 在 throttleMs 內重複觸發回 false（合併），不更新時間戳。
function shouldPlay(throttleState, key, nowMs, throttleMs) {
  if (!throttleState || typeof key !== "string") return false;
  const windowMs = Math.max(0, finiteOr(throttleMs, THROTTLE_MS));
  const last = throttleState[key];
  if (Number.isFinite(last) && nowMs - last < windowMs) return false;
  throttleState[key] = finiteOr(nowMs, 0);
  return true;
}

/* ──────────────────────────── 引擎層：AudioContext 節點圖 ──────────────────────────── */

function createEngine(options) {
  const opts = options || {};
  return {
    context: opts.context || null,
    contextFactory: typeof opts.contextFactory === "function" ? opts.contextFactory : null,
    master: null,
    masterVolume: clamp01(finiteOr(opts.masterVolume, MASTER_VOLUME)),
    throttleMs: Math.max(0, finiteOr(opts.throttleMs, THROTTLE_MS)),
    lastPlayedMs: {},
    rng: typeof opts.rng === "function" ? opts.rng : createSeededRng(finiteOr(opts.seed, DEFAULT_RNG_SEED)),
    noiseBuffer: null,
    failed: false,
    stats: { played: 0, throttled: 0, nodesCreated: 0 }
  };
}

function defaultContextFactory(root) {
  const scope = root || GLOBAL_ROOT;
  const Ctor = scope && (scope.AudioContext || scope.webkitAudioContext);
  if (typeof Ctor !== "function") return null;
  return new Ctor();
}

function ensureContext(engine, root) {
  if (!engine || engine.failed) return null;
  if (!engine.context) {
    try {
      engine.context = engine.contextFactory ? engine.contextFactory() : defaultContextFactory(root);
    } catch (error) {
      engine.context = null;
    }
    if (!engine.context) {
      engine.failed = true;
      return null;
    }
  }
  if (!engine.master) {
    try {
      engine.master = engine.context.createGain();
      engine.master.gain.value = engine.masterVolume;
      engine.master.connect(engine.context.destination);
    } catch (error) {
      engine.master = null;
      engine.failed = true;
      return null;
    }
  }
  return engine.context;
}

// 確定性噪聲緩衝：以固定 seed 生成，同 context 只建一次並重複使用。
function ensureNoiseBuffer(engine) {
  if (engine.noiseBuffer) return engine.noiseBuffer;
  const ctx = engine.context;
  const rate = finiteOr(ctx.sampleRate, 44100);
  const length = Math.max(1, Math.floor(rate * NOISE_SECONDS));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const rng = createSeededRng(NOISE_SEED);
  for (let i = 0; i < data.length; i += 1) data[i] = rng() * 2 - 1;
  engine.noiseBuffer = buffer;
  return buffer;
}

// ADSR 包絡：attack 線性升至峰值 → decay 落至 sustain 電平 → 尾端 release 收至近零。
function applyEnvelope(param, start, layer, peak, duration) {
  const attack = Math.max(0.001, finiteOr(layer.attack, 0.005));
  const decay = Math.max(0, finiteOr(layer.decay, 0.05));
  const release = Math.max(0.005, finiteOr(layer.release, 0.04));
  const level = Math.max(0.0001, peak);
  const sustainLevel = Math.max(0.0001, peak * clamp01(finiteOr(layer.sustain, 0.5)));
  const end = start + duration;
  const attackEnd = Math.min(end, start + attack);
  const decayEnd = Math.min(end, attackEnd + decay);
  const releaseStart = Math.max(decayEnd, end - release);
  param.setValueAtTime(0.0001, start);
  param.linearRampToValueAtTime(level, attackEnd);
  param.linearRampToValueAtTime(sustainLevel, decayEnd);
  if (releaseStart > decayEnd) param.setValueAtTime(sustainLevel, releaseStart);
  param.linearRampToValueAtTime(0.0001, end + 0.01);
}

// 單層節點圖：osc → env → master 或 noise → filter → env → master；回傳建立的節點數。
function buildLayer(engine, layer, t0, volume) {
  const ctx = engine.context;
  const start = t0 + Math.max(0, finiteOr(layer.delay, 0));
  const duration = Math.max(0.01, finiteOr(layer.duration, 0.1));
  let created = 0;

  const env = ctx.createGain();
  created += 1;
  applyEnvelope(env.gain, start, layer, clamp01(finiteOr(layer.gain, 0.5)) * clamp01(volume), duration);
  env.connect(engine.master);

  let source = null;
  if (layer.kind === "noise") {
    source = ctx.createBufferSource();
    created += 1;
    source.buffer = ensureNoiseBuffer(engine);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    created += 1;
    filter.type = NOISE_FILTERS.indexOf(layer.filterType) >= 0 ? layer.filterType : "lowpass";
    const freq = Math.max(20, finiteOr(layer.filterFreq, 600));
    if (filter.frequency && typeof filter.frequency.setValueAtTime === "function") filter.frequency.setValueAtTime(freq, start);
    else if (filter.frequency) filter.frequency.value = freq;
    if (filter.Q) filter.Q.value = Math.max(0.0001, finiteOr(layer.filterQ, 1));
    source.connect(filter);
    filter.connect(env);
  } else {
    source = ctx.createOscillator();
    created += 1;
    source.type = OSC_WAVES.indexOf(layer.wave) >= 0 ? layer.wave : "sine";
    const freqStart = Math.max(1, finiteOr(layer.freqStart, 220));
    const freqEnd = Math.max(1, finiteOr(layer.freqEnd, freqStart));
    if (source.frequency && typeof source.frequency.setValueAtTime === "function") {
      source.frequency.setValueAtTime(freqStart, start);
      if (freqEnd !== freqStart) {
        if (layer.freqCurve === "exp" && typeof source.frequency.exponentialRampToValueAtTime === "function") {
          source.frequency.exponentialRampToValueAtTime(freqEnd, start + duration);
        } else if (typeof source.frequency.linearRampToValueAtTime === "function") {
          source.frequency.linearRampToValueAtTime(freqEnd, start + duration);
        }
      }
    } else if (source.frequency) {
      source.frequency.value = freqStart;
    }
    const jitter = Math.max(0, finiteOr(layer.detuneJitter, 0));
    if (jitter > 0 && source.detune) source.detune.value = (engine.rng() * 2 - 1) * jitter;
    source.connect(env);
  }

  if (typeof source.start === "function") source.start(start);
  if (typeof source.stop === "function") source.stop(start + duration + 0.05);
  engine.stats.nodesCreated += created;
  return created;
}

// 引擎播放：解析配方 → 節流判定 → 建節點圖；回傳本次建立的節點數（0 = 未播放）。
function playEvent(engine, name, options, root) {
  if (!engine) return 0;
  const opts = options || {};
  const recipe = getRecipe(name, opts.variant);
  if (!recipe || !Array.isArray(recipe.layers) || recipe.layers.length === 0) return 0;
  const ctx = ensureContext(engine, root);
  if (!ctx) return 0;
  const key = opts.variant ? `${name}:${opts.variant}` : name;
  const nowMs = finiteOr(ctx.currentTime, 0) * 1000;
  if (!shouldPlay(engine.lastPlayedMs, key, nowMs, engine.throttleMs)) {
    engine.stats.throttled += 1;
    return 0;
  }
  const t0 = finiteOr(ctx.currentTime, 0) + 0.001;
  const volume = clamp01(finiteOr(recipe.volume, 0.3) * clamp01(finiteOr(opts.volume, 1)));
  let created = 0;
  for (let i = 0; i < recipe.layers.length; i += 1) {
    created += buildLayer(engine, recipe.layers[i], t0, volume);
  }
  engine.stats.played += 1;
  return created;
}

/* ──────────────────────── 預設單例＋autoplay 解鎖（頁面用） ──────────────────────── */

let defaultEngine = null;
let gestureSeen = false;
let unlockInstalled = false;

function getDefaultEngine() {
  if (!defaultEngine) defaultEngine = createEngine({});
  return defaultEngine;
}

function resumeContext(engine) {
  if (!engine || !engine.context) return false;
  const ctx = engine.context;
  if (ctx.state === "suspended" && typeof ctx.resume === "function") {
    try {
      const result = ctx.resume();
      if (result && typeof result.catch === "function") result.catch(() => {});
      return true;
    } catch (error) {
      return false;
    }
  }
  return ctx.state !== "suspended";
}

// 首次使用者互動解鎖：resume 既有 context；context 尚未建立時記錄手勢供之後補 resume。
function unlock() {
  gestureSeen = true;
  const engine = getDefaultEngine();
  ensureContext(engine, GLOBAL_ROOT);
  resumeContext(engine);
  return !!(engine && engine.context && !engine.failed);
}

function installUnlockHandlers(target) {
  const scope = target || GLOBAL_ROOT;
  if (unlockInstalled || !scope || typeof scope.addEventListener !== "function") return false;
  unlockInstalled = true;
  const handler = function handleFirstGesture() {
    unlock();
  };
  scope.addEventListener("pointerdown", handler, { passive: true });
  scope.addEventListener("touchstart", handler, { passive: true });
  scope.addEventListener("keydown", handler);
  return true;
}

// 頁面入口：以預設單例播放；呼叫端（game.js）負責 settings.sound === false 時不呼叫本函式。
function play(name, options) {
  const engine = getDefaultEngine();
  if (gestureSeen) {
    ensureContext(engine, GLOBAL_ROOT);
    resumeContext(engine);
  }
  const created = playEvent(engine, name, options, GLOBAL_ROOT);
  if (gestureSeen) resumeContext(engine);
  return created;
}

function resetForTests() {
  defaultEngine = null;
  gestureSeen = false;
  unlockInstalled = false;
}

const DSAudio = {
  EVENT_NAMES,
  RECIPES,
  THROTTLE_MS,
  MASTER_VOLUME,
  createSeededRng,
  getRecipe,
  shouldPlay,
  createEngine,
  ensureContext,
  playEvent,
  play,
  unlock,
  installUnlockHandlers,
  getDefaultEngine,
  _resetForTests: resetForTests
};

if (typeof window !== "undefined") window.DSAudio = DSAudio;
if (typeof module !== "undefined" && module.exports) module.exports = DSAudio;
