"use strict";

// R86 招牌玩法「攀車屍＋甩尾」純規則單測。
const assert = require("assert");
const config = require("../src/config.js");
const rules = require("../src/rules.js");

const L = config.CONVOY_LATCH;
assert(L && Array.isArray(L.slots) && L.slots.length === 4, "CONVOY_LATCH 應有四個攀附槽（車身兩側＋拖車兩側）");
assert(L.slots.some((slot) => slot.anchor === "trailer"), "至少一個槽在熹的拖車上");
assert.strictEqual(config.META_DEFAULT.tutorial.seenLatch, false, "新存檔尚未看過攀車教學");

// 可攀附敵種：只有遊蕩屍／奔屍；Boss、已攀附、飛出中都不行。
assert.strictEqual(rules.isLatchableEnemy({ enemyId: "shambler" }, config), true);
assert.strictEqual(rules.isLatchableEnemy({ enemyId: "runner" }, config), true);
assert.strictEqual(rules.isLatchableEnemy({ enemyId: "bloater" }, config), false, "爆裂屍維持接觸爆炸");
assert.strictEqual(rules.isLatchableEnemy({ enemyId: "runner", boss: true }, config), false);
assert.strictEqual(rules.isLatchableEnemy({ enemyId: "runner", latched: { slot: 0 } }, config), false);
assert.strictEqual(rules.isLatchableEnemy({ enemyId: "runner", flung: {} }, config), false);
assert.strictEqual(rules.isLatchableEnemy({ enemyId: "runner", noLatch: true }, config), false, "測試／特殊生成可關閉攀附");

// 槽位：依序填滿，滿了回 -1。
assert.strictEqual(rules.pickLatchSlot([], config), 0);
assert.strictEqual(rules.pickLatchSlot([0, 2], config), 1);
assert.strictEqual(rules.pickLatchSlot([0, 1, 2, 3], config), -1);

// 啃咬穿甲：重裝車（護甲 10）也要掉血，且少於裸車；最少 1。
const armored = rules.resolveLatchBiteDamage(7, 10, 1, config);
const naked = rules.resolveLatchBiteDamage(7, 0, 1, config);
assert(armored >= 4 && armored < naked, `穿甲後啃咬應有感但低於裸車：${armored} vs ${naked}`);
assert.strictEqual(rules.resolveLatchBiteDamage(1, 50, 1, config), 1, "最低 1 點");
const contactOnArmor = rules.applyVehicleDamage
  ? Math.max(1, Math.round(8 - 10))
  : 1;
assert(armored > contactOnArmor * 3, "攀車啃咬必須比舊接觸傷害（1 點）有威脅");

// 甩動偵測：單向開過去不觸發；左右急甩觸發；觸發後冷卻。
let tracker = {};
let fired = false;
for (let i = 0; i < 10; i += 1) {
  const r = rules.updateShakeTracker(tracker, 4, 1 / 60, config);
  tracker = r.tracker;
  fired = fired || r.triggered;
}
assert.strictEqual(fired, false, "只往右開不應觸發甩飛");
let triggerStep = -1;
tracker = {};
const swerve = [10, 10, -10, -10, 10];
swerve.forEach((dx, i) => {
  const r = rules.updateShakeTracker(tracker, dx, 1 / 30, config);
  tracker = r.tracker;
  if (r.triggered && triggerStep < 0) triggerStep = i;
});
assert(triggerStep >= 2, `左右急甩應觸發（實際步數 ${triggerStep}）`);
assert(tracker.cooldownLeft > 0 || triggerStep < swerve.length - 1, "觸發後進入短冷卻");
const afterCooldown = rules.updateShakeTracker({ left: 99, right: 99, cooldownLeft: 0.2 }, 0, 0.05, config);
assert.strictEqual(afterCooldown.triggered, false, "冷卻中不重複觸發");
// 慢慢左右晃（衰減掉）不算甩。
tracker = {};
fired = false;
for (let i = 0; i < 60; i += 1) {
  const r = rules.updateShakeTracker(tracker, i % 30 < 15 ? 0.6 : -0.6, 1 / 10, config);
  tracker = r.tracker;
  fired = fired || r.triggered;
}
assert.strictEqual(fired, false, "慢速晃動會衰減，不算甩");

// 多隻甩飛獎勵。
assert.strictEqual(rules.resolveMultiFlingParts(1, config), 0);
assert.strictEqual(rules.resolveMultiFlingParts(2, config), 1);
assert.strictEqual(rules.resolveMultiFlingParts(4, config), 3);

// 伏擊排程：第 1 波 60 秒內必有伏擊；後期波有遞增數量且有上限。
const w1 = rules.ambushesForWave(1, config);
assert(w1.length >= 1 && w1[0].at <= 15, "第一波 15 秒內必有路邊伏擊（開局鉤子）");
assert(w1.every((item, index) => index === 0 || item.at >= w1[index - 1].at), "依秒數排序");
const w3 = rules.ambushesForWave(3, config);
const w12 = rules.ambushesForWave(12, config);
const w40 = rules.ambushesForWave(40, config);
assert(w3.length === 1 && w12[0].count >= w3[0].count, "後期伏擊數量遞增");
assert(w40[0].count <= L.lateAmbush.maxCount, "伏擊數量有上限");

assert.strictEqual(rules.driftReady(5, 5.5), false);
assert.strictEqual(rules.driftReady(5.5, 5.5), true);

// 死因白名單與結算保存。
const settled = rules.settleRunRewards({
  meta: rules.migrateMeta(null, { config }),
  run: { vehicleId: "land_rig", wavesCleared: 1, kills: 10, flung: 6, bestFlingChain: 3, latchesTaken: 7, deathContext: { type: "latch", enemyId: "runner", amount: 5, wave: 2 } },
  rng: () => 0.5,
  config
});
assert.strictEqual(settled.meta.lastRun.deathContext.type, "latch", "攀車啃咬是合法死因");
assert.strictEqual(settled.meta.lastRun.flung, 6);
assert.strictEqual(settled.meta.lastRun.bestFlingChain, 3);

console.log("R86 convoy latch rules PASS");
