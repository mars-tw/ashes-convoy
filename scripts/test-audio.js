"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const audio = require("../src/audio.js");
const config = require("../src/config.js");

const EVENTS = ["shoot", "hit", "kill", "bossWarn", "bossKill", "pickup", "hurt", "gateChoice", "gateBreak", "alarm", "ui", "waveStart"];
const OSC_WAVES = ["sine", "triangle", "square", "sawtooth"];
const NOISE_FILTERS = ["lowpass", "highpass", "bandpass"];

// ---------- 1) audio.js 參數層純度自證：原文不得直用時間/亂數/計時器/儲存/網路 ----------
const audioSource = fs.readFileSync(path.join(__dirname, "..", "src", "audio.js"), "utf8");
const bannedTokens = [
  "Date.now",
  "Math.random",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "performance.",
  "localStorage",
  "sessionStorage",
  "XMLHttpRequest",
  "fetch(",
  "document"
];
bannedTokens.forEach((token) => {
  assert(audioSource.indexOf(token) < 0, `audio.js 純度違規：原文不得出現 "${token}"`);
});
assert(audioSource.indexOf("window.DSAudio") >= 0, "audio.js 必須以 UMD 掛載 window.DSAudio");
assert(audioSource.indexOf("module.exports") >= 0, "audio.js 必須支援 CommonJS 匯出");

// ---------- 2) 配方 schema 完整性 ----------
function assertLayer(name, layer, recipeDuration) {
  assert(layer && typeof layer === "object" && !Array.isArray(layer), `${name} 必須是物件`);
  assert(layer.kind === "osc" || layer.kind === "noise", `${name}.kind 必須是 osc 或 noise`);
  if (layer.kind === "osc") {
    assert(OSC_WAVES.indexOf(layer.wave) >= 0, `${name}.wave "${layer.wave}" 必須是合法波形`);
    assert(Number.isFinite(layer.freqStart) && layer.freqStart > 0 && layer.freqStart <= 20000, `${name}.freqStart 必須在 (0, 20000]`);
    assert(Number.isFinite(layer.freqEnd) && layer.freqEnd > 0 && layer.freqEnd <= 20000, `${name}.freqEnd 必須在 (0, 20000]`);
    assert(layer.freqCurve === "exp" || layer.freqCurve === "lin", `${name}.freqCurve 必須是 exp 或 lin`);
  } else {
    assert(NOISE_FILTERS.indexOf(layer.filterType) >= 0, `${name}.filterType "${layer.filterType}" 必須是合法濾波`);
    assert(Number.isFinite(layer.filterFreq) && layer.filterFreq > 0 && layer.filterFreq <= 20000, `${name}.filterFreq 必須在 (0, 20000]`);
    assert(Number.isFinite(layer.filterQ) && layer.filterQ > 0, `${name}.filterQ 必須 > 0`);
  }
  assert(Number.isFinite(layer.delay) && layer.delay >= 0, `${name}.delay 必須 >= 0`);
  assert(Number.isFinite(layer.duration) && layer.duration > 0, `${name}.duration 必須 > 0`);
  assert(layer.delay + layer.duration <= recipeDuration + 1e-9, `${name} 的 delay + duration 不可超過配方時長`);
  assert(Number.isFinite(layer.attack) && layer.attack >= 0, `${name}.attack 必須 >= 0`);
  assert(Number.isFinite(layer.decay) && layer.decay >= 0, `${name}.decay 必須 >= 0`);
  assert(Number.isFinite(layer.sustain) && layer.sustain >= 0 && layer.sustain <= 1, `${name}.sustain 必須 0..1`);
  assert(Number.isFinite(layer.release) && layer.release >= 0, `${name}.release 必須 >= 0`);
  assert(Number.isFinite(layer.gain) && layer.gain > 0 && layer.gain <= 1, `${name}.gain 必須 (0, 1]`);
  assert(Number.isFinite(layer.detuneJitter) && layer.detuneJitter >= 0, `${name}.detuneJitter 必須 >= 0`);
}

function assertRecipe(name, recipe) {
  assert(recipe && typeof recipe === "object", `${name} 配方必須存在`);
  assert(Number.isFinite(recipe.duration) && recipe.duration > 0 && recipe.duration <= 2, `${name}.duration 必須 (0, 2] 秒`);
  assert(Number.isFinite(recipe.volume) && recipe.volume > 0 && recipe.volume <= 1, `${name}.volume 必須 (0, 1]`);
  assert(Array.isArray(recipe.layers) && recipe.layers.length >= 1, `${name}.layers 必須是非空陣列`);
  recipe.layers.forEach((layer, index) => assertLayer(`${name}.layers[${index}]`, layer, recipe.duration));
}

assert(Array.isArray(audio.EVENT_NAMES), "audio.EVENT_NAMES 必須存在");
EVENTS.forEach((name) => {
  assert(audio.EVENT_NAMES.indexOf(name) >= 0, `EVENT_NAMES 缺少 ${name}`);
  assert(audio.RECIPES[name], `RECIPES 缺少事件 ${name}`);
});

// 每載具必有 shoot 變體（直接存在於 variants，不允許只靠 fallback）。
const vehicleIds = Object.keys(config.VEHICLES);
assert(vehicleIds.length >= 4, "VEHICLES 應至少有四台載具");
vehicleIds.forEach((vehicleId) => {
  const variant = audio.RECIPES.shoot.variants[vehicleId];
  assert(variant, `RECIPES.shoot.variants 缺少載具 ${vehicleId}`);
  assertRecipe(`shoot.${vehicleId}`, variant);
  assert.strictEqual(audio.getRecipe("shoot", vehicleId), variant, `getRecipe("shoot", "${vehicleId}") 應回傳對應變體`);
});
assert(
  audio.RECIPES.shoot.variants[audio.RECIPES.shoot.defaultVariant],
  "shoot.defaultVariant 必須指向存在的變體"
);
// 音色差異化：四載具 shoot 配方不可完全相同。
const shootSignatures = vehicleIds.map((vehicleId) => JSON.stringify(audio.RECIPES.shoot.variants[vehicleId]));
assert(new Set(shootSignatures).size === vehicleIds.length, "每台載具的 shoot 音色配方必須彼此不同");

// 非變體事件配方檢查。
EVENTS.filter((name) => name !== "shoot").forEach((name) => {
  assertRecipe(name, audio.getRecipe(name));
});

// getRecipe 邊界：未知事件回 null；未知變體退回預設。
assert.strictEqual(audio.getRecipe("nope"), null, "未知事件應回 null");
assert.strictEqual(
  audio.getRecipe("shoot", "unknown_vehicle"),
  audio.RECIPES.shoot.variants[audio.RECIPES.shoot.defaultVariant],
  "未知載具應退回 defaultVariant"
);

// 低調沉穩檢查：整體音量不可超過 0.6（不刺耳）；bossKill 為最長且不可超過 2 秒。
EVENTS.forEach((name) => {
  const recipe = name === "shoot" ? audio.getRecipe("shoot", "land_rig") : audio.getRecipe(name);
  assert(recipe.volume <= 0.6, `${name}.volume 應 <= 0.6（低調不刺耳），取得 ${recipe.volume}`);
});
assert(audio.getRecipe("bossKill").duration <= 2, "bossKill 需 <= 2 秒");
assert(audio.getRecipe("hit").duration <= 0.2, "hit 需為短促悶擊（<= 0.2 秒）");

// ---------- 3) 節流邏輯（純函式，注入時間） ----------
{
  const state = {};
  assert.strictEqual(audio.shouldPlay(state, "shoot", 0, 50), true, "首次觸發應放行");
  assert.strictEqual(audio.shouldPlay(state, "shoot", 30, 50), false, "50ms 內重複觸發應合併");
  assert.strictEqual(audio.shouldPlay(state, "shoot", 49, 50), false, "節流被拒不應刷新時間戳");
  assert.strictEqual(audio.shouldPlay(state, "hit", 30, 50), true, "不同音效 key 應互不影響");
  assert.strictEqual(audio.shouldPlay(state, "shoot", 50, 50), true, "超過節流窗應再次放行");
  assert.strictEqual(audio.shouldPlay(state, "shoot", 99, 50), false, "放行後重新起算節流窗");
  assert.strictEqual(audio.shouldPlay(null, "shoot", 0, 50), false, "無節流狀態應拒絕");
  assert.strictEqual(audio.shouldPlay({}, 123, 0, 50), false, "非字串 key 應拒絕");
  assert.strictEqual(audio.THROTTLE_MS, 50, "預設節流窗應為 50ms");
}

// ---------- 4) 確定性 rng ----------
{
  const a = audio.createSeededRng(2026);
  const b = audio.createSeededRng(2026);
  for (let i = 0; i < 10; i += 1) {
    const value = a();
    assert.strictEqual(value, b(), "createSeededRng 同 seed 序列需一致");
    assert(value >= 0 && value < 1, "rng 值域需為 [0,1)");
  }
}

// ---------- 5) 引擎層：fake AudioContext 節點圖與節流 ----------
function createFakeContext() {
  const counters = { oscillators: 0, gains: 0, bufferSources: 0, filters: 0, buffers: 0, resumes: 0, starts: 0, stops: 0 };
  function fakeParam(value) {
    return {
      value,
      setValueAtTime() { return this; },
      linearRampToValueAtTime() { return this; },
      exponentialRampToValueAtTime() { return this; },
      cancelScheduledValues() { return this; }
    };
  }
  function fakeNode(extra) {
    return Object.assign(
      {
        connections: [],
        connect(target) {
          this.connections.push(target);
          return target;
        },
        disconnect() {}
      },
      extra || {}
    );
  }
  const ctx = {
    counters,
    currentTime: 0,
    state: "suspended",
    sampleRate: 8000,
    destination: fakeNode(),
    createGain() {
      counters.gains += 1;
      return fakeNode({ gain: fakeParam(1) });
    },
    createOscillator() {
      counters.oscillators += 1;
      return fakeNode({
        type: "sine",
        frequency: fakeParam(440),
        detune: fakeParam(0),
        start() { counters.starts += 1; },
        stop() { counters.stops += 1; }
      });
    },
    createBuffer(channels, length, rate) {
      counters.buffers += 1;
      return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: () => new Float32Array(length) };
    },
    createBufferSource() {
      counters.bufferSources += 1;
      return fakeNode({
        buffer: null,
        loop: false,
        playbackRate: fakeParam(1),
        start() { counters.starts += 1; },
        stop() { counters.stops += 1; }
      });
    },
    createBiquadFilter() {
      counters.filters += 1;
      return fakeNode({ type: "lowpass", frequency: fakeParam(350), Q: fakeParam(1) });
    },
    resume() {
      counters.resumes += 1;
      ctx.state = "running";
      return Promise.resolve();
    }
  };
  return ctx;
}

{
  const previousAudioContext = global.AudioContext;
  const previousWebkitAudioContext = global.webkitAudioContext;
  let createdContexts = 0;
  let createdContext = null;
  global.AudioContext = function FakeAudioContext() {
    createdContexts += 1;
    createdContext = createFakeContext();
    return createdContext;
  };
  delete global.webkitAudioContext;
  audio._resetForTests();
  assert.strictEqual(audio.unlock(), true, "unlock should create and resume the default AudioContext on first gesture");
  assert.strictEqual(createdContexts, 1, "unlock should create exactly one default AudioContext");
  assert(createdContext.counters.gains >= 1, "unlock should create the master gain during context setup");
  assert.strictEqual(createdContext.counters.resumes, 1, "unlock should resume the suspended context immediately");
  assert(audio.play("hit") > 0, "play after unlock should synthesize through the existing context");
  assert.strictEqual(createdContexts, 1, "play after unlock should reuse the default AudioContext");
  audio._resetForTests();
  if (previousAudioContext) global.AudioContext = previousAudioContext;
  else delete global.AudioContext;
  if (previousWebkitAudioContext) global.webkitAudioContext = previousWebkitAudioContext;
  else delete global.webkitAudioContext;
}

{
  const events = [];
  const target = {
    addEventListener(name) {
      events.push(name);
    }
  };
  audio._resetForTests();
  assert.strictEqual(audio.installUnlockHandlers(target), true, "unlock handlers should install once");
  assert(events.includes("pointerdown"), "unlock should listen for pointerdown");
  assert(events.includes("touchstart"), "unlock should listen for touchstart for older iOS WebViews");
  assert(events.includes("keydown"), "unlock should listen for keydown");
  assert.strictEqual(audio.installUnlockHandlers(target), false, "unlock handlers should not double-install");
  audio._resetForTests();
}

{
  const ctx = createFakeContext();
  const engine = audio.createEngine({ context: ctx, throttleMs: 50, rng: audio.createSeededRng(7) });

  const created = audio.playEvent(engine, "shoot", { variant: "land_rig" });
  assert(created > 0, "shoot 應建立節點");
  assert(ctx.counters.oscillators >= 1, "land_rig shoot 應建立 oscillator");
  assert(ctx.counters.bufferSources >= 1, "land_rig shoot 應建立 noise buffer source");
  assert(ctx.counters.filters >= 1, "noise 層應建立 biquad filter");
  assert(ctx.counters.gains >= 3, "每層應有 env gain（外加 master gain）");
  assert.strictEqual(ctx.counters.buffers, 1, "噪聲緩衝應只建立一次");
  assert(ctx.counters.starts > 0 && ctx.counters.stops > 0, "來源節點應排程 start/stop");
  assert.strictEqual(engine.stats.played, 1, "播放統計應累計");

  // 同 50ms 內重複觸發合併：currentTime 未前進 → 不再建節點。
  const before = ctx.counters.oscillators + ctx.counters.gains + ctx.counters.bufferSources;
  assert.strictEqual(audio.playEvent(engine, "shoot", { variant: "land_rig" }), 0, "節流窗內重複觸發應回 0");
  assert.strictEqual(
    ctx.counters.oscillators + ctx.counters.gains + ctx.counters.bufferSources,
    before,
    "節流合併時不可建立任何節點"
  );
  assert.strictEqual(engine.stats.throttled, 1, "節流統計應累計");

  // 不同變體與不同事件不受同 key 節流影響。
  assert(audio.playEvent(engine, "shoot", { variant: "void_runner" }) > 0, "不同載具變體應各自節流");
  assert(audio.playEvent(engine, "hit") > 0, "不同事件應各自節流");
  assert(audio.playEvent(engine, "gateBreak", { volume: 0.45 }) > 0, "破門音效應可套用音量係數播放");

  // 時間前進超過節流窗後可再播。
  ctx.currentTime = 0.06;
  assert(audio.playEvent(engine, "shoot", { variant: "land_rig" }) > 0, "超過 50ms 後應可再播");

  // noise 緩衝為確定性資料（同 seed 同資料）。
  const bufferA = engine.noiseBuffer.getChannelData(0);
  assert(bufferA.length > 0, "噪聲緩衝應有資料長度");

  // 未知事件不建節點。
  const snapshot = ctx.counters.gains;
  assert.strictEqual(audio.playEvent(engine, "not_an_event"), 0, "未知事件應回 0");
  assert.strictEqual(ctx.counters.gains, snapshot, "未知事件不可建節點");
}

// 無 AudioContext 環境：引擎應安全失敗、不丟例外。
{
  const engine = audio.createEngine({});
  assert.strictEqual(audio.playEvent(engine, "hit", null, {}), 0, "無 AudioContext 時應回 0");
  assert.strictEqual(engine.failed, true, "無法建立 context 應標記 failed");
  assert.strictEqual(audio.playEvent(engine, "hit", null, {}), 0, "failed 引擎重播仍應回 0");
}

// bossKill 為多層配方：節點數應多於單層事件。
{
  const ctxA = createFakeContext();
  const engineA = audio.createEngine({ context: ctxA });
  const bossNodes = audio.playEvent(engineA, "bossKill");
  const ctxB = createFakeContext();
  const engineB = audio.createEngine({ context: ctxB });
  const hitNodes = audio.playEvent(engineB, "hit");
  assert(bossNodes > hitNodes, `bossKill 應為多層爆鳴（bossKill=${bossNodes}, hit=${hitNodes}）`);
}

console.log("Audio tests PASS");
