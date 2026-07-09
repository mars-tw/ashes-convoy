# 灰燼護航資料模型

本文件對齊目前 `src/config.js` 與 `src/rules.js`。文件更新只能描述現況，不應推測未實作系統。

## 儲存契約

- localStorage key：`ashes_convoy_meta_v1`
- schema version：`META_VERSION = 3`
- 格式：JSON
- 時間：`createdAt`、`updatedAt` 與紀錄欄位使用 ISO 字串或可被遷移的既有值。
- 遷移入口：`migrateMeta(raw, { config })`

```js
const META_DEFAULT = {
  version: 2,
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

## Meta 欄位

| 欄位 | 說明 |
|---|---|
| `selectedVehicle` | 目前選用載具；若未解鎖會遷回 `land_rig` |
| `shelterTheme` | 避難所背景，目前預設 `snow` |
| `parts` | 可花費零件，結算與成就會增加 |
| `bestByVehicle` | 各載具最佳波次、分數、擊殺、Boss 與時間 |
| `unlockedVehicles` | 載具解鎖狀態，`land_rig` 永遠預設解鎖 |
| `vehicleLevels` | 通用節點與專屬節點等級都放在各載具 id 底下 |
| `blueprints` | 藍圖載具目前張數，最大值等於該載具需求 |
| `bossBlueprintPity` | Boss 藍圖掉落保底計數 |
| `achievements` | 已領取或已標記完成的成就 true map |
| `lastRun` | 最近一次結算摘要，含零件拆分、藍圖掉落、成就與解鎖 |

## 載具與武器

| id | 解鎖 | HP | 護甲 | 武器 | 特色 |
|---|---|---:|---:|---|---|
| `land_rig` | 預設 | 520 | 10 | `rig_cannon` | 受壓後復仇火力，穩定推線 |
| `sky_barge` | 3 藍圖 | 300 | 3 | `sky_autocannon` | 高射速、低裝甲 |
| `sea_ark` | 3 藍圖 | 420 | 6 | `ark_cannon` | 爆風半徑 58，處理群聚 |
| `void_runner` | 3 藍圖 | 360 | 4 | `void_lance` | 基礎穿透 2，破甲疊到 6 層 |

| 武器 | 傷害 | 射擊間隔 | 彈速 | 穿透 | 散射 | 爆風 |
|---|---:|---:|---:|---:|---:|---:|
| `rig_cannon` | 20 | 0.24 | 330 | 0 | 0.012 | 0 |
| `sky_autocannon` | 12 | 0.17 | 390 | 0 | 0.04 | 0 |
| `ark_cannon` | 34 | 0.48 | 250 | 0 | 0.02 | 58 |
| `void_lance` | 8.5 | 0.105 | 430 | 2 | 0.018 | 0 |

## 敵人、波次與門

| 敵人 | HP | 速度 | 接觸傷害 | 預算 | 分數 | 首波 | 特性 |
|---|---:|---:|---:|---:|---:|---:|---|
| `shambler` | 30 | 24 | 8 | 2 | 10 | 1 | 基礎屍群 |
| `runner` | 18 | 42 | 6 | 2 | 12 | 1 | 快速接近 |
| `bloater` | 95 | 16 | 16 | 5 | 28 | 2 | 死亡爆裂半徑 62、傷害 22 |
| `boss_hive_titan` | 850 | 9 | 35 | 24 | 480 | 5 | Boss，66% 召喚、33% 衝鋒 |

| 增益門 | 核心 HP | 效果 |
|---|---:|---|
| `damage_plus` | 45 | 傷害 +35%，總傷害倍率上限 x3.5 |
| `rate_plus` | 45 | 射擊間隔 x0.8 |
| `multishot_plus` | 55 | 投射物 +1，上限 +4，側彈傷害 55% |
| `repair` | 40 | 回復最大 HP 18% |

波次參數：基礎 30 秒、每波 +1 秒、上限 45 秒；Boss 每 5 波；HP 成長 x1.13；速度每波 +1.5%，最高 +45%；開場屍群 24 隻，群聚大小 4-7。

## 經濟與解鎖

```js
earnedParts = max(2, round((waves * 4 + floor(min(kills, 360) / 6) + bosses * 24) * difficultyMul))
```

- 難度獎勵倍率：normal x1、hard x1.15、endless x1.1。
- 藍圖掉落：每擊敗一隻 Boss 判定一次，35% 掉 1 張；連 3 隻 Boss 未掉則保底。
- 藍圖目標：依載具順序鎖定第一台未解鎖藍圖載具；藍圖集滿 3 張立即解鎖。
- 藍圖不折算零件；沒有未解鎖載具時保底計數歸零。

## 升級表

| 通用節點 | 上限 | 效果 | 成本 |
|---|---:|---|---|
| `hull` | 8 | HP +8%/級 | 30, 55, 90, 150, 245, 400, 650, 1050 |
| `weapon` | 8 | 傷害 +7%/級 | 40, 70, 115, 190, 310, 500, 810, 1300 |
| `energy` | 6 | 射速 +5%/級 | 80, 130, 210, 340, 550, 880 |
| `gate` | 5 | 門效果 +4%/級 | 90, 160, 280, 490, 860 |

| 載具 | 專屬節點 |
|---|---|
| `land_rig` | `land_armor` 上限 2，護甲 +2/級；`land_resist` 上限 2，受傷 -4%/級 |
| `sky_barge` | `sky_overclock` 上限 2，射速 +4%/級；`sky_evasion` 上限 2，受傷 -5%/級 |
| `sea_ark` | `sea_depth` 上限 2，傷害 +5%/級；`sea_splash` 上限 2，爆風 +8/級 |
| `void_runner` | `void_overload` 上限 2，射速 +4%/級；`void_pierce` 上限 1，穿透 +1 |

## 成就牆

| id | 條件 | 零件 |
|---|---|---:|
| `first_kill` | 首次擊殺 | 4 |
| `first_boss` | 擊敗 1 隻 Boss | 8 |
| `wave_5` | 最佳波次達 5 | 8 |
| `wave_10` | 最佳波次達 10 | 8 |
| `sortie_land` / `sortie_air` / `sortie_sea` / `sortie_space` | 對應環境完成出擊紀錄 | 4 |
| `total_kills_100` | 累計 100 殺 | 8 |
| `unlock_all_vehicles` | 4 台載具全解鎖 | 8 |

## Rules 契約

- `migrateMeta` 必須容忍壞 JSON、舊版 id、NaN/Infinity、缺欄位與未解鎖選車。
- `settleRunRewards` 會同時更新零件、最佳紀錄、藍圖、成就與 `lastRun`，且不可直接突變傳入 meta。
- `getAchievementProgress` 以 meta 推導進度，完成後由 `applyAchievementRewards` 發零件。
- `buyUpgrade` 只能扣已解鎖載具可用節點的成本，達上限回傳不可購買。
- Node 測試覆蓋 config shape、rules deterministic、經濟、storage migration、sprite contract。
