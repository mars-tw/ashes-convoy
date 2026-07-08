"use strict";

const assert = require("assert");
const config = require("../src/config.js");

function assertFinitePositive(value, label) {
  assert.strictEqual(typeof value, "number", `${label} must be a number`);
  assert(Number.isFinite(value) && value > 0, `${label} must be positive and finite`);
}

assert.strictEqual(config.STORAGE_KEY, "ashes_convoy_meta_v1");
assert.strictEqual(config.META_VERSION, 2);
assert.strictEqual(config.APP_VERSION, "R50");
assert.strictEqual(config.CACHE_VERSION, "ashes-convoy-r50-v1");
assert.strictEqual(config.LOGIC.width, 195);
assert.strictEqual(config.LOGIC.height, 422);
assert.strictEqual(config.LOGIC.displayWidth, 390);
assert.strictEqual(config.LOGIC.displayHeight, 844);
assert.strictEqual(config.LOGIC.renderScale, 2);
assert.strictEqual(config.START_SCREEN.image, "assets/ui/start.png");
assert.deepStrictEqual(config.ENVIRONMENT_BACKGROUNDS, {
  land: "assets/env/land.png",
  air: "assets/env/air.png",
  sea: "assets/env/sea.png",
  space: "assets/env/space.png"
});
assert.deepStrictEqual(config.SHELTER_THEMES, {}, "shelter reference themes should not be used by the start screen");
const roadRatio = (config.LOGIC.roadRight - config.LOGIC.roadLeft) / config.LOGIC.width;
assert(roadRatio >= 0.55 && roadRatio <= 0.65, `road ratio should be 55-65%, got ${roadRatio}`);
const vehicleIds = ["land_rig", "sky_barge", "sea_ark", "void_runner"];
const expectedVehicleVisualWidths = { land_rig: 30, sky_barge: 26, sea_ark: 31, void_runner: 28 };
const expectedVehicleRadii = { land_rig: 8, sky_barge: 7, sea_ark: 9, void_runner: 8 };
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
  assert.strictEqual(vehicle.visualWidth, expectedVehicleVisualWidths[id], `${id} should use the Raiden-scale visual width`);
  assert.strictEqual(vehicle.radius, expectedVehicleRadii[id], `${id} should use the tightened hit radius`);
  assert(vehicle.visualWidth >= 24 && vehicle.visualWidth <= 31, `${id} raster width should be 24-31 world px`);
  const screenRatio = vehicle.visualWidth / config.LOGIC.width;
  assert(screenRatio >= 0.12 && screenRatio <= 0.16, `${id} should occupy 12-16% of canvas width, got ${screenRatio}`);
  assert.strictEqual(vehicle.visualHalfWidth * 2, vehicle.visualWidth, `${id} visual half width should match visual width`);
  const hitRatio = vehicle.radius / vehicle.visualHalfWidth;
  assert(hitRatio >= 0.5 && hitRatio <= 0.65, `${id} hit radius should be 50-65% of visual half width, got ${hitRatio}`);
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
  assert(enemy.spriteImage && enemy.spriteImage.startsWith("assets/zombies/") && enemy.spriteImage.endsWith(".png"), `${id} must bind a raster zombie image`);
  assertFinitePositive(enemy.visualWidth, `${id}.visualWidth`);
  assert(enemy.visualWidth >= enemy.radius * 1.8 && enemy.visualWidth <= enemy.radius * 2.2, `${id} visual width should align with collision radius`);
  assert.strictEqual(enemy.stage, 1);
});
assert(config.ENEMIES.runner.visualWidth < config.VEHICLES.sky_barge.visualWidth, "runner should read as smaller than the smallest vehicle");
assert(config.ENEMIES.shambler.visualWidth < config.VEHICLES.land_rig.visualWidth, "shambler should read as smaller than the land rig");
assert(config.ENEMIES.bloater.visualWidth > config.VEHICLES.sea_ark.visualWidth, "bloater should read as an elite larger than the player");
assert(config.ENEMIES.boss_hive_titan.visualWidth > config.ENEMIES.bloater.visualWidth * 2, "boss should remain clearly massive");
assert(config.ENEMIES.shambler.scale >= 1.5 && config.ENEMIES.shambler.radius >= 8, "shambler should remain readable at Raiden scale");
assert(config.ENEMIES.runner.scale >= 1.4 && config.ENEMIES.runner.radius >= 7, "runner should remain readable at Raiden scale");
assert(config.ENEMIES.bloater.scale >= 1.5 && config.ENEMIES.bloater.radius >= 17, "bloater should remain an elite body");
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
assert.strictEqual(config.PERFORMANCE.qualityProfiles.high.maxEffects, config.PERFORMANCE.maxEffects);
assert(config.PERFORMANCE.qualityProfiles.low.maxEffects < config.PERFORMANCE.qualityProfiles.high.maxEffects, "low quality should reduce effect cap");
assert(config.PERFORMANCE.qualityProfiles.low.maxEnemies < config.PERFORMANCE.qualityProfiles.high.maxEnemies, "low quality should reduce enemy cap");
assert.strictEqual(config.DIFFICULTIES.normal.locked, undefined);
assert.strictEqual(config.ECONOMY.difficultyRewardMul.normal, 1);
assert.strictEqual(config.ECONOMY.blueprintBundle, 1);
assert.strictEqual(config.ECONOMY.blueprintPityAfterBosses, 3);
assert.strictEqual(config.ECONOMY.eventPartsCapPerRun, 12);
assert.strictEqual(config.SUPPLY_DROPS.chancePerKill, 0.05);
assert.strictEqual(config.SUPPLY_DROPS.pityKills, 25);
assert.strictEqual(config.SUPPLY_DROPS.partsPerCache, 3);
assert.strictEqual(config.SUPPLY_DROPS.partsCapPerRun, 12);
assert.deepStrictEqual(Object.keys(config.SUPPLY_DROPS.rewards).sort(), ["damage_boost", "parts_cache", "rate_boost", "repair_small"]);
assert.strictEqual(config.QUESTS.dailyRewardParts, 5);
assert.strictEqual(config.QUESTS.weeklyRewardParts, 15);
assert.strictEqual(config.QUESTS.dailyPool.length, 4, "daily quest pool should stay lightweight");
assert.strictEqual(config.QUESTS.weeklyPool.length, 4, "weekly quest pool should stay lightweight");
config.QUESTS.dailyPool.forEach((quest) => assert.strictEqual(quest.rewardParts, 5, `${quest.id} daily reward should be 5`));
config.QUESTS.weeklyPool.forEach((quest) => assert.strictEqual(quest.rewardParts, 15, `${quest.id} weekly reward should be 15`));
assert.strictEqual(config.META_DEFAULT.unlockedVehicles.land_rig, true);
assert.strictEqual(config.META_DEFAULT.unlockedVehicles.sky_barge, false);
assert.strictEqual(config.META_DEFAULT.unlockedVehicles.sea_ark, false);
assert.strictEqual(config.META_DEFAULT.unlockedVehicles.void_runner, false);
assert.strictEqual(config.META_DEFAULT.blueprintWishlist, "sky_barge");
assert.strictEqual(config.META_DEFAULT.settings.aimAssistLevel, "medium");
assert.strictEqual(config.META_DEFAULT.settings.screenShake, true);
assert.strictEqual(config.META_DEFAULT.settings.damageTextDensity, "all");
assert.strictEqual(config.META_DEFAULT.settings.performanceMode, "auto");
assert.strictEqual(config.META_DEFAULT.settings.fontSize, "medium");
assert.strictEqual(config.META_DEFAULT.questStats.variantKills, 0);
assert.strictEqual(config.META_DEFAULT.questStats.environmentWins.land, 0);
["sky_barge", "sea_ark", "void_runner"].forEach((vehicleId) => {
  assert.strictEqual(config.VEHICLES[vehicleId].unlock.type, "blueprint", `${vehicleId} should use blueprint unlock`);
  assert.strictEqual(config.VEHICLES[vehicleId].unlock.blueprintsRequired, 3, `${vehicleId} should need 3 blueprints`);
});
assert.deepStrictEqual(Object.keys(config.ENVIRONMENT_EVENTS).sort(), ["air", "land", "sea", "space"]);
Object.values(config.ENVIRONMENT_EVENTS).forEach((event) => {
  assert(event.id && event.label && event.description, `${event.id} should have readable copy`);
  assert(event.chance > 0 && event.chance < 1, `${event.id} should be a random wave event`);
});
assert.strictEqual(config.ENEMY_VARIANTS.runner_frenzy.baseEnemy, "runner");
assert.strictEqual(config.ENEMY_VARIANTS.shambler_hardened.baseEnemy, "shambler");
Object.values(config.ENEMY_VARIANTS).forEach((variant) => {
  assert(variant.hpMul > 0 && variant.speedMul > 0, `${variant.id} needs stat multipliers`);
  assert(variant.tint || variant.filter, `${variant.id} needs a canvas-only visual difference`);
});

["hull", "weapon"].forEach((trackId) => {
  const track = config.ECONOMY.upgradeTracks[trackId];
  assert(track, `missing upgrade track ${trackId}`);
  assert.strictEqual(track.costs.length, track.maxLevel);
  track.costs.forEach((cost, index) => {
    assert(Number.isInteger(cost) && cost > 0, `${trackId} cost ${index} must be positive integer`);
    if (index > 0) assert(cost > track.costs[index - 1], `${trackId} costs must increase`);
  });
});

Object.keys(config.VEHICLES).forEach((vehicleId) => {
  const tracks = config.ECONOMY.vehicleUpgradeTracks[vehicleId];
  assert(tracks, `${vehicleId} should define vehicle-specific upgrade tracks`);
  assert.strictEqual(Object.keys(tracks).length, 2, `${vehicleId} should have two vehicle-specific nodes`);
  Object.values(tracks).forEach((track) => {
    assert.strictEqual(track.costs.length, track.maxLevel, `${track.id} costs should match max level`);
    track.costs.forEach((cost) => assert(Number.isInteger(cost) && cost > 0, `${track.id} cost should be positive`));
  });
});

const achievementRewardTotal = Object.values(config.ACHIEVEMENTS).reduce((sum, achievement) => sum + achievement.rewardParts, 0);
const eventAchievementTotal = Object.values(config.ACHIEVEMENTS)
  .filter((achievement) => achievement.metric.indexOf("eventCompletion:") === 0)
  .reduce((sum, achievement) => sum + achievement.rewardParts, 0);
assert.strictEqual(Object.keys(config.ACHIEVEMENTS).length, 14, "R22 should define fourteen achievements");
assert.strictEqual(achievementRewardTotal, 72, "R22 achievement rewards should include the event set");
assert(eventAchievementTotal <= config.ECONOMY.upgradeTracks.hull.costs[0], "event achievements should add at most one Lv1 hull upgrade");

console.log("Config tests PASS");
