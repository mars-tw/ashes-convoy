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
assert(config.ENEMY_VARIANTS[variantSpawn.variantId], `unexpected variant ${variantSpawn.variantId}`);
assert(variantSpawn.tint || variantSpawn.filter, "variant spawns should carry canvas tint/filter metadata");
["swarm_venom", "bloater_volatile", "spitter_corrosive", "husk_bulwark"].forEach((variantId) => {
  const variant = config.ENEMY_VARIANTS[variantId];
  const base = config.ENEMIES[variant.baseEnemy];
  const spawn = rules.applyEnemyVariantToSpawn(
    { enemyId: base.id, hp: base.hp, speed: base.speed },
    variant.minWave,
    () => 0,
    config
  );
  assert.strictEqual(spawn.variantId, variantId, `${variantId} should be selectable at its min wave`);
  assert(spawn.hp >= Math.round(base.hp * 0.7) && spawn.hp <= Math.round(base.hp * 1.45), `${variantId} hp should stay inside the variant envelope`);
  assert(spawn.speed >= base.speed * 0.75 && spawn.speed <= base.speed * 1.2, `${variantId} speed should stay inside the variant envelope`);
});

const noSupply = rules.rollSupplyDrop({ killsSinceDrop: 0, rng: () => 0.99, config });
assert.strictEqual(noSupply.dropped, false, "high roll should not drop a supply cache before pity");
assert.strictEqual(noSupply.killsSinceDrop, 1);
const pitySupply = rules.rollSupplyDrop({ killsSinceDrop: 24, rng: () => 0.99, config });
assert.strictEqual(pitySupply.dropped, true, "25th kill should guarantee a supply cache");
assert.strictEqual(pitySupply.guaranteed, true);
assert.strictEqual(pitySupply.killsSinceDrop, 0);
assert.strictEqual(rules.chooseSupplyReward(() => 0, config).id, "rate_boost", "supply rewards should be deterministic with injected rng");
const shieldSupply = rules.applySupplyRewardById({
  rewardId: "overshield",
  vehicle: { hp: 160, maxHp: 200, shield: 110, maxShield: 120 },
  stats: {},
  config
});
assert.strictEqual(shieldSupply.vehicle.maxShield, 120, "overshield should preserve the max shield cap");
assert.strictEqual(shieldSupply.vehicle.shield, 120, "overshield should grant shield but cap at 60% max HP");
assert.strictEqual(shieldSupply.shieldGained, 24, "overshield should calculate 12% max HP");

const wave1Pool = rules.enemyPoolForWave(1, config).map((enemy) => enemy.id).sort();
assert.deepStrictEqual(wave1Pool, ["runner", "shambler"], "wave 1 pool should preserve the original opening enemies");
const wave3Pool = rules.enemyPoolForWave(3, config).map((enemy) => enemy.id);
assert(wave3Pool.includes("swarm_mite") && wave3Pool.includes("spore_spitter") && wave3Pool.includes("shield_husk"), "wave 3 should introduce swarm/ranged/shield enemies");
assert(!wave3Pool.includes("tar_brute") && !wave3Pool.includes("void_wraith"), "elite and phase enemies should enter later");
const wave4Pool = rules.enemyPoolForWave(4, config).map((enemy) => enemy.id);
assert(wave4Pool.includes("ember_tick"), "wave 4 should introduce ember ticks");
const wave5Pool = rules.enemyPoolForWave(5, config).map((enemy) => enemy.id);
assert(wave5Pool.includes("ash_screamer"), "wave 5 should introduce ash screamer");
const wave7Pool = rules.enemyPoolForWave(7, config).map((enemy) => enemy.id);
assert(wave7Pool.includes("chain_tether"), "wave 7 should introduce chain tether");
const wave8Pool = rules.enemyPoolForWave(8, config).map((enemy) => enemy.id);
assert(wave8Pool.includes("mirror_husk"), "wave 8 should introduce mirror husk");

const weightedWave8Pool = rules.enemyPoolForWave(8, config).map((enemy) => ({
  enemyId: enemy.id,
  weight: Number.isFinite(enemy.poolWeight) ? enemy.poolWeight : enemy.id === "bloater" ? 0.65 : enemy.id === "runner" ? 1.15 : 1
}));
const weightedCounts = Object.fromEntries(weightedWave8Pool.map((item) => [item.enemyId, 0]));
const weightedRng = rules.createSeededRng("fractional-pool-weight-histogram");
const weightedSamples = 12000;
for (let i = 0; i < weightedSamples; i += 1) {
  const picked = rules.pickWeighted(weightedWave8Pool, weightedRng);
  weightedCounts[picked.enemyId] += 1;
}
const weightedTotal = weightedWave8Pool.reduce((sum, item) => sum + item.weight, 0);
weightedWave8Pool.forEach((item) => {
  const expected = item.weight / weightedTotal;
  const actual = weightedCounts[item.enemyId] / weightedSamples;
  assert(Math.abs(actual - expected) < 0.025, `${item.enemyId} poolWeight share should follow fractional config: expected ${expected}, got ${actual}`);
});
assert(weightedCounts.tar_brute < weightedCounts.runner * 0.4, "tar_brute fractional poolWeight should not be clamped to runner frequency");

const zeroWeightPool = [
  { enemyId: "zero_a", weight: 0 },
  { enemyId: "zero_b", weight: 0 },
  { enemyId: "zero_c", weight: 0 }
];
const zeroCounts = { zero_a: 0, zero_b: 0, zero_c: 0 };
const zeroFallbackRng = fixedRng([0, 0.2, 0.34, 0.5, 0.67, 0.99]);
for (let i = 0; i < 3000; i += 1) {
  const picked = rules.pickWeighted(zeroWeightPool, zeroFallbackRng);
  zeroCounts[picked.enemyId] += 1;
}
assert.deepStrictEqual(zeroCounts, { zero_a: 1000, zero_b: 1000, zero_c: 1000 }, "all-zero weights should fall back to a safe uniform pick");

const rangedShot = rules.resolveEnemyRangedAttack({
  enemy: {
    enemyId: "spore_spitter",
    x: 96,
    y: 245,
    radius: config.ENEMIES.spore_spitter.radius,
    attackCooldown: 0,
    behavior: config.ENEMIES.spore_spitter.behavior
  },
  vehicle: { x: 98, y: config.LOGIC.vehicleY, radius: config.VEHICLES.land_rig.radius },
  dt: 0.1,
  config
});
assert.strictEqual(rangedShot.fire, true, "spore spitter should fire when in range and off cooldown");
assert(rangedShot.projectile && rangedShot.projectile.vy > 0 && rangedShot.projectile.damage === config.ENEMIES.spore_spitter.behavior.projectileDamage, "ranged shot should target the vehicle with configured damage");
const rangedCooldown = rules.resolveEnemyRangedAttack({
  enemy: {
    enemyId: "spore_spitter",
    x: 96,
    y: 245,
    attackCooldown: 1,
    behavior: config.ENEMIES.spore_spitter.behavior
  },
  vehicle: { x: 98, y: config.LOGIC.vehicleY },
  dt: 0.1,
  config
});
assert.strictEqual(rangedCooldown.fire, false, "spore spitter should respect cooldown");
const screamShot = rules.resolveEnemyRangedAttack({
  enemy: {
    enemyId: "ash_screamer",
    x: 96,
    y: 248,
    radius: config.ENEMIES.ash_screamer.radius,
    attackCooldown: 0,
    behavior: config.ENEMIES.ash_screamer.behavior
  },
  vehicle: { x: 98, y: config.LOGIC.vehicleY, radius: config.VEHICLES.land_rig.radius },
  dt: 0.1,
  config
});
assert.strictEqual(screamShot.fire, true, "ash screamer should reuse ranged behavior");
assert.strictEqual(screamShot.projectile.kind, "scream", "ash screamer projectile should be visually distinguishable");
assert(screamShot.projectile.damage <= 8, "ash screamer projectile damage should respect the P0 cap");

const shieldDamage = rules.resolveEnemyIncomingDamage({
  enemy: { enemyId: "shield_husk", x: 100, y: 150, hp: 52, shieldHp: 28, behavior: config.ENEMIES.shield_husk.behavior },
  damage: 20,
  projectile: { vx: 0, vy: -220 },
  shieldFacing: { x: 100, y: config.LOGIC.vehicleY },
  config
});
assert.strictEqual(shieldDamage.shieldHp, 8, "shield should absorb incoming front damage first");
assert.strictEqual(Math.round(shieldDamage.appliedDamage * 10) / 10, 6.4, "shielded front hit should leak reduced hp damage");
assert.strictEqual(Math.round(shieldDamage.hp * 10) / 10, 45.6, "shield husk hp should only receive leaked damage");
const rearScreenShieldDamage = rules.resolveEnemyIncomingDamage({
  enemy: { enemyId: "shield_husk", x: 100, y: config.LOGIC.vehicleY + 42, hp: 52, shieldHp: 28, behavior: config.ENEMIES.shield_husk.behavior },
  damage: 20,
  projectile: { vx: 0, vy: 220, source: "companion" },
  shieldFacing: { x: 100, y: config.LOGIC.vehicleY },
  config
});
assert.strictEqual(rearScreenShieldDamage.shieldHp, 8, "shield should absorb downward shots when the husk is facing the trailer from below");
assert.strictEqual(Math.round(rearScreenShieldDamage.hp * 10) / 10, 45.6, "rear-screen shield hit should still leak only mitigated hp damage");
const sideScreenShieldDamage = rules.resolveEnemyIncomingDamage({
  enemy: { enemyId: "shield_husk", x: 134, y: config.LOGIC.vehicleY, hp: 52, shieldHp: 28, behavior: config.ENEMIES.shield_husk.behavior },
  damage: 20,
  projectile: { vx: 220, vy: 0, source: "companion" },
  shieldFacing: { x: 100, y: config.LOGIC.vehicleY },
  config
});
assert.strictEqual(sideScreenShieldDamage.shieldHp, 8, "shield should absorb side-screen shots that arrive from the trailer-facing arc");
const nonFacingShieldDamage = rules.resolveEnemyIncomingDamage({
  enemy: { enemyId: "shield_husk", x: 100, y: 150, hp: 52, shieldHp: 28, behavior: config.ENEMIES.shield_husk.behavior },
  damage: 20,
  projectile: { vx: 0, vy: 220, source: "companion" },
  shieldFacing: { x: 100, y: config.LOGIC.vehicleY },
  config
});
assert.strictEqual(nonFacingShieldDamage.shieldHp, 28, "shield should not absorb a reverse shot from outside the trailer-facing arc");
assert.strictEqual(nonFacingShieldDamage.hp, 32, "reverse shots outside the front arc should keep the existing weak-side hp behavior");
const phaseDamage = rules.resolveEnemyIncomingDamage({
  enemy: { enemyId: "void_wraith", hp: 42, phaseActive: true, behavior: config.ENEMIES.void_wraith.behavior },
  damage: 20,
  projectile: { vy: -220 },
  config
});
assert.strictEqual(phaseDamage.appliedDamage, 9, "phase enemy should reduce damage while phased");
const mirrorFront = rules.resolveEnemyIncomingDamage({
  enemy: { enemyId: "mirror_husk", x: 100, y: 150, hp: 58, shieldHp: 46, behavior: config.ENEMIES.mirror_husk.behavior },
  damage: 20,
  projectile: { vx: 0, vy: -220 },
  shieldFacing: { x: 100, y: config.LOGIC.vehicleY },
  config
});
assert(mirrorFront.appliedDamage <= 2, "mirror husk front should almost nullify direct fire while shielded");
const mirrorBack = rules.resolveEnemyIncomingDamage({
  enemy: { enemyId: "mirror_husk", x: 100, y: 150, hp: 58, shieldHp: 46, behavior: config.ENEMIES.mirror_husk.behavior },
  damage: 20,
  projectile: { vx: 0, vy: 220 },
  shieldFacing: { x: 100, y: config.LOGIC.vehicleY },
  config
});
assert.strictEqual(mirrorBack.hp, 38, "mirror husk back side should remain weak to reverse shots");

let mixedNew = 0;
let mixedTotal = 0;
for (let seed = 0; seed < 20; seed += 1) {
  const plan = rules.generateWave({ wave: 6, vehicleId: "land_rig", rng: rules.createSeededRng(`r52-mix-${seed}`), config });
  const nonBoss = plan.spawns.filter((spawn) => spawn.enemyId !== "boss_hive_titan");
  mixedTotal += nonBoss.length;
  mixedNew += nonBoss.filter((spawn) => ["spore_spitter", "shield_husk", "swarm_mite", "tar_brute", "void_wraith", "ash_screamer", "ember_tick"].includes(spawn.enemyId)).length;
  const cost = nonBoss.reduce((sum, spawn) => sum + config.ENEMIES[spawn.enemyId].budgetCost, 0);
  assert(cost / Math.max(1, nonBoss.length) <= 4.2, "wave 6 average enemy budget cost should stay controlled");
}
const newShare = mixedNew / mixedTotal;
assert(newShare > 0.12 && newShare < 0.62, `new enemy share should be present but not dominate, got ${newShare}`);

let focusSeen = false;
for (let seed = 0; seed < 40 && !focusSeen; seed += 1) {
  const plan = rules.generateWave({ wave: 4, vehicleId: "land_rig", rng: rules.createSeededRng(`focus-gate-${seed}`), config });
  focusSeen = plan.gates.some((gate) => gate.options.includes("gate_focus"));
}
assert.strictEqual(focusSeen, true, "gate_focus should enter the Boss-prep wave gate pool");
for (let seed = 0; seed < 20; seed += 1) {
  const plan = rules.generateWave({ wave: 3, vehicleId: "land_rig", rng: rules.createSeededRng(`no-focus-${seed}`), config });
  assert(plan.gates.every((gate) => !gate.options.includes("gate_focus")), "gate_focus should stay out of ordinary gate pairs");
}
const primaryLandEvent = rules.chooseEnvironmentEvent({ wave: 4, vehicleId: "land_rig", rng: () => 0.05, config });
assert.strictEqual(primaryLandEvent.id, "sandstorm", "low event roll should choose the primary land event");
assert.strictEqual(primaryLandEvent.alternates, undefined, "selected events should not carry alternate config payloads");
const alternateLandEvent = rules.chooseEnvironmentEvent({ wave: 4, vehicleId: "land_rig", rng: () => 0.35, config });
assert.strictEqual(alternateLandEvent.id, "land_blackout", "middle event roll should choose the mutually exclusive land alternate");
const noLandEvent = rules.chooseEnvironmentEvent({ wave: 4, vehicleId: "land_rig", rng: () => 0.8, config });
assert.strictEqual(noLandEvent, null, "high event roll should produce no environment event");
const airStaticEvent = rules.chooseEnvironmentEvent({ wave: 4, vehicleId: "sky_barge", rng: () => 0.35, config });
assert.strictEqual(airStaticEvent.id, "air_static", "air static should be selectable as the air alternate");
assert.strictEqual(airStaticEvent.enemyProjectileSpeedMul, 0.88, "air static should expose slower enemy projectile tuning");
const migratedEventStats = rules.migrateMeta({ eventStats: { sandstorm: { encounters: 2, completions: 1 } } }, { config }).eventStats;
assert.strictEqual(migratedEventStats.land_blackout.encounters, 0, "old saves should gain alternate event stats with zero counts");
const eventCodex = rules.getEventCodexProgress(rules.migrateMeta(null, { config }), config);
["sandstorm", "land_blackout", "air_static", "sea_fogbank", "space_echo"].forEach((eventId) => {
  assert(eventCodex.some((entry) => entry.id === eventId), `${eventId} should appear in event codex progress`);
});

function simulateSupplyReachability(startX) {
  const vehicle = { x: config.LOGIC.width * 0.5, y: config.LOGIC.vehicleY, radius: config.VEHICLES.land_rig.radius };
  let drop = {
    x: startX,
    y: vehicle.y - 150,
    vy: config.SUPPLY_DROPS.crateSpeed,
    radius: 12,
    age: 0,
    ttl: config.SUPPLY_DROPS.ttl,
    picked: false
  };
  const startDx = Math.abs(vehicle.x - drop.x);
  let minDistance = Infinity;
  for (let i = 0; i < Math.ceil(drop.ttl / 0.1); i += 1) {
    const result = rules.stepSupplyDropMotion({ drop, vehicle, dt: 0.1, config });
    drop = result.drop;
    minDistance = Math.min(minDistance, result.distanceAfter);
    if (result.distanceAfter <= config.SUPPLY_DROPS.pickupRadius + vehicle.radius) {
      return { reached: true, startDx, endDx: Math.abs(vehicle.x - drop.x), age: drop.age, minDistance };
    }
  }
  return { reached: false, startDx, endDx: Math.abs(vehicle.x - drop.x), age: drop.age, minDistance };
}
const leftSupply = simulateSupplyReachability(0);
assert(leftSupply.endDx < leftSupply.startDx * 0.45, "left edge supply should drift toward the vehicle x position");
assert(leftSupply.reached, `left edge supply should become reachable before ttl, min distance ${leftSupply.minDistance}`);
const rightSupply = simulateSupplyReachability(config.LOGIC.width);
assert(rightSupply.endDx < rightSupply.startDx * 0.45, "right edge supply should drift toward the vehicle x position");
assert(rightSupply.reached, `right edge supply should become reachable before ttl, min distance ${rightSupply.minDistance}`);

const noScavenge = rules.rollScavengeDrop({ killsSinceDrop: 0, rng: () => 0.99, config });
assert.strictEqual(noScavenge.dropped, false, "high roll should not drop scavenge goods before pity");
assert.strictEqual(noScavenge.killsSinceDrop, 1);
const pityScavenge = rules.rollScavengeDrop({ killsSinceDrop: 8, rng: () => 0.99, config });
assert.strictEqual(pityScavenge.dropped, true, "ninth kill should guarantee one scavenge good");
assert.strictEqual(pityScavenge.goods, 1);
assert.strictEqual(pityScavenge.killsSinceDrop, 0);
const scavengeBreakdown = rules.scavengeGoodsBreakdownForRun(
  { wavesCleared: 5, bossesDefeated: 1, scavengeGoods: 7 },
  config
);
assert.deepStrictEqual(
  scavengeBreakdown,
  { killGoods: 7, waveGoods: 5, bossGoods: 4, capped: false, total: 16 },
  "scavenge settlement should separate kill, wave and boss sources"
);

let trailerMeta = rules.migrateMeta({ version: config.META_VERSION, trailerGoods: 200 }, { config });
const trailerInitial = rules.getTrailerRoomState(trailerMeta, config);
assert.strictEqual(trailerInitial.goods, 200);
assert.strictEqual(trailerInitial.items.filter((item) => item.owned).length, 0);
const unknownFurniture = rules.buyTrailerFurniture({ meta: trailerMeta, furnitureId: "ghost_sofa", config });
assert.strictEqual(unknownFurniture.purchase.ok, false);
assert.strictEqual(unknownFurniture.purchase.reason, "unknown");
const poorFurniture = rules.buyTrailerFurniture({ meta: rules.migrateMeta(null, { config }), furnitureId: "supply_shelf", config });
assert.strictEqual(poorFurniture.purchase.ok, false);
assert.strictEqual(poorFurniture.purchase.reason, "goods");
const buyShelf = rules.buyTrailerFurniture({ meta: trailerMeta, furnitureId: "supply_shelf", now: () => "2026-07-08T00:00:00.000Z", config });
assert.strictEqual(buyShelf.purchase.ok, true);
assert.strictEqual(buyShelf.meta.trailerGoods, 192);
assert.strictEqual(buyShelf.meta.trailerRoom.owned.supply_shelf, true);
assert.strictEqual(buyShelf.meta.trailerRoom.slots.wall_left, "supply_shelf");
assert.strictEqual(buyShelf.meta.trailerRoom.seenIntro, true);
const lockedEquip = rules.equipTrailerFurniture({ meta: trailerMeta, furnitureId: "blueprint_board", config });
assert.strictEqual(lockedEquip.equip.ok, false);
assert.strictEqual(lockedEquip.equip.reason, "locked");
trailerMeta = buyShelf.meta;
["solar_radio", "patched_lights", "hydro_planter", "water_filter", "folding_workbench", "blueprint_board", "battery_bank"].forEach((id) => {
  trailerMeta = rules.buyTrailerFurniture({ meta: trailerMeta, furnitureId: id, config }).meta;
});
const trailerState = rules.getTrailerRoomState(trailerMeta, config);
assert.strictEqual(trailerState.items.filter((item) => item.owned).length, 8);
assert.strictEqual(trailerState.room.slots.desk, "folding_workbench");
const trailerBonuses = rules.calculateTrailerBonuses(trailerMeta, config);
assert(Math.abs(trailerBonuses.maxHpPct - 0.014) < 0.0001, "trailer max HP bonus should sum equipped HP furniture");
assert(Math.abs(trailerBonuses.damagePct - 0.02) < 0.0001, "trailer damage bonus should sum equipped weapon furniture");
assert(trailerBonuses.fireIntervalMul < 0.981 && trailerBonuses.fireIntervalMul > 0.979, "trailer fire interval bonus should multiply");
assert(trailerBonuses.damageTakenMul < 0.992 && trailerBonuses.damageTakenMul > 0.990, "trailer defense bonus should multiply");
const baseVehicleStats = rules.getVehicleStats("land_rig", rules.migrateMeta(null, { config }), config);
const trailerVehicleStats = rules.getVehicleStats("land_rig", trailerMeta, config);
assert(trailerVehicleStats.maxHp > baseVehicleStats.maxHp, "trailer HP furniture should affect vehicle stats");
assert(trailerVehicleStats.damageTakenMul < baseVehicleStats.damageTakenMul, "trailer defense furniture should affect vehicle mitigation");
const trailerBaseShot = rules.calculateShotStats({ vehicleId: "land_rig", meta: rules.migrateMeta(null, { config }), runMods: rules.defaultRunMods(), config });
const trailerBoostedShot = rules.calculateShotStats({ vehicleId: "land_rig", meta: trailerMeta, runMods: rules.defaultRunMods(), config });
assert(trailerBoostedShot.damage > trailerBaseShot.damage, "trailer workbench furniture should raise shot damage");
assert(trailerBoostedShot.fireInterval < trailerBaseShot.fireInterval, "trailer radio/blueprint furniture should lower fire interval");
const runTrailerSpec = {
  offsetY: 42,
  followLerp: 0.16,
  maxSwayRad: 0.12,
  swayPerPixel: 0.012,
  bobAmp: 1,
  bobHz: 1,
  bobPhase: 0.25
};
const runTrailerInitial = rules.resolveTrailerFollowPose({
  vehicle: { x: 100, y: 300 },
  time: 0,
  trailerConfig: runTrailerSpec
});
assert.strictEqual(runTrailerInitial.x, 100, "run trailer should start at the target x without a previous pose");
assert.strictEqual(runTrailerInitial.y, 342, "run trailer should apply the configured rear offset");
assert(Math.abs(runTrailerInitial.bobY - 1) < 0.0001, "run trailer bob should use injected time/phase");
const runTrailerLagged = rules.resolveTrailerFollowPose({
  vehicle: { x: 130, y: 300 },
  previous: runTrailerInitial,
  dt: 1 / 60,
  time: 0.1,
  trailerConfig: runTrailerSpec
});
assert(runTrailerLagged.x > 100 && runTrailerLagged.x < 130, "run trailer should lag behind sudden vehicle x movement");
assert.strictEqual(runTrailerLagged.targetY, 342, "run trailer target y should stay behind the vehicle");
assert(runTrailerLagged.rotation > 0 && runTrailerLagged.rotation <= runTrailerSpec.maxSwayRad, "run trailer should sway toward the target");
const runTrailerSimple = rules.resolveTrailerFollowPose({
  vehicle: { x: 130, y: 300 },
  previous: runTrailerInitial,
  dt: 1 / 60,
  time: 0.1,
  trailerConfig: runTrailerSpec,
  simplified: true
});
assert.strictEqual(runTrailerSimple.rotation, 0, "simplified trailer pose should remove sway");
assert.strictEqual(runTrailerSimple.bobY, 0, "simplified trailer pose should remove idle bob");
const settledScavenge = rules.settleRunRewards({
  meta: rules.migrateMeta(null, { config }),
  run: { vehicleId: "land_rig", wavesCleared: 5, kills: 12, bossesDefeated: 1, score: 1000, scavengeGoods: 6 },
  rng: () => 0.99,
  now: () => "2026-07-08T00:00:00.000Z",
  config
});
assert.strictEqual(settledScavenge.meta.trailerGoods, 15, "settlement should bank scavenge goods separately from parts");
assert.strictEqual(settledScavenge.meta.lastRun.scavengeBreakdown.total, 15);
assert.strictEqual(settledScavenge.reward.scavengeGoods, 15);

const migratedStory = rules.migrateMeta(
  {
    version: config.META_VERSION,
    story: { seen: { b01: true, ghost_signal: true }, lastUnlockedAt: "2026-07-09T00:00:00.000Z" }
  },
  { config }
);
assert.deepStrictEqual(migratedStory.story.seen, { b01: true }, "story migration should keep known seen beats only");
assert.strictEqual(migratedStory.story.lastUnlockedAt, "2026-07-09T00:00:00.000Z");
const storyFresh = rules.migrateMeta(null, { config });
const storyWave0 = rules.getStoryProgress(storyFresh, config);
assert.deepStrictEqual(storyWave0.filter((beat) => beat.unlocked).map((beat) => beat.id), ["b01"], "fresh story progress should only unlock the default beat");
assert.strictEqual(rules.countUnreadStory(storyFresh, config), 1, "fresh default beat should be unread");
const storyWave5 = rules.getStoryProgress(rules.migrateMeta({ version: config.META_VERSION, bestWave: 5 }, { config }), config);
assert(storyWave5.find((beat) => beat.id === "b05").unlocked, "bestWave 5 should unlock b05");
const storyBoss = rules.getStoryProgress(rules.migrateMeta({ version: config.META_VERSION, totalBossKills: 1 }, { config }), config);
assert(storyBoss.find((beat) => beat.id === "b07").unlocked, "one boss kill should unlock b07");
const storyVehicle = rules.getStoryProgress(
  rules.migrateMeta({ version: config.META_VERSION, unlockedVehicles: { land_rig: true, sky_barge: true } }, { config }),
  config
);
assert(storyVehicle.find((beat) => beat.id === "b06").unlocked, "two unlocked vehicles should unlock b06");
const storyFurniture = rules.getStoryProgress(
  rules.migrateMeta(
    {
      version: config.META_VERSION,
      trailerRoom: { owned: { supply_shelf: true }, slots: { wall_left: "supply_shelf" } }
    },
    { config }
  ),
  config
);
assert(storyFurniture.find((beat) => beat.id === "b04").unlocked, "one equipped furniture slot should unlock b04");
const markedStory = rules.markStoryBeatsSeen(storyFresh, ["b01", "ghost_signal"], {
  now: () => "2026-07-09T01:02:03.000Z",
  config
});
assert.strictEqual(markedStory.story.seen.b01, true, "markStoryBeatsSeen should mark known ids");
assert.strictEqual(markedStory.story.seen.ghost_signal, undefined, "markStoryBeatsSeen should ignore unknown ids");
assert.strictEqual(markedStory.story.lastUnlockedAt, "2026-07-09T01:02:03.000Z");
assert.strictEqual(rules.countUnreadStory(markedStory, config), 0, "seen default story should no longer count unread");
const markedStoryAgain = rules.markStoryBeatsSeen(markedStory, ["b01"], { now: () => "2026-07-09T01:02:03.000Z", config });
assert.deepStrictEqual(markedStoryAgain.story.seen, markedStory.story.seen, "markStoryBeatsSeen should be idempotent for seen ids");

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

const milestoneMeta = rules.migrateMeta({ version: config.META_VERSION, bestWave: 8 }, { config });
const milestoneProgress = rules.getMilestoneProgress(milestoneMeta, config);
assert.deepStrictEqual(
  milestoneProgress.filter((entry) => entry.ready).map((entry) => entry.id),
  ["wave_3", "wave_5", "wave_8"],
  "best wave 8 should make the first three milestones ready"
);
const milestoneClaim = rules.applyMilestoneRewards(milestoneMeta, config);
assert.deepStrictEqual(milestoneClaim.milestones, ["wave_3", "wave_5", "wave_8"]);
assert.strictEqual(milestoneClaim.parts, 32, "first three milestones should grant 32 parts");
const milestoneRepeat = rules.applyMilestoneRewards(milestoneClaim.meta, config);
assert.deepStrictEqual(milestoneRepeat.milestones, [], "milestone rewards should be idempotent");
assert.strictEqual(milestoneRepeat.parts, 0);

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
assert.strictEqual(baseMods.overload, 0, "default run mods should start with no overload");
assert.strictEqual(baseMods.weaponMode, "standard", "default weapon mode should be standard");
assert.strictEqual(baseMods.weaponLevel, 1, "default weapon level should start at 1");
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
const shieldInput = { hp: 100, maxHp: 200, shield: 0, maxShield: 120 };
const barrierGate = rules.applyGateEffect({
  gateId: "barrier",
  runMods: baseMods,
  vehicle: shieldInput,
  vehicleLevels: { hull: 0, weapon: 0, energy: 0, gate: 0 },
  config
});
assert.strictEqual(shieldInput.shield, 0, "shield gate should not mutate input vehicle");
assert.strictEqual(barrierGate.vehicle.maxShield, 120, "barrier gate should set max shield to 60% max HP");
assert.strictEqual(barrierGate.vehicle.shield, 30, "barrier gate should grant 15% max HP as shield");
const shieldedDamage = rules.applyVehicleDamage({ hp: 100, maxHp: 200, shield: 15, maxShield: 120 }, 20, 0);
assert.strictEqual(shieldedDamage.vehicle.shield, 0, "vehicle shield should absorb incoming damage first");
assert.strictEqual(shieldedDamage.vehicle.hp, 95, "remaining damage should spill into HP after shield breaks");

const slipstreamInput = { hp: 100, maxHp: 100, shield: 0, slipstreamReadyAt: 0 };
const slipstream = rules.resolveSlipstreamDamage({
  vehicle: slipstreamInput,
  passive: config.VEHICLES.sky_barge.passive,
  incoming: 100,
  time: 1,
  config
});
assert.strictEqual(slipstreamInput.slipstreamReadyAt, 0, "slipstream resolver should not mutate input vehicle");
assert.strictEqual(slipstream.triggered, true, "slipstream should trigger when off cooldown");
assert.strictEqual(slipstream.incomingDamage, 45, "slipstream should reduce one incoming hit to 45%");
assert.strictEqual(slipstream.vehicle.slipstreamReadyAt, 3.5, "slipstream should advance its cooldown");
const slipstreamCooling = rules.resolveSlipstreamDamage({
  vehicle: slipstream.vehicle,
  passive: config.VEHICLES.sky_barge.passive,
  incoming: 100,
  time: 2
});
assert.strictEqual(slipstreamCooling.triggered, false, "slipstream should not trigger before cooldown");
assert.strictEqual(slipstreamCooling.incomingDamage, 100);

const echoEnemies = [
  { id: "source", enemyId: "runner", x: 50, y: 50, maxHp: 20, hp: 0 },
  { id: "capped", enemyId: "bloater", x: 70, y: 50, maxHp: 200, hp: 200 },
  { id: "scaled", enemyId: "shambler", x: 50, y: 88, maxHp: 60, hp: 60 },
  { id: "far", enemyId: "runner", x: 120, y: 50, maxHp: 40, hp: 40 },
  { id: "boss", enemyId: "boss_hive_titan", x: 60, y: 60, maxHp: 500, hp: 500, boss: true }
];
const echo = rules.resolveBroadsideEcho({
  enemy: echoEnemies[0],
  enemies: echoEnemies,
  passive: config.VEHICLES.sea_ark.passive,
  time: 1,
  lastTriggeredAt: 0,
  rng: () => 0
});
assert.strictEqual(echo.triggered, true, "broadside echo should trigger on non-boss kills when chance passes");
assert.deepStrictEqual(echo.hits.map((hit) => hit.id).sort(), ["capped", "scaled"], "broadside echo should only hit nearby non-boss enemies");
assert.strictEqual(echo.hits.find((hit) => hit.id === "capped").damage, 40, "broadside echo damage should respect cap");
assert.strictEqual(echo.hits.find((hit) => hit.id === "scaled").damage, 21, "broadside echo damage should scale from target max HP");
assert.strictEqual(echoEnemies[1].hp, 200, "broadside echo resolver should not mutate enemies");
assert.strictEqual(
  rules.resolveBroadsideEcho({ enemy: Object.assign({}, echoEnemies[0], { boss: true }), enemies: echoEnemies, passive: config.VEHICLES.sea_ark.passive, time: 2, lastTriggeredAt: 0, rng: () => 0 }).triggered,
  false,
  "broadside echo should not trigger from boss kills"
);
assert.strictEqual(
  rules.resolveBroadsideEcho({ enemy: echoEnemies[0], enemies: echoEnemies, passive: config.VEHICLES.sea_ark.passive, time: 2, lastTriggeredAt: 0, rng: () => 0.99 }).triggered,
  false,
  "broadside echo should respect chance"
);
assert.strictEqual(
  rules.resolveBroadsideEcho({ enemy: echoEnemies[0], enemies: echoEnemies, passive: config.VEHICLES.sea_ark.passive, time: 1.1, lastTriggeredAt: 1, rng: () => 0 }).triggered,
  false,
  "broadside echo should respect min interval"
);

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

const samePowerup = rules.applyWeaponPowerup({
  currentMode: "spread",
  currentLevel: 2,
  pickedMode: "spread",
  config
});
assert.deepStrictEqual(samePowerup, { mode: "spread", level: 3 }, "same weapon mode should level up");
const cappedPowerup = rules.applyWeaponPowerup({
  currentMode: "laser",
  currentLevel: 5,
  pickedMode: "laser",
  config
});
assert.deepStrictEqual(cappedPowerup, { mode: "laser", level: 5 }, "weapon level should cap at maxLevel");
const switchedPowerup = rules.applyWeaponPowerup({
  currentMode: "homing",
  currentLevel: 4,
  pickedMode: "laser",
  config
});
assert.deepStrictEqual(switchedPowerup, { mode: "laser", level: 3 }, "switching weapon mode should reduce level by one");

const spreadShot = rules.calculateShotStats({
  vehicleId: "land_rig",
  meta,
  runMods: Object.assign(rules.defaultRunMods(), { weaponMode: "spread", weaponLevel: 2 }),
  config
});
assert.strictEqual(spreadShot.weaponMode, "spread");
assert.strictEqual(spreadShot.weaponLevel, 2);
assert.strictEqual(spreadShot.projectiles, baseShot.projectiles + 2, "spread mode should add two projectiles");
assert(spreadShot.spread > baseShot.spread, "spread mode should widen spread");
assert(spreadShot.damage > baseShot.damage * 0.75 && spreadShot.damage < baseShot.damage, "spread mode should trade per-shot damage for more shots");
const laserShot = rules.calculateShotStats({
  vehicleId: "land_rig",
  meta,
  runMods: Object.assign(rules.defaultRunMods(), { weaponMode: "laser", weaponLevel: 3 }),
  config
});
assert.strictEqual(laserShot.bulletSprite, "bullet_pulse", "laser mode should override bullet sprite");
assert.strictEqual(laserShot.spread, 0, "laser mode should remove spread");
assert.strictEqual(laserShot.pierce, baseShot.pierce + 3, "laser mode should add pierce");
assert(laserShot.projectileSpeed > baseShot.projectileSpeed, "laser mode should speed projectiles");
const homingShot = rules.calculateShotStats({
  vehicleId: "land_rig",
  meta,
  runMods: Object.assign(rules.defaultRunMods(), { weaponMode: "homing", weaponLevel: 2 }),
  config
});
assert.strictEqual(homingShot.homing, true, "homing mode should mark projectiles homing");
assert.strictEqual(homingShot.turnRate, 4.5, "homing mode should expose turn rate");
assert(homingShot.projectileSpeed < baseShot.projectileSpeed, "homing mode should slow projectiles");
const fractureShot = rules.calculateShotStats({
  vehicleId: "land_rig",
  meta,
  runMods: Object.assign(rules.defaultRunMods(), { weaponMode: "fracture", weaponLevel: 2 }),
  config
});
assert.strictEqual(fractureShot.shardCount, 2, "fracture mode should create two short shards");
assert(fractureShot.damage < baseShot.damage, "fracture primary hit should be lower than standard");
assert(fractureShot.damage * (1 + fractureShot.shardCount * fractureShot.shardDamageMul) <= baseShot.damage * 1.08, "fracture all-hit damage should stay near standard");
const emberShot = rules.calculateShotStats({
  vehicleId: "land_rig",
  meta,
  runMods: Object.assign(rules.defaultRunMods(), { weaponMode: "ember", weaponLevel: 2, burn: config.WEAPON_POWERUPS.modes.ember.burnTicks }),
  config
});
assert.strictEqual(emberShot.burnTicks, 3, "ember mode should activate the runMods burn slot");
assert(emberShot.damage < laserShot.damage, "ember direct damage should stay below laser");
assert(emberShot.damage * (1 + emberShot.burnTicks * emberShot.burnDamageMul) < laserShot.damage, "ember short DoT should not out-DPS laser on a single target");

const overloadValues = [0, 1, 2, 3, 4, 5].map((n) => rules.overloadDamage(n));
for (let i = 1; i < overloadValues.length; i += 1) {
  assert(overloadValues[i] > overloadValues[i - 1], "overload damage should increase monotonically");
  const currentStep = overloadValues[i] - overloadValues[i - 1];
  const previousStep = i > 1 ? overloadValues[i - 1] - overloadValues[i - 2] : Infinity;
  assert(currentStep > 0 && currentStep <= previousStep, "overload damage marginal gain should be positive and diminishing");
}
const overloadedShot = rules.calculateShotStats({
  vehicleId: "land_rig",
  meta,
  runMods: Object.assign(rules.defaultRunMods(), { overload: 6 }),
  config
});
assert.strictEqual(overloadedShot.overloadPierce, 2, "every three overload should add one pierce");
assert(overloadedShot.damage > baseShot.damage, "overload should increase shot damage");
assert(overloadedShot.overloadCritChance > 0 && overloadedShot.overloadCritChance < 1, "overload should expose crit chance");
assert.strictEqual(overloadedShot.overloadCritMul, 1.5);

const maxedDamageState = rules.gateOptionState({
  gateId: "damage_plus",
  runMods: Object.assign(rules.defaultRunMods(), { damageAdd: 2.5 }),
  vehicle: { hp: 100, maxHp: 200, shield: 0, maxShield: 120 },
  config
});
assert.strictEqual(maxedDamageState.maxed, true, "damage gate should be maxed at 2.5 damageAdd");
assert.strictEqual(maxedDamageState.overflow.amount, 6, "maxed damage gate should overflow to goods");
const maxedDamageGate = rules.applyGateEffect({
  gateId: "damage_plus",
  runMods: Object.assign(rules.defaultRunMods(), { damageAdd: 2.5 }),
  vehicle: { hp: 100, maxHp: 200, shield: 0, maxShield: 120 },
  config
});
assert.strictEqual(maxedDamageGate.runMods.damageAdd, 2.5, "maxed gate should not add dead damage");
assert.strictEqual(maxedDamageGate.runMods.overload, 1, "maxed gate should add overload");
assert.strictEqual(maxedDamageGate.overflow.type, "goods");
const focusGate = rules.applyGateEffect({
  gateId: "gate_focus",
  runMods: rules.defaultRunMods(),
  vehicle: { hp: 100, maxHp: 200, shield: 0, maxShield: 120 },
  vehicleLevels: { hull: 0, weapon: 0, energy: 0, gate: 0 },
  time: 12,
  config
});
assert.strictEqual(focusGate.runMods.focusUntil, 22, "focus gate should grant a 10 second calibration window");
const focusedShot = rules.calculateShotStats({
  vehicleId: "land_rig",
  meta,
  runMods: focusGate.runMods,
  time: 13,
  config
});
const expiredFocusShot = rules.calculateShotStats({
  vehicleId: "land_rig",
  meta,
  runMods: focusGate.runMods,
  time: 23,
  config
});
assert.strictEqual(focusedShot.focusActive, true, "focus should be active inside its time window");
assert(focusedShot.spread < baseShot.spread, "focus should reduce spread without adding damage");
assert.strictEqual(focusedShot.damage, baseShot.damage, "focus should not increase base damage");
assert.strictEqual(expiredFocusShot.focusActive, false, "focus should expire after its time window");
const maxedSupply = rules.applySupplyRewardById({
  rewardId: "overshield",
  runMods: rules.defaultRunMods(),
  vehicle: { hp: 200, maxHp: 200, shield: 120, maxShield: 120 },
  stats: {},
  config
});
assert.strictEqual(maxedSupply.vehicle.shield, 120, "maxed overshield should not exceed shield cap");
assert.strictEqual(maxedSupply.runMods.overload, 1, "maxed supply should add overload");
assert.strictEqual(maxedSupply.overflow.amount, 5, "maxed overshield should overflow to goods");

const gunnerPose = rules.resolveGunnerPose({
  vehicle: { x: 100, y: 300 },
  time: 0,
  config
});
assert.strictEqual(gunnerPose.x, 100, "gunner pose should align with vehicle x by default");
assert.strictEqual(gunnerPose.y, 334, "gunner pose should use the configured rear offset");
const gunnerTarget = rules.selectGunnerTarget({
  gunner: { x: 100, y: 334 },
  enemies: [
    { id: "far", enemyId: "runner", x: 100, y: 80, hp: 10 },
    { id: "near", enemyId: "shambler", x: 110, y: 220, hp: 10 },
    { id: "dead", enemyId: "runner", x: 95, y: 260, hp: 0 }
  ],
  range: 210,
  config
});
assert.strictEqual(gunnerTarget.id, "near", "gunner should select the nearest live target within range");

// R82（辯論裁決 B-01）：站點廣播／路牌——每環境 4 個里程碑句池非空且選句決定性
["land", "air", "sea", "space"].forEach((environment) => {
  config.ROUTE_BROADCASTS.milestoneWaves.forEach((wave) => {
    const pool = config.ROUTE_BROADCASTS.byEnvironment[environment][wave];
    assert(Array.isArray(pool) && pool.length > 0, `${environment} wave ${wave} broadcast pool should not be empty`);
    const first = rules.selectRouteBroadcast({ environment, wave, seed: "route-seed", config });
    const second = rules.selectRouteBroadcast({ environment, wave, seed: "route-seed", config });
    assert(first && first.text, `${environment} wave ${wave} should select a broadcast line`);
    assert.strictEqual(first, second, `${environment} wave ${wave} selection must be deterministic for the same seed`);
    assert(pool.includes(first), `${environment} wave ${wave} selection should come from its own pool`);
  });
});
assert.strictEqual(
  rules.selectRouteBroadcast({ environment: "land", wave: 4, seed: "route-seed", config }),
  null,
  "non-milestone waves should stay silent"
);
assert.strictEqual(
  rules.selectRouteBroadcast({ environment: "lava", wave: 3, seed: "route-seed", config }),
  null,
  "unknown environments should stay silent"
);
const broadcastFlavors = new Set();
for (let i = 0; i < 16; i += 1) {
  broadcastFlavors.add(rules.selectRouteBroadcast({ environment: "land", wave: 3, seed: `route-${i}`, config }).kind);
}
assert.deepStrictEqual([...broadcastFlavors].sort(), ["sign", "station"], "different seeds should rotate both broadcast flavors");

// R82（辯論裁決 B-02）：家具羈絆句——未裝備不得入選、裝備後可被選中、選句決定性
const bondEventIds = ["sortie_start", "boss_down", "critical_hull"];
const bareMeta = rules.migrateMeta(null, { config });
bondEventIds.forEach((barkId) => {
  const bark = config.RUN_BARKS[barkId];
  for (let wave = 1; wave <= 30; wave += 1) {
    const lines = rules.selectRunBarkLines({ bark, meta: bareMeta, wave });
    assert(lines.length >= 1, `${barkId} should keep its base lines without furniture`);
    lines.forEach((line) => assert(!line.requires, `${barkId} must never select bond lines while unequipped (wave ${wave})`));
  }
});
const bondMeta = rules.migrateMeta(null, { config });
bondMeta.trailerRoom.owned.supply_shelf = true;
bondMeta.trailerRoom.slots.wall_left = "supply_shelf";
bondEventIds.forEach((barkId) => {
  const bark = config.RUN_BARKS[barkId];
  const ownsBond = bark.lines.some((line) => line.requires && line.requires.furniture === "supply_shelf");
  let bondSeen = false;
  for (let wave = 1; wave <= 30; wave += 1) {
    const lines = rules.selectRunBarkLines({ bark, meta: bondMeta, wave });
    lines.forEach((line) => {
      if (!line.requires) return;
      assert.strictEqual(line.requires.furniture, "supply_shelf", `${barkId} must only select bond lines of equipped furniture`);
      bondSeen = true;
    });
  }
  assert.strictEqual(bondSeen, ownsBond, `${barkId} equipped bond line should ${ownsBond ? "" : "not "}be selectable`);
});
assert.deepStrictEqual(
  rules.selectRunBarkLines({ bark: config.RUN_BARKS.sortie_start, meta: bondMeta, wave: 5 }),
  rules.selectRunBarkLines({ bark: config.RUN_BARKS.sortie_start, meta: bondMeta, wave: 5 }),
  "bond line selection must be deterministic for the same wave"
);
const twinBondMeta = rules.migrateMeta(null, { config });
twinBondMeta.trailerRoom.owned.supply_shelf = true;
twinBondMeta.trailerRoom.slots.wall_left = "supply_shelf";
twinBondMeta.trailerRoom.owned.photo_frame = true;
twinBondMeta.trailerRoom.slots.bedside = "photo_frame";
const twinBondPicks = new Set();
for (let wave = 1; wave <= 30; wave += 1) {
  rules.selectRunBarkLines({ bark: config.RUN_BARKS.critical_hull, meta: twinBondMeta, wave }).forEach((line) => {
    if (line.requires) twinBondPicks.add(line.requires.furniture);
  });
}
assert.deepStrictEqual([...twinBondPicks].sort(), ["photo_frame", "supply_shelf"], "multiple equipped furniture should rotate bond lines across waves");

console.log("Rules tests PASS");
