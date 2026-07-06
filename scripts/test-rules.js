"use strict";

const assert = require("assert");
const config = require("../src/config.js");
const rules = require("../src/rules.js");

function fixedRng(values) {
  let index = 0;
  return function rng() {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

const waveA = rules.generateWave({ wave: 3, rng: rules.createSeededRng("same"), config });
const waveB = rules.generateWave({ wave: 3, rng: rules.createSeededRng("same"), config });
assert.deepStrictEqual(waveA, waveB, "wave generation must be deterministic for the same rng seed");
assert.strictEqual(waveA.boss, false);
assert(waveA.spawns.length > 0, "normal wave should spawn enemies");

const openingWave = rules.generateWave({ wave: 1, rng: rules.createSeededRng("opening"), config });
const openingShamblers = openingWave.spawns.filter((spawn) => spawn.time <= 10 && spawn.enemyId === "shambler");
assert(openingShamblers.length >= 12, "wave 1 should open with a shambler cluster");
const openingXs = openingShamblers.map((spawn) => spawn.x);
const openingSpread = Math.max(...openingXs) - Math.min(...openingXs);
assert(openingSpread >= 36, `opening horde should spread across multiple rows, got ${openingSpread}`);
openingShamblers.forEach((spawn) => {
  assert(spawn.x >= config.LOGIC.roadLeft && spawn.x <= config.LOGIC.roadRight, "opening enemies should spawn on the road");
});
assert(openingWave.gates[0].time >= 8 && openingWave.gates[0].time <= 11, "first gate should be scheduled in the 8-11s window");

const bossWave = rules.generateWave({ wave: 5, rng: fixedRng([0.1, 0.2, 0.3, 0.4]), config });
assert.strictEqual(bossWave.boss, true, "wave 5 should be a boss wave");
assert(bossWave.spawns.some((spawn) => spawn.enemyId === "boss_hive_titan"), "wave 5 should spawn hive titan");

const airEventWave = rules.generateWave({ wave: 3, vehicleId: "sky_barge", rng: fixedRng([0.1, 0.9, 0.9, 0.9]), config });
assert(airEventWave.environmentEvent && airEventWave.environmentEvent.id === "turbulence", "low event roll should trigger air turbulence");
const airSpawn = airEventWave.spawns.find((spawn) => spawn.enemyId !== "boss_hive_titan");
assert(airSpawn.speed >= rules.scaledEnemyStats(airSpawn.enemyId, 3, config).speed * 1.14, "turbulence should speed up enemies");

const variantWave = rules.generateWave({ wave: 8, vehicleId: "land_rig", rng: () => 0, config });
const variantSpawn = variantWave.spawns.find((spawn) => spawn.variantId);
assert(variantSpawn, "late waves should be able to mix enemy variants");
assert(["runner_frenzy", "shambler_hardened"].includes(variantSpawn.variantId), `unexpected variant ${variantSpawn.variantId}`);
assert(variantSpawn.tint || variantSpawn.filter, "variant spawns should carry canvas tint/filter metadata");

const noSupply = rules.rollSupplyDrop({ killsSinceDrop: 0, rng: () => 0.99, config });
assert.strictEqual(noSupply.dropped, false, "high roll should not drop a supply cache before pity");
assert.strictEqual(noSupply.killsSinceDrop, 1);
const pitySupply = rules.rollSupplyDrop({ killsSinceDrop: 24, rng: () => 0.99, config });
assert.strictEqual(pitySupply.dropped, true, "25th kill should guarantee a supply cache");
assert.strictEqual(pitySupply.guaranteed, true);
assert.strictEqual(pitySupply.killsSinceDrop, 0);
assert.strictEqual(rules.chooseSupplyReward(() => 0, config).id, "rate_boost", "supply rewards should be deterministic with injected rng");

const eventStats = rules.mergeEventStats(
  { meteor_shower: { encounters: 1, completions: 0 } },
  { meteor_shower: { encounters: 1, completions: 1 } },
  config
);
assert.strictEqual(eventStats.meteor_shower.encounters, 2);
assert.strictEqual(eventStats.meteor_shower.completions, 1);

const assistVehicle = { x: 98, y: config.LOGIC.vehicleY, radius: 18 };
const burstTarget = rules.selectAimAssistTarget({
  vehicle: assistVehicle,
  enemies: [
    { id: "near", enemyId: "shambler", x: 99, y: 252, hp: 20, speed: 36, vy: 36 },
    { id: "fast", enemyId: "runner", x: 140, y: 222, hp: 20, speed: 118, vy: 118 },
    { id: "burst", enemyId: "bloater", x: 100, y: 312, hp: 20, speed: 34, vy: 34 }
  ],
  config
});
assert.strictEqual(burstTarget.id, "burst", "aim assist should prioritize bloater burst risk");
assert.strictEqual(burstTarget.reason, "burst");

const fastTarget = rules.selectAimAssistTarget({
  vehicle: assistVehicle,
  enemies: [
    { id: "near", enemyId: "shambler", x: 99, y: 252, hp: 20, speed: 36, vy: 36 },
    { id: "fast", enemyId: "runner", x: 140, y: 222, hp: 20, speed: 118, vy: 118 }
  ],
  config
});
assert.strictEqual(fastTarget.id, "fast", "aim assist should prefer fast runner over nearest shambler");
assert.strictEqual(rules.aimAssistStrength({ aimAssistLevel: "off" }), 0);
assert(rules.aimAssistStrength({ aimAssistLevel: "high" }) > rules.aimAssistStrength({ aimAssistLevel: "low" }));

const recommendationMeta = rules.migrateMeta(
  {
    version: config.META_VERSION,
    parts: 1000,
    unlockedVehicles: { land_rig: true, sky_barge: true, sea_ark: true, void_runner: true }
  },
  { config }
);
const bossRecommendation = rules.recommendUpgradeForRun({
  meta: recommendationMeta,
  run: { vehicleId: "land_rig", wavesCleared: 5, deathContext: { type: "boss" }, damageTakenBy: { boss: 220 } },
  config
});
assert(["land_armor", "land_resist", "hull"].includes(bossRecommendation.track), "boss deaths should recommend survivability");
assert(bossRecommendation.reason.includes("Boss"), "boss recommendation should include a reason");
const mobRecommendation = rules.recommendUpgradeForRun({
  meta: recommendationMeta,
  run: { vehicleId: "land_rig", wavesCleared: 3, deathContext: { type: "enemy" }, damageTakenBy: { enemy: 180 } },
  config
});
assert(["weapon", "energy"].includes(mobRecommendation.track), "mob deaths should recommend clear speed");
const lateRecommendation = rules.recommendUpgradeForRun({
  meta: recommendationMeta,
  run: { vehicleId: "sea_ark", wavesCleared: 10, deathContext: { type: "enemy" } },
  config
});
assert(lateRecommendation.track.indexOf("sea_") === 0, "high wave runs should recommend vehicle-specific nodes");

const questNow = "2026-07-06T00:00:00.000Z";
const questMeta = rules.ensureQuestState(rules.migrateMeta(null, { config }), { now: questNow, config });
const boardA = rules.getQuestBoard(questMeta, { now: questNow, config });
const boardB = rules.getQuestBoard(questMeta, { now: questNow, config });
assert.strictEqual(boardA.length, 2, "quest board should expose one daily and one weekly quest");
assert.deepStrictEqual(boardA.map((quest) => quest.instanceId), boardB.map((quest) => quest.instanceId), "quest rotation should be deterministic by date seed");
const readyQuestMeta = rules.deepClone(questMeta);
const dailyQuest = boardA.find((quest) => quest.period === "daily");
if (dailyQuest.metric === "variantKills") readyQuestMeta.questStats.variantKills += dailyQuest.target;
if (dailyQuest.metric === "eventCompletions") readyQuestMeta.questStats.eventCompletions += dailyQuest.target;
if (dailyQuest.metric === "supplyCrates") readyQuestMeta.questStats.supplyCrates += dailyQuest.target;
if (dailyQuest.metric === "environmentWins") readyQuestMeta.questStats.environmentWins[dailyQuest.environment] += dailyQuest.target;
const claimedQuest = rules.claimQuestReward({ meta: readyQuestMeta, instanceId: dailyQuest.instanceId, now: questNow, config });
assert.strictEqual(claimedQuest.claim.ok, true, "ready daily quest should be claimable");
assert.strictEqual(claimedQuest.claim.rewardParts, 5);
const claimedAgain = rules.claimQuestReward({ meta: claimedQuest.meta, instanceId: dailyQuest.instanceId, now: questNow, config });
assert.strictEqual(claimedAgain.claim.ok, false, "quest rewards should be gated once per instance");
assert.strictEqual(claimedAgain.claim.reason, "claimed");

const encodedSave = rules.encodeSaveMeta(Object.assign({}, config.META_DEFAULT, { parts: 42 }), { config });
assert.strictEqual(typeof encodedSave, "string");
assert(encodedSave.length > 20, "encoded save should be a base64 payload");
const decodedSave = rules.decodeSaveMeta(encodedSave, { config });
assert.strictEqual(decodedSave.ok, true, "valid save code should decode");
assert.strictEqual(decodedSave.meta.parts, 42);
const badSave = rules.decodeSaveMeta("not valid base64", { config });
assert.strictEqual(badSave.ok, false, "bad save code should be rejected");

assert(rules.enemyHpScale(4, config) > rules.enemyHpScale(1, config), "enemy hp should scale by wave");
assert(rules.enemySpeedScale(8, config) > rules.enemySpeedScale(1, config), "enemy speed should scale by wave");
assert(rules.waveBudget(4, config) > rules.waveBudget(1, config), "wave budget should grow");

const shambler1 = rules.scaledEnemyStats("shambler", 1, config);
const shambler4 = rules.scaledEnemyStats("shambler", 4, config);
assert(shambler4.hp > shambler1.hp, "scaled enemy hp must grow");
assert(shambler4.speed > shambler1.speed, "scaled enemy speed must grow");

const baseMods = rules.defaultRunMods();
const damageGate = rules.applyGateEffect({
  gateId: "damage_plus",
  runMods: baseMods,
  vehicleLevels: { hull: 0, weapon: 0, energy: 0, gate: 0 },
  config
});
assert.strictEqual(baseMods.damageAdd, 0, "applyGateEffect must not mutate input mods");
assert(damageGate.runMods.damageAdd > 0, "damage gate should increase damageAdd");

const rateGate = rules.applyGateEffect({
  gateId: "rate_plus",
  runMods: baseMods,
  vehicleLevels: { hull: 0, weapon: 0, energy: 0, gate: 0 },
  config
});
assert(rateGate.runMods.fireIntervalMul < 1, "rate gate should reduce fire interval multiplier");

const multishot = rules.applyGateEffect({
  gateId: "multishot_plus",
  runMods: baseMods,
  vehicleLevels: { hull: 0, weapon: 0, energy: 0, gate: 0 },
  config
});
assert.strictEqual(multishot.runMods.projectileAdd, 1);

const repaired = rules.applyGateEffect({
  gateId: "repair",
  runMods: baseMods,
  vehicle: { hp: 100, maxHp: 200, shield: 0 },
  vehicleLevels: { hull: 0, weapon: 0, energy: 0, gate: 0 },
  config
});
assert.strictEqual(repaired.vehicle.hp, 136, "repair gate should heal 18% max hp");

const enemy = { id: "e1", hp: 10 };
const damaged = rules.damageEnemy(enemy, 12);
assert.strictEqual(enemy.hp, 10, "damageEnemy must not mutate input");
assert.strictEqual(damaged.hp, 0);
assert.strictEqual(damaged.dead, true);

const meta = rules.migrateMeta(null, { config });
const baseShot = rules.calculateShotStats({ vehicleId: "land_rig", meta, runMods: rules.defaultRunMods(), config });
const boostedShot = rules.calculateShotStats({ vehicleId: "land_rig", meta, runMods: damageGate.runMods, config });
assert(boostedShot.damage > baseShot.damage, "damage gate should affect shot damage");
assert(Number.isFinite(baseShot.muzzleOffset) && baseShot.muzzleOffset > 0, "shot stats should expose muzzle offset");

const fleetShots = Object.keys(config.VEHICLES).map((vehicleId) => ({
  vehicleId,
  shot: rules.calculateShotStats({ vehicleId, meta, runMods: rules.defaultRunMods(), config })
}));
assert.strictEqual(fleetShots.length, 4, "four fleet vehicles should calculate shot stats");
assert.strictEqual(new Set(fleetShots.map((entry) => entry.shot.weaponId)).size, 4, "fleet weapons should feel distinct");
assert(fleetShots.find((entry) => entry.vehicleId === "sea_ark").shot.splash > 0, "sea ark should expose splash damage");
assert(fleetShots.find((entry) => entry.vehicleId === "void_runner").shot.pierce > 0, "void runner should expose piercing shots");
assert(fleetShots.find((entry) => entry.vehicleId === "sky_barge").shot.fireInterval < baseShot.fireInterval, "sky barge should fire faster than land rig");
const voidRate = rules.calculateShotStats({
  vehicleId: "void_runner",
  meta,
  runMods: rateGate.runMods,
  config
});
const voidShot = fleetShots.find((entry) => entry.vehicleId === "void_runner").shot;
assert(voidRate.fireInterval < voidShot.fireInterval, "rate gate should affect void runner");
assert(voidRate.fireInterval >= Math.max(0.08, config.WEAPONS.void_lance.fireInterval * 0.55), "rate gate should respect weapon-scaled floor");

const specialMeta = rules.migrateMeta(
  {
    version: config.META_VERSION,
    unlockedVehicles: { land_rig: true, sky_barge: true, sea_ark: true, void_runner: true },
    vehicleLevels: {
      sky_barge: { sky_overclock: 2 },
      sea_ark: { sea_splash: 2 },
      void_runner: { void_pierce: 1 },
      land_rig: { land_resist: 2 }
    }
  },
  { config }
);
const skySpecial = rules.calculateShotStats({ vehicleId: "sky_barge", meta: specialMeta, runMods: rules.defaultRunMods(), config });
const skyBase = fleetShots.find((entry) => entry.vehicleId === "sky_barge").shot;
assert(skySpecial.fireInterval < skyBase.fireInterval, "sky overclock should reduce fire interval");
const seaSpecial = rules.calculateShotStats({ vehicleId: "sea_ark", meta: specialMeta, runMods: rules.defaultRunMods(), config });
const seaBase = fleetShots.find((entry) => entry.vehicleId === "sea_ark").shot;
assert.strictEqual(seaSpecial.splash, seaBase.splash + 16, "sea splash node should add splash radius");
const voidSpecial = rules.calculateShotStats({ vehicleId: "void_runner", meta: specialMeta, runMods: rules.defaultRunMods(), config });
assert.strictEqual(voidSpecial.pierce, voidShot.pierce + 1, "void pierce node should add one pierce");
const landSpecial = rules.getVehicleStats("land_rig", specialMeta, config);
assert(landSpecial.damageTakenMul < 1, "land resist node should reduce incoming damage multiplier");

console.log("Rules tests PASS");
