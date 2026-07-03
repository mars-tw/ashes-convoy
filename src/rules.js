"use strict";

const Config =
  typeof module !== "undefined" && module.exports
    ? require("./config.js")
    : typeof window !== "undefined"
      ? window.DSConfig
      : null;

function deepClone(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  const copy = {};
  Object.keys(value).forEach((key) => {
    copy[key] = deepClone(value[key]);
  });
  return copy;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback, options) {
  const opts = options || {};
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  const min = Number.isFinite(opts.min) ? opts.min : -Infinity;
  const max = Number.isFinite(opts.max) ? opts.max : Infinity;
  const cleaned = clamp(number, min, max);
  return opts.integer ? Math.floor(cleaned) : cleaned;
}

function boolTrueMap(input) {
  const output = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return output;
  Object.keys(input).forEach((key) => {
    if (input[key] === true) output[key] = true;
  });
  return output;
}

function valueFromNow(now) {
  if (typeof now === "function") return now();
  return now == null ? null : now;
}

function timestampFromNow(now) {
  const value = valueFromNow(now);
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (value && typeof value.toISOString === "function") return value.toISOString();
  return String(value);
}

function createSeededRng(seed) {
  const text = String(seed == null ? "ashes-convoy" : seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return function rng() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getConfig(config) {
  if (config) return config;
  if (!Config) throw new Error("DSRules requires DSConfig.");
  return Config;
}

function defaultVehicleId(config) {
  const cfg = getConfig(config);
  return cfg.META_DEFAULT && cfg.VEHICLES[cfg.META_DEFAULT.selectedVehicle]
    ? cfg.META_DEFAULT.selectedVehicle
    : Object.keys(cfg.VEHICLES)[0];
}

function normalizeShelterTheme(themeId, config) {
  const cfg = getConfig(config);
  return cfg.SHELTER_THEMES && cfg.SHELTER_THEMES[themeId] ? themeId : cfg.META_DEFAULT.shelterTheme || "snow";
}

function enemyHpScale(wave, config) {
  const cfg = getConfig(config);
  const safeWave = finiteNumber(wave, 1, { min: 1, integer: true });
  return Math.pow(cfg.WAVE.hpGrowth, safeWave - 1);
}

function enemySpeedScale(wave, config) {
  const cfg = getConfig(config);
  const safeWave = finiteNumber(wave, 1, { min: 1, integer: true });
  return 1 + Math.min(cfg.WAVE.speedGrowthCap, safeWave * cfg.WAVE.speedGrowthPerWave);
}

function waveBudget(wave, config) {
  const cfg = getConfig(config);
  const safeWave = finiteNumber(wave, 1, { min: 1, integer: true });
  return cfg.WAVE.budgetBase + safeWave * cfg.WAVE.budgetLinear + Math.floor(Math.pow(safeWave, cfg.WAVE.budgetPow));
}

function normalCountHint(wave, config) {
  const cfg = getConfig(config);
  const safeWave = finiteNumber(wave, 1, { min: 1, integer: true });
  return cfg.WAVE.normalCountBase + Math.floor(safeWave * cfg.WAVE.normalCountGrowth);
}

function bossHpScale(bossIndex, config) {
  const cfg = getConfig(config);
  const safeIndex = finiteNumber(bossIndex, 1, { min: 1, integer: true });
  return Math.pow(cfg.WAVE.bossHpGrowth, safeIndex - 1);
}

function waveDuration(wave, config) {
  const cfg = getConfig(config);
  const safeWave = finiteNumber(wave, 1, { min: 1, integer: true });
  return Math.min(cfg.WAVE.maxDuration, cfg.WAVE.baseDuration + (safeWave - 1) * cfg.WAVE.durationGrowth);
}

function scaledEnemyStats(enemyId, wave, config) {
  const cfg = getConfig(config);
  const enemy = cfg.ENEMIES[enemyId];
  if (!enemy) throw new Error(`Unknown enemy "${enemyId}".`);
  const difficulty = cfg.DIFFICULTIES.normal;
  const bossIndex = enemy.boss ? Math.max(1, Math.floor((wave - 1) / cfg.WAVE.bossEvery) + 1) : 1;
  const hpScale = enemy.boss ? bossHpScale(bossIndex, cfg) : enemyHpScale(wave, cfg);
  return {
    hp: Math.round(enemy.hp * hpScale * difficulty.hpMul),
    speed: enemy.speed * enemySpeedScale(wave, cfg),
    contactDamage: enemy.contactDamage,
    score: enemy.score
  };
}

function enemyPoolForWave(wave, config) {
  const cfg = getConfig(config);
  return Object.values(cfg.ENEMIES).filter((enemy) => {
    return !enemy.boss && enemy.stage === 1 && enemy.firstWave <= wave;
  });
}

function pickWeighted(pool, rng) {
  const total = pool.reduce((sum, item) => sum + Math.max(1, item.weight || 1), 0);
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= Math.max(1, pool[i].weight || 1);
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function chooseGatePair(wave, rng, config) {
  const cfg = getConfig(config);
  const ids = Object.keys(cfg.GATES);
  const bossNext = (wave + 1) % cfg.WAVE.bossEvery === 0;
  const pool = bossNext ? ["repair", "damage_plus", "rate_plus", "multishot_plus"] : ids;
  const first = pool[Math.floor(rng() * pool.length) % pool.length];
  let second = pool[Math.floor(rng() * pool.length) % pool.length];
  if (second === first) {
    const index = (pool.indexOf(first) + 1) % pool.length;
    second = pool[index];
  }
  if (bossNext && first !== "repair" && second !== "repair") return [first, "repair"];
  return [first, second];
}

function generateWave(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const rng = typeof opts.rng === "function" ? opts.rng : createSeededRng(`wave-${opts.wave}`);
  const wave = finiteNumber(opts.wave, 1, { min: 1, integer: true });
  const duration = waveDuration(wave, cfg);
  const bossWave = wave % cfg.WAVE.bossEvery === 0;
  const spawns = [];
  const budget = waveBudget(wave, cfg);

  if (bossWave) {
    const stats = scaledEnemyStats("boss_hive_titan", wave, cfg);
    spawns.push({
      time: 1.25,
      enemyId: "boss_hive_titan",
      x: cfg.LOGIC.width * 0.5,
      y: -70,
      hp: stats.hp,
      speed: stats.speed
    });
  }

  const pool = enemyPoolForWave(wave, cfg).map((enemy) => ({
    enemyId: enemy.id,
    cost: enemy.budgetCost,
    weight: enemy.id === "bloater" ? 0.65 : enemy.id === "runner" ? 1.15 : 1
  }));

  const targetCount = bossWave
    ? 10 + wave * 2
    : Math.max(cfg.WAVE.openingClusterCount, 14 + (wave - 1) * 6 + Math.floor(Math.pow(wave, 1.2)));
  const clusterCount = Math.max(3, Math.ceil(targetCount / cfg.WAVE.clusterSizeMax));
  let spawnCount = 0;
  for (let cluster = 0; cluster < clusterCount && spawnCount < targetCount; cluster += 1) {
    const firstWaveOpening = wave === 1 && cluster < 3;
    const clusterSize = firstWaveOpening
      ? cluster === 0
        ? 9
        : 9
      : cfg.WAVE.clusterSizeMin + Math.floor(rng() * (cfg.WAVE.clusterSizeMax - cfg.WAVE.clusterSizeMin + 1));
    const clusterTime = firstWaveOpening
      ? 1.1 + cluster * 2.35
      : cfg.WAVE.spawnStart +
        (cluster / Math.max(1, clusterCount - 1)) * (duration - cfg.WAVE.spawnEndPadding - cfg.WAVE.spawnStart) +
        rng() * 0.8;
    const laneWidth = cfg.LOGIC.roadRight - cfg.LOGIC.roadLeft;
    const centerRoll = rng();
    const centerX = firstWaveOpening
      ? cfg.LOGIC.roadLeft + laneWidth * (cluster === 0 ? 0.34 : cluster === 1 ? 0.66 : 0.5) + (rng() - 0.5) * 8
      : centerRoll < 0.2
        ? cfg.LOGIC.roadLeft + laneWidth * (0.18 + rng() * 0.14)
        : centerRoll > 0.8
          ? cfg.LOGIC.roadLeft + laneWidth * (0.68 + rng() * 0.14)
          : cfg.LOGIC.roadLeft + laneWidth * (0.3 + rng() * 0.4);
    const clusterRows = clusterSize >= 6 ? 3 : 2;
    const clusterCols = Math.ceil(clusterSize / clusterRows);
    const spread = Math.min(22, Math.max(13, (laneWidth - 24) / Math.max(1, clusterCols)));

    for (let member = 0; member < clusterSize && spawnCount < targetCount; member += 1) {
      let selected;
      if (wave === 1 && spawnCount < cfg.WAVE.openingClusterCount) {
        selected = { enemyId: "shambler", cost: cfg.ENEMIES.shambler.budgetCost };
      } else {
        selected = pickWeighted(pool, rng);
      }
      const enemy = cfg.ENEMIES[selected.enemyId];
      const stats = scaledEnemyStats(enemy.id, wave, cfg);
      const row = member % clusterRows;
      const col = Math.floor(member / clusterRows);
      const rowStagger = row % 2 === 0 ? 0 : spread * 0.45;
      const x = clamp(
        centerX + (col - (clusterCols - 1) / 2) * spread + rowStagger + (rng() - 0.5) * 4,
        cfg.LOGIC.roadLeft + 7,
        cfg.LOGIC.roadRight - 7
      );
      const y = -12 - rng() * 18 - row * 8 - col * 3;
      spawns.push({
        time: Math.min(duration - 1, clusterTime + rng() * 0.55),
        enemyId: enemy.id,
        x,
        y,
        hp: firstWaveOpening && enemy.id === "shambler" ? Math.min(stats.hp, 18) : stats.hp,
        speed: stats.speed,
        laneOffset: x - cfg.LOGIC.width * 0.5,
        swayPhase: rng() * Math.PI * 2,
        swayAmp: 4 + rng() * 4,
        swayFreq: 1.1 + rng() * 0.8
      });
      spawnCount += 1;
    }
  }

  while (spawnCount < targetCount && pool.length > 0) {
    const selected = pickWeighted(pool, rng);
    const enemy = cfg.ENEMIES[selected.enemyId];
    const stats = scaledEnemyStats(enemy.id, wave, cfg);
    const start = cfg.WAVE.spawnStart;
    const end = Math.max(start + 1, duration - cfg.WAVE.spawnEndPadding);
    const t = start + (spawnCount / Math.max(1, targetCount - 1)) * (end - start) + rng() * 0.45;
    const laneRoll = rng();
    const x =
      laneRoll < 0.18
        ? cfg.LOGIC.roadLeft + 8 + rng() * 24
        : laneRoll > 0.82
          ? cfg.LOGIC.roadRight - 32 + rng() * 24
          : cfg.LOGIC.roadLeft + 14 + rng() * (cfg.LOGIC.roadRight - cfg.LOGIC.roadLeft - 28);
    spawns.push({
      time: Math.min(duration - 1, t),
      enemyId: enemy.id,
      x,
      y: -32 - rng() * 90,
      hp: stats.hp,
      speed: stats.speed,
      laneOffset: x - cfg.LOGIC.width * 0.5,
      swayPhase: rng() * Math.PI * 2,
      swayAmp: 4 + rng() * 4,
      swayFreq: 1.1 + rng() * 0.8
    });
    spawnCount += 1;
  }

  spawns.sort((a, b) => a.time - b.time);

  return {
    wave,
    duration,
    budget,
    boss: bossWave,
    spawns,
    gates: [
      {
        time: cfg.WAVE.firstGateMinTime + rng() * (cfg.WAVE.firstGateMaxTime - cfg.WAVE.firstGateMinTime),
        options: chooseGatePair(wave, rng, cfg)
      }
    ]
  };
}

function defaultRunMods() {
  return {
    damageAdd: 0,
    fireIntervalMul: 1,
    projectileAdd: 0,
    burn: 0,
    shock: 0,
    slow: 0
  };
}

function sanitizeVehicleLevels(levels, vehicleId, config) {
  const cfg = getConfig(config);
  const input = levels && typeof levels === "object" ? levels : {};
  const output = { hull: 0, weapon: 0, energy: 0, gate: 0 };
  Object.keys(output).forEach((track) => {
    const upgrade = cfg.ECONOMY.upgradeTracks[track];
    const max = upgrade ? upgrade.maxLevel : 0;
    output[track] = finiteNumber(input[track], 0, { min: 0, max, integer: true });
  });
  if (!cfg.VEHICLES[vehicleId]) return { hull: 0, weapon: 0, energy: 0, gate: 0 };
  return output;
}

function getVehicleLevels(meta, vehicleId, config) {
  const cfg = getConfig(config);
  const stored = meta && meta.vehicleLevels ? meta.vehicleLevels[vehicleId] : null;
  return sanitizeVehicleLevels(stored, vehicleId, cfg);
}

function getVehicleStats(vehicleId, meta, config) {
  const cfg = getConfig(config);
  const vehicle = cfg.VEHICLES[vehicleId] || cfg.VEHICLES[defaultVehicleId(cfg)];
  const levels = getVehicleLevels(meta, vehicle.id, cfg);
  const hull = cfg.ECONOMY.upgradeTracks.hull;
  const weapon = cfg.ECONOMY.upgradeTracks.weapon;
  const maxHp = Math.round(vehicle.hp * (1 + levels.hull * hull.hpMulPerLevel));
  const damageMul = 1 + levels.weapon * weapon.damageMulPerLevel;
  return {
    id: vehicle.id,
    maxHp,
    hp: maxHp,
    armor: vehicle.armor,
    damageMul,
    levels
  };
}

function calculateShotStats(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const vehicle = cfg.VEHICLES[opts.vehicleId] || cfg.VEHICLES[defaultVehicleId(cfg)];
  const weapon = cfg.WEAPONS[vehicle.weapon];
  const meta = opts.meta || cfg.META_DEFAULT;
  const levels = getVehicleLevels(meta, vehicle.id, cfg);
  const runMods = Object.assign(defaultRunMods(), opts.runMods || {});
  const weaponTrack = cfg.ECONOMY.upgradeTracks.weapon;
  const energyTrack = cfg.ECONOMY.upgradeTracks.energy;
  const damageMul = 1 + levels.weapon * weaponTrack.damageMulPerLevel;
  const energyMul = Math.pow(1 - energyTrack.fireRateMulPerLevel, levels.energy);
  const damageAdd = Math.min(runMods.damageAdd, 2.5);
  const projectiles = clamp(weapon.baseProjectiles + runMods.projectileAdd, 1, weapon.baseProjectiles + 4);
  const minInterval = Math.max(0.08, weapon.fireInterval * 0.55);
  const interval = Math.max(minInterval, weapon.fireInterval * runMods.fireIntervalMul * energyMul);
  return {
    weaponId: weapon.id,
    bulletSprite: weapon.bulletSprite,
    damage: weapon.damage * damageMul * (1 + damageAdd),
    fireInterval: interval,
    projectileSpeed: weapon.projectileSpeed,
    pierce: weapon.pierce,
    spread: weapon.spread,
    splash: weapon.splash,
    muzzleOffset: weapon.muzzleOffset,
    baseProjectiles: weapon.baseProjectiles,
    bonusProjectiles: Math.max(0, projectiles - weapon.baseProjectiles),
    projectiles,
    sideDamageMul: weapon.sideDamageMul
  };
}

function applyGateEffect(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const gate = cfg.GATES[opts.gateId];
  if (!gate) throw new Error(`Unknown gate "${opts.gateId}".`);
  const currentMods = Object.assign(defaultRunMods(), opts.runMods || {});
  const vehicle = opts.vehicle ? deepClone(opts.vehicle) : null;
  const levels = sanitizeVehicleLevels(opts.vehicleLevels, opts.vehicleId || defaultVehicleId(cfg), cfg);
  const gateMul = 1 + levels.gate * cfg.ECONOMY.upgradeTracks.gate.gateMulPerLevel;
  const effect = gate.effect;
  const runMods = deepClone(currentMods);
  let changedVehicle = vehicle;

  if (effect.type === "damageAdd") {
    runMods.damageAdd = Math.min(effect.maxDamageMul - 1, runMods.damageAdd + effect.add * gateMul);
  } else if (effect.type === "fireIntervalMul") {
    runMods.fireIntervalMul = Math.max(0.45, runMods.fireIntervalMul * Math.pow(effect.mul, gateMul));
  } else if (effect.type === "projectileAdd") {
    runMods.projectileAdd = Math.min(effect.max, runMods.projectileAdd + effect.add);
  } else if (effect.type === "repairPct" && changedVehicle) {
    const heal = Math.round(changedVehicle.maxHp * effect.pct * gateMul);
    changedVehicle.hp = Math.min(changedVehicle.maxHp, changedVehicle.hp + heal);
  }

  return { runMods, vehicle: changedVehicle, gateId: gate.id };
}

function damageEnemy(enemy, amount) {
  const next = deepClone(enemy);
  const damage = finiteNumber(amount, 0, { min: 0 });
  next.hp = Math.max(0, finiteNumber(next.hp, 0, { min: 0 }) - damage);
  next.dead = next.hp <= 0;
  return next;
}

function applyVehicleDamage(vehicle, incoming, armor) {
  const next = deepClone(vehicle);
  const rawDamage = finiteNumber(incoming, 0, { min: 0 });
  const reduction = finiteNumber(armor, 0, { min: 0 });
  const damage = Math.max(1, Math.round(rawDamage - reduction));
  const shield = finiteNumber(next.shield, 0, { min: 0 });
  if (shield > 0) {
    const used = Math.min(shield, damage);
    next.shield = shield - used;
    next.hp = Math.max(0, finiteNumber(next.hp, 0, { min: 0 }) - (damage - used));
  } else {
    next.hp = Math.max(0, finiteNumber(next.hp, 0, { min: 0 }) - damage);
  }
  return { vehicle: next, damage };
}

function rewardPartsForRun(run, config) {
  const cfg = getConfig(config);
  const wavesCleared = finiteNumber(run && run.wavesCleared, 0, { min: 0, integer: true });
  const kills = finiteNumber(run && run.kills, 0, { min: 0, integer: true });
  const bossesDefeated = finiteNumber(run && run.bossesDefeated, 0, { min: 0, integer: true });
  if (wavesCleared === 0 && kills === 0 && bossesDefeated === 0) return 0;
  const difficultyId = run && cfg.ECONOMY.difficultyRewardMul[run.difficultyId] ? run.difficultyId : "normal";
  const baseParts = wavesCleared * cfg.ECONOMY.partsPerWave;
  const killParts = Math.floor(Math.min(kills, cfg.ECONOMY.killRewardCap) / cfg.ECONOMY.killDivisor);
  const bossParts = bossesDefeated * cfg.ECONOMY.bossParts;
  const difficultyMul = cfg.ECONOMY.difficultyRewardMul[difficultyId];
  return Math.max(cfg.ECONOMY.minRunParts, Math.round((baseParts + killParts + bossParts) * difficultyMul));
}

function migrateMeta(raw, options) {
  const cfg = getConfig(options && options.config);
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      parsed = null;
    }
  }

  const base = deepClone(cfg.META_DEFAULT);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;

  const input = deepClone(parsed);
  const meta = deepClone(base);
  meta.version = cfg.META_VERSION;
  meta.createdAt = typeof input.createdAt === "string" || typeof input.createdAt === "number" ? input.createdAt : base.createdAt;
  meta.updatedAt = typeof input.updatedAt === "string" || typeof input.updatedAt === "number" ? input.updatedAt : base.updatedAt;
  meta.shelterTheme = normalizeShelterTheme(input.shelterTheme, cfg);

  ["parts", "totalRuns", "totalKills", "totalBossKills", "bestWave", "bestScore", "bossBlueprintPity"].forEach((key) => {
    meta[key] = finiteNumber(input[key], base[key], { min: 0, integer: true });
  });

  meta.unlockedVehicles = {};
  Object.keys(cfg.VEHICLES).forEach((vehicleId) => {
    meta.unlockedVehicles[vehicleId] = true;
  });

  meta.selectedVehicle = cfg.VEHICLES[input.selectedVehicle] ? input.selectedVehicle : base.selectedVehicle;
  if (!meta.unlockedVehicles[meta.selectedVehicle]) meta.selectedVehicle = base.selectedVehicle;

  meta.vehicleLevels = {};
  Object.keys(cfg.VEHICLES).forEach((vehicleId) => {
    const rawLevels = input.vehicleLevels && input.vehicleLevels[vehicleId];
    meta.vehicleLevels[vehicleId] = sanitizeVehicleLevels(rawLevels, vehicleId, cfg);
  });

  meta.bestByVehicle = {};
  if (input.bestByVehicle && typeof input.bestByVehicle === "object" && !Array.isArray(input.bestByVehicle)) {
    Object.keys(cfg.VEHICLES).forEach((vehicleId) => {
      const record = input.bestByVehicle[vehicleId];
      if (!record || typeof record !== "object" || Array.isArray(record)) return;
      meta.bestByVehicle[vehicleId] = {
        wave: finiteNumber(record.wave, 0, { min: 0, integer: true }),
        score: finiteNumber(record.score, 0, { min: 0, integer: true }),
        kills: finiteNumber(record.kills, 0, { min: 0, integer: true }),
        bosses: finiteNumber(record.bosses, 0, { min: 0, integer: true }),
        at: typeof record.at === "string" ? record.at : null
      };
    });
  }

  meta.blueprints = {};
  if (input.blueprints && typeof input.blueprints === "object" && !Array.isArray(input.blueprints)) {
    Object.keys(input.blueprints).forEach((key) => {
      meta.blueprints[key] = finiteNumber(input.blueprints[key], 0, { min: 0, integer: true });
    });
  }

  meta.achievements = boolTrueMap(input.achievements);
  meta.claimedMilestones = boolTrueMap(input.claimedMilestones);
  meta.settings = Object.assign({}, base.settings);
  if (input.settings && typeof input.settings === "object" && !Array.isArray(input.settings)) {
    Object.keys(base.settings).forEach((key) => {
      if (typeof input.settings[key] === "boolean") meta.settings[key] = input.settings[key];
    });
  }
  meta.tutorial = Object.assign({}, base.tutorial);
  if (input.tutorial && typeof input.tutorial === "object" && !Array.isArray(input.tutorial)) {
    Object.keys(base.tutorial).forEach((key) => {
      if (typeof input.tutorial[key] === "boolean") meta.tutorial[key] = input.tutorial[key];
    });
  }

  meta.lastRun = input.lastRun && typeof input.lastRun === "object" && !Array.isArray(input.lastRun) ? deepClone(input.lastRun) : null;
  return meta;
}

function settleRunRewards(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const sourceMeta = migrateMeta(opts.meta || cfg.META_DEFAULT, { config: cfg });
  const meta = deepClone(sourceMeta);
  const run = opts.run || {};
  const at = timestampFromNow(opts.now);
  const wavesCleared = finiteNumber(run.wavesCleared, 0, { min: 0, integer: true });
  const kills = finiteNumber(run.kills, 0, { min: 0, integer: true });
  const bossesDefeated = finiteNumber(run.bossesDefeated, 0, { min: 0, integer: true });
  const score = finiteNumber(run.score, wavesCleared * 100 + kills * 10 + bossesDefeated * 500, { min: 0, integer: true });
  const vehicleId = cfg.VEHICLES[run.vehicleId] ? run.vehicleId : meta.selectedVehicle;
  const difficultyId = cfg.ECONOMY.difficultyRewardMul[run.difficultyId] ? run.difficultyId : "normal";
  const normalizedRun = { wavesCleared, kills, bossesDefeated, score, vehicleId, difficultyId };
  const parts = rewardPartsForRun(normalizedRun, cfg);
  const achievements = [];

  if (kills > 0 && meta.achievements.first_kill !== true) {
    meta.achievements.first_kill = true;
    achievements.push("first_kill");
  }
  if (bossesDefeated > 0 && meta.achievements.first_boss !== true) {
    meta.achievements.first_boss = true;
    achievements.push("first_boss");
  }
  if (wavesCleared >= 5 && meta.achievements.wave_5 !== true) {
    meta.achievements.wave_5 = true;
    achievements.push("wave_5");
  }

  meta.parts += parts;
  meta.totalRuns += 1;
  meta.totalKills += kills;
  meta.totalBossKills += bossesDefeated;
  meta.bestWave = Math.max(meta.bestWave, wavesCleared);
  meta.bestScore = Math.max(meta.bestScore, score);
  meta.selectedVehicle = vehicleId;
  meta.updatedAt = at;
  if (!meta.createdAt) meta.createdAt = at;

  const currentBest = meta.bestByVehicle[vehicleId];
  const isBest = !currentBest || score > currentBest.score || wavesCleared > currentBest.wave;
  if (isBest) {
    meta.bestByVehicle[vehicleId] = {
      wave: wavesCleared,
      score,
      kills,
      bosses: bossesDefeated,
      at
    };
  }

  meta.lastRun = {
    vehicleId,
    wavesCleared,
    kills,
    bossesDefeated,
    score,
    earnedParts: parts,
    unlockedAchievements: achievements.slice(),
    at
  };

  return {
    meta,
    reward: {
      parts,
      blueprints: {},
      achievements,
      isBest
    }
  };
}

function getUpgradeCost(meta, vehicleId, track, config) {
  const cfg = getConfig(config);
  const upgrade = cfg.ECONOMY.upgradeTracks[track];
  if (!upgrade || !cfg.VEHICLES[vehicleId]) return null;
  const levels = getVehicleLevels(meta, vehicleId, cfg);
  const level = levels[track] || 0;
  if (level >= upgrade.maxLevel) return null;
  return upgrade.costs[level];
}

function buyUpgrade(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const meta = migrateMeta(opts.meta || cfg.META_DEFAULT, { config: cfg });
  const vehicleId = cfg.VEHICLES[opts.vehicleId] ? opts.vehicleId : meta.selectedVehicle;
  const track = opts.track;
  const cost = getUpgradeCost(meta, vehicleId, track, cfg);
  const at = timestampFromNow(opts.now);

  if (cost == null) {
    return { meta, purchase: { ok: false, reason: "max_or_unknown", cost: null } };
  }
  if (meta.unlockedVehicles[vehicleId] !== true) {
    return { meta, purchase: { ok: false, reason: "locked", cost } };
  }
  if (meta.parts < cost) {
    return { meta, purchase: { ok: false, reason: "parts", cost } };
  }

  const next = deepClone(meta);
  next.parts -= cost;
  next.vehicleLevels[vehicleId][track] += 1;
  next.selectedVehicle = vehicleId;
  next.updatedAt = at;
  if (!next.createdAt) next.createdAt = at;
  return {
    meta: next,
    purchase: {
      ok: true,
      vehicleId,
      track,
      cost,
      level: next.vehicleLevels[vehicleId][track]
    }
  };
}

const DSRules = {
  deepClone,
  clamp,
  finiteNumber,
  createSeededRng,
  enemyHpScale,
  enemySpeedScale,
  waveBudget,
  normalCountHint,
  bossHpScale,
  waveDuration,
  scaledEnemyStats,
  generateWave,
  defaultRunMods,
  getVehicleLevels,
  getVehicleStats,
  calculateShotStats,
  applyGateEffect,
  damageEnemy,
  applyVehicleDamage,
  rewardPartsForRun,
  migrateMeta,
  settleRunRewards,
  getUpgradeCost,
  buyUpgrade
};

if (typeof window !== "undefined") window.DSRules = DSRules;
if (typeof module !== "undefined" && module.exports) module.exports = DSRules;
