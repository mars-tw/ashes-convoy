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
const baseShot = rules.calculateShotStats({ vehicleId: "iron_crow", meta, runMods: rules.defaultRunMods(), config });
const boostedShot = rules.calculateShotStats({ vehicleId: "iron_crow", meta, runMods: damageGate.runMods, config });
assert(boostedShot.damage > baseShot.damage, "damage gate should affect shot damage");
assert(Number.isFinite(baseShot.muzzleOffset) && baseShot.muzzleOffset > 0, "shot stats should expose muzzle offset");

const skiffShot = rules.calculateShotStats({ vehicleId: "dawn_skiff", meta, runMods: rules.defaultRunMods(), config });
assert.notStrictEqual(baseShot.fireInterval, skiffShot.fireInterval, "vehicle weapons should feel different");
assert.notStrictEqual(baseShot.projectiles, skiffShot.projectiles, "vehicle projectile patterns should differ");
assert.strictEqual(skiffShot.baseProjectiles, 2, "dawn skiff should keep two full-damage base projectiles");
const skiffRate = rules.calculateShotStats({
  vehicleId: "dawn_skiff",
  meta,
  runMods: rateGate.runMods,
  config
});
assert(skiffRate.fireInterval < skiffShot.fireInterval, "rate gate should affect dawn skiff");
assert(skiffRate.fireInterval >= Math.max(0.08, config.WEAPONS.pulse_burst.fireInterval * 0.55), "rate gate should respect weapon-scaled floor");

console.log("Rules tests PASS");
