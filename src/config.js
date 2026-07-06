"use strict";

const STORAGE_KEY = "ashes_convoy_meta_v1";
const META_VERSION = 2;

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
  land_rig: {
    id: "land_rig",
    name: "壁爐裝甲車",
    kind: "rig",
    environment: "land",
    environmentLabel: "陸地",
    spriteImage: "assets/vehicles/land.png",
    sprite: "vehicle_iron_crow",
    unlock: { type: "default" },
    hp: 520,
    armor: 10,
    weapon: "rig_cannon",
    radius: 20,
    visualWidth: 80,
    visualHalfWidth: 40,
    moveResponsiveness: 0.14,
    aimResponsiveness: 0.12,
    passive: { id: "revenge_fire", damageMul: 0.1, duration: 2 },
    role: "高耐久坦克",
    stage: 4
  },
  sky_barge: {
    id: "sky_barge",
    name: "晨光飛船",
    kind: "airship",
    environment: "air",
    environmentLabel: "天空",
    spriteImage: "assets/vehicles/air.png",
    sprite: "vehicle_dawn_skiff",
    unlock: { type: "blueprint", blueprintsRequired: 3 },
    hp: 300,
    armor: 3,
    weapon: "sky_autocannon",
    radius: 16,
    visualWidth: 74,
    visualHalfWidth: 37,
    moveResponsiveness: 0.28,
    aimResponsiveness: 0.22,
    role: "高機動脆皮",
    stage: 4
  },
  sea_ark: {
    id: "sea_ark",
    name: "潮汐方舟",
    kind: "boat",
    environment: "sea",
    environmentLabel: "海面",
    spriteImage: "assets/vehicles/sea.png",
    sprite: "vehicle_iron_crow",
    unlock: { type: "blueprint", blueprintsRequired: 3 },
    hp: 420,
    armor: 6,
    weapon: "ark_cannon",
    radius: 19,
    visualWidth: 86,
    visualHalfWidth: 43,
    moveResponsiveness: 0.18,
    aimResponsiveness: 0.14,
    role: "濺射清場",
    stage: 4
  },
  void_runner: {
    id: "void_runner",
    name: "星窗穿梭艇",
    kind: "spaceship",
    environment: "space",
    environmentLabel: "太空",
    spriteImage: "assets/vehicles/space.png",
    sprite: "vehicle_dawn_skiff",
    unlock: { type: "blueprint", blueprintsRequired: 3 },
    hp: 360,
    armor: 4,
    weapon: "void_lance",
    radius: 17,
    visualWidth: 76,
    visualHalfWidth: 38,
    moveResponsiveness: 0.21,
    aimResponsiveness: 0.24,
    passive: { id: "armor_break_focus", armorBreakPerHit: 0.025, maxStacks: 6 },
    role: "穿透精準輸出",
    stage: 4
  }
};

const WEAPONS = {
  rig_cannon: {
    id: "rig_cannon",
    name: "壁爐機砲",
    bulletSprite: "bullet_machine",
    damage: 20,
    fireInterval: 0.24,
    projectileSpeed: 330,
    pierce: 0,
    spread: 0.012,
    splash: 0,
    baseProjectiles: 1,
    sideDamageMul: 0.55,
    muzzleOffset: 62
  },
  sky_autocannon: {
    id: "sky_autocannon",
    name: "雲端速射砲",
    bulletSprite: "bullet_machine",
    damage: 12,
    fireInterval: 0.17,
    projectileSpeed: 390,
    pierce: 0,
    spread: 0.04,
    splash: 0,
    baseProjectiles: 1,
    sideDamageMul: 0.55,
    muzzleOffset: 58
  },
  ark_cannon: {
    id: "ark_cannon",
    name: "甲板艦砲",
    bulletSprite: "bullet_rocket",
    damage: 34,
    fireInterval: 0.48,
    projectileSpeed: 250,
    pierce: 0,
    spread: 0.02,
    splash: 58,
    baseProjectiles: 1,
    sideDamageMul: 0.5,
    muzzleOffset: 70
  },
  void_lance: {
    id: "void_lance",
    name: "星核光矛",
    bulletSprite: "bullet_pulse",
    damage: 8.5,
    fireInterval: 0.105,
    projectileSpeed: 430,
    pierce: 2,
    spread: 0.018,
    splash: 0,
    baseProjectiles: 1,
    sideDamageMul: 0.55,
    muzzleOffset: 54
  }
};

const ENEMIES = {
  shambler: {
    id: "shambler",
    name: "遊蕩屍",
    spriteImage: "assets/zombies/shambler.png",
    sprite: "zombie_shambler",
    hp: 30,
    speed: 24,
    contactDamage: 8,
    budgetCost: 2,
    score: 10,
    radius: 10,
    scale: 2,
    visualWidth: 20,
    firstWave: 1,
    tags: ["ground"],
    stage: 1
  },
  runner: {
    id: "runner",
    name: "疾奔屍",
    spriteImage: "assets/zombies/runner.png",
    sprite: "zombie_runner",
    hp: 18,
    speed: 42,
    contactDamage: 6,
    budgetCost: 2,
    score: 12,
    radius: 9,
    scale: 1.9,
    visualWidth: 18,
    firstWave: 1,
    tags: ["ground", "fast"],
    stage: 1
  },
  bloater: {
    id: "bloater",
    name: "腫囊屍",
    spriteImage: "assets/zombies/bloater.png",
    sprite: "zombie_bloater",
    hp: 95,
    speed: 16,
    contactDamage: 16,
    budgetCost: 5,
    score: 28,
    radius: 18,
    scale: 1.55,
    visualWidth: 34,
    firstWave: 2,
    deathBurst: { radius: 62, damage: 22 },
    tags: ["ground", "burst"],
    stage: 1
  },
  boss_hive_titan: {
    id: "boss_hive_titan",
    name: "母巢巨屍",
    spriteImage: "assets/zombies/titan.png",
    sprite: "boss_hive_titan",
    hp: 850,
    speed: 9,
    contactDamage: 35,
    budgetCost: 24,
    score: 480,
    radius: 40,
    scale: 1.9,
    visualWidth: 82,
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

const ENEMY_VARIANTS = {
  runner_frenzy: {
    id: "runner_frenzy",
    baseEnemy: "runner",
    label: "爆走 runner",
    hpMul: 0.8,
    speedMul: 1.3,
    tint: "rgba(225, 95, 79, 0.34)",
    filter: "sepia(1) saturate(2.15) hue-rotate(-18deg) contrast(1.12)",
    minWave: 3
  },
  shambler_hardened: {
    id: "shambler_hardened",
    baseEnemy: "shambler",
    label: "硬化 shambler",
    hpMul: 1.5,
    speedMul: 0.85,
    tint: "rgba(210, 214, 214, 0.3)",
    filter: "grayscale(0.85) brightness(0.9) contrast(1.18)",
    minWave: 4
  }
};

const ENVIRONMENT_EVENTS = {
  land: {
    id: "sandstorm",
    environment: "land",
    label: "沙塵暴",
    description: "視野下降，結算零件 +20%",
    chance: 0.38,
    minWave: 2,
    rewardMulAdd: 0.2,
    visibilityLoss: 0.18
  },
  air: {
    id: "turbulence",
    environment: "air",
    label: "亂流",
    description: "敵速 +15%，結算零件 +12%",
    chance: 0.38,
    minWave: 2,
    enemySpeedMul: 1.15,
    rewardMulAdd: 0.12
  },
  sea: {
    id: "undertow",
    environment: "sea",
    label: "暗流",
    description: "敵群左右漂移，結算零件 +10%",
    chance: 0.38,
    minWave: 2,
    rewardMulAdd: 0.1,
    swayAmpMul: 1.75,
    driftAmp: 8
  },
  space: {
    id: "meteor_shower",
    environment: "space",
    label: "隕石雨",
    description: "額外障礙，可擊爆拿零件",
    chance: 0.38,
    minWave: 2,
    hazardCount: 3,
    hazardHp: 20,
    hazardParts: 2
  }
};

const SUPPLY_DROPS = {
  chancePerKill: 0.05,
  pityKills: 25,
  partsPerCache: 3,
  partsCapPerRun: 12,
  crateSpeed: 18,
  pickupRadius: 34,
  magnetRadius: 92,
  rewards: {
    rate_boost: {
      id: "rate_boost",
      label: "射速補給",
      weight: 1,
      type: "rate",
      duration: 10,
      fireIntervalMul: 0.85
    },
    damage_boost: {
      id: "damage_boost",
      label: "火力補給",
      weight: 1,
      type: "damage",
      duration: 10,
      damageAdd: 0.2
    },
    repair_small: {
      id: "repair_small",
      label: "維修補給",
      weight: 1,
      type: "repair",
      repairPct: 0.08
    },
    parts_cache: {
      id: "parts_cache",
      label: "零件補給",
      weight: 1,
      type: "parts",
      parts: 3
    }
  }
};

const QUESTS = {
  dailyRewardParts: 5,
  weeklyRewardParts: 15,
  dailyPool: [
    {
      id: "daily_variant_hunt",
      label: "變種清掃",
      description: "擊殺 2 隻變種殭屍",
      metric: "variantKills",
      target: 2,
      rewardParts: 5
    },
    {
      id: "daily_event_finish",
      label: "事件應對",
      description: "完成 1 次環境事件",
      metric: "eventCompletions",
      target: 1,
      rewardParts: 5
    },
    {
      id: "daily_supply_run",
      label: "補給回收",
      description: "撿取 2 個補給箱",
      metric: "supplyCrates",
      target: 2,
      rewardParts: 5
    },
    {
      id: "daily_land_win",
      label: "陸地巡防",
      description: "用陸地載具完成 3 波",
      metric: "environmentWins",
      environment: "land",
      target: 1,
      rewardParts: 5
    }
  ],
  weeklyPool: [
    {
      id: "weekly_variant_hunt",
      label: "變種壓制",
      description: "擊殺 8 隻變種殭屍",
      metric: "variantKills",
      target: 8,
      rewardParts: 15
    },
    {
      id: "weekly_event_finish",
      label: "事件專員",
      description: "完成 4 次環境事件",
      metric: "eventCompletions",
      target: 4,
      rewardParts: 15
    },
    {
      id: "weekly_supply_run",
      label: "補給線維持",
      description: "撿取 8 個補給箱",
      metric: "supplyCrates",
      target: 8,
      rewardParts: 15
    },
    {
      id: "weekly_air_win",
      label: "天空航線",
      description: "用天空載具完成 3 波",
      metric: "environmentWins",
      environment: "air",
      target: 1,
      rewardParts: 15
    }
  ]
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
    effect: { type: "fireIntervalMul", mul: 0.8 },
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
  firstGateMinTime: 8,
  firstGateMaxTime: 11,
  gateIntervalMin: 20,
  gateIntervalMax: 30,
  gateSpeed: 22,
  gateHpGrowth: 1.09,
  bossHpGrowth: 1.28,
  openingClusterCount: 24,
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
  partsPerWave: 4,
  killDivisor: 6,
  killRewardCap: 360,
  bossParts: 24,
  minRunParts: 2,
  difficultyRewardMul: {
    normal: 1,
    hard: 1.15,
    endless: 1.1
  },
  blueprintDropChance: 0.35,
  blueprintBundle: 1,
  blueprintPityAfterBosses: 3,
  eventPartsCapPerRun: 12,
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
  },
  vehicleUpgradeTracks: {
    land_rig: {
      land_armor: {
        id: "land_armor",
        label: "裝甲強化",
        maxLevel: 2,
        costs: [45, 90],
        armorAddPerLevel: 2,
        description: "每級護甲 +2"
      },
      land_resist: {
        id: "land_resist",
        label: "毒抗隔艙",
        maxLevel: 2,
        costs: [50, 100],
        damageTakenMulPerLevel: 0.04,
        description: "每級承傷 -4%"
      }
    },
    sky_barge: {
      sky_overclock: {
        id: "sky_overclock",
        label: "引擎超頻",
        maxLevel: 2,
        costs: [45, 90],
        fireRateMulPerLevel: 0.04,
        description: "每級射速 +4%"
      },
      sky_evasion: {
        id: "sky_evasion",
        label: "迴避航線",
        maxLevel: 2,
        costs: [50, 100],
        damageTakenMulPerLevel: 0.05,
        description: "每級承傷 -5%"
      }
    },
    sea_ark: {
      sea_depth: {
        id: "sea_depth",
        label: "深水炸彈",
        maxLevel: 2,
        costs: [45, 90],
        damageMulPerLevel: 0.05,
        description: "每級砲擊傷害 +5%"
      },
      sea_splash: {
        id: "sea_splash",
        label: "濺射半徑",
        maxLevel: 2,
        costs: [50, 100],
        splashAddPerLevel: 8,
        description: "每級濺射 +8"
      }
    },
    void_runner: {
      void_overload: {
        id: "void_overload",
        label: "過載射速",
        maxLevel: 2,
        costs: [45, 90],
        fireRateMulPerLevel: 0.04,
        description: "每級射速 +4%"
      },
      void_pierce: {
        id: "void_pierce",
        label: "穿透校準",
        maxLevel: 1,
        costs: [80],
        pierceAddPerLevel: 1,
        description: "滿級穿透 +1"
      }
    }
  }
};

const ACHIEVEMENTS = {
  first_kill: {
    id: "first_kill",
    label: "第一滴黑血",
    description: "首次擊殺任一喪屍。",
    rewardParts: 4,
    target: 1,
    metric: "kills"
  },
  first_boss: {
    id: "first_boss",
    label: "首殺 Boss",
    description: "首次擊破母巢巨屍。",
    rewardParts: 8,
    target: 1,
    metric: "bosses"
  },
  wave_5: {
    id: "wave_5",
    label: "第 5 波突破",
    description: "抵達並結算第 5 波。",
    rewardParts: 8,
    target: 5,
    metric: "bestWave"
  },
  wave_10: {
    id: "wave_10",
    label: "第 10 波突破",
    description: "抵達並結算第 10 波。",
    rewardParts: 8,
    target: 10,
    metric: "bestWave"
  },
  sortie_land: {
    id: "sortie_land",
    label: "陸地出勤",
    description: "用陸地載具完成一次有效出勤。",
    rewardParts: 4,
    target: 1,
    metric: "environment:land"
  },
  sortie_air: {
    id: "sortie_air",
    label: "天空出勤",
    description: "用天空載具完成一次有效出勤。",
    rewardParts: 4,
    target: 1,
    metric: "environment:air"
  },
  sortie_sea: {
    id: "sortie_sea",
    label: "海面出勤",
    description: "用海面載具完成一次有效出勤。",
    rewardParts: 4,
    target: 1,
    metric: "environment:sea"
  },
  sortie_space: {
    id: "sortie_space",
    label: "太空出勤",
    description: "用太空載具完成一次有效出勤。",
    rewardParts: 4,
    target: 1,
    metric: "environment:space"
  },
  total_kills_100: {
    id: "total_kills_100",
    label: "百屍清道夫",
    description: "累積擊殺 100 名喪屍。",
    rewardParts: 8,
    target: 100,
    metric: "totalKills"
  },
  unlock_all_vehicles: {
    id: "unlock_all_vehicles",
    label: "四域車隊",
    description: "解鎖四台載具。",
    rewardParts: 8,
    target: 4,
    metric: "unlockedVehicles"
  },
  event_sandstorm: {
    id: "event_sandstorm",
    label: "沙塵穿越",
    description: "首次完成沙塵暴事件波。",
    rewardParts: 3,
    target: 1,
    metric: "eventCompletion:sandstorm"
  },
  event_turbulence: {
    id: "event_turbulence",
    label: "亂流穿越",
    description: "首次完成亂流事件波。",
    rewardParts: 3,
    target: 1,
    metric: "eventCompletion:turbulence"
  },
  event_undertow: {
    id: "event_undertow",
    label: "暗流穿越",
    description: "首次完成暗流事件波。",
    rewardParts: 3,
    target: 1,
    metric: "eventCompletion:undertow"
  },
  event_meteor_shower: {
    id: "event_meteor_shower",
    label: "隕石穿越",
    description: "首次完成隕石雨事件波。",
    rewardParts: 3,
    target: 1,
    metric: "eventCompletion:meteor_shower"
  }
};

const START_SCREEN = {
  image: "assets/ui/start.png",
  alt: "灰燼護航開始畫面"
};

const SHELTER_THEMES = {};

const META_DEFAULT = {
  version: META_VERSION,
  createdAt: null,
  updatedAt: null,
  selectedVehicle: "land_rig",
  shelterTheme: "snow",
  parts: 0,
  totalRuns: 0,
  totalKills: 0,
  totalBossKills: 0,
  bestWave: 0,
  bestScore: 0,
  bestByVehicle: {},
  unlockedVehicles: {
    land_rig: true,
    sky_barge: false,
    sea_ark: false,
    void_runner: false
  },
  vehicleLevels: {
    land_rig: { hull: 0, weapon: 0, energy: 0, gate: 0 },
    sky_barge: { hull: 0, weapon: 0, energy: 0, gate: 0 },
    sea_ark: { hull: 0, weapon: 0, energy: 0, gate: 0 },
    void_runner: { hull: 0, weapon: 0, energy: 0, gate: 0 }
  },
  blueprints: {
    sky_barge: 0,
    sea_ark: 0,
    void_runner: 0
  },
  blueprintWishlist: "sky_barge",
  bossBlueprintPity: 0,
  achievements: {},
  eventStats: {
    sandstorm: { encounters: 0, completions: 0 },
    turbulence: { encounters: 0, completions: 0 },
    undertow: { encounters: 0, completions: 0 },
    meteor_shower: { encounters: 0, completions: 0 }
  },
  questStats: {
    variantKills: 0,
    eventCompletions: 0,
    supplyCrates: 0,
    environmentWins: {
      land: 0,
      air: 0,
      sea: 0,
      space: 0
    }
  },
  questBaselines: {},
  questClaims: {},
  claimedMilestones: {},
  settings: {
    aimAssist: true,
    aimAssistLevel: "medium",
    reducedFlash: false,
    screenShake: true,
    damageTextDensity: "all",
    sound: true
  },
  tutorial: {
    seenIntro: false,
    seenGate: false,
    seenGarage: false
  },
  recovery: {
    pending: false,
    message: "",
    at: null
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
  ENEMY_VARIANTS,
  ENVIRONMENT_EVENTS,
  SUPPLY_DROPS,
  QUESTS,
  GATES,
  WAVE,
  PERFORMANCE,
  DIFFICULTIES,
  ECONOMY,
  ACHIEVEMENTS,
  START_SCREEN,
  SHELTER_THEMES,
  META_DEFAULT
};

if (typeof window !== "undefined") window.DSConfig = DSConfig;
if (typeof module !== "undefined" && module.exports) module.exports = DSConfig;
