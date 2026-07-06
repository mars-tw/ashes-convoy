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
assert.deepStrictEqual(
  rules.rewardPartsBreakdownForRun({ wavesCleared: 5, kills: 55, bossesDefeated: 1, difficultyId: "normal" }, config),
  {
    waveParts: 20,
    killParts: 9,
    bossParts: 24,
    subtotal: 53,
    difficultyId: "normal",
    difficultyMul: 1,
    difficultyBonus: 0,
    minimumBonus: 0,
    total: 53
  }
);
const eventBreakdown = rules.rewardPartsBreakdownForRun(
  { wavesCleared: 5, kills: 55, bossesDefeated: 1, difficultyId: "normal", eventRewardMul: 1.2, eventParts: 4 },
  config
);
assert.strictEqual(eventBreakdown.eventBonus, 15, "sandstorm + meteor parts should be explicit event bonus");
assert.strictEqual(eventBreakdown.total, 68, "event bonus should add to normal run rewards");
const supplyBreakdown = rules.rewardPartsBreakdownForRun(
  { wavesCleared: 1, kills: 1, bossesDefeated: 0, difficultyId: "normal", supplyParts: 99, supplyCratesCollected: 5 },
  config
);
assert.strictEqual(supplyBreakdown.supplyParts, 12, "supply parts should respect the per-run cap");
assert.strictEqual(supplyBreakdown.supplyCrates, 5, "settlement should preserve supply crate count");

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
assert.strictEqual(result.reward.achievementParts, 24);
assert.strictEqual(result.reward.totalParts, 77);
assert.strictEqual(result.reward.partsBreakdown.waveParts, 20);
assert.strictEqual(result.reward.partsBreakdown.killParts, 9);
assert.strictEqual(result.reward.partsBreakdown.bossParts, 24);
assert.strictEqual(result.reward.blueprints.sky_barge, 1, "first boss should drop one sky barge blueprint with a low rng roll");
assert.strictEqual(result.reward.blueprints.parts, undefined, "blueprints must not convert to parts");
assert.strictEqual(result.meta.parts, 77);
assert.strictEqual(result.meta.totalRuns, 1);
assert.strictEqual(result.meta.totalKills, 55);
assert.strictEqual(result.meta.totalBossKills, 1);
assert.strictEqual(result.meta.questStats.environmentWins.land, 1, "clearing 3+ waves should advance environment quest stats");
assert.strictEqual(result.meta.blueprints.sky_barge, 1);
assert.strictEqual(result.meta.unlockedVehicles.sky_barge, false);
assert.strictEqual(result.meta.lastRun.earnedParts, 77);
assert.strictEqual(result.meta.lastRun.runParts, 53);
assert.strictEqual(result.meta.lastRun.achievementParts, 24);
assert.strictEqual(result.meta.lastRun.partsBreakdown.total, 53);
assert.strictEqual(result.meta.achievements.first_boss, true);
assert(result.reward.achievements.includes("first_boss"));
assert(result.reward.achievements.includes("first_kill"));
assert(result.reward.achievements.includes("wave_5"));
assert(result.reward.achievements.includes("sortie_land"));

const second = rules.settleRunRewards({
  meta: result.meta,
  run: { vehicleId: "land_rig", wavesCleared: 5, kills: 55, bossesDefeated: 1, score: 6400, difficultyId: "normal" },
  rng: () => 0.99,
  now: fixedNow,
  config
});
assert(!second.reward.achievements.includes("first_boss"), "first boss achievement must not repeat");
assert.strictEqual(second.reward.parts, 53, "main currency formula must not depend on rng");
assert.strictEqual(second.reward.achievementParts, 8, "second run should only pay the newly reached 100-kill achievement");
assert.deepStrictEqual(second.reward.achievements, ["total_kills_100"]);

const pity = rules.settleRunRewards({
  meta: rules.migrateMeta(null, { config }),
  run: { vehicleId: "land_rig", wavesCleared: 15, kills: 0, bossesDefeated: 3, score: 1500, difficultyId: "normal" },
  rng: () => 0.99,
  now: fixedNow,
  config
});
assert.strictEqual(pity.reward.blueprints.sky_barge, 1, "three bosses should trigger one guaranteed blueprint");

const wishlist = rules.settleRunRewards({
  meta: rules.migrateMeta(
    {
      version: config.META_VERSION,
      unlockedVehicles: { land_rig: true, sky_barge: false, sea_ark: false, void_runner: false },
      blueprints: { sky_barge: 0, sea_ark: 0, void_runner: 0 },
      blueprintWishlist: "sea_ark"
    },
    { config }
  ),
  run: { vehicleId: "land_rig", wavesCleared: 5, kills: 1, bossesDefeated: 1, score: 1500, difficultyId: "normal" },
  rng: () => 0,
  now: fixedNow,
  config
});
assert.strictEqual(wishlist.reward.blueprints.sea_ark, 1, "wishlist should prioritize sea ark blueprint drops");
assert.strictEqual(wishlist.meta.blueprints.sky_barge, 0, "wishlist should not spend the drop on sky first");

const eventAchievement = rules.settleRunRewards({
  meta: rules.migrateMeta(null, { config }),
  run: {
    vehicleId: "land_rig",
    wavesCleared: 2,
    kills: 1,
    bossesDefeated: 0,
    score: 300,
    difficultyId: "normal",
    eventStats: { sandstorm: { encounters: 1, completions: 1 } }
  },
  rng: () => 0.99,
  now: fixedNow,
  config
});
assert.strictEqual(eventAchievement.meta.eventStats.sandstorm.completions, 1);
assert.strictEqual(eventAchievement.meta.questStats.eventCompletions, 1, "completed events should advance quest stats");
assert(eventAchievement.reward.achievements.includes("event_sandstorm"), "first completed event should unlock its achievement");
const eventRepeat = rules.settleRunRewards({
  meta: eventAchievement.meta,
  run: {
    vehicleId: "land_rig",
    wavesCleared: 2,
    kills: 1,
    bossesDefeated: 0,
    score: 300,
    difficultyId: "normal",
    eventStats: { sandstorm: { encounters: 1, completions: 1 } }
  },
  rng: () => 0.99,
  now: fixedNow,
  config
});
assert(!eventRepeat.reward.achievements.includes("event_sandstorm"), "event achievements should not repeat");

const questOnlyProgress = rules.settleRunRewards({
  meta: rules.migrateMeta(null, { config }),
  run: {
    vehicleId: "land_rig",
    wavesCleared: 1,
    kills: 3,
    bossesDefeated: 0,
    score: 300,
    difficultyId: "normal",
    supplyCratesCollected: 2,
    variantKills: { runner_frenzy: 2 },
    damageTimeline: { 1: 20, 2: 45 },
    recentDamageEvents: [{ time: 9, source: "enemy", amount: 12, buffs: ["射速門"] }],
    damageTakenBy: { enemy: 12 },
    damageDealt: 65,
    duration: 10
  },
  rng: () => 0.99,
  now: fixedNow,
  config
});
assert.strictEqual(questOnlyProgress.meta.questStats.supplyCrates, 2, "supply pickup should advance quest stats");
assert.strictEqual(questOnlyProgress.meta.questStats.variantKills, 2, "variant kills should advance quest stats");
assert.strictEqual(questOnlyProgress.meta.lastRun.damageTimeline["2"], 45, "settlement should preserve damage timeline buckets");
assert.strictEqual(questOnlyProgress.meta.lastRun.recentDamageEvents[0].source, "enemy", "settlement should preserve death-window damage events");
assert.strictEqual(questOnlyProgress.meta.parts, questOnlyProgress.reward.totalParts, "quest progress alone should not auto-issue quest rewards");

const unlockedSky = rules.settleRunRewards({
  meta: rules.migrateMeta(null, { config }),
  run: { vehicleId: "land_rig", wavesCleared: 15, kills: 1, bossesDefeated: 3, score: 1500, difficultyId: "normal" },
  rng: () => 0,
  now: fixedNow,
  config
});
assert.strictEqual(unlockedSky.meta.blueprints.sky_barge, 3);
assert.strictEqual(unlockedSky.meta.unlockedVehicles.sky_barge, true, "three sky blueprints should unlock the sky barge");
assert(unlockedSky.reward.unlockedVehicles.includes("sky_barge"));

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

const armored = rules.buyUpgrade({
  meta: enough,
  vehicleId: "land_rig",
  track: "land_armor",
  now: fixedNow,
  config
});
assert.strictEqual(armored.purchase.ok, true);
assert.strictEqual(armored.purchase.cost, 45);
assert.strictEqual(armored.meta.vehicleLevels.land_rig.land_armor, 1);
assert.strictEqual(rules.getVehicleStats("land_rig", armored.meta, config).armor, config.VEHICLES.land_rig.armor + 2);

const noRefundTracks = Object.values(config.ECONOMY.upgradeTracks).every((track) => {
  return !Object.prototype.hasOwnProperty.call(track, "refundParts") && !Object.prototype.hasOwnProperty.call(track, "partsReturn");
});
assert(noRefundTracks, "upgrade tracks must not define main-currency refunds");

Object.values(config.GATES).forEach((gate) => {
  assert(!Object.prototype.hasOwnProperty.call(gate.effect, "parts"), `${gate.id} must not grant permanent parts`);
});

console.log("Economy tests PASS");
