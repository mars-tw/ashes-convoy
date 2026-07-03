# 資料模型骨架

本文件定義未來 `src/config.js`、`src/rules.js`、localStorage 與測試需要遵守的資料形狀。Stage 1 實作時可微調數值，但欄位語意不可任意改名。

## 命名與版本

- localStorage key：`ashes_convoy_meta_v1`
- schema 常數：`META_VERSION = 1`
- 儲存格式：JSON
- 時間欄位：使用 `now()` 注入後的 ISO 字串或 epoch ms，不能在純規則函式內直接呼叫 `Date.now()`
- 隨機：所有會影響結果的函式都要傳入 `rng`

## Meta 存檔

```js
const META_DEFAULT = {
  version: 1,
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
```

### `bestByVehicle`

```js
bestByVehicle: {
  [vehicleId]: {
    wave: 10,
    score: 12340,
    kills: 130,
    bosses: 2,
    at: "2026-07-03T00:00:00.000Z"
  }
}
```

### `blueprints`

```js
blueprints: {
  rift_hauler: 5,
  frost_wing: 0
}
```

藍圖只用於解鎖載具，不得轉換為廢土零件。

### `lastRun`

```js
lastRun: {
  vehicleId: "iron_crow",
  wavesCleared: 5,
  kills: 55,
  bossesDefeated: 1,
  score: 6400,
  earnedParts: 33,
  unlockedAchievements: ["first_boss"],
  at: "2026-07-03T00:00:00.000Z"
}
```

## 遷移規則

```js
function migrateMeta(raw, { now }) => meta
```

要求：

- `raw == null` 時回傳深拷貝的 `META_DEFAULT`。
- 無效 JSON 回傳預設值，不拋到 UI。
- `version` 缺失或小於目前版本時逐版遷移。
- 數字欄位需清洗 NaN、Infinity、負值。
- 未知載具從 `selectedVehicle` 移除並回到 `iron_crow`。
- `unlockedVehicles` 至少保證 `iron_crow` 與 `dawn_skiff` 為 true。
- `vehicleLevels` 缺失時補預設，不可覆蓋既有合法等級。
- `achievements` 與 `claimedMilestones` 只接受布林 true。
- 遷移函式不得突變輸入物件。

## Config 骨架

### 載具 `VEHICLES`

```js
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
    passive: { id: "revenge_fire", damageMul: 0.10, duration: 2 },
    stage: 1
  }
};
```

必要欄位：

- `id`
- `name`
- `kind`: `train` 或 `ship`
- `sprite`
- `unlock`
- `hp`
- `armor`
- `turretSlots`
- `weapon`
- `passive`
- `stage`

### 武器 `WEAPONS`

```js
const WEAPONS = {
  machine_cannon: {
    id: "machine_cannon",
    name: "機砲",
    bulletSprite: "bullet_machine",
    damage: 8,
    fireInterval: 0.22,
    projectileSpeed: 620,
    pierce: 0,
    spread: 0,
    splash: 0
  }
};
```

### 敵人 `ENEMIES`

```js
const ENEMIES = {
  shambler: {
    id: "shambler",
    name: "遊蕩屍",
    sprite: "zombie_shambler",
    hp: 30,
    speed: 38,
    contactDamage: 8,
    budgetCost: 2,
    score: 10,
    tags: ["ground"],
    stage: 1
  }
};
```

Boss 也放在 `ENEMIES`，並加上：

```js
boss: true,
phases: [
  { hpPct: 0.66, action: "summon" },
  { hpPct: 0.33, action: "charge" }
]
```

### 增益門 `GATES`

```js
const GATES = {
  damage_plus: {
    id: "damage_plus",
    label: "火力 +35%",
    sprite: "gate_damage",
    coreHp: 45,
    effect: { type: "damageMul", add: 0.35 },
    stage: 1
  }
};
```

必要規則：

- `coreHp` 隨波次可用倍率成長。
- gate 效果只作用於本局。
- gate 不得直接給 `parts`。

### 波次 `WAVE`

```js
const WAVE = {
  baseDuration: 30,
  durationGrowth: 1.0,
  bossEvery: 5,
  hpGrowth: 1.13,
  budgetBase: 18,
  budgetLinear: 5,
  budgetPow: 1.35,
  speedGrowthPerWave: 0.015,
  speedGrowthCap: 0.45
};
```

建議純函式：

```js
function enemyHpScale(wave, config) => number
function enemySpeedScale(wave, config) => number
function waveBudget(wave, config) => number
function generateWave({ wave, rng, config }) => wavePlan
```

### 經濟 `ECONOMY`

```js
const ECONOMY = {
  partsPerWave: 3,
  killDivisor: 8,
  killRewardCap: 360,
  bossParts: 12,
  minRunParts: 2,
  difficultyRewardMul: {
    normal: 1.0,
    hard: 1.15,
    endless: 1.10
  },
  blueprintDropChance: 0.30,
  blueprintBundle: 5,
  blueprintPityAfterBosses: 3
};
```

結算函式：

```js
function settleRunRewards({
  meta,
  run,
  config,
  rng,
  now
}) => {
  meta,
  reward: {
    parts,
    blueprints,
    achievements,
    isBest
  }
}
```

要求：

- 不突變輸入 `meta`。
- `parts` 不得為負。
- `blueprints` 不得轉回 `parts`。
- 成就不可重複給獎。
- `rng` 只用於藍圖掉落，不可用於主貨幣公式。

## Runtime State 骨架

Runtime state 不直接存入 localStorage，只在單局中存在。

```js
const runState = {
  seed: "stage1-seed",
  time: 0,
  paused: false,
  over: false,
  wave: 1,
  vehicleId: "iron_crow",
  vehicle: {
    hp: 420,
    maxHp: 420,
    shield: 0,
    x: 195,
    y: 690,
    aimX: 195,
    aimY: 320,
    weaponCooldown: 0
  },
  runMods: {
    damageAdd: 0,
    fireIntervalMul: 1,
    projectileAdd: 0,
    burn: 0,
    shock: 0,
    slow: 0
  },
  enemies: [],
  projectiles: [],
  gates: [],
  effects: [],
  stats: {
    kills: 0,
    bossesDefeated: 0,
    damageDealt: 0,
    gatesTaken: 0,
    score: 0
  }
};
```

## `window.__test` 骨架

Stage 1 實作完成時，瀏覽器需提供：

```js
window.__test = {
  getState,
  setState,
  step,
  spawnEnemy,
  spawnGate,
  grantGate,
  damageVehicle,
  killAllEnemies,
  finishRun,
  clearStorage,
  config,
  spritesReady
};
```

規則：

- `step(deltaMs)` 必須 deterministic。
- `finishRun(overrides)` 可直接觸發結算，用於 E2E 驗證 localStorage。
- `clearStorage()` 只清本專案 key，不清瀏覽器全部 localStorage。
- 測試掛鉤不得需要外部套件。
