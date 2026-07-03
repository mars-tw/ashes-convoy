"use strict";

const assert = require("assert");
const config = require("../src/config.js");
const rules = require("../src/rules.js");

const fixedNow = () => "2026-07-03T00:00:00.000Z";

assert.strictEqual(rules.rewardPartsForRun({ wavesCleared: 0, kills: 0, bossesDefeated: 0, difficultyId: "normal" }, config), 0);
assert.strictEqual(rules.rewardPartsForRun({ wavesCleared: 3, kills: 25, bossesDefeated: 0, difficultyId: "normal" }, config), 16);
assert.strictEqual(rules.rewardPartsForRun({ wavesCleared: 5, kills: 55, bossesDefeated: 1, difficultyId: "normal" }, config), 53);
assert.strictEqual(rules.rewardPartsForRun({ wavesCleared: 10, kills: 130, bossesDefeated: 2, difficultyId: "normal" }, config), 109);
assert.strictEqual(rules.rewardPartsForRun({ wavesCleared: 15, kills: 205, bossesDefeated: 3, difficultyId: "normal" }, config), 166);

const meta = rules.migrateMeta(null, { config });
const before = JSON.stringify(meta);
const result = rules.settleRunRewards({
  meta,
  run: { vehicleId: "land_rig", wavesCleared: 5, kills: 55, bossesDefeated: 1, score: 6400, difficultyId: "normal" },
  rng: () => 0,
  now: fixedNow,
  config
});

assert.strictEqual(JSON.stringify(meta), before, "settleRunRewards must not mutate input meta");
assert.strictEqual(result.reward.parts, 53);
assert.strictEqual(result.reward.blueprints.parts, undefined, "blueprints must not convert to parts");
assert.strictEqual(result.meta.parts, 53);
assert.strictEqual(result.meta.totalRuns, 1);
assert.strictEqual(result.meta.totalKills, 55);
assert.strictEqual(result.meta.totalBossKills, 1);
assert.strictEqual(result.meta.achievements.first_boss, true);
assert(result.reward.achievements.includes("first_boss"));

const second = rules.settleRunRewards({
  meta: result.meta,
  run: { vehicleId: "land_rig", wavesCleared: 5, kills: 55, bossesDefeated: 1, score: 6400, difficultyId: "normal" },
  rng: () => 0.99,
  now: fixedNow,
  config
});
assert(!second.reward.achievements.includes("first_boss"), "first boss achievement must not repeat");
assert.strictEqual(second.reward.parts, 53, "main currency formula must not depend on rng");

const enough = rules.migrateMeta(Object.assign({}, config.META_DEFAULT, { parts: 70 }), { config });
const hullCost = rules.getUpgradeCost(enough, "land_rig", "hull", config);
assert.strictEqual(hullCost, 30, "first hull upgrade should be reachable after a strong first boss run");
const bought = rules.buyUpgrade({
  meta: enough,
  vehicleId: "land_rig",
  track: "hull",
  now: fixedNow,
  config
});
assert.strictEqual(bought.purchase.ok, true);
assert.strictEqual(bought.purchase.cost, 30);
assert.strictEqual(bought.meta.parts, 40);
assert.strictEqual(bought.meta.vehicleLevels.land_rig.hull, 1);
assert.strictEqual(enough.parts, 70, "buyUpgrade must not mutate input meta");

const noRefundTracks = Object.values(config.ECONOMY.upgradeTracks).every((track) => {
  return !Object.prototype.hasOwnProperty.call(track, "refundParts") && !Object.prototype.hasOwnProperty.call(track, "partsReturn");
});
assert(noRefundTracks, "upgrade tracks must not define main-currency refunds");

Object.values(config.GATES).forEach((gate) => {
  assert(!Object.prototype.hasOwnProperty.call(gate.effect, "parts"), `${gate.id} must not grant permanent parts`);
});

console.log("Economy tests PASS");
