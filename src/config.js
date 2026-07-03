"use strict";

const STORAGE_KEY = "ashes_convoy_meta_v1";
const META_VERSION = 1;

const LOGIC = {
  width: 195,
  height: 422,
  displayWidth: 390,
  displayHeight: 844,
  renderScale: 2,
  roadLeft: 39,
  roadRight: 156,
  vehicleY: 352,
  aimMinY: 34,
  aimMaxY: 320
};

const VEHICLES = {
  iron_crow: {
    id: "iron_crow",
    name: "鐵鴉號",
    kind: "train",
    sprite: "vehicle_iron_crow",
    unlock: { type: "default" },
    hp: 420,
    armor: 8,
    turretSlots: 2,
    weapon: "machine_cannon",
    radius: 17,
    visualHalfWidth: 40,
    moveResponsiveness: 0.16,
    aimResponsiveness: 0.12,
    passive: { id: "revenge_fire", damageMul: 0.1, duration: 2 },
    stage: 1
  },
  dawn_skiff: {
    id: "dawn_skiff",
    name: "晨星艇",
    kind: "ship",
    sprite: "vehicle_dawn_skiff",
    unlock: { type: "default" },
    hp: 300,
    armor: 3,
    turretSlots: 3,
    weapon: "pulse_burst",
    radius: 15,
    visualHalfWidth: 38,
    moveResponsiveness: 0.24,
    aimResponsiveness: 0.2,
    passive: { id: "armor_break_focus", armorBreakPerHit: 0.03, maxStacks: 6 },
    stage: 1
  }
};

const WEAPONS = {
  machine_cannon: {
    id: "machine_cannon",
    name: "雙管機砲",
    bulletSprite: "bullet_machine",
    damage: 18,
    fireInterval: 0.22,
    projectileSpeed: 330,
    pierce: 0,
    spread: 0.012,
    splash: 0,
    baseProjectiles: 1,
    sideDamageMul: 0.55,
    muzzleOffset: 20
  },
  pulse_burst: {
    id: "pulse_burst",
    name: "脈衝速射",
    bulletSprite: "bullet_pulse",
    damage: 7.2,
    fireInterval: 0.12,
    projectileSpeed: 380,
    pierce: 0,
    spread: 0.055,
    splash: 0,
    baseProjectiles: 2,
    sideDamageMul: 0.52,
    muzzleOffset: 18
  },
  rocket_pod: {
    id: "rocket_pod",
    name: "火箭艙",
    bulletSprite: "bullet_rocket",
    damage: 42,
    fireInterval: 0.72,
    projectileSpeed: 235,
    pierce: 0,
    spread: 0.03,
    splash: 62,
    baseProjectiles: 1,
    sideDamageMul: 0.5,
    muzzleOffset: 18
  }
};

const ENEMIES = {
  shambler: {
    id: "shambler",
    name: "遊蕩屍",
    sprite: "zombie_shambler",
    hp: 30,
    speed: 24,
    contactDamage: 8,
    budgetCost: 2,
    score: 10,
    radius: 7,
    scale: 1.3,
    firstWave: 1,
    tags: ["ground"],
    stage: 1
  },
  runner: {
    id: "runner",
    name: "疾奔屍",
    sprite: "zombie_runner",
    hp: 18,
    speed: 42,
    contactDamage: 6,
    budgetCost: 2,
    score: 12,
    radius: 6,
    scale: 1.25,
    firstWave: 1,
    tags: ["ground", "fast"],
    stage: 1
  },
  bloater: {
    id: "bloater",
    name: "腫囊屍",
    sprite: "zombie_bloater",
    hp: 95,
    speed: 16,
    contactDamage: 16,
    budgetCost: 5,
    score: 28,
    radius: 12,
    scale: 1,
    firstWave: 2,
    deathBurst: { radius: 62, damage: 22 },
    tags: ["ground", "burst"],
    stage: 1
  },
  boss_hive_titan: {
    id: "boss_hive_titan",
    name: "母巢巨屍",
    sprite: "boss_hive_titan",
    hp: 850,
    speed: 9,
    contactDamage: 35,
    budgetCost: 24,
    score: 480,
    radius: 26,
    scale: 1.25,
    firstWave: 5,
    boss: true,
    phases: [
      { hpPct: 0.66, action: "summon" },
      { hpPct: 0.33, action: "charge" }
    ],
    tags: ["boss", "hive"],
    stage: 1
  }
};

const GATES = {
  damage_plus: {
    id: "damage_plus",
    label: "火力 +35%",
    shortLabel: "火力",
    sprite: "gate_damage",
    coreHp: 45,
    effect: { type: "damageAdd", add: 0.35, maxDamageMul: 3.5 },
    stage: 1
  },
  rate_plus: {
    id: "rate_plus",
    label: "射速 +25%",
    shortLabel: "射速",
    sprite: "gate_rate",
    coreHp: 45,
    effect: { type: "fireIntervalMul", mul: 0.8, minInterval: 0.12 },
    stage: 1
  },
  multishot_plus: {
    id: "multishot_plus",
    label: "彈道 +1",
    shortLabel: "彈道",
    sprite: "gate_multishot",
    coreHp: 55,
    effect: { type: "projectileAdd", add: 1, max: 4, sideDamageMul: 0.55 },
    stage: 1
  },
  repair: {
    id: "repair",
    label: "緊急維修",
    shortLabel: "維修",
    sprite: "gate_repair",
    coreHp: 40,
    effect: { type: "repairPct", pct: 0.18 },
    stage: 1
  }
};

const WAVE = {
  baseDuration: 30,
  durationGrowth: 1,
  maxDuration: 45,
  bossEvery: 5,
  hpGrowth: 1.13,
  budgetBase: 18,
  budgetLinear: 5,
  budgetPow: 1.35,
  speedGrowthPerWave: 0.015,
  speedGrowthCap: 0.45,
  normalCountBase: 8,
  normalCountGrowth: 1.6,
  spawnStart: 0.8,
  spawnEndPadding: 3.2,
  firstGateMinTime: 15,
  firstGateMaxTime: 25,
  gateIntervalMin: 20,
  gateIntervalMax: 30,
  gateSpeed: 22,
  gateHpGrowth: 1.09,
  bossHpGrowth: 1.28,
  openingClusterCount: 18,
  clusterSpawnWindow: 8.5,
  clusterSizeMin: 4,
  clusterSizeMax: 7
};

const PERFORMANCE = {
  maxEnemies: 72,
  maxProjectiles: 96,
  maxEffects: 90,
  corpseFadeSeconds: 0.7,
  lowFpsFloor: 30
};

const DIFFICULTIES = {
  normal: { id: "normal", name: "普通", hpMul: 1, countMul: 1, rewardMul: 1, bossEvery: 5 },
  hard: { id: "hard", name: "硬派", hpMul: 1.25, countMul: 1.1, rewardMul: 1.15, bossEvery: 5, locked: true },
  endless: { id: "endless", name: "無盡", hpMul: 1.18, countMul: 1.18, rewardMul: 1.1, bossEvery: 4, locked: true }
};

const ECONOMY = {
  partsPerWave: 3,
  killDivisor: 8,
  killRewardCap: 360,
  bossParts: 12,
  minRunParts: 2,
  difficultyRewardMul: {
    normal: 1,
    hard: 1.15,
    endless: 1.1
  },
  blueprintDropChance: 0.3,
  blueprintBundle: 5,
  blueprintPityAfterBosses: 3,
  upgradeTracks: {
    hull: {
      id: "hull",
      label: "車體強化",
      maxLevel: 8,
      hpMulPerLevel: 0.08,
      costs: [30, 55, 90, 150, 245, 400, 650, 1050]
    },
    weapon: {
      id: "weapon",
      label: "武器調校",
      maxLevel: 8,
      damageMulPerLevel: 0.07,
      costs: [40, 70, 115, 190, 310, 500, 810, 1300]
    },
    energy: {
      id: "energy",
      label: "供能效率",
      maxLevel: 6,
      fireRateMulPerLevel: 0.05,
      costs: [80, 130, 210, 340, 550, 880]
    },
    gate: {
      id: "gate",
      label: "補給介面",
      maxLevel: 5,
      gateMulPerLevel: 0.04,
      costs: [90, 160, 280, 490, 860]
    }
  }
};

const META_DEFAULT = {
  version: META_VERSION,
  createdAt: null,
  updatedAt: null,
  selectedVehicle: "iron_crow",
  parts: 0,
  totalRuns: 0,
  totalKills: 0,
  totalBossKills: 0,
  bestWave: 0,
  bestScore: 0,
  bestByVehicle: {},
  unlockedVehicles: {
    iron_crow: true,
    dawn_skiff: true
  },
  vehicleLevels: {
    iron_crow: { hull: 0, weapon: 0, energy: 0, gate: 0 },
    dawn_skiff: { hull: 0, weapon: 0, energy: 0, gate: 0 }
  },
  blueprints: {},
  bossBlueprintPity: 0,
  achievements: {},
  claimedMilestones: {},
  settings: {
    aimAssist: true,
    reducedFlash: false,
    sound: true
  },
  tutorial: {
    seenIntro: false,
    seenGate: false,
    seenGarage: false
  },
  lastRun: null
};

const DSConfig = {
  STORAGE_KEY,
  META_VERSION,
  LOGIC,
  VEHICLES,
  WEAPONS,
  ENEMIES,
  GATES,
  WAVE,
  PERFORMANCE,
  DIFFICULTIES,
  ECONOMY,
  META_DEFAULT
};

if (typeof window !== "undefined") window.DSConfig = DSConfig;
if (typeof module !== "undefined" && module.exports) module.exports = DSConfig;
