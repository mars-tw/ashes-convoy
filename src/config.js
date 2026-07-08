"use strict";

const STORAGE_KEY = "ashes_convoy_meta_v1";
const META_VERSION = 2;
const VERSION_SOURCE =
  (typeof globalThis !== "undefined" && globalThis.DSVersion) ||
  (typeof require === "function" ? require("./version.js") : { APP_VERSION: "R49", CACHE_VERSION: "ashes-convoy-r49-v1" });
const APP_VERSION = VERSION_SOURCE.APP_VERSION;
const CACHE_VERSION = VERSION_SOURCE.CACHE_VERSION;

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

const ENVIRONMENT_BACKGROUNDS = {
  land: "assets/env/land.png",
  air: "assets/env/air.png",
  sea: "assets/env/sea.png",
  space: "assets/env/space.png"
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
    radius: 8,
    visualWidth: 30,
    visualHalfWidth: 15,
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
    radius: 7,
    visualWidth: 26,
    visualHalfWidth: 13,
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
    radius: 9,
    visualWidth: 31,
    visualHalfWidth: 15.5,
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
    radius: 8,
    visualWidth: 28,
    visualHalfWidth: 14,
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
    muzzleOffset: 23
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
    muzzleOffset: 20
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
    muzzleOffset: 25
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
    muzzleOffset: 20
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
    radius: 8,
    scale: 1.6,
    visualWidth: 16,
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
    radius: 7,
    scale: 1.45,
    visualWidth: 14,
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
    radius: 17,
    scale: 1.5,
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

const FX = {
  // 特效品質分級：low 粒子上限為 high 的一半以下、發射率減半、關閉 vignette、環境層密度減半。
  quality: {
    high: { maxParticles: 96, emitRateMul: 1, vignette: true, trailEvery: 1, envDensityMul: 1 },
    low: { maxParticles: 48, emitRateMul: 0.5, vignette: false, trailEvery: 2, envDensityMul: 0.5 }
  },
  shapes: ["spark", "smoke", "debris", "foam", "dust", "ember", "shard"],
  // 擊殺爆發：依敵種類型（zombie 血綠碎塊＋骨屑 / mech 火花＋機油黑煙 / boss 多段大爆發）。
  killBurst: {
    zombie: [
      {
        shape: "debris",
        count: 9,
        speedMin: 24,
        speedMax: 68,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 1.6,
        lifeMin: 0.3,
        lifeMax: 0.62,
        sizeMin: 1.5,
        sizeMax: 3,
        sizeEnd: 0.6,
        colors: ["#6f8f3f", "#4c6b2a", "#39511f"],
        gravity: 90,
        drag: 2.2,
        spin: 6
      },
      {
        shape: "shard",
        count: 5,
        speedMin: 30,
        speedMax: 82,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 1.3,
        lifeMin: 0.22,
        lifeMax: 0.5,
        sizeMin: 1,
        sizeMax: 2,
        sizeEnd: 0.5,
        colors: ["#e8e2cc", "#cfc7ac"],
        gravity: 110,
        drag: 1.6,
        spin: 9
      }
    ],
    mech: [
      {
        shape: "spark",
        count: 10,
        speedMin: 50,
        speedMax: 120,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 1.7,
        lifeMin: 0.12,
        lifeMax: 0.35,
        sizeMin: 1,
        sizeMax: 2,
        sizeEnd: 0.4,
        colors: ["#ffd76a", "#ffae42", "#fff2b0"],
        gravity: 30,
        drag: 3,
        spin: 0
      },
      {
        shape: "smoke",
        count: 4,
        speedMin: 6,
        speedMax: 18,
        angleCenter: -Math.PI / 2,
        angleSpread: 0.9,
        lifeMin: 0.5,
        lifeMax: 1,
        sizeMin: 2.5,
        sizeMax: 4,
        sizeEnd: 7,
        colors: ["#2c2c30", "#3a3a40"],
        gravity: -14,
        drag: 1,
        spin: 1.5
      }
    ],
    boss: [
      {
        shape: "ember",
        count: 14,
        delay: 0,
        speedMin: 40,
        speedMax: 130,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 2,
        lifeMin: 0.25,
        lifeMax: 0.6,
        sizeMin: 1.5,
        sizeMax: 3.2,
        sizeEnd: 0.5,
        colors: ["#ffb46b", "#ff7a45", "#ffe08a"],
        gravity: 40,
        drag: 2.4,
        spin: 4
      },
      {
        shape: "debris",
        count: 12,
        delay: 0.16,
        speedMin: 30,
        speedMax: 100,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 2,
        lifeMin: 0.35,
        lifeMax: 0.8,
        sizeMin: 1.6,
        sizeMax: 3.4,
        sizeEnd: 0.7,
        colors: ["#6f8f3f", "#54401f", "#4c6b2a"],
        gravity: 100,
        drag: 1.8,
        spin: 7
      },
      {
        shape: "smoke",
        count: 8,
        delay: 0.34,
        speedMin: 8,
        speedMax: 26,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 0.9,
        lifeMin: 0.6,
        lifeMax: 1.2,
        sizeMin: 3,
        sizeMax: 5,
        sizeEnd: 9,
        colors: ["#3a3a40", "#2c2c30", "#514238"],
        gravity: -12,
        drag: 1,
        spin: 1
      }
    ]
  },
  // 命中點小火花：顏色依載具彈色。
  hitSpark: {
    base: {
      shape: "spark",
      count: 4,
      speedMin: 36,
      speedMax: 92,
      angleCenter: Math.PI / 2,
      angleSpread: 1.1,
      lifeMin: 0.08,
      lifeMax: 0.2,
      sizeMin: 0.8,
      sizeMax: 1.8,
      sizeEnd: 0.3,
      colors: ["#ffd76a"],
      gravity: 0,
      drag: 5,
      spin: 0
    },
    defaultColor: "#ffd76a",
    colorsByVehicle: {
      land_rig: "#ffd27f",
      sky_barge: "#ffe9a8",
      sea_ark: "#ffb46b",
      void_runner: "#9fd8ff"
    }
  },
  // 砲口閃焰強化：reducedFlash 開啟時退回保守參數並停用閃爍。
  muzzleFlash: {
    scale: 1.55,
    brightness: 1.35,
    frames: 3,
    flickerHz: 24,
    offset: 2,
    reducedFlash: { scale: 1.05, brightness: 1, frames: 2, flickerHz: 0, offset: 2 }
  },
  // 環境動態層：land 車尾揚塵＋路面飛屑 / sea 船首 V 尾流白沫＋波光點 / air 雲影＋風速線 / space 引擎藍焰＋流星＋星塵視差。
  environments: {
    land: {
      layers: [
        {
          id: "wheel_dust",
          anchor: "vehicle_rear",
          ratePerSec: 12,
          shape: "dust",
          count: 1,
          speedMin: 4,
          speedMax: 16,
          angleCenter: Math.PI / 2,
          angleSpread: 0.6,
          lifeMin: 0.45,
          lifeMax: 0.95,
          sizeMin: 1.6,
          sizeMax: 3.2,
          sizeEnd: 5.5,
          colors: ["#b09a72", "#8f7b57", "#7a6748"],
          gravity: -6,
          drag: 1.4,
          spin: 0.6,
          jitterX: 9,
          jitterY: 2
        },
        {
          id: "road_grit",
          anchor: "road",
          ratePerSec: 4,
          shape: "debris",
          count: 1,
          speedMin: 20,
          speedMax: 42,
          angleCenter: Math.PI / 2,
          angleSpread: 0.25,
          lifeMin: 0.3,
          lifeMax: 0.6,
          sizeMin: 0.8,
          sizeMax: 1.6,
          sizeEnd: 0.8,
          colors: ["#6d6156", "#57493c"],
          gravity: 0,
          drag: 0,
          spin: 5,
          jitterX: 55,
          jitterY: 6
        }
      ]
    },
    sea: {
      layers: [
        {
          id: "bow_foam_left",
          anchor: "vehicle_bow",
          anchorSide: -1,
          ratePerSec: 14,
          shape: "foam",
          count: 1,
          speedMin: 10,
          speedMax: 30,
          angleCenter: Math.PI * 0.78,
          angleSpread: 0.35,
          lifeMin: 0.45,
          lifeMax: 1,
          sizeMin: 2.2,
          sizeMax: 4.2,
          sizeEnd: 6,
          colors: ["#eaf6f2", "#bfe3dc", "#8fc7c2"],
          gravity: 0,
          drag: 1.8,
          spin: 0,
          jitterX: 4,
          jitterY: 3
        },
        {
          id: "bow_foam_right",
          anchor: "vehicle_bow",
          anchorSide: 1,
          ratePerSec: 14,
          shape: "foam",
          count: 1,
          speedMin: 10,
          speedMax: 30,
          angleCenter: Math.PI * 0.22,
          angleSpread: 0.35,
          lifeMin: 0.45,
          lifeMax: 1,
          sizeMin: 2.2,
          sizeMax: 4.2,
          sizeEnd: 6,
          colors: ["#eaf6f2", "#bfe3dc", "#8fc7c2"],
          gravity: 0,
          drag: 1.8,
          spin: 0,
          jitterX: 4,
          jitterY: 3
        },
        {
          id: "sun_glitter",
          anchor: "water",
          ratePerSec: 9,
          shape: "spark",
          count: 1,
          speedMin: 0,
          speedMax: 4,
          angleCenter: Math.PI / 2,
          angleSpread: 0.4,
          lifeMin: 0.3,
          lifeMax: 0.8,
          sizeMin: 1,
          sizeMax: 2,
          sizeEnd: 0.3,
          colors: ["#e9fbff", "#bfeef2"],
          gravity: 0,
          drag: 0,
          spin: 0,
          jitterX: 90,
          jitterY: 140
        }
      ]
    },
    air: {
      layers: [
        {
          id: "cloud_shadow",
          anchor: "screen",
          ratePerSec: 0.5,
          shape: "smoke",
          count: 1,
          speedMin: 34,
          speedMax: 52,
          angleCenter: Math.PI / 2,
          angleSpread: 0.05,
          lifeMin: 3,
          lifeMax: 5,
          sizeMin: 14,
          sizeMax: 26,
          sizeEnd: 26,
          colors: ["#9fb4c8", "#8aa2b8"],
          gravity: 0,
          drag: 0,
          spin: 0,
          jitterX: 80,
          jitterY: 8
        },
        {
          id: "wind_streak",
          anchor: "screen",
          ratePerSec: 7,
          shape: "spark",
          count: 1,
          stretch: 6,
          speedMin: 150,
          speedMax: 240,
          angleCenter: Math.PI / 2,
          angleSpread: 0.03,
          lifeMin: 0.25,
          lifeMax: 0.5,
          sizeMin: 0.6,
          sizeMax: 1,
          sizeEnd: 0.4,
          colors: ["#f4fbff", "#dcecf7"],
          gravity: 0,
          drag: 0,
          spin: 0,
          jitterX: 90,
          jitterY: 20
        }
      ]
    },
    space: {
      layers: [
        {
          id: "engine_flame",
          anchor: "vehicle_rear",
          ratePerSec: 20,
          shape: "ember",
          count: 1,
          speedMin: 26,
          speedMax: 60,
          angleCenter: Math.PI / 2,
          angleSpread: 0.3,
          lifeMin: 0.12,
          lifeMax: 0.3,
          sizeMin: 1.2,
          sizeMax: 2.4,
          sizeEnd: 0.4,
          colors: ["#7fd4ff", "#4aa8ff", "#bfeaff"],
          gravity: 0,
          drag: 0.6,
          spin: 0,
          jitterX: 3,
          jitterY: 2
        },
        {
          id: "meteor",
          anchor: "screen",
          ratePerSec: 0.35,
          shape: "shard",
          count: 1,
          stretch: 8,
          speedMin: 180,
          speedMax: 260,
          angleCenter: Math.PI * 0.62,
          angleSpread: 0.1,
          lifeMin: 0.5,
          lifeMax: 0.9,
          sizeMin: 1,
          sizeMax: 1.8,
          sizeEnd: 0.4,
          colors: ["#ffe9c8", "#ffb46b"],
          gravity: 0,
          drag: 0,
          spin: 0,
          jitterX: 100,
          jitterY: 30
        },
        {
          id: "star_dust",
          anchor: "parallax",
          ratePerSec: 0,
          shape: "spark",
          colors: ["#cfd6ff", "#ffffff", "#9fb0ff"],
          parallax: [
            { speed: 12, density: 0.5, size: 0.7, alpha: 0.5 },
            { speed: 26, density: 0.3, size: 1, alpha: 0.75 },
            { speed: 46, density: 0.18, size: 1.4, alpha: 1 }
          ]
        }
      ]
    }
  },
  // 載具生命感：影子橢圓（land/sea 貼地深、air/space 浮空淡＋下移偏移）、怠速浮動、移動傾斜、噴焰/排氣。
  vehicle: {
    shadow: {
      land: { widthMul: 0.94, heightMul: 0.2, alpha: 0.45, offsetY: 3, color: "#000000" },
      sea: { widthMul: 1, heightMul: 0.24, alpha: 0.35, offsetY: 4, color: "#04222a" },
      air: { widthMul: 0.68, heightMul: 0.15, alpha: 0.18, offsetY: 16, color: "#000000" },
      space: { widthMul: 0.56, heightMul: 0.13, alpha: 0.1, offsetY: 20, color: "#000000" }
    },
    idle: {
      land: { amp: 0.5, hz: 2.4 },
      sea: { amp: 1.8, hz: 0.8 },
      air: { amp: 1.3, hz: 1.3 },
      space: { amp: 1, hz: 1 }
    },
    tilt: {
      land: { maxRad: 0.05, perUnit: 0.006, ease: 10 },
      sea: { maxRad: 0.09, perUnit: 0.01, ease: 6 },
      air: { maxRad: 0.16, perUnit: 0.016, ease: 8 },
      space: { maxRad: 0.12, perUnit: 0.013, ease: 9 }
    },
    exhaust: {
      land: {
        shape: "smoke",
        ratePerSec: 6,
        count: 1,
        speedMin: 5,
        speedMax: 14,
        angleCenter: Math.PI / 2,
        angleSpread: 0.5,
        lifeMin: 0.4,
        lifeMax: 0.8,
        sizeMin: 1.2,
        sizeMax: 2.2,
        sizeEnd: 4,
        colors: ["#4a443c", "#5b544a"],
        gravity: -8,
        drag: 1.2,
        spin: 0.8,
        jitterX: 2,
        jitterY: 1
      },
      sea: {
        shape: "foam",
        ratePerSec: 12,
        count: 1,
        speedMin: 8,
        speedMax: 20,
        angleCenter: Math.PI / 2,
        angleSpread: 0.6,
        lifeMin: 0.5,
        lifeMax: 1,
        sizeMin: 2.4,
        sizeMax: 4.4,
        sizeEnd: 7,
        colors: ["#eaf6f2", "#bfe3dc"],
        gravity: 0,
        drag: 1.6,
        spin: 0,
        jitterX: 7,
        jitterY: 2
      },
      air: {
        shape: "smoke",
        ratePerSec: 5,
        count: 1,
        speedMin: 20,
        speedMax: 40,
        angleCenter: Math.PI / 2,
        angleSpread: 0.15,
        lifeMin: 0.5,
        lifeMax: 1,
        sizeMin: 0.8,
        sizeMax: 1.4,
        sizeEnd: 2.6,
        colors: ["#e8f2fa", "#cfe2f0"],
        gravity: 0,
        drag: 0.4,
        spin: 0,
        jitterX: 3,
        jitterY: 1
      },
      space: {
        shape: "ember",
        ratePerSec: 18,
        count: 1,
        speedMin: 24,
        speedMax: 54,
        angleCenter: Math.PI / 2,
        angleSpread: 0.25,
        lifeMin: 0.1,
        lifeMax: 0.26,
        sizeMin: 1.1,
        sizeMax: 2.2,
        sizeEnd: 0.4,
        colors: ["#7fd4ff", "#4aa8ff"],
        gravity: 0,
        drag: 0.5,
        spin: 0,
        jitterX: 2,
        jitterY: 1
      }
    }
  },
  // vignette 色彩分級：land 暖褐 / sea 冷青 / air 亮白 / space 深紫。low 品質整層關閉。
  vignette: {
    land: { color: "#3a2415", strength: 0.32 },
    sea: { color: "#0c2f33", strength: 0.3 },
    air: { color: "#e8f1f8", strength: 0.16 },
    space: { color: "#170b2e", strength: 0.4 }
  },
  // 補給箱重繪：像素木箱＋圖示＋浮動＋光暈（取代青色線框）。
  supplyCrate: {
    size: 16,
    body: { fill: "#8a5a2b", edge: "#5d3a18", slat: "#a97b46", strap: "#3f2a14", icon: "#ffd76a" },
    float: { amp: 1.5, hz: 1.1 },
    glow: { color: "#ffd76a", radius: 13, alphaMax: 0.32, pulseHz: 1.5 }
  },
  // 波次開場「第 N 波」與 Boss 警告演出。reducedFlash 時 flash/shake 一律為 0。
  waveBanner: {
    wave: {
      textTemplate: "第 {n} 波",
      inTime: 0.35,
      holdTime: 1.1,
      outTime: 0.4,
      offsetY: -46,
      riseBy: 12,
      maxScale: 1.18,
      color: "#f2e6c8",
      edge: "#3a2a18",
      flashHz: 0,
      shake: 0
    },
    boss: {
      textTemplate: "警告：Boss 逼近",
      inTime: 0.3,
      holdTime: 1.7,
      outTime: 0.5,
      offsetY: -52,
      riseBy: 8,
      maxScale: 1.3,
      color: "#ff6a5a",
      edge: "#2a0d0d",
      flashHz: 3,
      shake: 2.4
    }
  },
  // 震屏強度建議值（渲染端經 DSFx.resolveShake 套用 reducedFlash / screenShake 設定）。
  shake: { hitAmp: 1.1, killAmp: 0.8, bossKillAmp: 3, max: 6 }
};

const PERFORMANCE = {
  maxEnemies: 72,
  maxProjectiles: 96,
  maxEffects: 90,
  corpseFadeSeconds: 0.7,
  lowFpsFloor: 30,
  recoverFps: 48,
  qualityProfiles: {
    high: {
      maxEnemies: 72,
      maxEffects: 90,
      floatingTextMinInterval: 0,
      enemyAnimScale: 1,
      fx: FX.quality.high
    },
    low: {
      maxEnemies: 54,
      maxEffects: 48,
      floatingTextMinInterval: 0.08,
      enemyAnimScale: 0.45,
      fx: FX.quality.low
    }
  }
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
    performanceMode: "auto",
    fxLevel: "full",
    fontSize: "medium",
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
  APP_VERSION,
  CACHE_VERSION,
  LOGIC,
  ENVIRONMENT_BACKGROUNDS,
  VEHICLES,
  WEAPONS,
  ENEMIES,
  ENEMY_VARIANTS,
  ENVIRONMENT_EVENTS,
  SUPPLY_DROPS,
  QUESTS,
  GATES,
  WAVE,
  FX,
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
