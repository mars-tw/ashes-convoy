"use strict";

const assert = require("assert");
const config = require("../src/config.js");

function assertFinitePositive(value, label) {
  assert.strictEqual(typeof value, "number", `${label} must be a number`);
  assert(Number.isFinite(value) && value > 0, `${label} must be positive and finite`);
}

assert.strictEqual(config.STORAGE_KEY, "ashes_convoy_meta_v1");
assert.strictEqual(config.META_VERSION, 1);
assert.strictEqual(config.LOGIC.width, 195);
assert.strictEqual(config.LOGIC.height, 422);
assert.strictEqual(config.LOGIC.displayWidth, 390);
assert.strictEqual(config.LOGIC.displayHeight, 844);
assert.strictEqual(config.LOGIC.renderScale, 2);
assert.strictEqual(config.START_SCREEN.image, "assets/ui/start.png");
assert.deepStrictEqual(config.SHELTER_THEMES, {}, "shelter reference themes should not be used by the start screen");
const roadRatio = (config.LOGIC.roadRight - config.LOGIC.roadLeft) / config.LOGIC.width;
assert(roadRatio >= 0.55 && roadRatio <= 0.65, `road ratio should be 55-65%, got ${roadRatio}`);
const vehicleIds = ["land_rig", "sky_barge", "sea_ark", "void_runner"];
assert.strictEqual(config.META_DEFAULT.selectedVehicle, "land_rig");

vehicleIds.forEach((id) => {
  const vehicle = config.VEHICLES[id];
  assert(vehicle, `missing vehicle ${id}`);
  assert.strictEqual(vehicle.id, id);
  assert(["land", "air", "sea", "space"].includes(vehicle.environment), `${id} needs a valid environment`);
  assert(vehicle.environmentLabel, `${id} needs an environment label`);
  assert(vehicle.sprite.startsWith("vehicle_"), `${id} must bind a vehicle sprite`);
  assert(vehicle.spriteImage && vehicle.spriteImage.endsWith(".png"), `${id} must bind a raster vehicle image`);
  assert(config.WEAPONS[vehicle.weapon], `${id} weapon must exist`);
  assertFinitePositive(vehicle.hp, `${id}.hp`);
  assert(Number.isFinite(vehicle.armor) && vehicle.armor >= 0, `${id}.armor must be non-negative`);
  assertFinitePositive(vehicle.visualWidth, `${id}.visualWidth`);
  assert(vehicle.visualWidth >= 70 && vehicle.visualWidth <= 90, `${id} raster width should be 70-90 world px`);
  assert(vehicle.visualHalfWidth * 2 < config.LOGIC.roadRight - config.LOGIC.roadLeft, `${id} should fit inside road`);
  assert.strictEqual(vehicle.stage, 4);
});

assert.deepStrictEqual(vehicleIds.map((id) => config.VEHICLES[id].environment).sort(), ["air", "land", "sea", "space"]);
assert.strictEqual(new Set(vehicleIds.map((id) => config.VEHICLES[id].weapon)).size, 4, "fleet weapons must differ");

Object.entries(config.WEAPONS).forEach(([id, weapon]) => {
  assert.strictEqual(weapon.id, id);
  assert(weapon.name, `${id} needs a name`);
  assert(weapon.bulletSprite.startsWith("bullet_"), `${id} must use a bullet sprite`);
  assertFinitePositive(weapon.damage, `${id}.damage`);
  assertFinitePositive(weapon.fireInterval, `${id}.fireInterval`);
  assertFinitePositive(weapon.projectileSpeed, `${id}.projectileSpeed`);
});

["shambler", "runner", "bloater", "boss_hive_titan"].forEach((id) => {
  const enemy = config.ENEMIES[id];
  assert(enemy, `missing enemy ${id}`);
  assert.strictEqual(enemy.id, id);
  assertFinitePositive(enemy.hp, `${id}.hp`);
  assertFinitePositive(enemy.speed, `${id}.speed`);
  assertFinitePositive(enemy.contactDamage, `${id}.contactDamage`);
  assertFinitePositive(enemy.budgetCost, `${id}.budgetCost`);
  assertFinitePositive(enemy.score, `${id}.score`);
  assert.strictEqual(enemy.stage, 1);
});
assert(config.ENEMIES.shambler.scale >= 1.9 && config.ENEMIES.shambler.radius >= 10, "shambler should be visually enlarged");
assert(config.ENEMIES.runner.scale >= 1.8 && config.ENEMIES.runner.radius >= 9, "runner should be visually enlarged");
assert(config.ENEMIES.bloater.scale >= 1.5 && config.ENEMIES.bloater.radius >= 18, "bloater should be visually enlarged");
assert(config.ENEMIES.boss_hive_titan.scale >= 1.8 && config.ENEMIES.boss_hive_titan.radius >= 40, "boss should be enlarged");

assert.strictEqual(config.ENEMIES.boss_hive_titan.boss, true);
assert.strictEqual(config.ENEMIES.boss_hive_titan.firstWave, 5);
assert(Array.isArray(config.ENEMIES.boss_hive_titan.phases));
assert(config.ENEMIES.boss_hive_titan.phases.length >= 2);

["damage_plus", "rate_plus", "multishot_plus", "repair"].forEach((id) => {
  const gate = config.GATES[id];
  assert(gate, `missing gate ${id}`);
  assert.strictEqual(gate.id, id);
  assert(gate.label, `${id} needs a label`);
  assert(gate.sprite.startsWith("gate_"), `${id} must bind a gate sprite`);
  assertFinitePositive(gate.coreHp, `${id}.coreHp`);
  assert(gate.effect && typeof gate.effect === "object", `${id} needs an effect`);
  assert(!Object.prototype.hasOwnProperty.call(gate.effect, "parts"), `${id} must not grant parts`);
});

assert.strictEqual(config.WAVE.bossEvery, 5);
assert(config.WAVE.firstGateMinTime >= 8 && config.WAVE.firstGateMaxTime <= 11, "first gate should appear in 8-11 seconds");
assert(config.PERFORMANCE.maxEnemies >= 60, "enemy cap should support large hordes");
assert.strictEqual(config.DIFFICULTIES.normal.locked, undefined);
assert.strictEqual(config.ECONOMY.difficultyRewardMul.normal, 1);

["hull", "weapon"].forEach((trackId) => {
  const track = config.ECONOMY.upgradeTracks[trackId];
  assert(track, `missing upgrade track ${trackId}`);
  assert.strictEqual(track.costs.length, track.maxLevel);
  track.costs.forEach((cost, index) => {
    assert(Number.isInteger(cost) && cost > 0, `${trackId} cost ${index} must be positive integer`);
    if (index > 0) assert(cost > track.costs[index - 1], `${trackId} costs must increase`);
  });
});

console.log("Config tests PASS");
