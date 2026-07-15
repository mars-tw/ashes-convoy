"use strict";

const STORAGE_KEY = "ashes_convoy_meta_v1";
const META_VERSION = 3;
const VERSION_SOURCE =
  (typeof globalThis !== "undefined" && globalThis.DSVersion) ||
  (typeof require === "function" ? require("./version.js") : { APP_VERSION: "R76", CACHE_VERSION: "ashes-convoy-r76-v1" });
const APP_VERSION = VERSION_SOURCE.APP_VERSION;
const CACHE_VERSION = VERSION_SOURCE.CACHE_VERSION;

const LOGIC = {
  width: 195,
  height: 422,
  displayWidth: 390,
  displayHeight: 844,
  renderScale: 2,
  roadLeft: 27,
  roadRight: 168,
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

const ROAD_DETAIL_ATLAS = {
  image: "assets/env/kenney_road_debris.png",
  frames: 4,
  frameWidth: 32,
  frameHeight: 32,
  density: 0.22
};

const RUN_TRAILER = {
  byEnvironment: {
    land: {
      spriteImage: "assets/vehicles/trailer.png",
      visualWidth: 23,
      offsetY: 42,
      followLerp: 0.16,
      maxSwayRad: 0.12,
      swayPerPixel: 0.012,
      bobAmp: 0.45,
      bobHz: 2.1,
      bobPhase: 0.37,
      shadow: { widthMul: 0.92, heightMul: 0.22, alpha: 0.28, offsetY: 9, color: "#000000" }
    }
  }
};

const TRAILER_GUNNER = {
  enabledDefault: true,
  sprite: "assets/vehicles/xi_gunner.png",
  frames: 2,
  visualWidth: 28,
  offsetX: 0,
  offsetY: 34,
  followLerp: 0.12,
  targetRange: 320,
  weapon: {
    damage: 6,
    fireInterval: 0.9,
    projectileSpeed: 300,
    projectileRadius: 3,
    spread: 0,
    bulletSprite: "bullet_machine",
    color: "#ffd27f"
  },
  muzzleOffsetY: -12,
  firingFrameSeconds: 0.14
};

const STORY = {
  characters: {
    xi: { id: "xi", name: "熹", role: "trailer" },
    driver: { id: "driver", name: "壁爐", role: "driver" }
  },
  beats: [
    {
      id: "b01",
      order: 1,
      chapter: "序章",
      title: "空罐與火種",
      unlock: { type: "default" },
      lines: [
        { speaker: "narration", text: "無線電是撿來的，只剩一個頻道還活著。" },
        { speaker: "xi", text: "喂……有人嗎？這台車，後面的門是壞的。" },
        { speaker: "driver", text: "別怕。門我焊死了，喪屍進不來。你先睡，天亮我們就走。" },
        { speaker: "xi", text: "你叫什麼？" },
        { speaker: "driver", text: "呼號叫我『壁爐』就好。有火的地方，就不算太冷。" }
      ]
    },
    {
      id: "b02",
      order: 2,
      chapter: "",
      title: "第一個晚上",
      unlock: { type: "bestWave", value: 1 },
      lines: [
        { speaker: "xi", text: "外面一直在響。是它們嗎？" },
        { speaker: "driver", text: "是砲，是我在擋。數到一百它就停，你數給我聽。" },
        { speaker: "xi", text: "一、二、三……壁爐，你不要走遠。" },
        { speaker: "driver", text: "我就在前面這塊鐵皮後面。哪都不去。" }
      ]
    },
    {
      id: "b03",
      order: 3,
      chapter: "",
      title: "她終於開口",
      unlock: { type: "bestWave", value: 3 },
      lines: [
        { speaker: "xi", text: "今天我把報紙鋪平了，當地毯。這樣走路不會冷。" },
        { speaker: "driver", text: "不錯嘛，會過日子了。" },
        { speaker: "xi", text: "媽媽以前也這樣鋪。……我記不太清楚她的臉了。" },
        { speaker: "driver", text: "記不清沒關係。你把這台車記住就好，這裡以後也算你家。" }
      ]
    },
    {
      id: "b04",
      order: 4,
      chapter: "",
      title: "拼起來的家具",
      unlock: { type: "furnitureCount", value: 1 },
      lines: [
        { speaker: "xi", text: "你撿的那個架子，我擺好了！罐頭排整齊，看起來就像……真的有人住。" },
        { speaker: "driver", text: "本來就有人住。是你。" },
        { speaker: "xi", text: "嘿嘿。那我要一直住到很老很老。" }
      ]
    },
    {
      id: "b05",
      order: 5,
      chapter: "",
      title: "爐火與灰燼",
      unlock: { type: "bestWave", value: 5 },
      lines: [
        { speaker: "xi", text: "為什麼叫『壁爐』？" },
        { speaker: "driver", text: "以前的家有個壁爐。冬天全家圍著它，灰燼掃了又生。世界燒成這樣，我還想守著一點火。" },
        { speaker: "xi", text: "那我就是你要守的火嗎？" },
        { speaker: "driver", text: "……對。所以你不准熄。" }
      ]
    },
    {
      id: "b06",
      order: 6,
      chapter: "",
      title: "藍圖上的遠方",
      unlock: { type: "vehicleUnlock", value: 2 },
      lines: [
        { speaker: "xi", text: "你換了另一台車？窗外的顏色不一樣了。" },
        { speaker: "driver", text: "舊路斷了，我們得繞海、繞天走。藍圖是撿來的，拼一拼還能跑。" },
        { speaker: "xi", text: "那我把望遠鏡架在窗邊，我幫你看前面有沒有路。" },
        { speaker: "driver", text: "好，你當我的眼睛。我當你的牆。" }
      ]
    },
    {
      id: "b07",
      order: 7,
      chapter: "",
      title: "巨屍的影子",
      unlock: { type: "bosses", value: 1 },
      lines: [
        { speaker: "xi", text: "剛剛那個好大……車都在抖。" },
        { speaker: "driver", text: "母巢巨屍。放倒了，別怕。" },
        { speaker: "xi", text: "你有沒有受傷？" },
        { speaker: "driver", text: "一點皮肉。你聽我聲音還穩，就代表沒事。" },
        { speaker: "xi", text: "那你多說幾句，我要一直聽到穩為止。" }
      ]
    },
    {
      id: "b08",
      order: 8,
      chapter: "",
      title: "拖車就是家",
      unlock: { type: "furnitureCount", value: 4 },
      lines: [
        { speaker: "xi", text: "串燈、菜架、還有你焊的桌子……壁爐，這裡現在好亮。" },
        { speaker: "driver", text: "亮了好。亮了喪屍就不敢靠。" },
        { speaker: "xi", text: "才不是因為喪屍。是因為……是家才會亮。" },
        { speaker: "driver", text: "……是。是家。" }
      ]
    },
    {
      id: "b09",
      order: 9,
      chapter: "",
      title: "更深的路",
      unlock: { type: "bestWave", value: 8 },
      lines: [
        { speaker: "xi", text: "路越走越荒了，罐頭上的字我都不認得。" },
        { speaker: "driver", text: "越深的地方零件越好，撐過去我們就能換更硬的殼。" },
        { speaker: "xi", text: "我不要更硬的殼。我要你更少受傷。" },
        { speaker: "driver", text: "那就一樣的意思。乖，繫好帶子。" }
      ]
    },
    {
      id: "b10",
      order: 10,
      chapter: "",
      title: "風暴之間",
      unlock: { type: "bestWave", value: 12 },
      lines: [
        { speaker: "xi", text: "外面風好大，燈一直閃。" },
        { speaker: "driver", text: "風暴而已，過了就晴。這次換我數給你聽。" },
        { speaker: "xi", text: "……你剛剛那句，聲音在抖。" },
        { speaker: "driver", text: "鐵皮冷。人沒抖。睡吧，醒來就過去了。" }
      ]
    },
    {
      id: "b11",
      order: 11,
      chapter: "",
      title: "群星的方向",
      unlock: { type: "bestWave", value: 16 },
      lines: [
        { speaker: "xi", text: "望遠鏡裡有星星！好多好多，一點都不像灰的。" },
        { speaker: "driver", text: "那是我們要去的方向。地上沒路了，就往上面找。" },
        { speaker: "xi", text: "上面也有喪屍嗎？" },
        { speaker: "driver", text: "有星星的地方，我陪你一起怕。" }
      ]
    },
    {
      id: "b12",
      order: 12,
      chapter: "結局",
      title: "不熄的光",
      unlock: { type: "bestWave", value: 20 },
      lines: [
        { speaker: "narration", text: "里程表跳過了一個又一個死掉的城市。" },
        { speaker: "xi", text: "壁爐，我畫完了。畫的是一台車，拉著一節拖車，後面拖著一長串亮亮的東西。" },
        { speaker: "driver", text: "那是什麼？" },
        { speaker: "xi", text: "是我們走過的路啊。你看，灰裡面，全是火。" },
        { speaker: "driver", text: "……收好。等我們找到能停下來的地方，就掛在牆上。" },
        { speaker: "xi", text: "一定會找到的。因為火還沒熄。" }
      ]
    }
  ]
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
    passive: { id: "slipstream", dodgeCooldown: 2.5, damageTakenMul: 0.45 },
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
    passive: { id: "broadside_echo", chance: 0.25, radius: 40, dmgPct: 0.35, dmgCap: 40, minInterval: 0.4 },
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

// R73 action atlases share each walk atlas' frame interface and warm tint.
// Variant enemy ids intentionally reuse the same authored body/action set as
// their base visual; runtime tint/filter remains a separate presentation layer.
const ENEMY_ACTION_ATLASES = {
  shambler: {
    hurt: { image: "assets/enemies/oga_shambler_hurt.png", frames: 2, frameWidth: 40, frameHeight: 40, fps: 10 },
    death: { image: "assets/enemies/oga_shambler_death.png", frames: 3, frameWidth: 40, frameHeight: 40, fps: 6 }
  },
  runner: {
    hurt: { image: "assets/enemies/oga_runner_hurt.png", frames: 2, frameWidth: 40, frameHeight: 40, fps: 10 },
    death: { image: "assets/enemies/oga_runner_death.png", frames: 3, frameWidth: 40, frameHeight: 40, fps: 6 }
  },
  bloater: {
    hurt: { image: "assets/enemies/bloater_hurt.png", frames: 2, frameWidth: 52, frameHeight: 52, fps: 10 },
    death: { image: "assets/enemies/bloater_death.png", frames: 3, frameWidth: 52, frameHeight: 52, fps: 6 }
  },
  spore_spitter: {
    hurt: { image: "assets/enemies/oga_spitter_hurt.png", frames: 2, frameWidth: 40, frameHeight: 40, fps: 10 },
    death: { image: "assets/enemies/oga_spitter_death.png", frames: 3, frameWidth: 40, frameHeight: 40, fps: 6 }
  },
  shield_husk: {
    hurt: { image: "assets/enemies/shield_husk_hurt.png", frames: 2, frameWidth: 48, frameHeight: 64, fps: 10 },
    death: { image: "assets/enemies/shield_husk_death.png", frames: 3, frameWidth: 48, frameHeight: 64, fps: 6 }
  },
  swarm_mite: {
    hurt: { image: "assets/enemies/swarm_mite_hurt.png", frames: 2, frameWidth: 44, frameHeight: 44, fps: 10 },
    death: { image: "assets/enemies/swarm_mite_death.png", frames: 3, frameWidth: 44, frameHeight: 44, fps: 6 }
  },
  tar_brute: {
    hurt: { image: "assets/enemies/tar_brute_hurt.png", frames: 2, frameWidth: 56, frameHeight: 68, fps: 10 },
    death: { image: "assets/enemies/tar_brute_death.png", frames: 3, frameWidth: 56, frameHeight: 68, fps: 6 }
  },
  void_wraith: {
    hurt: { image: "assets/enemies/void_wraith_hurt.png", frames: 2, frameWidth: 48, frameHeight: 64, fps: 10 },
    death: { image: "assets/enemies/void_wraith_death.png", frames: 3, frameWidth: 48, frameHeight: 64, fps: 6 }
  },
  boss_hive_titan: {
    hurt: { image: "assets/enemies/titan_hurt.png", frames: 2, frameWidth: 88, frameHeight: 80, fps: 10 },
    death: { image: "assets/enemies/titan_death.png", frames: 3, frameWidth: 88, frameHeight: 80, fps: 6 }
  }
};

const ENEMIES = {
  shambler: {
    id: "shambler",
    name: "遊蕩屍",
    spriteImage: "assets/zombies/shambler.png",
    spriteAnimation: { image: "assets/enemies/oga_shambler_walk.png", frames: 4, frameWidth: 40, frameHeight: 40, fps: 5, warmTint: "rgba(154, 83, 40, 0.2)" },
    spriteActions: ENEMY_ACTION_ATLASES.shambler,
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
    spriteAnimation: { image: "assets/enemies/oga_runner_walk.png", frames: 4, frameWidth: 40, frameHeight: 40, fps: 9, warmTint: "rgba(178, 76, 35, 0.2)" },
    spriteActions: ENEMY_ACTION_ATLASES.runner,
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
    spriteAnimation: { image: "assets/enemies/bloater_walk.png", frames: 4, frameWidth: 52, frameHeight: 52, fps: 4, warmTint: "rgba(139, 80, 38, 0.2)" },
    spriteActions: ENEMY_ACTION_ATLASES.bloater,
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
  spore_spitter: {
    id: "spore_spitter",
    name: "孢囊吐射者",
    spriteImage: "assets/zombies/spore_spitter.png",
    spriteAnimation: { image: "assets/enemies/oga_spitter_walk.png", frames: 4, frameWidth: 40, frameHeight: 40, fps: 4, warmTint: "rgba(156, 91, 42, 0.2)" },
    spriteActions: ENEMY_ACTION_ATLASES.spore_spitter,
    sprite: "zombie_spore_spitter",
    hp: 34,
    speed: 18,
    contactDamage: 7,
    budgetCost: 4,
    score: 20,
    radius: 9,
    scale: 1.45,
    visualWidth: 18,
    firstWave: 3,
    poolWeight: 0.52,
    behavior: {
      type: "ranged",
      range: 128,
      keepDistance: 126,
      cooldown: 2.35,
      windup: 0.35,
      projectileSpeed: 56,
      projectileDamage: 10,
      projectileRadius: 5,
      projectileLife: 3.2
    },
    tags: ["ground", "ranged"],
    stage: 1
  },
  shield_husk: {
    id: "shield_husk",
    name: "盾殼屍",
    spriteImage: "assets/zombies/shield_husk.png",
    spriteAnimation: { image: "assets/enemies/shield_husk_walk.png", frames: 4, frameWidth: 48, frameHeight: 64, fps: 4, warmTint: "rgba(142, 82, 43, 0.18)" },
    spriteActions: ENEMY_ACTION_ATLASES.shield_husk,
    sprite: "zombie_shield_husk",
    hp: 52,
    speed: 20,
    contactDamage: 10,
    budgetCost: 4,
    score: 24,
    radius: 11,
    scale: 1.5,
    visualWidth: 22,
    firstWave: 3,
    poolWeight: 0.46,
    behavior: {
      type: "shield",
      shieldHp: 28,
      frontDamageMul: 0.32,
      shieldBreakFlash: 0.32
    },
    tags: ["ground", "shield"],
    stage: 1
  },
  swarm_mite: {
    id: "swarm_mite",
    name: "碎牙蟲群",
    spriteImage: "assets/zombies/swarm_mite.png",
    spriteAnimation: { image: "assets/enemies/swarm_mite_walk.png", frames: 4, frameWidth: 44, frameHeight: 44, fps: 10, warmTint: "rgba(172, 87, 34, 0.22)" },
    spriteActions: ENEMY_ACTION_ATLASES.swarm_mite,
    sprite: "zombie_swarm_mite",
    hp: 9,
    speed: 52,
    contactDamage: 3,
    budgetCost: 1,
    score: 6,
    radius: 5,
    scale: 1.15,
    visualWidth: 10,
    firstWave: 2,
    poolWeight: 0.8,
    behavior: {
      type: "swarm",
      zigzagAmp: 12,
      zigzagFreq: 4.8
    },
    tags: ["ground", "swarm", "fast"],
    stage: 1
  },
  tar_brute: {
    id: "tar_brute",
    name: "瀝青肉盾",
    spriteImage: "assets/zombies/tar_brute.png",
    spriteAnimation: { image: "assets/enemies/tar_brute_walk.png", frames: 4, frameWidth: 56, frameHeight: 68, fps: 3, warmTint: "rgba(142, 72, 34, 0.24)" },
    spriteActions: ENEMY_ACTION_ATLASES.tar_brute,
    sprite: "zombie_tar_brute",
    hp: 155,
    speed: 11,
    contactDamage: 18,
    budgetCost: 7,
    score: 38,
    radius: 20,
    scale: 1.55,
    visualWidth: 40,
    firstWave: 4,
    poolWeight: 0.32,
    behavior: {
      type: "brute",
      slowRadius: 52,
      slowMul: 0.68
    },
    tags: ["ground", "elite", "slow_aura"],
    stage: 1
  },
  void_wraith: {
    id: "void_wraith",
    name: "虛空漂影",
    spriteImage: "assets/zombies/void_wraith.png",
    spriteAnimation: { image: "assets/enemies/void_wraith_walk.png", frames: 4, frameWidth: 48, frameHeight: 64, fps: 5, warmTint: "rgba(133, 73, 43, 0.16)" },
    spriteActions: ENEMY_ACTION_ATLASES.void_wraith,
    sprite: "zombie_void_wraith",
    hp: 42,
    speed: 28,
    contactDamage: 9,
    budgetCost: 4,
    score: 26,
    radius: 10,
    scale: 1.45,
    visualWidth: 20,
    firstWave: 6,
    poolWeight: 0.34,
    behavior: {
      type: "phase",
      strafeAmp: 22,
      strafeFreq: 2.2,
      phaseCycle: 3.2,
      phaseDuration: 0.82,
      phaseDamageMul: 0.45
    },
    tags: ["phase", "floating"],
    stage: 1
  },
  ash_screamer: {
    id: "ash_screamer",
    name: "灰喉尖嘯屍",
    spriteImage: "assets/zombies/spore_spitter.png",
    spriteAnimation: { image: "assets/enemies/oga_spitter_walk.png", frames: 4, frameWidth: 40, frameHeight: 40, fps: 5, warmTint: "rgba(160, 91, 45, 0.18)" },
    spriteActions: ENEMY_ACTION_ATLASES.spore_spitter,
    sprite: "zombie_spore_spitter",
    hp: 30,
    speed: 20,
    contactDamage: 6,
    budgetCost: 3,
    score: 18,
    radius: 9,
    scale: 1.45,
    visualWidth: 18,
    firstWave: 5,
    poolWeight: 0.42,
    tint: "rgba(130, 190, 210, 0.28)",
    filter: "grayscale(0.45) hue-rotate(16deg) saturate(1.25) brightness(1.02)",
    behavior: {
      type: "ranged",
      range: 118,
      keepDistance: 118,
      cooldown: 1.9,
      windup: 0.22,
      projectileSpeed: 64,
      projectileDamage: 7,
      projectileRadius: 4,
      projectileLife: 2.6,
      projectileKind: "scream"
    },
    tags: ["ground", "ranged", "scream"],
    stage: 1
  },
  chain_tether: {
    id: "chain_tether",
    name: "鐵鏈拖屍",
    spriteImage: "assets/zombies/tar_brute.png",
    spriteAnimation: { image: "assets/enemies/tar_brute_walk.png", frames: 4, frameWidth: 56, frameHeight: 68, fps: 3, warmTint: "rgba(132, 76, 45, 0.2)" },
    spriteActions: ENEMY_ACTION_ATLASES.tar_brute,
    sprite: "zombie_tar_brute",
    hp: 90,
    speed: 14,
    contactDamage: 12,
    budgetCost: 5,
    score: 30,
    radius: 14,
    scale: 1.42,
    visualWidth: 28,
    firstWave: 7,
    poolWeight: 0.3,
    tint: "rgba(150, 160, 168, 0.28)",
    filter: "grayscale(0.65) contrast(1.16) brightness(0.92)",
    behavior: {
      type: "brute",
      slowRadius: 44,
      slowMul: 0.8
    },
    tags: ["ground", "slow_aura", "tether"],
    stage: 1
  },
  mirror_husk: {
    id: "mirror_husk",
    name: "反光殼屍",
    spriteImage: "assets/zombies/shield_husk.png",
    spriteAnimation: { image: "assets/enemies/shield_husk_walk.png", frames: 4, frameWidth: 48, frameHeight: 64, fps: 3, warmTint: "rgba(147, 82, 40, 0.16)" },
    spriteActions: ENEMY_ACTION_ATLASES.shield_husk,
    sprite: "zombie_shield_husk",
    hp: 58,
    speed: 18,
    contactDamage: 11,
    budgetCost: 5,
    score: 32,
    radius: 12,
    scale: 1.5,
    visualWidth: 24,
    firstWave: 8,
    poolWeight: 0.24,
    tint: "rgba(210, 230, 236, 0.34)",
    filter: "grayscale(0.35) brightness(1.18) contrast(1.28)",
    behavior: {
      type: "shield",
      shieldHp: 46,
      frontDamageMul: 0.08,
      shieldBreakFlash: 0.38
    },
    tags: ["ground", "shield", "weak_back"],
    stage: 1
  },
  ember_tick: {
    id: "ember_tick",
    name: "餘燼蜱群",
    spriteImage: "assets/zombies/swarm_mite.png",
    spriteAnimation: { image: "assets/enemies/swarm_mite_walk.png", frames: 4, frameWidth: 44, frameHeight: 44, fps: 11, warmTint: "rgba(193, 83, 27, 0.26)" },
    spriteActions: ENEMY_ACTION_ATLASES.swarm_mite,
    sprite: "zombie_swarm_mite",
    hp: 7,
    speed: 58,
    contactDamage: 2,
    budgetCost: 1,
    score: 5,
    radius: 5,
    scale: 1.08,
    visualWidth: 10,
    firstWave: 4,
    poolWeight: 0.72,
    tint: "rgba(255, 116, 48, 0.36)",
    filter: "sepia(1) saturate(2.2) hue-rotate(-24deg) brightness(1.08)",
    behavior: {
      type: "swarm",
      zigzagAmp: 15,
      zigzagFreq: 5.4
    },
    tags: ["ground", "swarm", "fast", "ember"],
    stage: 1
  },
  boss_hive_titan: {
    id: "boss_hive_titan",
    name: "母巢巨屍",
    spriteImage: "assets/zombies/titan.png",
    spriteAnimation: { image: "assets/enemies/titan_walk.png", frames: 4, frameWidth: 88, frameHeight: 80, fps: 2, warmTint: "rgba(137, 70, 35, 0.2)" },
    spriteActions: ENEMY_ACTION_ATLASES.boss_hive_titan,
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
  },
  swarm_venom: {
    id: "swarm_venom",
    baseEnemy: "swarm_mite",
    label: "毒牙蟲",
    hpMul: 1.2,
    speedMul: 1.15,
    tint: "rgba(120, 200, 80, 0.32)",
    filter: "sepia(1) saturate(2) hue-rotate(40deg)",
    minWave: 5
  },
  bloater_volatile: {
    id: "bloater_volatile",
    baseEnemy: "bloater",
    label: "易爆腫囊",
    hpMul: 0.75,
    speedMul: 1.1,
    tint: "rgba(255, 140, 40, 0.34)",
    filter: "saturate(1.6) contrast(1.1)",
    minWave: 6
  },
  spitter_corrosive: {
    id: "spitter_corrosive",
    baseEnemy: "spore_spitter",
    label: "腐蝕吐射",
    hpMul: 1.3,
    speedMul: 0.9,
    tint: "rgba(150, 90, 180, 0.3)",
    filter: "hue-rotate(-40deg) saturate(1.5)",
    minWave: 6
  },
  husk_bulwark: {
    id: "husk_bulwark",
    baseEnemy: "shield_husk",
    label: "重甲盾殼",
    hpMul: 1.4,
    speedMul: 0.8,
    tint: "rgba(200, 205, 210, 0.3)",
    filter: "grayscale(0.7) brightness(0.92) contrast(1.2)",
    minWave: 7
  },
  brute_molten: {
    id: "brute_molten",
    baseEnemy: "tar_brute",
    label: "熔核瀝青",
    hpMul: 1.35,
    speedMul: 0.9,
    tint: "rgba(255,110,50,0.34)",
    filter: "saturate(1.5) contrast(1.15) hue-rotate(-8deg)",
    minWave: 8
  },
  wraith_null: {
    id: "wraith_null",
    baseEnemy: "void_wraith",
    label: "虛滅漂影",
    hpMul: 0.85,
    speedMul: 1.25,
    tint: "rgba(150,90,200,0.3)",
    filter: "hue-rotate(30deg) saturate(1.6) brightness(0.95)",
    minWave: 8
  },
  screamer_white_noise: {
    id: "screamer_white_noise",
    baseEnemy: "ash_screamer",
    label: "白噪灰喉",
    hpMul: 0.9,
    speedMul: 1.12,
    tint: "rgba(150, 220, 230, 0.3)",
    filter: "grayscale(0.55) hue-rotate(28deg) saturate(1.45) brightness(1.08)",
    minWave: 7
  },
  tether_rusthook: {
    id: "tether_rusthook",
    baseEnemy: "chain_tether",
    label: "鏽鉤拖屍",
    hpMul: 1.18,
    speedMul: 0.92,
    tint: "rgba(190, 120, 70, 0.32)",
    filter: "sepia(0.8) saturate(1.35) contrast(1.14)",
    minWave: 9
  },
  husk_backglint: {
    id: "husk_backglint",
    baseEnemy: "mirror_husk",
    label: "背光殼屍",
    hpMul: 1.08,
    speedMul: 1.05,
    tint: "rgba(225, 245, 250, 0.34)",
    filter: "brightness(1.25) contrast(1.34) saturate(0.82)",
    minWave: 10
  },
  tick_cindercloud: {
    id: "tick_cindercloud",
    baseEnemy: "ember_tick",
    label: "燼雲蜱",
    hpMul: 0.9,
    speedMul: 1.18,
    tint: "rgba(255, 92, 42, 0.34)",
    filter: "sepia(1) saturate(2.45) hue-rotate(-32deg) brightness(1.12)",
    minWave: 6
  }
};

const WEAPON_POWERUPS = {
  dropChancePerKill: 0.035,
  pityKills: 30,
  crateSpeed: 24,
  ttl: 14,
  pickupRadius: 30,
  maxLevel: 5,
  levelDamageMul: [1, 1.12, 1.24, 1.38, 1.55],
  modes: {
    standard: {
      label: "標準彈",
      visual: { id: "standard", shape: "capsule", core: "#ffd36a", edge: "#fff1b8", trail: "#d5963f", trailShape: "spark", trailLife: 0.2, trailSize: 1.5, trailStretch: 2.4, length: 8, width: 3 }
    },
    spread: {
      label: "散射",
      visual: { id: "scatter", shape: "pellet", core: "#d39a4a", edge: "#ffe0a3", trail: "#8b5a2b", trailShape: "debris", trailLife: 0.14, trailSize: 1.15, trailStretch: 1.2, length: 5, width: 4 },
      projectilesAdd: 2,
      spreadAdd: 0.06,
      damageMul: 0.72
    },
    laser: {
      label: "雷射",
      visual: { id: "laser", shape: "beam", core: "#f06cff", edge: "#ffe0ff", trail: "#a94fcc", trailShape: "spark", trailLife: 0.12, trailSize: 1.2, trailStretch: 5.8, length: 14, width: 2 },
      pierceAdd: 3,
      projectileSpeedMul: 1.35,
      spread: 0,
      damageMul: 0.9,
      bulletSprite: "bullet_pulse"
    },
    homing: {
      label: "追蹤",
      visual: { id: "homing", shape: "chevron", core: "#d8fbff", edge: "#ffffff", trail: "#78cbd8", trailShape: "ember", trailLife: 0.24, trailSize: 1.45, trailStretch: 2, length: 8, width: 5 },
      homing: true,
      turnRate: 4.5,
      projectileSpeedMul: 0.9,
      damageMul: 0.85
    },
    fracture: {
      label: "裂片",
      visual: { id: "fracture", shape: "diamond", core: "#64ddff", edge: "#e0f8ff", trail: "#3b91c8", trailShape: "shard", trailLife: 0.28, trailSize: 1.45, trailStretch: 3.2, length: 8, width: 5 },
      damageMul: 0.68,
      shardCount: 2,
      shardDamageMul: 0.16,
      shardSpread: 0.3,
      shardSpeedMul: 0.72,
      shardLife: 0.36,
      bulletSprite: "bullet_pulse"
    },
    ember: {
      label: "燼燃",
      visual: { id: "ember", shape: "flame", core: "#ff7a38", edge: "#ffe18a", trail: "#b43c22", trailShape: "ember", trailLife: 0.34, trailSize: 2, trailStretch: 1.5, length: 9, width: 5 },
      damageMul: 0.78,
      projectileSpeedMul: 0.95,
      burnTicks: 3,
      burnDamageMul: 0.055,
      burnInterval: 0.42,
      bulletSprite: "bullet_pulse"
    }
  },
  cycleModes: ["spread", "fracture", "laser", "ember", "homing"]
};

const RUN_BARKS = {
  sortie_start: {
    id: "sortie_start",
    ttl: 1.8,
    lines: [
      { speaker: "driver", text: "繫好。今天也把火帶回來。" },
      { speaker: "xi", text: "我把後門鎖好了。" }
    ]
  },
  first_supply: {
    id: "first_supply",
    ttl: 1.7,
    lines: [
      { speaker: "xi", text: "是罐頭還是子彈？……都要。" }
    ]
  },
  first_gate: {
    id: "first_gate",
    ttl: 1.7,
    lines: [
      { speaker: "driver", text: "選一條能活下去的。" }
    ]
  },
  boss_radio: {
    id: "boss_radio",
    ttl: 1.9,
    lines: [
      { speaker: "xi", text: "大地雷……不，是腳步。" },
      { speaker: "driver", text: "別看它，聽我的節奏。" }
    ]
  },
  boss_down: {
    id: "boss_down",
    ttl: 1.8,
    lines: [
      { speaker: "driver", text: "數到十。還在，就好。" }
    ]
  },
  critical_hull: {
    id: "critical_hull",
    ttl: 1.8,
    lines: [
      { speaker: "xi", text: "壁爐？你聲音……又在抖。" }
    ]
  },
  deep_route: {
    id: "deep_route",
    ttl: 1.8,
    lines: [
      { speaker: "narration", text: "路上的地名，已經沒人記得。" }
    ]
  }
};

const ENVIRONMENT_EVENTS = {
  land: {
    id: "sandstorm",
    environment: "land",
    label: "灰喉走廊",
    description: "沙塵灌進道路，視野下降；撐過本波，結算零件 +20%",
    objective: "撐過本波",
    systemLine: "沙牆壓低視野，車燈只能照見下一個影子。",
    barks: [
      { speaker: "xi", text: "外面……像有人在哭。" },
      { speaker: "driver", text: "聽見哭聲就別停。" }
    ],
    completeLine: "沙聲退開，輪痕還在。",
    chance: 0.3,
    minWave: 2,
    rewardMulAdd: 0.2,
    visibilityLoss: 0.18,
    alternates: [
      {
        id: "land_blackout",
        environment: "land",
        label: "燈火管制",
        description: "車燈收束，視野更窄；撐過本波，結算零件 +8%",
        objective: "低視野存活",
        systemLine: "燈火壓到最低，廢城像把路吞了。",
        barks: [
          { speaker: "driver", text: "不要開遠光，會把牠們全叫醒。" },
          { speaker: "xi", text: "我只看得到你的肩膀。" }
        ],
        completeLine: "燈線恢復，黑暗沒有跟上來。",
        chance: 0.14,
        minWave: 4,
        rewardMulAdd: 0.08,
        visibilityLoss: 0.28
      }
    ]
  },
  air: {
    id: "turbulence",
    environment: "air",
    label: "斷錨航道",
    description: "亂流推擠敵群，敵速 +15%；撐過本波，結算零件 +12%",
    objective: "穩住航線",
    systemLine: "風切把航道撕成碎片，所有東西都快了一拍。",
    barks: [
      { speaker: "driver", text: "抓穩，這段風不講理。" },
      { speaker: "xi", text: "我抓著了，換你別放手。" }
    ],
    completeLine: "亂流被甩在尾焰後面。",
    chance: 0.3,
    minWave: 2,
    enemySpeedMul: 1.15,
    rewardMulAdd: 0.12,
    alternates: [
      {
        id: "air_static",
        environment: "air",
        label: "靜電層",
        description: "靜電拖慢敵方投射物；撐過本波，結算零件 +8%",
        objective: "穿越靜電雲",
        systemLine: "空氣帶電，敵方彈體在藍白火花裡失速。",
        barks: [
          { speaker: "xi", text: "頭髮都站起來了。" },
          { speaker: "driver", text: "讓它替我們慢一點。" }
        ],
        completeLine: "電噪散去，通訊重新咬住頻道。",
        chance: 0.14,
        minWave: 4,
        enemyProjectileSpeedMul: 0.88,
        rewardMulAdd: 0.08
      }
    ]
  },
  sea: {
    id: "undertow",
    environment: "sea",
    label: "沉錨帶",
    description: "暗流牽偏敵群，左右漂移加劇；撐過本波，結算零件 +10%",
    objective: "穿過沉錨帶",
    systemLine: "水下殘骸拉扯航線，敵群像被看不見的繩拖著。",
    barks: [
      { speaker: "xi", text: "車在歪……我把罐頭扶好了。" },
      { speaker: "driver", text: "先扶好你自己。" }
    ],
    completeLine: "暗流鬆手，甲板終於不再偏斜。",
    chance: 0.3,
    minWave: 2,
    rewardMulAdd: 0.1,
    swayAmpMul: 1.75,
    driftAmp: 8,
    alternates: [
      {
        id: "sea_fogbank",
        environment: "sea",
        label: "鹽霧岸",
        description: "鹽霧遮蔽巨影，疾奔屍權重上升、腫囊屍權重下降",
        objective: "清出霧岸",
        systemLine: "白霧貼著水面，快影比大影更早出現。",
        barks: [
          { speaker: "driver", text: "看腳步，不看輪廓。" },
          { speaker: "xi", text: "霧裡有很多小聲音。" }
        ],
        completeLine: "鹽霧裂開，航標重新浮現。",
        chance: 0.14,
        minWave: 4,
        rewardMulAdd: 0.06,
        poolWeightMul: { runner: 1.35, bloater: 0.55 }
      }
    ]
  },
  space: {
    id: "meteor_shower",
    environment: "space",
    label: "星渣雨",
    description: "星渣落入航線，可擊爆障礙拿零件",
    objective: "擊破星渣或撐過本波",
    systemLine: "亮點不是星星，是冷掉的碎片在墜落。",
    barks: [
      { speaker: "driver", text: "那些不是星星，別抬頭太久。" },
      { speaker: "xi", text: "我只抬一秒。" }
    ],
    completeLine: "星渣燒盡，窗外只剩黑。",
    chance: 0.3,
    minWave: 2,
    hazardCount: 3,
    hazardHp: 20,
    hazardParts: 2,
    alternates: [
      {
        id: "space_echo",
        environment: "space",
        label: "殘響帶",
        description: "相位怪權重上升；撐過本波，結算零件 +12%",
        objective: "穿過殘響帶",
        systemLine: "舊訊號在真空裡回頭，虛影沿著聲音靠近。",
        barks: [
          { speaker: "xi", text: "無線電在叫我們的名字。" },
          { speaker: "driver", text: "不要回答。" }
        ],
        completeLine: "殘響斷線，艙內重新安靜。",
        chance: 0.14,
        minWave: 6,
        rewardMulAdd: 0.12,
        poolWeightMul: { void_wraith: 1.45 }
      }
    ]
  }
};

const SUPPLY_DROPS = {
  chancePerKill: 0.05,
  pityKills: 25,
  partsPerCache: 3,
  partsCapPerRun: 12,
  crateSpeed: 24,
  horizontalDriftSpeed: 34,
  magnetSpeed: 92,
  ttl: 16,
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
    },
    overshield: {
      id: "overshield",
      label: "護盾補給",
      weight: 1,
      type: "shield",
      shieldPct: 0.12
    }
  }
};

const TRAILER_ROOM = {
  resourceName: "拾荒物資",
  dropChancePerKill: 0.16,
  pityKills: 9,
  goodsPerDrop: 1,
  waveGoods: 1,
  bossGoods: 4,
  maxGoodsPerRun: 28,
  slots: {
    wall_left: { id: "wall_left", label: "左牆層架" },
    wall_right: { id: "wall_right", label: "右牆掛件" },
    window_sill: { id: "window_sill", label: "窗台" },
    bedside: { id: "bedside", label: "床邊" },
    floor_left: { id: "floor_left", label: "左地面" },
    floor_right: { id: "floor_right", label: "右地面" },
    desk: { id: "desk", label: "工作桌" },
    ceiling: { id: "ceiling", label: "天花板" }
  },
  furniture: {
    supply_shelf: {
      id: "supply_shelf",
      name: "物資層架",
      style: "生存物資",
      slot: "wall_left",
      rarity: "common",
      cost: 8,
      sprite: "assets/shelter/trailer/supply_shelf.png",
      description: "罐頭、水瓶與繩索整理在手邊，逃生艙開始像個能活下去的地方。",
      effectText: "車體 HP +0.6%",
      effects: { maxHpPct: 0.006 }
    },
    solar_radio: {
      id: "solar_radio",
      name: "太陽能收音機",
      style: "生存物資",
      slot: "bedside",
      rarity: "common",
      cost: 12,
      sprite: "assets/shelter/trailer/solar_radio.png",
      description: "回收太陽能板接上舊收音機，讓火控節奏更穩。",
      effectText: "射擊間隔 -0.8%",
      effects: { fireIntervalMul: 0.992 }
    },
    patched_lights: {
      id: "patched_lights",
      name: "修補串燈",
      style: "生存物資",
      slot: "ceiling",
      rarity: "common",
      cost: 14,
      sprite: "assets/shelter/trailer/patched_lights.png",
      description: "低耗電暖光串燈，夜間維修時少犯錯。",
      effectText: "承受傷害 -0.4%",
      effects: { damageTakenMul: 0.996 }
    },
    hydro_planter: {
      id: "hydro_planter",
      name: "水耕菜架",
      style: "溫室生態",
      slot: "window_sill",
      rarity: "uncommon",
      cost: 18,
      sprite: "assets/shelter/trailer/hydro_planter.png",
      description: "水耕番茄與生菜補充長途出勤的體力。",
      effectText: "車體 HP +0.8%",
      effects: { maxHpPct: 0.008 }
    },
    water_filter: {
      id: "water_filter",
      name: "濾水罐組",
      style: "溫室生態",
      slot: "floor_left",
      rarity: "uncommon",
      cost: 24,
      sprite: "assets/shelter/trailer/water_filter.png",
      description: "玻璃罐、砂石與活性碳組成的小型循環水站。",
      effectText: "承受傷害 -0.5%",
      effects: { damageTakenMul: 0.995 }
    },
    folding_workbench: {
      id: "folding_workbench",
      name: "折疊工坊",
      style: "工坊機械",
      slot: "desk",
      rarity: "uncommon",
      cost: 28,
      sprite: "assets/shelter/trailer/folding_workbench.png",
      description: "格紋桌布上堆著電路板、工具與半拆彈匣。",
      effectText: "武器傷害 +1.2%",
      effects: { damagePct: 0.012 }
    },
    blueprint_board: {
      id: "blueprint_board",
      name: "藍圖釘板",
      style: "工坊機械",
      slot: "wall_right",
      rarity: "rare",
      cost: 32,
      sprite: "assets/shelter/trailer/blueprint_board.png",
      description: "牆上釘著地圖、剪刀膠帶與載具管線草圖。",
      effectText: "射擊間隔 -1.2%",
      effects: { fireIntervalMul: 0.988 }
    },
    battery_bank: {
      id: "battery_bank",
      name: "回收電池箱",
      style: "車隊維修",
      slot: "floor_right",
      rarity: "rare",
      cost: 38,
      sprite: "assets/shelter/trailer/battery_bank.png",
      description: "拆自廢車的電池並聯，替武器穩壓供電。",
      effectText: "武器傷害 +0.8%",
      effects: { damagePct: 0.008 }
    },
    field_medkit: {
      id: "field_medkit",
      name: "野戰急救箱",
      style: "生存物資",
      slot: "bedside",
      rarity: "common",
      cost: 12,
      sprite: "assets/shelter/trailer/field_medkit.png",
      description: "止血帶、消毒棉與臨時縫合包塞在鐵箱裡，撞擊後比較不慌。",
      effectText: "承受傷害 -0.4%",
      effects: { damageTakenMul: 0.996 }
    },
    mycelium_rack: {
      id: "mycelium_rack",
      name: "菌菇培養架",
      style: "溫室生態",
      slot: "window_sill",
      rarity: "uncommon",
      cost: 20,
      sprite: "assets/shelter/trailer/mycelium_rack.png",
      description: "密封玻璃盒裡養著夜光菌絲，替長途出勤補上乾糧與濕度。",
      effectText: "射擊間隔 -1%",
      effects: { fireIntervalMul: 0.99 }
    },
    reload_bench: {
      id: "reload_bench",
      name: "彈藥重裝台",
      style: "工坊機械",
      slot: "desk",
      rarity: "uncommon",
      cost: 30,
      sprite: "assets/shelter/trailer/reload_bench.png",
      description: "壓彈器、量杯與拆開的彈匣固定在桌面，讓火控補彈更順。",
      effectText: "射擊間隔 -1%",
      effects: { fireIntervalMul: 0.99 }
    },
    welding_kit: {
      id: "welding_kit",
      name: "焊補工具箱",
      style: "車隊維修",
      slot: "floor_right",
      rarity: "rare",
      cost: 34,
      sprite: "assets/shelter/trailer/welding_kit.png",
      description: "小型焊槍、焊條與補強片排在耐熱布上，車體破口能當場封住。",
      effectText: "車體 HP +0.8%",
      effects: { maxHpPct: 0.008 }
    },
    crayon_drawing: {
      id: "crayon_drawing",
      name: "熹的蠟筆畫",
      style: "生存物資",
      slot: "wall_right",
      rarity: "common",
      cost: 10,
      sprite: "assets/shelter/trailer/crayon_drawing.png",
      description: "釘在牆上的小畫，車後拖著一串亮點，像灰裡還沒熄的火。",
      effectText: "承受傷害 -0.4%",
      effects: { damageTakenMul: 0.996 }
    },
    star_telescope: {
      id: "star_telescope",
      name: "窗邊望遠鏡",
      style: "溫室生態",
      slot: "window_sill",
      rarity: "rare",
      cost: 30,
      sprite: "assets/shelter/trailer/star_telescope.png",
      description: "黃銅鏡筒朝著裂開的夜空，熹說她會幫忙找下一條路。",
      effectText: "車體 HP +0.8%",
      effects: { maxHpPct: 0.008 }
    },
    photo_frame: {
      id: "photo_frame",
      name: "磨損相框",
      style: "工坊機械",
      slot: "bedside",
      rarity: "uncommon",
      cost: 18,
      sprite: "assets/shelter/trailer/photo_frame.png",
      description: "褪色拍立得裡，一大一小兩個影子靠在拖車門邊，像終於有人等門開。",
      effectText: "射擊間隔 -1%",
      effects: { fireIntervalMul: 0.99 }
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
  },
  barrier: {
    id: "barrier",
    label: "能量護盾",
    shortLabel: "護盾",
    sprite: "gate_barrier",
    coreHp: 50,
    effect: { type: "shieldPct", pct: 0.15, maxShieldMul: 0.6 },
    stage: 1
  },
  gate_focus: {
    id: "gate_focus",
    label: "校準門",
    shortLabel: "校準",
    sprite: "gate_rate",
    coreHp: 45,
    effect: { type: "focus", duration: 10, spreadMul: 0.52 },
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
  // Kenney Particle Pack CC0：原圖裁切、縮圖與廢土色預調後，載入時在離屏 canvas 建立有限 tint 變體。
  textures: {
    smoke: "assets/fx/kenney_smoke.png",
    fire: "assets/fx/kenney_fire.png",
    debris: "assets/fx/kenney_debris.png",
    flash: "assets/fx/kenney_flash.png"
  },
  textureTints: ["#ffd36a", "#ff7a38", "#64ddff", "#f06cff", "#d39a4a", "#d8fbff", "#8f6a4d", "#5a514b"],
  // 擊殺爆發：依敵種類型（zombie 血綠碎塊＋骨屑 / mech 火花＋機油黑煙 / boss 多段大爆發）。
  killBurst: {
    zombie: [
      {
        shape: "spark",
        texture: "flash",
        count: 1,
        speedMin: 0,
        speedMax: 3,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 2,
        lifeMin: 0.08,
        lifeMax: 0.13,
        sizeMin: 10,
        sizeMax: 14,
        sizeEnd: 18,
        colors: ["#e8b568"],
        gravity: 0,
        drag: 8,
        spin: 1
      },
      {
        shape: "debris",
        texture: "debris",
        count: 9,
        delay: 0.035,
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
        delay: 0.07,
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
      },
      {
        shape: "smoke",
        texture: "smoke",
        count: 2,
        delay: 0.11,
        speedMin: 5,
        speedMax: 14,
        angleCenter: -Math.PI / 2,
        angleSpread: 1.1,
        lifeMin: 0.35,
        lifeMax: 0.62,
        sizeMin: 8,
        sizeMax: 12,
        sizeEnd: 20,
        colors: ["#5b5147", "#786a58"],
        gravity: -10,
        drag: 1.4,
        spin: 1.2
      }
    ],
    mech: [
      {
        shape: "spark",
        texture: "flash",
        count: 1,
        speedMin: 0,
        speedMax: 2,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 2,
        lifeMin: 0.08,
        lifeMax: 0.14,
        sizeMin: 12,
        sizeMax: 16,
        sizeEnd: 20,
        colors: ["#ffd76a"],
        gravity: 0,
        drag: 8,
        spin: 2
      },
      {
        shape: "spark",
        count: 10,
        delay: 0.025,
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
        texture: "smoke",
        count: 4,
        delay: 0.11,
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
      },
      {
        shape: "debris",
        texture: "debris",
        count: 3,
        delay: 0.065,
        speedMin: 22,
        speedMax: 62,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 1.5,
        lifeMin: 0.28,
        lifeMax: 0.55,
        sizeMin: 5,
        sizeMax: 8,
        sizeEnd: 3,
        colors: ["#8f6a4d", "#55443a"],
        gravity: 84,
        drag: 2,
        spin: 7
      }
    ],
    boss: [
      {
        shape: "spark",
        texture: "flash",
        count: 2,
        delay: 0,
        speedMin: 0,
        speedMax: 5,
        angleCenter: -Math.PI / 2,
        angleSpread: Math.PI * 2,
        lifeMin: 0.12,
        lifeMax: 0.2,
        sizeMin: 24,
        sizeMax: 34,
        sizeEnd: 48,
        colors: ["#ffe08a", "#ff9b52"],
        gravity: 0,
        drag: 8,
        spin: 2
      },
      {
        shape: "ember",
        texture: "fire",
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
        texture: "debris",
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
        texture: "smoke",
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
      texture: "flash",
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
    layers: [
      {
        shape: "spark",
        texture: "flash",
        count: 1,
        speedMin: 0,
        speedMax: 1,
        angleCenter: Math.PI / 2,
        angleSpread: Math.PI * 2,
        lifeMin: 0.055,
        lifeMax: 0.09,
        sizeMin: 6,
        sizeMax: 9,
        sizeEnd: 13,
        colors: ["#ffd76a"],
        gravity: 0,
        drag: 8,
        spin: 0
      },
      {
        shape: "debris",
        texture: "debris",
        useHitColor: false,
        count: 2,
        speedMin: 18,
        speedMax: 44,
        angleCenter: Math.PI / 2,
        angleSpread: 1.2,
        lifeMin: 0.1,
        lifeMax: 0.22,
        sizeMin: 3,
        sizeMax: 5,
        sizeEnd: 2,
        colors: ["#8f6a4d", "#5b4c42"],
        gravity: 30,
        drag: 4,
        spin: 5
      }
    ],
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
  bossArrival: { duration: 2.5, pulseHz: 1.45, strength: 0.56, color: "#26080a" },
  lowHpPulse: { threshold: 0.25, pulseHz: 0.72, minAlpha: 0.1, maxAlpha: 0.3, color: "#7f1115" },
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
  combo: {
    windowSeconds: 2.25,
    fadeSeconds: 0.45,
    size: 13,
    color: "#ffe08a"
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
  downgradeFrames: 18,
  recoverFrames: 180,
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

const MILESTONES = {
  wave_3: {
    id: "wave_3",
    label: "突破第 3 波",
    description: "最遠抵達第 3 波，建立護航基準。",
    metric: "bestWave",
    target: 3,
    rewardParts: 6
  },
  wave_5: {
    id: "wave_5",
    label: "突破第 5 波",
    description: "最遠抵達第 5 波，證明車隊能撐過首輪高壓。",
    metric: "bestWave",
    target: 5,
    rewardParts: 10
  },
  wave_8: {
    id: "wave_8",
    label: "突破第 8 波",
    description: "最遠抵達第 8 波，足以回收更深處的零件。",
    metric: "bestWave",
    target: 8,
    rewardParts: 16
  },
  wave_12: {
    id: "wave_12",
    label: "突破第 12 波",
    description: "最遠抵達第 12 波，車隊已能處理持續變異潮。",
    metric: "bestWave",
    target: 12,
    rewardParts: 24
  },
  wave_16: {
    id: "wave_16",
    label: "突破第 16 波",
    description: "最遠抵達第 16 波，路線記錄足以支援長程改裝。",
    metric: "bestWave",
    target: 16,
    rewardParts: 34
  },
  wave_20: {
    id: "wave_20",
    label: "突破第 20 波",
    description: "最遠抵達第 20 波，完成末日護航的里程碑。",
    metric: "bestWave",
    target: 20,
    rewardParts: 50
  },
  wave_25: {
    id: "wave_25",
    label: "突破第 25 波",
    description: "最高紀錄達到 25 波，無線電裡的靜電終於被下一段路蓋過。",
    metric: "bestWave",
    target: 25,
    rewardParts: 60
  },
  wave_30: {
    id: "wave_30",
    label: "深水第 30 波",
    description: "抵達第 30 波，車隊仍向灰燼深處推進",
    metric: "bestWave",
    target: 30,
    rewardParts: 80
  },
  wave_40: {
    id: "wave_40",
    label: "深水第 40 波",
    description: "抵達第 40 波，夜色也攔不住護航火線",
    metric: "bestWave",
    target: 40,
    rewardParts: 110
  },
  wave_50: {
    id: "wave_50",
    label: "深水第 50 波",
    description: "抵達第 50 波，殘響之後仍有引擎聲",
    metric: "bestWave",
    target: 50,
    rewardParts: 150
  },
  wave_75: {
    id: "wave_75",
    label: "深水第 75 波",
    description: "抵達第 75 波，廢土長夜被砲火鑿開",
    metric: "bestWave",
    target: 75,
    rewardParts: 220
  },
  wave_100: {
    id: "wave_100",
    label: "深水第 100 波",
    description: "抵達第 100 波，灰燼盡頭仍有火",
    metric: "bestWave",
    target: 100,
    rewardParts: 320
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
    land_blackout: { encounters: 0, completions: 0 },
    turbulence: { encounters: 0, completions: 0 },
    air_static: { encounters: 0, completions: 0 },
    undertow: { encounters: 0, completions: 0 },
    sea_fogbank: { encounters: 0, completions: 0 },
    meteor_shower: { encounters: 0, completions: 0 },
    space_echo: { encounters: 0, completions: 0 }
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
  trailerGoods: 0,
  trailerRoom: {
    owned: {},
    slots: {
      wall_left: null,
      wall_right: null,
      window_sill: null,
      bedside: null,
      floor_left: null,
      floor_right: null,
      desk: null,
      ceiling: null
    },
    seenIntro: false
  },
  story: {
    seen: {},
    lastUnlockedAt: null
  },
  settings: {
    aimAssist: true,
    aimAssistLevel: "medium",
    reducedFlash: false,
    screenShake: true,
    showRunTrailer: true,
    showCompanion: true,
    damageTextDensity: "all",
    performanceMode: "auto",
    fxLevel: "reduced",
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
  ROAD_DETAIL_ATLAS,
  RUN_TRAILER,
  TRAILER_GUNNER,
  STORY,
  VEHICLES,
  WEAPONS,
  WEAPON_POWERUPS,
  RUN_BARKS,
  ENEMIES,
  ENEMY_VARIANTS,
  ENVIRONMENT_EVENTS,
  SUPPLY_DROPS,
  TRAILER_ROOM,
  QUESTS,
  GATES,
  WAVE,
  FX,
  PERFORMANCE,
  DIFFICULTIES,
  ECONOMY,
  ACHIEVEMENTS,
  MILESTONES,
  START_SCREEN,
  SHELTER_THEMES,
  META_DEFAULT
};

if (typeof window !== "undefined") window.DSConfig = DSConfig;
if (typeof module !== "undefined" && module.exports) module.exports = DSConfig;
