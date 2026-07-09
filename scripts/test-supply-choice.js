"use strict";

const assert = require("assert");
const config = require("../src/config.js");
const rules = require("../src/rules.js");

const baseVehicle = { hp: 80, maxHp: 100, shield: 0 };
const baseStats = {
  supplyParts: 0,
  supplyCratesCollected: 0,
  supplyRewards: {},
  lastSupplyReward: ""
};

const rate = rules.applySupplyRewardById({
  rewardId: "rate_boost",
  time: 12,
  vehicle: baseVehicle,
  supplyBuffs: [],
  stats: baseStats,
  buffId: "buff_rate",
  config
});
assert.strictEqual(rate.ok, true);
assert.strictEqual(rate.stats.supplyCratesCollected, 1);
assert.strictEqual(rate.stats.lastSupplyReward, "rate_boost");
assert.strictEqual(rate.stats.supplyRewards.rate_boost, 1);
assert.strictEqual(rate.supplyBuffs.length, 1);
assert.strictEqual(rate.supplyBuffs[0].rewardId, "rate_boost");
assert.strictEqual(rate.supplyBuffs[0].fireIntervalMul, 0.85);
assert.strictEqual(rate.supplyBuffs[0].until, 22);
assert.strictEqual(baseStats.supplyCratesCollected, 0, "applySupplyRewardById must not mutate input stats");

const damage = rules.applySupplyRewardById({
  rewardId: "damage_boost",
  time: 4,
  vehicle: baseVehicle,
  supplyBuffs: [{ id: "old", rewardId: "rate_boost", type: "rate", until: 8 }],
  stats: baseStats,
  buffId: "buff_damage",
  config
});
assert.strictEqual(damage.ok, true);
assert.strictEqual(damage.supplyBuffs.length, 2);
assert.strictEqual(damage.supplyBuffs[1].rewardId, "damage_boost");
assert.strictEqual(damage.supplyBuffs[1].damageAdd, 0.2);
assert.strictEqual(damage.supplyBuffs[1].until, 14);

const repair = rules.applySupplyRewardById({
  rewardId: "repair_small",
  time: 0,
  vehicle: { hp: 95, maxHp: 100, shield: 0 },
  supplyBuffs: [],
  stats: baseStats,
  config
});
assert.strictEqual(repair.ok, true);
assert.strictEqual(repair.heal, 8);
assert.strictEqual(repair.vehicle.hp, 100, "repair should cap at max hp");

const parts = rules.applySupplyRewardById({
  rewardId: "parts_cache",
  time: 0,
  vehicle: baseVehicle,
  supplyBuffs: [],
  stats: Object.assign({}, baseStats, { supplyParts: 10 }),
  config
});
assert.strictEqual(parts.ok, true);
assert.strictEqual(parts.partsGained, 2);
assert.strictEqual(parts.stats.supplyParts, config.SUPPLY_DROPS.partsCapPerRun);

const maxedRate = rules.applySupplyRewardById({
  rewardId: "rate_boost",
  time: 0,
  runMods: Object.assign(rules.defaultRunMods(), { fireIntervalMul: 0.46 }),
  vehicle: baseVehicle,
  supplyBuffs: [],
  stats: baseStats,
  config
});
assert.strictEqual(maxedRate.ok, true);
assert.strictEqual(maxedRate.supplyBuffs.length, 0, "maxed rate supply should not add a dead buff");
assert.strictEqual(maxedRate.runMods.overload, 1, "maxed rate supply should add overload");
assert.deepStrictEqual(maxedRate.overflow, { type: "score", amount: 120 });

const maxedRepair = rules.supplyOptionState({
  rewardId: "repair_small",
  runMods: rules.defaultRunMods(),
  vehicle: { hp: 100, maxHp: 100, shield: 0 },
  config
});
assert.strictEqual(maxedRepair.maxed, true);
assert.strictEqual(maxedRepair.overflowText, "分數 +80");

const invalid = rules.applySupplyRewardById({
  rewardId: "missing_reward",
  time: 0,
  vehicle: baseVehicle,
  supplyBuffs: [],
  stats: baseStats,
  config
});
assert.strictEqual(invalid.ok, false);
assert.strictEqual(invalid.reason, "unknown_reward");
assert.strictEqual(invalid.stats.supplyCratesCollected, 0);
assert.strictEqual(invalid.supplyBuffs.length, 0);

console.log("Supply choice tests PASS");
