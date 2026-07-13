"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const fx = require("../src/fx.js");
const config = require("../src/config.js");
const FX = config.FX;

const HEX = /^#[0-9a-fA-F]{6}$/;
const ENVIRONMENTS = ["land", "sea", "air", "space"];

// ---------- 1) fx.js 純度自證：檔案原文不得出現時間/亂數/DOM/儲存全域 ----------
const fxSource = fs.readFileSync(path.join(__dirname, "..", "src", "fx.js"), "utf8");
const bannedTokens = [
  "Date.now",
  "Math.random",
  "document",
  "window.localStorage",
  "localStorage",
  "sessionStorage",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "performance.",
  "XMLHttpRequest",
  "fetch("
];
bannedTokens.forEach((token) => {
  assert(fxSource.indexOf(token) < 0, `fx.js 純度違規：原文不得出現 "${token}"`);
});
assert(fxSource.indexOf("window.DSFx") >= 0, "fx.js 必須以 UMD 掛載 window.DSFx");
assert(fxSource.indexOf("module.exports") >= 0, "fx.js 必須支援 CommonJS 匯出");

// ---------- 2) 發射器規格 schema 完整性 ----------
function assertBurstSpec(name, spec) {
  assert(spec && typeof spec === "object" && !Array.isArray(spec), `${name} 必須是物件`);
  assert(FX.shapes.indexOf(spec.shape) >= 0, `${name}.shape "${spec.shape}" 必須在 FX.shapes 內`);
  assert(Number.isFinite(spec.count) && spec.count >= 1, `${name}.count 必須 >= 1`);
  assert(Number.isFinite(spec.speedMin) && spec.speedMin >= 0, `${name}.speedMin 必須 >= 0`);
  assert(Number.isFinite(spec.speedMax) && spec.speedMax >= spec.speedMin, `${name}.speedMax 必須 >= speedMin`);
  assert(Number.isFinite(spec.angleCenter), `${name}.angleCenter 必須是有限數`);
  assert(Number.isFinite(spec.angleSpread) && spec.angleSpread >= 0, `${name}.angleSpread 必須 >= 0`);
  assert(Number.isFinite(spec.lifeMin) && spec.lifeMin > 0, `${name}.lifeMin 必須 > 0`);
  assert(Number.isFinite(spec.lifeMax) && spec.lifeMax >= spec.lifeMin, `${name}.lifeMax 必須 >= lifeMin`);
  assert(Number.isFinite(spec.sizeMin) && spec.sizeMin > 0, `${name}.sizeMin 必須 > 0`);
  assert(Number.isFinite(spec.sizeMax) && spec.sizeMax >= spec.sizeMin, `${name}.sizeMax 必須 >= sizeMin`);
  assert(Array.isArray(spec.colors) && spec.colors.length > 0, `${name}.colors 必須是非空陣列`);
  spec.colors.forEach((color) => assert(HEX.test(color), `${name} 顏色需為 6 碼 hex，取得 ${color}`));
  assert(Number.isFinite(spec.gravity), `${name}.gravity 必須是有限數`);
  assert(Number.isFinite(spec.drag), `${name}.drag 必須是有限數`);
}

assert(Array.isArray(FX.shapes) && FX.shapes.length >= 7, "FX.shapes 至少需七種形狀");
["spark", "smoke", "debris", "foam", "dust", "ember", "shard"].forEach((shape) => {
  assert(FX.shapes.indexOf(shape) >= 0, `FX.shapes 缺少 ${shape}`);
});

// killBurst：每敵種必有，boss 需多段（至少一段 delay > 0）。
["zombie", "mech", "boss"].forEach((kind) => {
  const specs = FX.killBurst[kind];
  assert(Array.isArray(specs) && specs.length >= 2, `FX.killBurst.${kind} 至少需兩段規格`);
  specs.forEach((spec, index) => assertBurstSpec(`FX.killBurst.${kind}[${index}]`, spec));
});
assert(
  FX.killBurst.boss.some((spec) => Number.isFinite(spec.delay) && spec.delay > 0),
  "FX.killBurst.boss 需為多段爆發（至少一段 delay > 0）"
);

// hitSpark：base 規格完整，且每台載具都有彈色。
assertBurstSpec("FX.hitSpark.base", FX.hitSpark.base);
assert(HEX.test(FX.hitSpark.defaultColor), "FX.hitSpark.defaultColor 需為 hex");
Object.keys(config.VEHICLES).forEach((vehicleId) => {
  const color = FX.hitSpark.colorsByVehicle[vehicleId];
  assert(color && HEX.test(color), `FX.hitSpark.colorsByVehicle 缺少 ${vehicleId} 的 hex 彈色`);
});

// muzzleFlash：強化參數＋reducedFlash 保守子規格。
assert(FX.muzzleFlash.scale > 1, "muzzleFlash.scale 需大於 1（強化）");
assert(FX.muzzleFlash.brightness >= 1, "muzzleFlash.brightness 需 >= 1");
assert(Number.isInteger(FX.muzzleFlash.frames) && FX.muzzleFlash.frames >= 2, "muzzleFlash.frames 需 >= 2");
assert(FX.muzzleFlash.reducedFlash, "muzzleFlash 需含 reducedFlash 子規格");
assert(FX.muzzleFlash.reducedFlash.scale < FX.muzzleFlash.scale, "reducedFlash.scale 需低於強化值");
assert(FX.muzzleFlash.reducedFlash.flickerHz === 0, "reducedFlash.flickerHz 必須為 0");

// 環境動態層：四環境必有，且關鍵層 id 到位。
ENVIRONMENTS.forEach((env) => {
  const block = FX.environments[env];
  assert(block && Array.isArray(block.layers) && block.layers.length >= 2, `FX.environments.${env} 至少需兩層`);
  block.layers.forEach((layer, index) => {
    const name = `FX.environments.${env}.layers[${index}]`;
    assert(typeof layer.id === "string" && layer.id.length > 0, `${name}.id 必須存在`);
    assert(typeof layer.anchor === "string" && layer.anchor.length > 0, `${name}.anchor 必須存在`);
    assert(Number.isFinite(layer.ratePerSec) && layer.ratePerSec >= 0, `${name}.ratePerSec 必須 >= 0`);
    if (Array.isArray(layer.parallax)) {
      assert(layer.parallax.length >= 2, `${name}.parallax 至少需兩層視差`);
      layer.parallax.forEach((sub, subIndex) => {
        assert(sub.speed > 0, `${name}.parallax[${subIndex}].speed 必須 > 0`);
        assert(sub.density > 0 && sub.density <= 1, `${name}.parallax[${subIndex}].density 必須 0..1`);
        assert(sub.size > 0, `${name}.parallax[${subIndex}].size 必須 > 0`);
        assert(sub.alpha > 0 && sub.alpha <= 1, `${name}.parallax[${subIndex}].alpha 必須 0..1`);
      });
      assert(Array.isArray(layer.colors) && layer.colors.length > 0, `${name}.colors 必須是非空陣列`);
      layer.colors.forEach((color) => assert(HEX.test(color), `${name} 顏色需為 hex`));
    } else {
      assertBurstSpec(name, layer);
    }
  });
});
const layerIds = (env) => FX.environments[env].layers.map((layer) => layer.id);
assert(layerIds("land").indexOf("wheel_dust") >= 0, "land 需有車尾揚塵層 wheel_dust");
assert(layerIds("land").indexOf("road_grit") >= 0, "land 需有路面飛屑層 road_grit");
assert(layerIds("sea").indexOf("bow_foam_left") >= 0 && layerIds("sea").indexOf("bow_foam_right") >= 0, "sea 需有船首 V 尾流雙層");
assert(layerIds("sea").indexOf("sun_glitter") >= 0, "sea 需有波光點層");
assert(layerIds("air").indexOf("cloud_shadow") >= 0 && layerIds("air").indexOf("wind_streak") >= 0, "air 需有雲影與風速線");
["engine_flame", "meteor", "star_dust"].forEach((id) => {
  assert(layerIds("space").indexOf(id) >= 0, `space 需有 ${id} 層`);
});

// 載具生命感：影子/怠速/傾斜/排氣，四環境必有。
ENVIRONMENTS.forEach((env) => {
  const shadow = FX.vehicle.shadow[env];
  assert(shadow, `FX.vehicle.shadow.${env} 必須存在`);
  assert(shadow.widthMul > 0 && shadow.heightMul > 0, `${env} 影子尺寸需為正`);
  assert(shadow.alpha > 0 && shadow.alpha <= 1, `${env} 影子 alpha 需 0..1`);
  assert(Number.isFinite(shadow.offsetY), `${env} 影子 offsetY 需為有限數`);
  assert(HEX.test(shadow.color), `${env} 影子顏色需為 hex`);
  const idle = FX.vehicle.idle[env];
  assert(idle && idle.amp > 0 && idle.hz > 0, `FX.vehicle.idle.${env} 需有正的 amp/hz`);
  const tilt = FX.vehicle.tilt[env];
  assert(tilt && tilt.maxRad > 0 && tilt.perUnit > 0 && tilt.ease > 0, `FX.vehicle.tilt.${env} 需完整`);
  assertBurstSpec(`FX.vehicle.exhaust.${env}`, FX.vehicle.exhaust[env]);
  assert(Number.isFinite(FX.vehicle.exhaust[env].ratePerSec) && FX.vehicle.exhaust[env].ratePerSec > 0, `${env} 排氣需有 ratePerSec`);
});
// 貼地深、浮空淡＋偏移的關係檢查。
assert(FX.vehicle.shadow.air.alpha < FX.vehicle.shadow.land.alpha, "air 影子需比 land 淡");
assert(FX.vehicle.shadow.space.alpha < FX.vehicle.shadow.sea.alpha, "space 影子需比 sea 淡");
assert(FX.vehicle.shadow.air.offsetY > FX.vehicle.shadow.land.offsetY, "air 影子需有浮空偏移");
assert(FX.vehicle.shadow.space.offsetY > FX.vehicle.shadow.sea.offsetY, "space 影子需有浮空偏移");

// vignette：四環境必有 hex 色與 0..1 強度。
ENVIRONMENTS.forEach((env) => {
  const vig = FX.vignette[env];
  assert(vig && HEX.test(vig.color), `FX.vignette.${env}.color 需為 hex`);
  assert(vig.strength > 0 && vig.strength <= 1, `FX.vignette.${env}.strength 需 0..1`);
});

// 補給箱重繪參數。
assert(FX.supplyCrate.size > 0, "supplyCrate.size 需為正");
["fill", "edge", "slat", "strap", "icon"].forEach((key) => {
  assert(HEX.test(FX.supplyCrate.body[key]), `supplyCrate.body.${key} 需為 hex`);
});
assert(FX.supplyCrate.float.amp > 0 && FX.supplyCrate.float.hz > 0, "supplyCrate.float 需完整");
assert(HEX.test(FX.supplyCrate.glow.color) && FX.supplyCrate.glow.alphaMax > 0 && FX.supplyCrate.glow.radius > 0 && FX.supplyCrate.glow.pulseHz > 0, "supplyCrate.glow 需完整");

// 波次橫幅：wave 需含「第 {n} 波」模板；boss 需有警告文案與 flash/shake。
assert(FX.waveBanner.wave.textTemplate.indexOf("{n}") >= 0, "wave 模板需含 {n}");
assert(FX.waveBanner.wave.textTemplate.indexOf("波") >= 0, "wave 模板需為繁中波次文案");
assert(FX.waveBanner.boss.textTemplate.indexOf("警告") >= 0 || FX.waveBanner.boss.textTemplate.indexOf("Boss") >= 0, "boss 模板需為警告文案");
["wave", "boss"].forEach((kind) => {
  const banner = FX.waveBanner[kind];
  assert(banner.inTime > 0 && banner.holdTime > 0 && banner.outTime > 0, `${kind} 橫幅時序需為正`);
  assert(banner.maxScale >= 1, `${kind}.maxScale 需 >= 1`);
  assert(HEX.test(banner.color) && HEX.test(banner.edge), `${kind} 顏色需為 hex`);
});
assert(FX.waveBanner.boss.flashHz > 0 && FX.waveBanner.boss.shake > 0, "boss 橫幅需有 flash 與 shake 強化");

// R69 combo reward flourish config.
assert(FX.combo && FX.combo.windowSeconds > 0 && FX.combo.fadeSeconds > 0, "FX.combo should define combo timing");
assert(FX.combo.size >= 10 && HEX.test(FX.combo.color), "FX.combo should define readable text styling");

// shake 建議值。
assert(FX.shake.hitAmp > 0 && FX.shake.killAmp > 0 && FX.shake.bossKillAmp > 0 && FX.shake.max > 0, "FX.shake 需完整");

// ---------- 3) 品質降級係數 ----------
assert(FX.quality.high && FX.quality.low, "FX.quality 需含 high/low");
assert(FX.quality.low.maxParticles * 2 <= FX.quality.high.maxParticles, "low 粒子上限需 <= high 的一半");
assert(FX.quality.low.emitRateMul <= FX.quality.high.emitRateMul / 2, "low 發射率需至少砍半");
assert(FX.quality.high.vignette === true && FX.quality.low.vignette === false, "low 需關閉 vignette");
assert(FX.quality.low.trailEvery > FX.quality.high.trailEvery, "low 曳光需抽疏");
assert(FX.quality.low.envDensityMul <= FX.quality.high.envDensityMul / 2, "low 環境層密度需至少砍半");
// PERFORMANCE.qualityProfiles 掛載同一份 FX 品質參照（單一事實來源）。
assert.strictEqual(config.PERFORMANCE.qualityProfiles.high.fx, FX.quality.high, "qualityProfiles.high.fx 需指向 FX.quality.high");
assert.strictEqual(config.PERFORMANCE.qualityProfiles.low.fx, FX.quality.low, "qualityProfiles.low.fx 需指向 FX.quality.low");

// ---------- 4) 池行為：上限不可超、壽命歸零回收 ----------
const capSpec = {
  shape: "spark",
  count: 5000,
  x: 10,
  y: 20,
  speedMin: 10,
  speedMax: 30,
  angleCenter: 0,
  angleSpread: Math.PI,
  lifeMin: 0.5,
  lifeMax: 1,
  sizeMin: 1,
  sizeMax: 2,
  colors: ["#ffffff", "#ffd76a"],
  gravity: 0,
  drag: 0
};
{
  const state = fx.createFxState({ fxConfig: FX, quality: "high" });
  assert.strictEqual(state.maxParticles, FX.quality.high.maxParticles, "high 池大小需等於 FX.quality.high.maxParticles");
  const rng = fx.createSeededRng(42);
  const spawned = fx.spawnBurst(state, capSpec, rng);
  assert(spawned <= state.maxParticles, "發射數不可超過池上限");
  assert.strictEqual(state.activeCount, state.maxParticles, "池應被填滿");
  assert.strictEqual(fx.spawnBurst(state, capSpec, rng), 0, "池滿時不可再發射");
  assert.strictEqual(state.activeCount + state.freeCount, state.maxParticles, "active + free 恆等於池大小");

  // 壽命歸零 → 全數回收，且可重複使用。
  fx.updateParticles(state, 0.4);
  assert.strictEqual(state.activeCount, state.maxParticles, "0.4 秒後（壽命 0.5..1）應全數存活");
  const sample = state.pool.find((p) => p.active);
  assert(sample.alpha > 0 && sample.alpha < 1, "存活粒子 alpha 應隨壽命衰減");
  fx.updateParticles(state, 2);
  assert.strictEqual(state.activeCount, 0, "壽命耗盡後應全數回收");
  assert.strictEqual(state.freeCount, state.maxParticles, "回收後 free 應回到池大小");
  assert(fx.spawnBurst(state, capSpec, fx.createSeededRng(7)) > 0, "回收後應可再發射");
  fx.resetFxState(state);
  assert.strictEqual(state.activeCount, 0, "resetFxState 應清空池");
  assert.strictEqual(state.freeCount, state.maxParticles, "resetFxState 應還原 free 名單");
}

// 低優先環境／曳光保留 25% 池位；關鍵 smoke/flash 在滿池時可回收低優先粒子。
{
  const state = fx.createFxState({ fxConfig: FX, quality: "high" });
  const trail = { x: 0, y: 0, vx: 0, vy: 0, life: 2, size: 1, color: "#ffffff" };
  let trails = 0;
  for (let i = 0; i < state.maxParticles * 2; i += 1) trails += fx.spawnTrailPoint(state, trail);
  assert.strictEqual(trails, state.maxParticles - state.reservedCritical, "低優先曳光需保留 25% 關鍵池位");
  const smoke = Object.assign({}, capSpec, { texture: "smoke", count: state.reservedCritical });
  assert.strictEqual(fx.spawnBurst(state, smoke, fx.createSeededRng(8)), state.reservedCritical, "關鍵煙需可使用保留池位");
  assert.strictEqual(state.activeCount, state.maxParticles, "優先發射後仍不得超過池上限");
  const flash = Object.assign({}, capSpec, { texture: "flash", count: 1 });
  assert.strictEqual(fx.spawnBurst(state, flash, fx.createSeededRng(9)), 1, "關鍵 flash 應可回收低優先粒子");
  assert.strictEqual(state.priorityEvictions, 1, "關鍵發射需記錄一次低優先回收");
  assert.strictEqual(state.activeCount + state.freeCount, state.maxParticles, "優先回收後池恆等式需成立");
}

// ---------- 5) rng 注入決定性：同 seed 同結果 ----------
function snapshotScenario(seed) {
  const state = fx.createFxState({ fxConfig: FX, quality: "high" });
  const rng = fx.createSeededRng(seed);
  fx.spawnKillBurst(state, FX, "boss", 90, 120, rng);
  fx.spawnHitSpark(state, FX, { x: 40, y: 60, vehicleId: "sea_ark" }, rng);
  fx.spawnTrailPoint(state, { x: 50, y: 70, vx: 0, vy: -120, life: 0.3, size: 1.5, color: "#9fd8ff" }, rng);
  fx.updateParticles(state, 0.016);
  fx.spawnEnvironmentLayer(state, FX.environments.land.layers[0], 0.5, 97, 360, rng);
  fx.updateParticles(state, 0.2);
  return JSON.stringify(state.pool);
}
assert.strictEqual(snapshotScenario(1234), snapshotScenario(1234), "同 seed 必須產生完全相同的粒子狀態");
assert.notStrictEqual(snapshotScenario(1234), snapshotScenario(99), "不同 seed 應產生不同結果");
{
  const a = fx.createSeededRng(2026);
  const b = fx.createSeededRng(2026);
  for (let i = 0; i < 20; i += 1) {
    const value = a();
    assert.strictEqual(value, b(), "createSeededRng 同 seed 序列需一致");
    assert(value >= 0 && value < 1, "rng 值域需為 [0,1)");
  }
  assert(fx.createSeededRng(1)() !== fx.createSeededRng(2)(), "不同 seed 首值應不同");
}
assert.throws(() => fx.spawnBurst(fx.createFxState({ fxConfig: FX }), capSpec, null), TypeError, "未注入 rng 應丟 TypeError");

// ---------- 6) 降級係數生效 ----------
{
  const high = fx.createFxState({ fxConfig: FX, quality: "high" });
  const low = fx.createFxState({ fxConfig: FX, quality: "low" });
  assert.strictEqual(low.maxParticles, FX.quality.low.maxParticles, "low 池大小需套用降級上限");
  const spec10 = Object.assign({}, capSpec, { count: 10 });
  assert.strictEqual(fx.spawnBurst(high, spec10, fx.createSeededRng(5)), 10, "high 應足量發射");
  assert.strictEqual(fx.spawnBurst(low, spec10, fx.createSeededRng(5)), 5, "low 發射數應減半");
  assert.strictEqual(fx.effectiveCount(low, 1), 1, "低品質下單發仍需保底 1 顆");

  // vignette：low 品質整層關閉。
  const vig = fx.vignetteParams(FX, "land", "high");
  assert(vig && vig.color === FX.vignette.land.color, "high 應回傳 land 暖褐 vignette");
  assert.strictEqual(fx.vignetteParams(FX, "land", "low"), null, "low 品質 vignette 需關閉");

  // 環境層密度：low 累積速率減半。
  const dustLayer = FX.environments.land.layers[0];
  let highTotal = 0;
  let lowTotal = 0;
  const rngHigh = fx.createSeededRng(11);
  const rngLow = fx.createSeededRng(11);
  const highEnv = fx.createFxState({ fxConfig: FX, quality: "high" });
  const lowEnv = fx.createFxState({ fxConfig: FX, quality: "low" });
  for (let i = 0; i < 10; i += 1) {
    highTotal += fx.spawnEnvironmentLayer(highEnv, dustLayer, 0.1, 97, 360, rngHigh);
    lowTotal += fx.spawnEnvironmentLayer(lowEnv, dustLayer, 0.1, 97, 360, rngLow);
    fx.updateParticles(highEnv, 0.1);
    fx.updateParticles(lowEnv, 0.1);
  }
  assert(highTotal >= 10, `high 一秒內揚塵應至少 10 顆，取得 ${highTotal}`);
  assert(lowTotal <= Math.ceil(highTotal / 2), `low 環境層發射需減半（high=${highTotal}, low=${lowTotal}）`);

  // 曳光抽疏：low trailEvery=2 → 十次呼叫只落五顆。
  const trailSpec = { x: 0, y: 0, vx: 0, vy: -100, life: 0.4, size: 1.5, color: "#ffd76a" };
  const highTrail = fx.createFxState({ fxConfig: FX, quality: "high" });
  const lowTrail = fx.createFxState({ fxConfig: FX, quality: "low" });
  let highTrailCount = 0;
  let lowTrailCount = 0;
  for (let i = 0; i < 10; i += 1) {
    highTrailCount += fx.spawnTrailPoint(highTrail, trailSpec);
    lowTrailCount += fx.spawnTrailPoint(lowTrail, trailSpec);
  }
  assert.strictEqual(highTrailCount, 10, "high 曳光每次呼叫都應落點");
  assert.strictEqual(lowTrailCount, 5, "low 曳光應隔次落點");
}

// ---------- 7) reducedFlash 抑制新增閃光/震屏 ----------
{
  const normal = fx.muzzleFlashParams(FX, { reducedFlash: false });
  const reduced = fx.muzzleFlashParams(FX, { reducedFlash: true });
  assert(normal.scale > reduced.scale, "reducedFlash 需縮小砲口閃焰");
  assert(normal.brightness > reduced.brightness, "reducedFlash 需降低亮度");
  assert(reduced.frames <= normal.frames, "reducedFlash 幀數不可增加");
  assert.strictEqual(reduced.flickerHz, 0, "reducedFlash 需停用閃爍");
  assert.strictEqual(reduced.reduced, true, "reduced 旗標需回傳");

  assert.strictEqual(fx.resolveShake(FX, 3, { reducedFlash: true }), 0, "reducedFlash 需歸零震屏");
  assert.strictEqual(fx.resolveShake(FX, 3, { screenShake: false }), 0, "screenShake=false 需歸零震屏");
  assert.strictEqual(fx.resolveShake(FX, 3, { reducedFlash: false, screenShake: true }), 3, "正常設定應保留震屏");
  assert.strictEqual(fx.resolveShake(FX, 99, {}), FX.shake.max, "震屏需以 FX.shake.max 封頂");

  const bossQuiet = fx.waveBanner(FX, "boss", 5, 0.1, { reducedFlash: true, screenShake: true });
  assert.strictEqual(bossQuiet.flash, 0, "reducedFlash 時 boss 橫幅 flash 必為 0");
  assert.strictEqual(bossQuiet.shake, 0, "reducedFlash 時 boss 橫幅 shake 必為 0");
  const bossLoud = fx.waveBanner(FX, "boss", 5, 0.1, { reducedFlash: false, screenShake: true });
  assert(bossLoud.flash > 0, "正常設定下 boss 橫幅應有 flash");
  assert(bossLoud.shake > 0, "正常設定下 boss 橫幅入場應有 shake");
}

// ---------- 8) 演出輔助函式行為 ----------
{
  // 波次橫幅時間軸。
  const hold = fx.waveBanner(FX, "wave", 7, FX.waveBanner.wave.inTime + 0.1, {});
  assert.strictEqual(hold.active, true, "hold 階段橫幅應顯示");
  assert.strictEqual(hold.alpha, 1, "hold 階段 alpha 應為 1");
  assert.strictEqual(hold.text, "第 7 波", "wave 模板需輸出「第 7 波」");
  const total = FX.waveBanner.wave.inTime + FX.waveBanner.wave.holdTime + FX.waveBanner.wave.outTime;
  assert.strictEqual(fx.waveBanner(FX, "wave", 7, total + 0.01, {}).active, false, "演出結束後應隱藏");
  assert.strictEqual(fx.waveBanner(FX, "wave", 7, -1, {}).active, false, "尚未開始不應顯示");

  // boss 多段爆發：延遲粒子先隱藏，時間到才可見。
  const state = fx.createFxState({ fxConfig: FX, quality: "high" });
  fx.spawnKillBurst(state, FX, "boss", 90, 120, fx.createSeededRng(3));
  let visibleEarly = 0;
  fx.forEachActive(state, () => { visibleEarly += 1; });
  assert(visibleEarly < state.activeCount, "boss 爆發的延遲段初期不應可見");
  fx.updateParticles(state, 0.2);
  let visibleLate = 0;
  fx.forEachActive(state, () => { visibleLate += 1; });
  assert(visibleLate > visibleEarly, "延遲段時間到後應轉為可見");

  // 敵種 → 擊殺爆發類型。
  assert.strictEqual(fx.enemyFxKind(config.ENEMIES.boss_hive_titan), "boss", "boss 敵種需對映 boss 爆發");
  assert.strictEqual(fx.enemyFxKind(config.ENEMIES.shambler), "zombie", "一般喪屍需對映 zombie 爆發");
  assert.strictEqual(fx.enemyFxKind({ tags: ["mech"] }), "mech", "mech 標籤需對映 mech 爆發");
  assert.strictEqual(fx.getKillBurstSpecs(FX, "unknown_kind"), FX.killBurst.zombie, "未知敵種需退回 zombie 規格");

  // 命中火花取用載具彈色。
  const sparkState = fx.createFxState({ fxConfig: FX, quality: "high" });
  fx.spawnHitSpark(sparkState, FX, { x: 1, y: 2, vehicleId: "void_runner" }, fx.createSeededRng(9));
  const spark = sparkState.pool.find((p) => p.active);
  assert.strictEqual(spark.color, FX.hitSpark.colorsByVehicle.void_runner, "命中火花需採用載具彈色");

  // 載具生命感：怠速浮動/傾斜夾限/影子與排氣參照。
  const idleAir = FX.vehicle.idle.air;
  const motion = fx.vehicleMotion(FX, "air", 0.25 / idleAir.hz, 999, {});
  assert(Math.abs(motion.bobY - idleAir.amp) < 1e-9, "怠速浮動峰值應等於 amp");
  assert.strictEqual(motion.tiltRad, FX.vehicle.tilt.air.maxRad, "傾斜需夾限於 maxRad");
  assert.strictEqual(fx.vehicleMotion(FX, "air", 0, -999, {}).tiltRad, -FX.vehicle.tilt.air.maxRad, "反向傾斜需夾限");
  assert.strictEqual(motion.shadow, FX.vehicle.shadow.air, "影子需回傳 air 參數");
  assert.strictEqual(motion.exhaust, FX.vehicle.exhaust.air, "排氣需回傳 air 規格");

  // 補給箱：浮動幅度與光暈脈動有界。
  for (let i = 0; i <= 20; i += 1) {
    const crate = fx.supplyCrateVisual(FX, i * 0.13, {});
    assert(Math.abs(crate.bobY) <= FX.supplyCrate.float.amp + 1e-9, "補給箱浮動需在 amp 內");
    assert(crate.glowAlpha >= 0 && crate.glowAlpha <= FX.supplyCrate.glow.alphaMax + 1e-9, "光暈 alpha 需有界");
  }
  assert.strictEqual(fx.supplyCrateVisual(FX, 0, {}).style, FX.supplyCrate.body, "補給箱樣式需回傳木箱參數");

  // 環境層查詢。
  assert.strictEqual(fx.environmentLayers(FX, "space").length, 3, "space 應有三層動態");
  assert.strictEqual(fx.environmentLayers(FX, "nowhere").length, 0, "未知環境應回空陣列");
}

console.log("FX tests PASS");
