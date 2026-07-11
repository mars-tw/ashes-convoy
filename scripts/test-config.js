"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const config = require("../src/config.js");

function assertFinitePositive(value, label) {
  assert.strictEqual(typeof value, "number", `${label} must be a number`);
  assert(Number.isFinite(value) && value > 0, `${label} must be positive and finite`);
}

assert.strictEqual(config.STORAGE_KEY, "ashes_convoy_meta_v1");
assert.strictEqual(config.META_VERSION, 3);
assert.strictEqual(config.APP_VERSION, "R65");
assert.strictEqual(config.CACHE_VERSION, "ashes-convoy-r65-v1");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert(indexHtml.includes("manifest.webmanifest?v=R65"), "index.html should version the web manifest for R65");
assert(indexHtml.includes("assets/icons/icon-192.png?v=R65"), "index.html should version the app icon for R65");
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
assert(config.RUN_TRAILER && config.RUN_TRAILER.byEnvironment.land, "land environment should define a visible run trailer");
assert.strictEqual(config.RUN_TRAILER.byEnvironment.land.spriteImage, "assets/vehicles/trailer.png");
assert(fs.existsSync(path.join(__dirname, "..", config.RUN_TRAILER.byEnvironment.land.spriteImage)), "run trailer sprite should exist");
assertFinitePositive(config.RUN_TRAILER.byEnvironment.land.visualWidth, "RUN_TRAILER.land.visualWidth");
assertFinitePositive(config.RUN_TRAILER.byEnvironment.land.offsetY, "RUN_TRAILER.land.offsetY");
assert(config.TRAILER_GUNNER && config.TRAILER_GUNNER.enabledDefault === true, "R65 should enable the trailer gunner by default");
assert.strictEqual(config.TRAILER_GUNNER.sprite, "assets/vehicles/xi_gunner.png");
assert(fs.existsSync(path.join(__dirname, "..", config.TRAILER_GUNNER.sprite)), "trailer gunner sprite should exist");
assert.strictEqual(config.TRAILER_GUNNER.weapon.damage, 6);
assert.strictEqual(config.TRAILER_GUNNER.weapon.fireInterval, 0.9);
assert.strictEqual(config.TRAILER_GUNNER.targetRange, 320);
assert.deepStrictEqual(config.SHELTER_THEMES, {}, "shelter reference themes should not be used by the start screen");
const roadRatio = (config.LOGIC.roadRight - config.LOGIC.roadLeft) / config.LOGIC.width;
assert(roadRatio >= 0.68 && roadRatio <= 0.78, `road ratio should be 68-78%, got ${roadRatio}`);
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
assert(config.WEAPON_POWERUPS, "R65 should define weapon power-ups");
assert.strictEqual(config.WEAPON_POWERUPS.dropChancePerKill, 0.035);
assert.strictEqual(config.WEAPON_POWERUPS.pityKills, 30);
assert.strictEqual(config.WEAPON_POWERUPS.crateSpeed, 24);
assert.strictEqual(config.WEAPON_POWERUPS.ttl, 14);
assert.strictEqual(config.WEAPON_POWERUPS.pickupRadius, 30);
assert.strictEqual(config.WEAPON_POWERUPS.maxLevel, 5);
assert.deepStrictEqual(config.WEAPON_POWERUPS.levelDamageMul, [1, 1.12, 1.24, 1.38, 1.55]);
assert.deepStrictEqual(config.WEAPON_POWERUPS.cycleModes, ["spread", "fracture", "laser", "ember", "homing"]);
assert.strictEqual(config.WEAPON_POWERUPS.modes.spread.projectilesAdd, 2);
assert.strictEqual(config.WEAPON_POWERUPS.modes.laser.pierceAdd, 3);
assert.strictEqual(config.WEAPON_POWERUPS.modes.laser.bulletSprite, "bullet_pulse");
assert.strictEqual(config.WEAPON_POWERUPS.modes.homing.homing, true);
assert.strictEqual(config.WEAPON_POWERUPS.modes.homing.turnRate, 4.5);
assert.strictEqual(config.WEAPON_POWERUPS.modes.fracture.shardCount, 2);
assert(config.WEAPON_POWERUPS.modes.fracture.damageMul < 0.75 && config.WEAPON_POWERUPS.modes.fracture.shardDamageMul <= 0.16, "fracture should trade primary DPS for short shards");
assert.strictEqual(config.WEAPON_POWERUPS.modes.ember.burnTicks, 3);
assert(config.WEAPON_POWERUPS.modes.ember.damageMul < config.WEAPON_POWERUPS.modes.laser.damageMul, "ember primary DPS should stay below laser");

const expectedEnemies = [
  "shambler",
  "runner",
  "bloater",
  "spore_spitter",
  "shield_husk",
  "swarm_mite",
  "tar_brute",
  "void_wraith",
  "ash_screamer",
  "chain_tether",
  "mirror_husk",
  "ember_tick",
  "boss_hive_titan"
];
assert.deepStrictEqual(Object.keys(config.ENEMIES).sort(), expectedEnemies.slice().sort(), "enemy roster should match R65 roster");
expectedEnemies.forEach((id) => {
  const enemy = config.ENEMIES[id];
  assert(enemy, `missing enemy ${id}`);
  assert.strictEqual(enemy.id, id);
  assertFinitePositive(enemy.hp, `${id}.hp`);
  assertFinitePositive(enemy.speed, `${id}.speed`);
  assertFinitePositive(enemy.contactDamage, `${id}.contactDamage`);
  assertFinitePositive(enemy.budgetCost, `${id}.budgetCost`);
  assertFinitePositive(enemy.score, `${id}.score`);
  assert(enemy.spriteImage && enemy.spriteImage.startsWith("assets/zombies/") && enemy.spriteImage.endsWith(".png"), `${id} must bind a raster zombie image`);
  assert(fs.existsSync(path.join(__dirname, "..", enemy.spriteImage)), `${id} raster image should exist`);
  assertFinitePositive(enemy.visualWidth, `${id}.visualWidth`);
  assert(enemy.visualWidth >= enemy.radius * 1.8 && enemy.visualWidth <= enemy.radius * 2.2, `${id} visual width should align with collision radius`);
  assert.strictEqual(enemy.stage, 1);
});
assert.strictEqual(config.ENEMIES.spore_spitter.behavior.type, "ranged");
assert.strictEqual(config.ENEMIES.shield_husk.behavior.type, "shield");
assert.strictEqual(config.ENEMIES.swarm_mite.behavior.type, "swarm");
assert.strictEqual(config.ENEMIES.tar_brute.behavior.type, "brute");
assert.strictEqual(config.ENEMIES.void_wraith.behavior.type, "phase");
assert.strictEqual(config.ENEMIES.ash_screamer.behavior.type, "ranged");
assert.strictEqual(config.ENEMIES.chain_tether.behavior.type, "brute");
assert.strictEqual(config.ENEMIES.mirror_husk.behavior.type, "shield");
assert.strictEqual(config.ENEMIES.ember_tick.behavior.type, "swarm");
assert(config.ENEMIES.spore_spitter.firstWave >= 3, "ranged enemy should not appear in the opening waves");
assert(config.ENEMIES.swarm_mite.budgetCost === 1 && config.ENEMIES.swarm_mite.hp < config.ENEMIES.runner.hp, "swarm mite should be cheap and fragile");
assert(config.ENEMIES.tar_brute.hp > config.ENEMIES.bloater.hp && config.ENEMIES.tar_brute.speed < config.ENEMIES.bloater.speed, "tar brute should be a slow meat shield");
assert(config.ENEMIES.ash_screamer.firstWave === 5 && config.ENEMIES.ash_screamer.behavior.projectileDamage <= 8, "ash screamer should enter midgame with low projectile damage");
assert(config.ENEMIES.chain_tether.firstWave === 7 && config.ENEMIES.chain_tether.behavior.slowMul >= 0.78, "chain tether slow should be readable but not hard-locking");
assert(config.ENEMIES.mirror_husk.firstWave === 8 && config.ENEMIES.mirror_husk.poolWeight <= 0.28, "mirror husk should stay rare because frontal mitigation is strong");
assert(config.ENEMIES.ember_tick.firstWave === 4 && config.ENEMIES.ember_tick.budgetCost === 1, "ember tick should remain a cheap swarm enemy");
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

["damage_plus", "rate_plus", "multishot_plus", "repair", "barrier", "gate_focus"].forEach((id) => {
  const gate = config.GATES[id];
  assert(gate, `missing gate ${id}`);
  assert.strictEqual(gate.id, id);
  assert(gate.label, `${id} needs a label`);
  assert(gate.sprite.startsWith("gate_"), `${id} must bind a gate sprite`);
  assertFinitePositive(gate.coreHp, `${id}.coreHp`);
  assert(gate.effect && typeof gate.effect === "object", `${id} needs an effect`);
  assert(!Object.prototype.hasOwnProperty.call(gate.effect, "parts"), `${id} must not grant parts`);
});
assert.strictEqual(config.GATES.gate_focus.effect.type, "focus");
assert.strictEqual(config.GATES.gate_focus.effect.duration, 10);
assert(config.GATES.gate_focus.effect.spreadMul < 1, "focus gate should improve handling without increasing damage");

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
assert.strictEqual(config.SUPPLY_DROPS.crateSpeed, 24);
assert.strictEqual(config.SUPPLY_DROPS.horizontalDriftSpeed, 34);
assert.strictEqual(config.SUPPLY_DROPS.magnetSpeed, 92);
assert.strictEqual(config.SUPPLY_DROPS.ttl, 16);
assert.deepStrictEqual(Object.keys(config.SUPPLY_DROPS.rewards).sort(), ["damage_boost", "overshield", "parts_cache", "rate_boost", "repair_small"]);
assert.strictEqual(config.TRAILER_ROOM.resourceName, "拾荒物資");
assert.strictEqual(config.TRAILER_ROOM.dropChancePerKill, 0.16);
assert.strictEqual(config.TRAILER_ROOM.pityKills, 9);
assert.strictEqual(config.TRAILER_ROOM.waveGoods, 1);
assert.strictEqual(config.TRAILER_ROOM.bossGoods, 4);
assert.strictEqual(config.TRAILER_ROOM.maxGoodsPerRun, 28);
assert.strictEqual(Object.keys(config.TRAILER_ROOM.slots).length, 8, "trailer room should expose eight fixed slots");
assert.strictEqual(Object.keys(config.TRAILER_ROOM.furniture).length, 15, "R65 should expand the trailer furniture catalog");
const trailerCostTotal = Object.values(config.TRAILER_ROOM.furniture).reduce((sum, item) => sum + item.cost, 0);
assert.strictEqual(trailerCostTotal, 328, "trailer furniture should have a clear long-tail cost");
const trailerFullEffects = Object.values(config.TRAILER_ROOM.furniture).reduce(
  (sum, item) => {
    sum.maxHpPct += item.effects.maxHpPct || 0;
    sum.damagePct += item.effects.damagePct || 0;
    sum.fireIntervalMul *= item.effects.fireIntervalMul || 1;
    sum.damageTakenMul *= item.effects.damageTakenMul || 1;
    return sum;
  },
  { maxHpPct: 0, damagePct: 0, fireIntervalMul: 1, damageTakenMul: 1 }
);
// Equipment-time hard caps remain enforced in rules; catalog totals can be higher because slots compete.
assert(trailerFullEffects.maxHpPct <= 0.04, "full trailer HP catalog bonus should stay within the room envelope");
assert(trailerFullEffects.damagePct <= 0.04, "full trailer damage catalog bonus should stay within the room envelope");
assert(1 - trailerFullEffects.fireIntervalMul <= 0.06, "full trailer fire-rate catalog bonus should stay minor");
assert(1 - trailerFullEffects.damageTakenMul <= 0.03, "full trailer mitigation catalog bonus should stay minor");
Object.values(config.TRAILER_ROOM.furniture).forEach((item) => {
  assert(config.TRAILER_ROOM.slots[item.slot], `${item.id} should point to a valid trailer slot`);
  assert(item.sprite && item.sprite.startsWith("assets/shelter/trailer/") && item.sprite.endsWith(".png"), `${item.id} should bind a trailer sprite`);
  assert(fs.existsSync(path.join(__dirname, "..", item.sprite)), `${item.id} trailer sprite should exist`);
  assert(item.name && item.description && item.effectText, `${item.id} should have visible room copy`);
  assert(Number.isInteger(item.cost) && item.cost > 0, `${item.id} should have a positive cost`);
  assert(["生存物資", "溫室生態", "工坊機械", "車隊維修"].includes(item.style), `${item.id} should fit the room style set`);
});
["crayon_drawing", "star_telescope", "photo_frame"].forEach((id) => {
  const item = config.TRAILER_ROOM.furniture[id];
  assert(item && item.name && item.description && item.effectText, `${id} should include room copy`);
  assert(fs.existsSync(path.join(__dirname, "..", item.sprite)), `${id} sprite should exist`);
});
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
assert.strictEqual(config.META_DEFAULT.settings.showRunTrailer, true);
assert.strictEqual(config.META_DEFAULT.settings.showCompanion, true);
assert.strictEqual(config.META_DEFAULT.settings.damageTextDensity, "all");
assert.strictEqual(config.META_DEFAULT.settings.performanceMode, "auto");
assert.strictEqual(config.META_DEFAULT.settings.fxLevel, "reduced");
assert.strictEqual(config.META_DEFAULT.settings.fontSize, "medium");
assert(config.PERFORMANCE.downgradeFrames <= 20, "auto quality should react quickly to sustained low FPS");
assert(config.PERFORMANCE.recoverFrames >= 180, "auto quality recovery should resist oscillation");
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
  assert(event.systemLine && Array.isArray(event.barks) && event.barks.length >= 2 && event.completeLine, `${event.id} should include R65 event bark copy`);
  assert(Array.isArray(event.alternates) && event.alternates.length === 1, `${event.id} should define one mutually exclusive alternate`);
  event.alternates.forEach((alternate) => {
    assert(alternate.id && alternate.label && alternate.description, `${alternate.id} should have readable copy`);
    assert(alternate.systemLine && Array.isArray(alternate.barks) && alternate.barks.length >= 2 && alternate.completeLine, `${alternate.id} should include event bark copy`);
    assert(alternate.chance > 0 && alternate.chance < 1, `${alternate.id} should be a random alternate event`);
  });
});
assert.strictEqual(config.ENEMY_VARIANTS.runner_frenzy.baseEnemy, "runner");
assert.strictEqual(config.ENEMY_VARIANTS.shambler_hardened.baseEnemy, "shambler");
assert.strictEqual(config.ENEMY_VARIANTS.swarm_venom.baseEnemy, "swarm_mite");
assert.strictEqual(config.ENEMY_VARIANTS.bloater_volatile.baseEnemy, "bloater");
assert.strictEqual(config.ENEMY_VARIANTS.spitter_corrosive.baseEnemy, "spore_spitter");
assert.strictEqual(config.ENEMY_VARIANTS.husk_bulwark.baseEnemy, "shield_husk");
assert.strictEqual(config.ENEMY_VARIANTS.brute_molten.baseEnemy, "tar_brute");
assert.strictEqual(config.ENEMY_VARIANTS.wraith_null.baseEnemy, "void_wraith");
assert.strictEqual(config.ENEMY_VARIANTS.screamer_white_noise.baseEnemy, "ash_screamer");
assert.strictEqual(config.ENEMY_VARIANTS.tether_rusthook.baseEnemy, "chain_tether");
assert.strictEqual(config.ENEMY_VARIANTS.husk_backglint.baseEnemy, "mirror_husk");
assert.strictEqual(config.ENEMY_VARIANTS.tick_cindercloud.baseEnemy, "ember_tick");
Object.values(config.ENEMY_VARIANTS).forEach((variant) => {
  assert(config.ENEMIES[variant.baseEnemy], `${variant.id} should point to a known base enemy`);
  assert(variant.hpMul > 0 && variant.speedMul > 0, `${variant.id} needs stat multipliers`);
  assert(variant.tint || variant.filter, `${variant.id} needs a canvas-only visual difference`);
});
["sortie_start", "first_supply", "first_gate", "boss_radio", "boss_down", "critical_hull", "deep_route"].forEach((id) => {
  const bark = config.RUN_BARKS[id];
  assert(bark && bark.id === id, `${id} run bark should exist`);
  assert(Array.isArray(bark.lines) && bark.lines.length >= 1 && bark.lines.length <= 2, `${id} should stay short`);
  bark.lines.forEach((line) => {
    assert(["xi", "driver", "narration"].includes(line.speaker), `${id} has invalid speaker ${line.speaker}`);
    assert(line.text && line.text.length > 0, `${id} line should not be blank`);
  });
});
assert.strictEqual(config.VEHICLES.sky_barge.passive.id, "slipstream");
assert.strictEqual(config.VEHICLES.sea_ark.passive.id, "broadside_echo");

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
const milestoneRewardTotal = Object.values(config.MILESTONES).reduce((sum, milestone) => sum + milestone.rewardParts, 0);
assert.strictEqual(Object.keys(config.MILESTONES).length, 12, "R65 should define twelve wave milestones");
assert.strictEqual(milestoneRewardTotal, 1080, "R65 milestone rewards should total 1080 parts");
assert.strictEqual(config.MILESTONES.wave_25.target, 25, "R65 wave_25 milestone should target wave 25");
assert.strictEqual(config.MILESTONES.wave_100.description, "抵達第 100 波，灰燼盡頭仍有火");
Object.values(config.MILESTONES).forEach((milestone) => {
  assert.strictEqual(milestone.metric, "bestWave", `${milestone.id} should track bestWave`);
  assert(Number.isInteger(milestone.target) && milestone.target > 0, `${milestone.id} should have a wave target`);
});

assert(config.STORY && Array.isArray(config.STORY.beats), "R65 should define story beats");
assert.strictEqual(config.STORY.beats.length, 12, "R65 should include 12 radio log beats");
const validStoryUnlocks = new Set(["default", "bestWave", "bosses", "vehicleUnlock", "furnitureCount"]);
config.STORY.beats.forEach((beat) => {
  assert(beat.id && beat.title, `${beat.id || "story beat"} should have id and title`);
  assert(Array.isArray(beat.lines) && beat.lines.length > 0, `${beat.id} should include dialogue lines`);
  beat.lines.forEach((line) => {
    assert(["xi", "driver", "narration"].includes(line.speaker), `${beat.id} has an invalid speaker ${line.speaker}`);
    assert(line.text && line.text.replace(/\s+/g, "").length > 0, `${beat.id} line text should not be blank`);
  });
  assert(beat.unlock && validStoryUnlocks.has(beat.unlock.type), `${beat.id} should use a valid story unlock type`);
});
assert.strictEqual(config.STORY.beats.find((beat) => beat.id === "b01").unlock.type, "default");
assert(config.STORY.beats.some((beat) => beat.unlock.type === "bestWave" && beat.unlock.value === 20 && beat.title === "不熄的光"), "R65 story should include the wave 20 ending beat");

console.log("Config tests PASS");
