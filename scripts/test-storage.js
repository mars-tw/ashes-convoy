"use strict";

const assert = require("assert");
const config = require("../src/config.js");
const rules = require("../src/rules.js");

const fresh = rules.migrateMeta(null, { now: () => "2026-07-03T00:00:00.000Z", config });
assert.deepStrictEqual(fresh, config.META_DEFAULT, "null migration should return the default shape");
fresh.parts = 999;
const freshAgain = rules.migrateMeta(null, { config });
assert.strictEqual(freshAgain.parts, 0, "default migration must be a deep copy");
assert.strictEqual(freshAgain.unlockedVehicles.land_rig, true);
assert.strictEqual(freshAgain.unlockedVehicles.sky_barge, false);
assert.strictEqual(freshAgain.unlockedVehicles.sea_ark, false);
assert.strictEqual(freshAgain.unlockedVehicles.void_runner, false);
assert.strictEqual(freshAgain.blueprintWishlist, "sky_barge");

const invalid = rules.migrateMeta("{not-json", { config });
assert.deepStrictEqual(invalid, config.META_DEFAULT, "invalid JSON should fall back to default");

const dirty = {
  version: 0,
  selectedVehicle: "unknown_vehicle",
  parts: Infinity,
  totalRuns: -4,
  totalKills: NaN,
  totalBossKills: 2.9,
  bestWave: "7",
  bestScore: "-30",
  shelterTheme: "bunker",
  unlockedVehicles: { iron_crow: false, dawn_skiff: true, ghost: true, sky_barge: false },
  vehicleLevels: {
    iron_crow: { hull: 3.8, weapon: 99, energy: -2, gate: "2" },
    dawn_skiff: { hull: NaN, weapon: 1, energy: Infinity, gate: 1 },
    land_rig: { hull: 3.8, weapon: 99, energy: -2, gate: "2" },
    void_runner: { hull: 2, weapon: 1, energy: 99, gate: 1 }
  },
  achievements: { first_boss: true, bogus: false },
  claimedMilestones: { a: true, b: "true" },
  settings: { aimAssist: false, reducedFlash: true, sound: "yes" },
  tutorial: { seenIntro: true, seenGate: "yes", seenGarage: false },
  blueprints: { rift_hauler: 5.5, frost_wing: -2 },
  bestByVehicle: {
    iron_crow: { wave: 6, score: 4000, kills: 42, bosses: 1, at: "2026-07-03T00:00:00.000Z" },
    sea_ark: { wave: 5, score: 3500, kills: 30, bosses: 1, at: "2026-07-03T00:00:00.000Z" },
    ghost: { wave: 99, score: 99, kills: 99, bosses: 99, at: "bad" }
  }
};
const dirtyBefore = JSON.stringify(dirty, (key, value) => {
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
});
const migrated = rules.migrateMeta(dirty, { config });

assert.strictEqual(
  JSON.stringify(dirty, (key, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    return value;
  }),
  dirtyBefore,
  "migrateMeta must not mutate input objects"
);
assert.strictEqual(migrated.version, 2);
assert.strictEqual(migrated.selectedVehicle, "land_rig");
assert.strictEqual(migrated.shelterTheme, "snow");
assert.strictEqual(migrated.parts, 0);
assert.strictEqual(migrated.totalRuns, 0);
assert.strictEqual(migrated.totalKills, 0);
assert.strictEqual(migrated.totalBossKills, 2);
assert.strictEqual(migrated.bestWave, 7);
assert.strictEqual(migrated.bestScore, 0);
["land_rig", "sky_barge", "sea_ark", "void_runner"].forEach((vehicleId) => {
  assert.strictEqual(migrated.unlockedVehicles[vehicleId], true, `${vehicleId} should be unlocked`);
  assert(migrated.vehicleLevels[vehicleId], `${vehicleId} levels should be present`);
});
assert.strictEqual(migrated.unlockedVehicles.iron_crow, undefined);
assert.strictEqual(migrated.unlockedVehicles.dawn_skiff, undefined);
assert.strictEqual(migrated.vehicleLevels.land_rig.hull, 3);
assert.strictEqual(migrated.vehicleLevels.land_rig.weapon, config.ECONOMY.upgradeTracks.weapon.maxLevel);
assert.strictEqual(migrated.vehicleLevels.land_rig.energy, 0);
assert.strictEqual(migrated.vehicleLevels.land_rig.gate, 2);
assert.strictEqual(migrated.vehicleLevels.void_runner.weapon, 1);
assert.strictEqual(migrated.vehicleLevels.void_runner.energy, config.ECONOMY.upgradeTracks.energy.maxLevel);
assert.strictEqual(migrated.achievements.first_boss, true);
assert.strictEqual(migrated.achievements.bogus, undefined);
assert.strictEqual(migrated.claimedMilestones.a, true);
assert.strictEqual(migrated.claimedMilestones.b, undefined);
assert.strictEqual(migrated.settings.aimAssist, false);
assert.strictEqual(migrated.settings.reducedFlash, true);
assert.strictEqual(migrated.settings.sound, true);
assert.strictEqual(migrated.tutorial.seenIntro, true);
assert.strictEqual(migrated.tutorial.seenGate, false);
assert.strictEqual(migrated.blueprints.sky_barge, 3);
assert.strictEqual(migrated.blueprints.sea_ark, 3);
assert.strictEqual(migrated.blueprints.void_runner, 3);
assert.strictEqual(migrated.blueprintWishlist, null);
assert.strictEqual(migrated.blueprints.rift_hauler, undefined);
assert.strictEqual(migrated.blueprints.frost_wing, undefined);
assert.strictEqual(migrated.bestByVehicle.iron_crow, undefined);
assert.strictEqual(migrated.bestByVehicle.sea_ark.wave, 5);
assert.strictEqual(migrated.bestByVehicle.ghost, undefined);

const oldJson = JSON.stringify({
  selectedVehicle: "dawn_skiff",
  shelterTheme: "not-a-theme",
  parts: 18,
  vehicleLevels: { dawn_skiff: { hull: 1, weapon: 2 } }
});
const old = rules.migrateMeta(oldJson, { config });
assert.strictEqual(old.version, 2);
assert.strictEqual(old.selectedVehicle, "land_rig");
assert.strictEqual(old.shelterTheme, "snow");
assert.strictEqual(old.parts, 18);
assert.strictEqual(old.vehicleLevels.land_rig.hull, 0);
assert.strictEqual(old.vehicleLevels.land_rig.weapon, 0);
assert.strictEqual(old.unlockedVehicles.land_rig, true);
assert.strictEqual(old.unlockedVehicles.sky_barge, true);
assert.strictEqual(old.unlockedVehicles.sea_ark, false);
assert.strictEqual(old.unlockedVehicles.void_runner, false);
assert.strictEqual(old.blueprintWishlist, "sea_ark");

const oldRunner = rules.migrateMeta(
  {
    version: 1,
    totalRuns: 1,
    selectedVehicle: "void_runner",
    vehicleLevels: { void_runner: { weapon: 1 } }
  },
  { config }
);
["land_rig", "sky_barge", "sea_ark", "void_runner"].forEach((vehicleId) => {
  assert.strictEqual(oldRunner.unlockedVehicles[vehicleId], true, `${vehicleId} should be retained for an old active player`);
});
assert.strictEqual(oldRunner.selectedVehicle, "void_runner");
assert.strictEqual(oldRunner.blueprintWishlist, null);

console.log("Storage tests PASS");
