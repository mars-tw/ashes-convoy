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

function eventIds(config) {
  const cfg = getConfig(config);
  return Object.values(cfg.ENVIRONMENT_EVENTS || {}).map((event) => event.id);
}

function sanitizeEventStats(input, config) {
  const cfg = getConfig(config);
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = {};
  eventIds(cfg).forEach((eventId) => {
    const record = source[eventId] || {};
    output[eventId] = {
      encounters: finiteNumber(record.encounters, 0, { min: 0, integer: true }),
      completions: finiteNumber(record.completions, 0, { min: 0, integer: true })
    };
  });
  return output;
}

function mergeEventStats(metaStats, runStats, config) {
  const cfg = getConfig(config);
  const output = sanitizeEventStats(metaStats, cfg);
  const run = sanitizeEventStats(runStats, cfg);
  eventIds(cfg).forEach((eventId) => {
    output[eventId].encounters += run[eventId].encounters;
    output[eventId].completions += run[eventId].completions;
  });
  return output;
}

function sanitizeCountMap(input, options) {
  const opts = options || {};
  const maxKeys = finiteNumber(opts.maxKeys, 16, { min: 1, max: 80, integer: true });
  const maxValue = finiteNumber(opts.maxValue, 1000000, { min: 1, integer: true });
  const output = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return output;
  Object.keys(input)
    .slice(0, maxKeys)
    .forEach((key) => {
      const safeKey = String(key).slice(0, 48);
      const value = finiteNumber(input[key], 0, { min: 0, max: maxValue });
      if (value > 0) output[safeKey] = value;
    });
  return output;
}

function sanitizeDeathContext(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const allowed = { boss: true, enemy: true, burst: true, hazard: true, quit: true, unknown: true };
  const type = allowed[source.type] ? source.type : "unknown";
  return {
    type,
    enemyId: typeof source.enemyId === "string" ? source.enemyId.slice(0, 48) : "",
    amount: finiteNumber(source.amount, 0, { min: 0, max: 100000 }),
    wave: finiteNumber(source.wave, 0, { min: 0, integer: true })
  };
}

function sanitizeRecovery(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    pending: source.pending === true,
    message: typeof source.message === "string" ? source.message.slice(0, 160) : "",
    at: typeof source.at === "string" || typeof source.at === "number" ? source.at : null
  };
}

function validAimAssistLevel(level) {
  return level === "off" || level === "low" || level === "medium" || level === "high";
}

function validDamageTextDensity(density) {
  return density === "all" || density === "large" || density === "off";
}

function validPerformanceMode(mode) {
  return mode === "auto" || mode === "high" || mode === "low";
}

function validFxLevel(level) {
  return level === "full" || level === "reduced" || level === "off";
}

function validFontSize(size) {
  return size === "small" || size === "medium" || size === "large";
}

function sanitizeSettings(input, config) {
  const cfg = getConfig(config);
  const base = deepClone(cfg.META_DEFAULT.settings);
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = Object.assign({}, base);
  if (validAimAssistLevel(source.aimAssistLevel)) {
    output.aimAssistLevel = source.aimAssistLevel;
  } else if (typeof source.aimAssist === "boolean") {
    output.aimAssistLevel = source.aimAssist ? "medium" : "off";
  }
  ["reducedFlash", "screenShake", "sound"].forEach((key) => {
    if (typeof source[key] === "boolean") output[key] = source[key];
  });
  if (validDamageTextDensity(source.damageTextDensity)) output.damageTextDensity = source.damageTextDensity;
  if (validPerformanceMode(source.performanceMode)) output.performanceMode = source.performanceMode;
  if (validFxLevel(source.fxLevel)) output.fxLevel = source.fxLevel;
  if (validFontSize(source.fontSize)) output.fontSize = source.fontSize;
  output.aimAssist = output.aimAssistLevel !== "off";
  return output;
}

function aimAssistStrength(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const level = validAimAssistLevel(source.aimAssistLevel)
    ? source.aimAssistLevel
    : source.aimAssist === false
      ? "off"
      : "medium";
  if (level === "off") return 0;
  if (level === "low") return 0.1;
  if (level === "high") return 0.28;
  return 0.18;
}

function sanitizeQuestStats(input, config) {
  const cfg = getConfig(config);
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const wins = source.environmentWins && typeof source.environmentWins === "object" && !Array.isArray(source.environmentWins)
    ? source.environmentWins
    : {};
  const environmentWins = {};
  ["land", "air", "sea", "space"].forEach((environment) => {
    environmentWins[environment] = finiteNumber(wins[environment], 0, { min: 0, integer: true });
  });
  return {
    variantKills: finiteNumber(source.variantKills, 0, { min: 0, integer: true }),
    eventCompletions: finiteNumber(source.eventCompletions, 0, { min: 0, integer: true }),
    supplyCrates: finiteNumber(source.supplyCrates, 0, { min: 0, integer: true }),
    environmentWins
  };
}

function trailerFurnitureIds(config) {
  const cfg = getConfig(config);
  return Object.keys((cfg.TRAILER_ROOM && cfg.TRAILER_ROOM.furniture) || {});
}

function trailerSlotIds(config) {
  const cfg = getConfig(config);
  return Object.keys((cfg.TRAILER_ROOM && cfg.TRAILER_ROOM.slots) || {});
}

function sanitizeTrailerRoom(input, config) {
  const cfg = getConfig(config);
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = {
    owned: {},
    slots: {},
    seenIntro: source.seenIntro === true
  };
  const furniture = (cfg.TRAILER_ROOM && cfg.TRAILER_ROOM.furniture) || {};
  const slotIds = trailerSlotIds(cfg);
  const ownedSource = source.owned && typeof source.owned === "object" && !Array.isArray(source.owned) ? source.owned : {};
  trailerFurnitureIds(cfg).forEach((id) => {
    if (ownedSource[id] === true) output.owned[id] = true;
  });
  const slotSource = source.slots && typeof source.slots === "object" && !Array.isArray(source.slots) ? source.slots : {};
  slotIds.forEach((slotId) => {
    const furnitureId = typeof slotSource[slotId] === "string" ? slotSource[slotId] : null;
    const item = furniture[furnitureId];
    output.slots[slotId] = item && item.slot === slotId && output.owned[furnitureId] === true ? furnitureId : null;
  });
  return output;
}

function rollScavengeDrop(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const room = cfg.TRAILER_ROOM || {};
  const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
  const killsSinceDrop = finiteNumber(opts.killsSinceDrop, 0, { min: 0, integer: true });
  const pityKills = finiteNumber(room.pityKills, 9, { min: 1, integer: true });
  const nextCount = killsSinceDrop + 1;
  const guaranteed = nextCount >= pityKills;
  const chance = finiteNumber(room.dropChancePerKill, 0, { min: 0, max: 1 });
  const dropped = guaranteed || rng() < chance;
  return {
    dropped,
    guaranteed,
    goods: dropped ? finiteNumber(room.goodsPerDrop, 1, { min: 1, integer: true }) : 0,
    killsSinceDrop: dropped ? 0 : nextCount
  };
}

function scavengeGoodsBreakdownForRun(run, config) {
  const cfg = getConfig(config);
  const room = cfg.TRAILER_ROOM || {};
  const killGoods = finiteNumber(run && run.scavengeGoods, 0, {
    min: 0,
    max: finiteNumber(room.maxGoodsPerRun, 28, { min: 1, integer: true }),
    integer: true
  });
  const wavesCleared = finiteNumber(run && run.wavesCleared, 0, { min: 0, integer: true });
  const bossesDefeated = finiteNumber(run && run.bossesDefeated, 0, { min: 0, integer: true });
  const waveGoods = wavesCleared * finiteNumber(room.waveGoods, 0, { min: 0, integer: true });
  const bossGoods = bossesDefeated * finiteNumber(room.bossGoods, 0, { min: 0, integer: true });
  const cap = finiteNumber(room.maxGoodsPerRun, 28, { min: 1, integer: true });
  const total = Math.min(cap, killGoods + waveGoods + bossGoods);
  return {
    killGoods,
    waveGoods,
    bossGoods,
    capped: total < killGoods + waveGoods + bossGoods,
    total
  };
}

function calculateTrailerBonuses(meta, config) {
  const cfg = getConfig(config);
  const migrated = meta && meta.version === cfg.META_VERSION ? meta : migrateMeta(meta || cfg.META_DEFAULT, { config: cfg });
  const room = sanitizeTrailerRoom(migrated.trailerRoom, cfg);
  const furniture = (cfg.TRAILER_ROOM && cfg.TRAILER_ROOM.furniture) || {};
  const bonuses = {
    maxHpPct: 0,
    damagePct: 0,
    fireIntervalMul: 1,
    damageTakenMul: 1
  };
  Object.keys(room.slots).forEach((slotId) => {
    const furnitureId = room.slots[slotId];
    if (!furnitureId || room.owned[furnitureId] !== true) return;
    const effect = furniture[furnitureId] && furniture[furnitureId].effects;
    if (!effect) return;
    bonuses.maxHpPct += finiteNumber(effect.maxHpPct, 0, { min: 0, max: 0.05 });
    bonuses.damagePct += finiteNumber(effect.damagePct, 0, { min: 0, max: 0.05 });
    bonuses.fireIntervalMul *= finiteNumber(effect.fireIntervalMul, 1, { min: 0.9, max: 1 });
    bonuses.damageTakenMul *= finiteNumber(effect.damageTakenMul, 1, { min: 0.9, max: 1 });
  });
  bonuses.maxHpPct = Math.min(0.04, bonuses.maxHpPct);
  bonuses.damagePct = Math.min(0.04, bonuses.damagePct);
  bonuses.fireIntervalMul = Math.max(0.94, bonuses.fireIntervalMul);
  bonuses.damageTakenMul = Math.max(0.94, bonuses.damageTakenMul);
  return bonuses;
}

function getTrailerRoomState(meta, config) {
  const cfg = getConfig(config);
  const migrated = migrateMeta(meta || cfg.META_DEFAULT, { config: cfg });
  const room = sanitizeTrailerRoom(migrated.trailerRoom, cfg);
  const furniture = (cfg.TRAILER_ROOM && cfg.TRAILER_ROOM.furniture) || {};
  const items = trailerFurnitureIds(cfg).map((id) => {
    const item = furniture[id];
    const owned = room.owned[id] === true;
    return Object.assign({}, deepClone(item), {
      owned,
      equipped: Object.keys(room.slots).some((slotId) => room.slots[slotId] === id),
      affordable: migrated.trailerGoods >= finiteNumber(item.cost, 0, { min: 0, integer: true })
    });
  });
  return {
    goods: migrated.trailerGoods,
    resourceName: (cfg.TRAILER_ROOM && cfg.TRAILER_ROOM.resourceName) || "拾荒物資",
    room,
    slots: deepClone((cfg.TRAILER_ROOM && cfg.TRAILER_ROOM.slots) || {}),
    items,
    bonuses: calculateTrailerBonuses(migrated, cfg)
  };
}

function buyTrailerFurniture(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const furnitureId = typeof opts.furnitureId === "string" ? opts.furnitureId : "";
  const furniture = cfg.TRAILER_ROOM && cfg.TRAILER_ROOM.furniture ? cfg.TRAILER_ROOM.furniture[furnitureId] : null;
  const meta = migrateMeta(opts.meta || cfg.META_DEFAULT, { config: cfg });
  if (!furniture) return { meta, purchase: { ok: false, reason: "unknown", furnitureId } };
  if (meta.trailerRoom.owned[furnitureId] === true) return { meta, purchase: { ok: false, reason: "owned", furnitureId } };
  const cost = finiteNumber(furniture.cost, 0, { min: 0, integer: true });
  if (meta.trailerGoods < cost) return { meta, purchase: { ok: false, reason: "goods", furnitureId, cost } };
  const next = deepClone(meta);
  next.trailerGoods -= cost;
  next.trailerRoom.owned[furnitureId] = true;
  next.trailerRoom.slots[furniture.slot] = furnitureId;
  next.trailerRoom.seenIntro = true;
  next.updatedAt = timestampFromNow(opts.now);
  if (!next.createdAt) next.createdAt = next.updatedAt;
  return {
    meta: next,
    purchase: { ok: true, furnitureId, slot: furniture.slot, cost, item: deepClone(furniture) }
  };
}

function equipTrailerFurniture(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const furnitureId = typeof opts.furnitureId === "string" ? opts.furnitureId : "";
  const furniture = cfg.TRAILER_ROOM && cfg.TRAILER_ROOM.furniture ? cfg.TRAILER_ROOM.furniture[furnitureId] : null;
  const meta = migrateMeta(opts.meta || cfg.META_DEFAULT, { config: cfg });
  if (!furniture) return { meta, equip: { ok: false, reason: "unknown", furnitureId } };
  if (meta.trailerRoom.owned[furnitureId] !== true) return { meta, equip: { ok: false, reason: "locked", furnitureId } };
  const next = deepClone(meta);
  next.trailerRoom.slots[furniture.slot] = furnitureId;
  next.trailerRoom.seenIntro = true;
  next.updatedAt = timestampFromNow(opts.now);
  if (!next.createdAt) next.createdAt = next.updatedAt;
  return {
    meta: next,
    equip: { ok: true, furnitureId, slot: furniture.slot, item: deepClone(furniture) }
  };
}

function sanitizeQuestBaselines(input, config) {
  const cfg = getConfig(config);
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = {};
  Object.keys(source).slice(0, 32).forEach((instanceId) => {
    output[String(instanceId).slice(0, 96)] = sanitizeQuestStats(source[instanceId], cfg);
  });
  return output;
}

function sanitizeDamageEvents(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(-12).map((event) => {
    const source = event && typeof event === "object" ? event : {};
    const buffs = Array.isArray(source.buffs) ? source.buffs.slice(0, 6).map((item) => String(item).slice(0, 24)) : [];
    return {
      time: finiteNumber(source.time, 0, { min: 0 }),
      source: typeof source.source === "string" ? source.source.slice(0, 24) : "unknown",
      enemyId: typeof source.enemyId === "string" ? source.enemyId.slice(0, 48) : "",
      amount: finiteNumber(source.amount, 0, { min: 0, max: 100000 }),
      buffs
    };
  });
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

function dateFromNow(now) {
  const value = valueFromNow(now);
  if (value == null) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dailyKey(now) {
  const date = dateFromNow(now);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function weeklyKey(now) {
  const date = dateFromNow(now);
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  return `${local.getFullYear()}-${pad2(local.getMonth() + 1)}-${pad2(local.getDate())}`;
}

function hashText(text) {
  let hash = 2166136261;
  const source = String(text);
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

function enemyBehavior(enemy, enemyConfig) {
  const fromEnemy = enemy && enemy.behavior && typeof enemy.behavior === "object" ? enemy.behavior : null;
  const fromConfig = enemyConfig && enemyConfig.behavior && typeof enemyConfig.behavior === "object" ? enemyConfig.behavior : null;
  return fromEnemy || fromConfig || {};
}

function resolveEnemyRangedAttack(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const enemy = opts.enemy || {};
  const vehicle = opts.vehicle || {};
  const enemyConfig = cfg.ENEMIES[enemy.enemyId] || opts.enemyConfig || {};
  const behavior = enemyBehavior(enemy, enemyConfig);
  const dt = finiteNumber(opts.dt, 0, { min: 0, max: 1 });
  const cooldownSeconds = finiteNumber(behavior.cooldown, 2.4, { min: 0.1 });
  const nextCooldown = Math.max(0, finiteNumber(enemy.attackCooldown, cooldownSeconds, { min: 0 }) - dt);
  const enemyX = finiteNumber(enemy.x, cfg.LOGIC.width * 0.5);
  const enemyY = finiteNumber(enemy.y, 0);
  const vehicleX = finiteNumber(vehicle.x, cfg.LOGIC.width * 0.5);
  const vehicleY = finiteNumber(vehicle.y, cfg.LOGIC.vehicleY);
  const dx = vehicleX - enemyX;
  const dy = vehicleY - enemyY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const range = finiteNumber(behavior.range, 0, { min: 0 });
  const canFire = behavior.type === "ranged" && range > 0 && distance <= range && enemyY > 20 && enemyY < vehicleY - 28;
  if (!canFire || nextCooldown > 0 || distance <= 0) {
    return { fire: false, cooldown: nextCooldown, projectile: null, distance };
  }
  const speed = finiteNumber(behavior.projectileSpeed, 52, { min: 1 });
  return {
    fire: true,
    cooldown: cooldownSeconds,
    distance,
    projectile: {
      x: enemyX,
      y: enemyY + finiteNumber(enemy.radius, enemyConfig.radius || 8, { min: 1 }) * 0.45,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
      damage: finiteNumber(behavior.projectileDamage, Math.max(1, enemyConfig.contactDamage || 6), { min: 1 }),
      radius: finiteNumber(behavior.projectileRadius, 5, { min: 1 }),
      life: finiteNumber(behavior.projectileLife, 3, { min: 0.2 }),
      kind: "acid"
    }
  };
}

function resolveEnemyIncomingDamage(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const enemy = opts.enemy || {};
  const enemyConfig = cfg.ENEMIES[enemy.enemyId] || opts.enemyConfig || {};
  const behavior = enemyBehavior(enemy, enemyConfig);
  const projectile = opts.projectile || {};
  const rawDamage = finiteNumber(opts.damage, 0, { min: 0 });
  let hp = finiteNumber(enemy.hp, 0, { min: 0 });
  let shieldHp = finiteNumber(enemy.shieldHp, finiteNumber(behavior.shieldHp, 0, { min: 0 }), { min: 0 });
  let appliedDamage = rawDamage;
  let shieldDamage = 0;
  let shieldBroken = false;
  const frontHit = finiteNumber(projectile.vy, -1) < 0;

  if (behavior.type === "shield" && shieldHp > 0 && frontHit) {
    const before = shieldHp;
    shieldDamage = Math.min(before, rawDamage);
    shieldHp = Math.max(0, before - rawDamage);
    appliedDamage = rawDamage * finiteNumber(behavior.frontDamageMul, 0.35, { min: 0, max: 1 });
    shieldBroken = before > 0 && shieldHp <= 0;
  }

  if (behavior.type === "phase" && enemy.phaseActive === true) {
    appliedDamage *= finiteNumber(behavior.phaseDamageMul, 0.5, { min: 0, max: 1 });
  }

  hp = Math.max(0, hp - appliedDamage);
  return {
    hp,
    shieldHp,
    appliedDamage,
    shieldDamage,
    shieldBroken
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

function blueprintVehicleIds(config) {
  const cfg = getConfig(config);
  return Object.keys(cfg.VEHICLES).filter((vehicleId) => {
    const vehicle = cfg.VEHICLES[vehicleId];
    return vehicle.unlock && vehicle.unlock.type === "blueprint";
  });
}

function normalizeBlueprintWishlist(meta, config) {
  const cfg = getConfig(config);
  const input = meta && typeof meta === "object" ? meta : {};
  const locked = blueprintVehicleIds(cfg).filter((vehicleId) => {
    return input.unlockedVehicles && input.unlockedVehicles[vehicleId] !== true;
  });
  if (!locked.length) return null;
  return locked.includes(input.blueprintWishlist) ? input.blueprintWishlist : locked[0];
}

function variantChanceForWave(wave, config) {
  const cfg = getConfig(config);
  const safeWave = finiteNumber(wave, 1, { min: 1, integer: true });
  if (!cfg.ENEMY_VARIANTS || safeWave < 3) return 0;
  return clamp(0.04 + safeWave * 0.025, 0, 0.3);
}

function applyEnemyVariantToSpawn(spawn, wave, rng, config) {
  const cfg = getConfig(config);
  const variants = Object.values(cfg.ENEMY_VARIANTS || {}).filter((variant) => {
    return variant.baseEnemy === spawn.enemyId && wave >= finiteNumber(variant.minWave, 3, { min: 1, integer: true });
  });
  if (!variants.length || rng() >= variantChanceForWave(wave, cfg)) return spawn;
  const variant = variants[Math.floor(rng() * variants.length) % variants.length];
  const next = Object.assign({}, spawn);
  next.variantId = variant.id;
  next.variantLabel = variant.label;
  next.hp = Math.max(1, Math.round(next.hp * finiteNumber(variant.hpMul, 1, { min: 0.1 })));
  next.speed *= finiteNumber(variant.speedMul, 1, { min: 0.1 });
  next.tint = variant.tint || "";
  next.filter = variant.filter || "";
  return next;
}

function chooseEnvironmentEvent(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
  const wave = finiteNumber(opts.wave, 1, { min: 1, integer: true });
  const vehicle = cfg.VEHICLES[opts.vehicleId] || cfg.VEHICLES[defaultVehicleId(cfg)];
  const event = cfg.ENVIRONMENT_EVENTS && cfg.ENVIRONMENT_EVENTS[vehicle.environment];
  if (!event || wave < finiteNumber(event.minWave, 2, { min: 1, integer: true })) return null;
  const chance = finiteNumber(event.chance, 0, { min: 0, max: 1 });
  if (rng() >= chance) return null;
  return deepClone(event);
}

function applyEnvironmentEventToSpawn(spawn, environmentEvent) {
  if (!environmentEvent) return spawn;
  const next = Object.assign({}, spawn);
  if (environmentEvent.enemySpeedMul) next.speed *= finiteNumber(environmentEvent.enemySpeedMul, 1, { min: 0.1 });
  if (environmentEvent.swayAmpMul) next.swayAmp = finiteNumber(next.swayAmp, 0, { min: 0 }) * environmentEvent.swayAmpMul;
  if (environmentEvent.driftAmp) next.eventDriftAmp = environmentEvent.driftAmp;
  return next;
}

function finalizeSpawn(spawn, wave, rng, environmentEvent, config) {
  return applyEnvironmentEventToSpawn(applyEnemyVariantToSpawn(spawn, wave, rng, config), environmentEvent);
}

function rollSupplyDrop(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const supply = cfg.SUPPLY_DROPS || {};
  const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
  const killsSinceDrop = finiteNumber(opts.killsSinceDrop, 0, { min: 0, integer: true });
  const pityKills = finiteNumber(supply.pityKills, 25, { min: 1, integer: true });
  const nextCount = killsSinceDrop + 1;
  const guaranteed = nextCount >= pityKills;
  const chance = finiteNumber(supply.chancePerKill, 0, { min: 0, max: 1 });
  const dropped = guaranteed || rng() < chance;
  return {
    dropped,
    guaranteed,
    killsSinceDrop: dropped ? 0 : nextCount
  };
}

function chooseSupplyReward(rng, config) {
  const cfg = getConfig(config);
  const roll = typeof rng === "function" ? rng : Math.random;
  const rewards = Object.values((cfg.SUPPLY_DROPS && cfg.SUPPLY_DROPS.rewards) || {});
  if (!rewards.length) return null;
  const total = rewards.reduce((sum, reward) => sum + Math.max(0, reward.weight || 0), 0) || rewards.length;
  let value = roll() * total;
  for (let i = 0; i < rewards.length; i += 1) {
    value -= Math.max(0, rewards[i].weight || 1);
    if (value <= 0) return deepClone(rewards[i]);
  }
  return deepClone(rewards[rewards.length - 1]);
}

function stepSupplyDropMotion(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const supply = cfg.SUPPLY_DROPS || {};
  const drop = deepClone(opts.drop || {});
  const vehicle = opts.vehicle || {};
  const dt = finiteNumber(opts.dt, 0, { min: 0, max: 1 });
  const vehicleX = finiteNumber(vehicle.x, cfg.LOGIC.width * 0.5);
  const vehicleY = finiteNumber(vehicle.y, cfg.LOGIC.vehicleY);
  const startX = finiteNumber(drop.x, vehicleX);
  const startY = finiteNumber(drop.y, vehicleY);
  const dx = vehicleX - startX;
  const dy = vehicleY - startY;
  const distanceBefore = Math.sqrt(dx * dx + dy * dy);
  const magnetRadius = finiteNumber(supply.magnetRadius, 92, { min: 0 });
  const magnetSpeed = finiteNumber(supply.magnetSpeed, 82, { min: 0 });
  const driftSpeed = finiteNumber(supply.horizontalDriftSpeed, 0, { min: 0 });
  const fallSpeed = finiteNumber(drop.vy, finiteNumber(supply.crateSpeed, 18, { min: 0 }), { min: 0 });

  if (distanceBefore <= magnetRadius && distanceBefore > 0) {
    const step = Math.min(magnetSpeed * dt, distanceBefore);
    drop.x = startX + (dx / distanceBefore) * step;
    drop.y = startY + (dy / distanceBefore) * step;
  } else {
    const xStep = Math.min(Math.abs(dx), driftSpeed * dt);
    drop.x = startX + Math.sign(dx) * xStep;
    drop.y = startY + fallSpeed * dt;
  }
  drop.age = finiteNumber(drop.age, 0, { min: 0 }) + dt;

  const afterDx = vehicleX - drop.x;
  const afterDy = vehicleY - drop.y;
  const distanceAfter = Math.sqrt(afterDx * afterDx + afterDy * afterDy);
  return { drop, distanceBefore, distanceAfter };
}

function applySupplyRewardById(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const reward = cfg.SUPPLY_DROPS && cfg.SUPPLY_DROPS.rewards
    ? cfg.SUPPLY_DROPS.rewards[opts.rewardId]
    : null;
  const vehicle = opts.vehicle ? deepClone(opts.vehicle) : null;
  const supplyBuffs = Array.isArray(opts.supplyBuffs) ? deepClone(opts.supplyBuffs) : [];
  const stats = opts.stats ? deepClone(opts.stats) : {};
  if (!stats.supplyRewards || typeof stats.supplyRewards !== "object" || Array.isArray(stats.supplyRewards)) {
    stats.supplyRewards = {};
  } else {
    stats.supplyRewards = deepClone(stats.supplyRewards);
  }
  stats.supplyParts = finiteNumber(stats.supplyParts, 0, {
    min: 0,
    max: (cfg.SUPPLY_DROPS && cfg.SUPPLY_DROPS.partsCapPerRun) || 12,
    integer: true
  });
  stats.supplyCratesCollected = finiteNumber(stats.supplyCratesCollected, 0, { min: 0, integer: true });
  stats.lastSupplyReward = stats.lastSupplyReward || "";

  if (!reward) {
    return {
      ok: false,
      reason: "unknown_reward",
      rewardId: opts.rewardId || "",
      vehicle,
      supplyBuffs,
      stats,
      reward: null,
      buff: null,
      heal: 0,
      partsGained: 0
    };
  }

  const now = finiteNumber(opts.time, 0, { min: 0 });
  const rewardId = reward.id;
  const result = {
    ok: true,
    reason: "",
    rewardId,
    vehicle,
    supplyBuffs,
    stats,
    reward: deepClone(reward),
    buff: null,
    heal: 0,
    partsGained: 0
  };

  stats.supplyCratesCollected += 1;
  stats.lastSupplyReward = rewardId;
  stats.supplyRewards[rewardId] = finiteNumber(stats.supplyRewards[rewardId], 0, { min: 0, integer: true }) + 1;

  if (reward.type === "rate" || reward.type === "damage") {
    result.buff = {
      id: opts.buffId || `supply_${rewardId}`,
      rewardId,
      label: reward.label,
      type: reward.type,
      fireIntervalMul: reward.fireIntervalMul || 1,
      damageAdd: reward.damageAdd || 0,
      until: now + finiteNumber(reward.duration, 10, { min: 0 })
    };
    supplyBuffs.push(deepClone(result.buff));
  } else if (reward.type === "repair" && vehicle) {
    const maxHp = finiteNumber(vehicle.maxHp, 0, { min: 0 });
    const hp = finiteNumber(vehicle.hp, 0, { min: 0 });
    result.heal = Math.round(maxHp * finiteNumber(reward.repairPct, 0, { min: 0, max: 1 }));
    vehicle.hp = Math.min(maxHp, hp + result.heal);
  } else if (reward.type === "parts") {
    const cap = (cfg.SUPPLY_DROPS && cfg.SUPPLY_DROPS.partsCapPerRun) || 12;
    const current = finiteNumber(stats.supplyParts, 0, { min: 0, max: cap, integer: true });
    result.partsGained = Math.min(finiteNumber(reward.parts, 0, { min: 0, integer: true }), Math.max(0, cap - current));
    stats.supplyParts = current + result.partsGained;
  }

  return result;
}

function selectAimAssistTarget(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const vehicle = opts.vehicle || {};
  const enemies = Array.isArray(opts.enemies) ? opts.enemies : [];
  const vehicleX = finiteNumber(vehicle.x, cfg.LOGIC.width * 0.5);
  const vehicleY = finiteNumber(vehicle.y, cfg.LOGIC.vehicleY || cfg.LOGIC.height * 0.82);
  const vehicleRadius = finiteNumber(vehicle.radius, 18, { min: 1 });
  const maxDistance = finiteNumber(opts.maxDistance, cfg.LOGIC.height * 0.52, { min: 80 });
  let best = null;

  enemies.forEach((enemy, index) => {
    if (!enemy || enemy.dead === true || finiteNumber(enemy.hp, 1) <= 0) return;
    const enemyId = typeof enemy.enemyId === "string" ? enemy.enemyId : "";
    const enemyConfig = cfg.ENEMIES[enemyId] || {};
    const x = finiteNumber(enemy.x, cfg.LOGIC.width * 0.5);
    const y = finiteNumber(enemy.y, 0);
    if (y > cfg.LOGIC.height + 40) return;
    const dx = x - vehicleX;
    const dy = y - vehicleY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!Number.isFinite(dist) || dist > maxDistance) return;

    const speed = finiteNumber(enemy.speed, finiteNumber(enemy.vy, 0));
    const vy = finiteNumber(enemy.vy, speed);
    const variantId = typeof enemy.variantId === "string" ? enemy.variantId : "";
    const isBloater = enemyId === "bloater" || !!enemyConfig.deathBurst;
    const burstRadius = finiteNumber(enemyConfig.deathBurst && enemyConfig.deathBurst.radius, 0, { min: 0 });
    const burstThreat = isBloater && dist <= burstRadius + vehicleRadius + 82 && y > vehicleY - 230;
    const fastThreat =
      enemyId === "runner" ||
      variantId.indexOf("runner") >= 0 ||
      variantId.indexOf("frenzy") >= 0 ||
      speed >= 82 ||
      vy >= 82;
    const tier = burstThreat ? 3 : fastThreat || variantId ? 2 : 1;
    const reason = tier === 3 ? "burst" : tier === 2 ? "fast" : "nearest";
    const score = tier * 100000 - dist + Math.max(0, vy) * 0.45 - Math.abs(dx) * 0.08 - index * 0.001;

    if (!best || score > best.score) {
      best = {
        id: enemy.id || enemyId || `enemy_${index}`,
        enemyId,
        variantId,
        x,
        y,
        distance: dist,
        reason,
        score
      };
    }
  });

  return best;
}

function vehicleSpecialTracks(vehicleId, config) {
  const cfg = getConfig(config);
  return Object.keys((cfg.ECONOMY.vehicleUpgradeTracks && cfg.ECONOMY.vehicleUpgradeTracks[vehicleId]) || {});
}

function firstUpgradeableTrack(meta, vehicleId, tracks, affordableOnly, config) {
  const cfg = getConfig(config);
  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i];
    const cost = getUpgradeCost(meta, vehicleId, track, cfg);
    if (cost == null) continue;
    if (affordableOnly && meta.parts < cost) continue;
    const def = getUpgradeDefinition(vehicleId, track, cfg);
    return { vehicleId, track, cost, label: def.label };
  }
  return null;
}

function recommendUpgradeForRun(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const meta = migrateMeta(opts.meta || cfg.META_DEFAULT, { config: cfg });
  const run = opts.run || {};
  const vehicleId = cfg.VEHICLES[run.vehicleId] ? run.vehicleId : cfg.VEHICLES[opts.vehicleId] ? opts.vehicleId : meta.selectedVehicle;
  const wavesCleared = finiteNumber(run.wavesCleared, 0, { min: 0, integer: true });
  const deathContext = sanitizeDeathContext(run.deathContext);
  const damageTakenBy = sanitizeCountMap(run.damageTakenBy);
  const specialTracks = vehicleSpecialTracks(vehicleId, cfg);
  const defensiveSpecials = specialTracks.filter((track) => {
    return track.indexOf("armor") >= 0 || track.indexOf("resist") >= 0 || track.indexOf("evasion") >= 0;
  });
  const offensiveSpecials = specialTracks.filter((track) => defensiveSpecials.indexOf(track) < 0);
  const affordableOnly = opts.affordableOnly !== false;
  let tracks = ["hull", "weapon", "energy", "gate"].concat(specialTracks);
  let reason = "用最便宜的可用升級補上下一局基礎戰力。";
  let profile = "balanced";

  if (wavesCleared >= 10 && specialTracks.length) {
    tracks = specialTracks.concat(["energy", "weapon", "hull", "gate"]);
    reason = "已撐到高波段，專屬節點能把這台載具的後期打法放大。";
    profile = "late_wave";
  } else if (deathContext.type === "boss" || (damageTakenBy.boss || 0) >= Math.max(1, damageTakenBy.enemy || 0) * 1.15) {
    tracks = defensiveSpecials.concat(["hull", "weapon", "energy", "gate"], offensiveSpecials);
    reason = "Boss 壓力是本局主要破口，先補車體或護甲提高容錯。";
    profile = "boss_survival";
  } else if (deathContext.type === "enemy" || (damageTakenBy.enemy || 0) > (damageTakenBy.boss || 0)) {
    tracks = ["weapon", "energy"].concat(offensiveSpecials, ["hull", "gate"], defensiveSpecials);
    reason = "小怪磨血偏多，先提升清場速度降低被貼身時間。";
    profile = "mob_clear";
  }

  const candidate = firstUpgradeableTrack(meta, vehicleId, tracks, affordableOnly, cfg);
  if (!candidate) return null;
  return Object.assign(candidate, { reason, profile });
}

function createSafeRecoveryMeta(meta, errorInfo, options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const next = migrateMeta(meta || cfg.META_DEFAULT, { config: cfg });
  const info = errorInfo && typeof errorInfo === "object" ? errorInfo : {};
  const rawMessage = typeof info.message === "string" ? info.message : String(errorInfo || "unknown error");
  next.recovery = {
    pending: true,
    message: rawMessage.slice(0, 160),
    at: timestampFromNow(opts.now || info.at) || null
  };
  return next;
}

function encodeSaveMeta(meta, options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const migrated = migrateMeta(meta || cfg.META_DEFAULT, { config: cfg });
  const json = JSON.stringify(migrated);
  if (typeof Buffer !== "undefined") return Buffer.from(json, "utf8").toString("base64");
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(json)));
  throw new Error("Base64 encoder unavailable.");
}

function decodeSaveMeta(code, options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  if (typeof code !== "string" || !code.trim()) {
    return { ok: false, reason: "empty", meta: null };
  }
  try {
    let json;
    const text = code.trim();
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(text, "base64").toString("utf8");
    } else if (typeof atob === "function") {
      json = decodeURIComponent(escape(atob(text)));
    } else {
      throw new Error("Base64 decoder unavailable.");
    }
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "shape", meta: null };
    const meta = migrateMeta(parsed, { config: cfg });
    return { ok: true, reason: "", meta };
  } catch (error) {
    return { ok: false, reason: "decode", meta: null };
  }
}

function questMetricValue(stats, quest) {
  const safeStats = sanitizeQuestStats(stats);
  if (!quest) return 0;
  if (quest.metric === "variantKills") return safeStats.variantKills;
  if (quest.metric === "eventCompletions") return safeStats.eventCompletions;
  if (quest.metric === "supplyCrates") return safeStats.supplyCrates;
  if (quest.metric === "environmentWins") {
    return safeStats.environmentWins[quest.environment] || 0;
  }
  return 0;
}

function activeQuestDefinitions(now, config) {
  const cfg = getConfig(config);
  const dailyPool = (cfg.QUESTS && cfg.QUESTS.dailyPool) || [];
  const weeklyPool = (cfg.QUESTS && cfg.QUESTS.weeklyPool) || [];
  const dayKey = dailyKey(now);
  const weekKey = weeklyKey(now);
  const daily = dailyPool.length ? dailyPool[hashText(`daily:${dayKey}`) % dailyPool.length] : null;
  const weekly = weeklyPool.length ? weeklyPool[hashText(`weekly:${weekKey}`) % weeklyPool.length] : null;
  return [
    daily
      ? Object.assign({}, daily, {
          period: "daily",
          periodKey: dayKey,
          instanceId: `daily:${dayKey}:${daily.id}`,
          rewardParts: daily.rewardParts || (cfg.QUESTS && cfg.QUESTS.dailyRewardParts) || 5
        })
      : null,
    weekly
      ? Object.assign({}, weekly, {
          period: "weekly",
          periodKey: weekKey,
          instanceId: `weekly:${weekKey}:${weekly.id}`,
          rewardParts: weekly.rewardParts || (cfg.QUESTS && cfg.QUESTS.weeklyRewardParts) || 15
        })
      : null
  ].filter(Boolean);
}

function ensureQuestState(meta, options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const next = migrateMeta(meta || cfg.META_DEFAULT, { config: cfg });
  const active = activeQuestDefinitions(opts.now, cfg);
  active.forEach((quest) => {
    if (!next.questBaselines[quest.instanceId]) {
      next.questBaselines[quest.instanceId] = sanitizeQuestStats(next.questStats, cfg);
    }
  });
  return next;
}

function getQuestBoard(meta, options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const ensured = ensureQuestState(meta || cfg.META_DEFAULT, { now: opts.now, config: cfg });
  const active = activeQuestDefinitions(opts.now, cfg);
  return active.map((quest) => {
    const current = questMetricValue(ensured.questStats, quest);
    const baseline = questMetricValue(ensured.questBaselines[quest.instanceId], quest);
    const progress = Math.min(quest.target, Math.max(0, current - baseline));
    const claimed = ensured.questClaims[quest.instanceId] === true;
    return Object.assign({}, quest, {
      progress,
      target: finiteNumber(quest.target, 1, { min: 1, integer: true }),
      claimed,
      ready: progress >= quest.target && !claimed
    });
  });
}

function applyQuestRunStats(meta, run, config) {
  const cfg = getConfig(config);
  const next = deepClone(meta);
  const stats = sanitizeQuestStats(next.questStats, cfg);
  const variantKills = sanitizeCountMap(run.variantKills);
  const eventStats = sanitizeEventStats(run.eventStats, cfg);
  stats.variantKills += Object.keys(variantKills).reduce((sum, key) => sum + variantKills[key], 0);
  stats.supplyCrates += finiteNumber(run.supplyCratesCollected, 0, { min: 0, integer: true });
  stats.eventCompletions += Object.keys(eventStats).reduce((sum, eventId) => {
    return sum + finiteNumber(eventStats[eventId].completions, 0, { min: 0, integer: true });
  }, 0);
  const vehicle = cfg.VEHICLES[run.vehicleId];
  const wonSortie = finiteNumber(run.wavesCleared, 0, { min: 0, integer: true }) >= 3 || finiteNumber(run.bossesDefeated, 0, { min: 0, integer: true }) > 0;
  if (vehicle && wonSortie) {
    stats.environmentWins[vehicle.environment] = (stats.environmentWins[vehicle.environment] || 0) + 1;
  }
  next.questStats = stats;
  return next;
}

function claimQuestReward(options) {
  const opts = options || {};
  const cfg = getConfig(opts.config);
  const ensured = ensureQuestState(opts.meta || cfg.META_DEFAULT, { now: opts.now, config: cfg });
  const board = getQuestBoard(ensured, { now: opts.now, config: cfg });
  const quest = board.find((entry) => entry.instanceId === opts.instanceId);
  if (!quest) return { meta: ensured, claim: { ok: false, reason: "missing" } };
  if (quest.claimed) return { meta: ensured, claim: { ok: false, reason: "claimed", quest } };
  if (!quest.ready) return { meta: ensured, claim: { ok: false, reason: "progress", quest } };
  const next = deepClone(ensured);
  next.questClaims[quest.instanceId] = true;
  next.parts += quest.rewardParts;
  next.updatedAt = timestampFromNow(opts.now);
  return {
    meta: next,
    claim: {
      ok: true,
      quest,
      rewardParts: quest.rewardParts
    }
  };
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
  const vehicleId = cfg.VEHICLES[opts.vehicleId] ? opts.vehicleId : defaultVehicleId(cfg);
  const environmentEvent = bossWave
    ? null
    : chooseEnvironmentEvent({ wave, vehicleId, rng, config: cfg });

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
    weight: Number.isFinite(enemy.poolWeight) ? enemy.poolWeight : enemy.id === "bloater" ? 0.65 : enemy.id === "runner" ? 1.15 : 1
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
      spawns.push(finalizeSpawn({
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
      }, wave, rng, environmentEvent, cfg));
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
    spawns.push(finalizeSpawn({
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
    }, wave, rng, environmentEvent, cfg));
    spawnCount += 1;
  }

  spawns.sort((a, b) => a.time - b.time);

  return {
    wave,
    duration,
    budget,
    boss: bossWave,
    environmentEvent,
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
  if (!cfg.VEHICLES[vehicleId]) return output;
  const vehicleTracks = (cfg.ECONOMY.vehicleUpgradeTracks && cfg.ECONOMY.vehicleUpgradeTracks[vehicleId]) || {};
  Object.keys(vehicleTracks).forEach((track) => {
    output[track] = finiteNumber(input[track], 0, {
      min: 0,
      max: vehicleTracks[track].maxLevel,
      integer: true
    });
  });
  return output;
}

function getVehicleLevels(meta, vehicleId, config) {
  const cfg = getConfig(config);
  const stored = meta && meta.vehicleLevels ? meta.vehicleLevels[vehicleId] : null;
  return sanitizeVehicleLevels(stored, vehicleId, cfg);
}

function getUpgradeDefinition(vehicleId, track, config) {
  const cfg = getConfig(config);
  if (cfg.ECONOMY.upgradeTracks[track]) return Object.assign({ scope: "common" }, cfg.ECONOMY.upgradeTracks[track]);
  const vehicleTracks = (cfg.ECONOMY.vehicleUpgradeTracks && cfg.ECONOMY.vehicleUpgradeTracks[vehicleId]) || {};
  if (vehicleTracks[track]) return Object.assign({ scope: "vehicle" }, vehicleTracks[track]);
  return null;
}

function collectVehicleUpgradeEffects(vehicleId, levels, config) {
  const cfg = getConfig(config);
  const tracks = (cfg.ECONOMY.vehicleUpgradeTracks && cfg.ECONOMY.vehicleUpgradeTracks[vehicleId]) || {};
  const effects = {
    armorAdd: 0,
    damageTakenMul: 1,
    damageMul: 1,
    fireIntervalMul: 1,
    splashAdd: 0,
    pierceAdd: 0
  };
  Object.keys(tracks).forEach((track) => {
    const level = finiteNumber(levels && levels[track], 0, { min: 0, max: tracks[track].maxLevel, integer: true });
    if (level <= 0) return;
    const def = tracks[track];
    effects.armorAdd += (def.armorAddPerLevel || 0) * level;
    effects.damageTakenMul *= Math.max(0.65, 1 - (def.damageTakenMulPerLevel || 0) * level);
    effects.damageMul *= 1 + (def.damageMulPerLevel || 0) * level;
    effects.fireIntervalMul *= Math.max(0.55, 1 - (def.fireRateMulPerLevel || 0) * level);
    effects.splashAdd += (def.splashAddPerLevel || 0) * level;
    effects.pierceAdd += (def.pierceAddPerLevel || 0) * level;
  });
  return effects;
}

function getVehicleStats(vehicleId, meta, config) {
  const cfg = getConfig(config);
  const vehicle = cfg.VEHICLES[vehicleId] || cfg.VEHICLES[defaultVehicleId(cfg)];
  const levels = getVehicleLevels(meta, vehicle.id, cfg);
  const hull = cfg.ECONOMY.upgradeTracks.hull;
  const weapon = cfg.ECONOMY.upgradeTracks.weapon;
  const special = collectVehicleUpgradeEffects(vehicle.id, levels, cfg);
  const trailer = calculateTrailerBonuses(meta, cfg);
  const maxHp = Math.round(vehicle.hp * (1 + levels.hull * hull.hpMulPerLevel) * (1 + trailer.maxHpPct));
  const damageMul = 1 + levels.weapon * weapon.damageMulPerLevel;
  return {
    id: vehicle.id,
    maxHp,
    hp: maxHp,
    armor: vehicle.armor + special.armorAdd,
    damageTakenMul: special.damageTakenMul * trailer.damageTakenMul,
    damageMul: damageMul * special.damageMul * (1 + trailer.damagePct),
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
  const special = collectVehicleUpgradeEffects(vehicle.id, levels, cfg);
  const trailer = calculateTrailerBonuses(meta, cfg);
  const damageMul = (1 + levels.weapon * weaponTrack.damageMulPerLevel) * special.damageMul * (1 + trailer.damagePct);
  const energyMul = Math.pow(1 - energyTrack.fireRateMulPerLevel, levels.energy);
  const damageAdd = Math.min(runMods.damageAdd, 2.5);
  const projectiles = clamp(weapon.baseProjectiles + runMods.projectileAdd, 1, weapon.baseProjectiles + 4);
  const minInterval = Math.max(0.08, weapon.fireInterval * 0.55);
  const interval = Math.max(minInterval, weapon.fireInterval * runMods.fireIntervalMul * energyMul * special.fireIntervalMul * trailer.fireIntervalMul);
  return {
    weaponId: weapon.id,
    bulletSprite: weapon.bulletSprite,
    damage: weapon.damage * damageMul * (1 + damageAdd),
    fireInterval: interval,
    projectileSpeed: weapon.projectileSpeed,
    pierce: weapon.pierce + special.pierceAdd,
    spread: weapon.spread,
    splash: weapon.splash + special.splashAdd,
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
  const takenMul = finiteNumber(next.damageTakenMul, 1, { min: 0.45, max: 1.5 });
  const damage = Math.max(1, Math.round(rawDamage * takenMul - reduction));
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

function rewardPartsBreakdownForRun(run, config) {
  const cfg = getConfig(config);
  const wavesCleared = finiteNumber(run && run.wavesCleared, 0, { min: 0, integer: true });
  const kills = finiteNumber(run && run.kills, 0, { min: 0, integer: true });
  const bossesDefeated = finiteNumber(run && run.bossesDefeated, 0, { min: 0, integer: true });
  const eventRewardMul = finiteNumber(run && run.eventRewardMul, 1, { min: 1, max: 2 });
  const eventParts = finiteNumber(run && run.eventParts, 0, {
    min: 0,
    max: cfg.ECONOMY.eventPartsCapPerRun || 12,
    integer: true
  });
  const supplyParts = finiteNumber(run && run.supplyParts, 0, {
    min: 0,
    max: (cfg.SUPPLY_DROPS && cfg.SUPPLY_DROPS.partsCapPerRun) || 12,
    integer: true
  });
  const supplyCrates = finiteNumber(run && run.supplyCratesCollected, 0, { min: 0, integer: true });
  const difficultyId = run && cfg.ECONOMY.difficultyRewardMul[run.difficultyId] ? run.difficultyId : "normal";
  const baseParts = wavesCleared * cfg.ECONOMY.partsPerWave;
  const killParts = Math.floor(Math.min(kills, cfg.ECONOMY.killRewardCap) / cfg.ECONOMY.killDivisor);
  const bossParts = bossesDefeated * cfg.ECONOMY.bossParts;
  const difficultyMul = cfg.ECONOMY.difficultyRewardMul[difficultyId];
  const subtotal = baseParts + killParts + bossParts;
  const eventBonus = Math.max(0, Math.round(subtotal * (eventRewardMul - 1)) + eventParts);
  const subtotalWithEvents = subtotal + eventBonus + supplyParts;
  const rounded = Math.round(subtotalWithEvents * difficultyMul);
  const emptyRun = wavesCleared === 0 && kills === 0 && bossesDefeated === 0 && eventBonus === 0 && supplyParts === 0;
  const total = emptyRun ? 0 : Math.max(cfg.ECONOMY.minRunParts, rounded);
  const breakdown = {
    waveParts: baseParts,
    killParts,
    bossParts,
    subtotal,
    difficultyId,
    difficultyMul,
    difficultyBonus: total - subtotalWithEvents,
    minimumBonus: Math.max(0, total - rounded),
    total
  };
  if (eventBonus > 0) breakdown.eventBonus = eventBonus;
  if (supplyCrates > 0 || supplyParts > 0) {
    breakdown.supplyCrates = supplyCrates;
    breakdown.supplyParts = supplyParts;
  }
  return breakdown;
}

function rewardPartsForRun(run, config) {
  return rewardPartsBreakdownForRun(run, config).total;
}

function blueprintRequiredForVehicle(vehicleId, config) {
  const cfg = getConfig(config);
  const vehicle = cfg.VEHICLES[vehicleId];
  if (!vehicle || !vehicle.unlock || vehicle.unlock.type !== "blueprint") return 0;
  return finiteNumber(vehicle.unlock.blueprintsRequired, 3, { min: 1, integer: true });
}

function isVehicleUnlocked(meta, vehicleId, config) {
  const cfg = getConfig(config);
  if (!cfg.VEHICLES[vehicleId]) return false;
  const migrated = meta && meta.version === cfg.META_VERSION ? meta : migrateMeta(meta || cfg.META_DEFAULT, { config: cfg });
  return migrated.unlockedVehicles && migrated.unlockedVehicles[vehicleId] === true;
}

function firstLockedBlueprintVehicle(meta, config) {
  const cfg = getConfig(config);
  const migrated = meta && meta.version === cfg.META_VERSION ? meta : migrateMeta(meta || cfg.META_DEFAULT, { config: cfg });
  return normalizeBlueprintWishlist(migrated, cfg);
}

function hasVehicleUseSignal(input, vehicleId, config) {
  const cfg = getConfig(config);
  const legacyMap = {
    iron_crow: "land_rig",
    dawn_skiff: "sky_barge",
    rift_hauler: "sea_ark",
    frost_wing: "void_runner"
  };
  const aliases = [vehicleId].concat(
    Object.keys(legacyMap).filter((legacyId) => legacyMap[legacyId] === vehicleId)
  );
  return aliases.some((id) => {
    if (input.selectedVehicle === id) return true;
    if (input.lastRun && input.lastRun.vehicleId === id) return true;
    if (input.unlockedVehicles && input.unlockedVehicles[id] === true) return true;
    if (input.bestByVehicle && input.bestByVehicle[id]) return true;
    const rawLevels = input.vehicleLevels && input.vehicleLevels[id];
    if (rawLevels && typeof rawLevels === "object") {
      return Object.keys(rawLevels).some((track) => finiteNumber(rawLevels[track], 0, { min: 0, integer: true }) > 0);
    }
    return false;
  });
}

function applyBlueprintDrops(meta, bossesDefeated, rng, config) {
  const cfg = getConfig(config);
  const next = deepClone(meta);
  const drops = {};
  const unlocked = [];
  const bossCount = finiteNumber(bossesDefeated, 0, { min: 0, integer: true });
  const roll = typeof rng === "function" ? rng : Math.random;

  for (let i = 0; i < bossCount; i += 1) {
    const target = firstLockedBlueprintVehicle(next, cfg);
    if (!target) {
      next.bossBlueprintPity = 0;
      break;
    }
    next.bossBlueprintPity += 1;
    const guaranteed = next.bossBlueprintPity >= cfg.ECONOMY.blueprintPityAfterBosses;
    const shouldDrop = guaranteed || roll() < cfg.ECONOMY.blueprintDropChance;
    if (!shouldDrop) continue;

    const required = blueprintRequiredForVehicle(target, cfg);
    const before = finiteNumber(next.blueprints[target], 0, { min: 0, integer: true });
    const after = Math.min(required, before + cfg.ECONOMY.blueprintBundle);
    next.blueprints[target] = after;
    drops[target] = (drops[target] || 0) + (after - before);
    next.bossBlueprintPity = 0;
    if (after >= required && next.unlockedVehicles[target] !== true) {
      next.unlockedVehicles[target] = true;
      unlocked.push(target);
      next.blueprintWishlist = normalizeBlueprintWishlist(next, cfg);
    }
  }

  next.blueprintWishlist = normalizeBlueprintWishlist(next, cfg);
  return { meta: next, drops, unlocked };
}

function achievementMetricValue(meta, achievement, config) {
  const cfg = getConfig(config);
  const metric = achievement.metric || "";
  if (metric === "kills") return Math.min(achievement.target, meta.totalKills > 0 ? 1 : 0);
  if (metric === "bosses") return Math.min(achievement.target, meta.totalBossKills);
  if (metric === "bestWave") return Math.min(achievement.target, meta.bestWave);
  if (metric === "totalKills") return Math.min(achievement.target, meta.totalKills);
  if (metric === "unlockedVehicles") {
    return Object.keys(cfg.VEHICLES).filter((vehicleId) => meta.unlockedVehicles[vehicleId] === true).length;
  }
  if (metric.indexOf("environment:") === 0) {
    const env = metric.split(":")[1];
    return Object.keys(meta.bestByVehicle || {}).some((vehicleId) => {
      return cfg.VEHICLES[vehicleId] && cfg.VEHICLES[vehicleId].environment === env;
    })
      ? 1
      : 0;
  }
  if (metric.indexOf("eventCompletion:") === 0) {
    const eventId = metric.split(":")[1];
    const stats = sanitizeEventStats(meta.eventStats, cfg);
    return Math.min(achievement.target, stats[eventId] ? stats[eventId].completions : 0);
  }
  return 0;
}

function getEventCodexProgress(meta, config) {
  const cfg = getConfig(config);
  const migrated = migrateMeta(meta || cfg.META_DEFAULT, { config: cfg });
  const stats = sanitizeEventStats(migrated.eventStats, cfg);
  const events = Object.values(cfg.ENVIRONMENT_EVENTS || {});
  return events.map((event) => ({
    id: event.id,
    label: event.label,
    environment: event.environment,
    description: event.description,
    encounters: stats[event.id] ? stats[event.id].encounters : 0,
    completions: stats[event.id] ? stats[event.id].completions : 0
  }));
}

function getAchievementProgress(meta, config) {
  const cfg = getConfig(config);
  const migrated = migrateMeta(meta || cfg.META_DEFAULT, { config: cfg });
  return Object.keys(cfg.ACHIEVEMENTS).map((id) => {
    const achievement = cfg.ACHIEVEMENTS[id];
    const value = achievementMetricValue(migrated, achievement, cfg);
    const done = migrated.achievements[id] === true || value >= achievement.target;
    return {
      id,
      label: achievement.label,
      description: achievement.description,
      rewardParts: achievement.rewardParts,
      value: done ? achievement.target : value,
      target: achievement.target,
      done
    };
  });
}

function applyAchievementRewards(meta, config) {
  const cfg = getConfig(config);
  const next = deepClone(meta);
  const progress = getAchievementProgress(next, cfg);
  const unlocked = [];
  let parts = 0;
  progress.forEach((entry) => {
    if (entry.done && next.achievements[entry.id] !== true) {
      next.achievements[entry.id] = true;
      unlocked.push(entry.id);
      parts += cfg.ACHIEVEMENTS[entry.id].rewardParts;
    }
  });
  return { meta: next, achievements: unlocked, parts };
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

  ["parts", "totalRuns", "totalKills", "totalBossKills", "bestWave", "bestScore", "bossBlueprintPity", "trailerGoods"].forEach((key) => {
    meta[key] = finiteNumber(input[key], base[key], { min: 0, integer: true });
  });

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
  Object.keys(cfg.VEHICLES).forEach((vehicleId) => {
    const required = blueprintRequiredForVehicle(vehicleId, cfg);
    if (required <= 0) return;
    const raw = input.blueprints && input.blueprints[vehicleId];
    meta.blueprints[vehicleId] = finiteNumber(raw, 0, { min: 0, max: required, integer: true });
  });

  meta.unlockedVehicles = {};
  const oldPlayer = input.version !== cfg.META_VERSION && meta.totalRuns > 0;
  Object.keys(cfg.VEHICLES).forEach((vehicleId) => {
    const vehicle = cfg.VEHICLES[vehicleId];
    const defaultUnlocked = vehicle.unlock && vehicle.unlock.type === "default";
    const usedBefore = hasVehicleUseSignal(input, vehicleId, cfg);
    const required = blueprintRequiredForVehicle(vehicleId, cfg);
    const hasBlueprints = required > 0 && meta.blueprints[vehicleId] >= required;
    meta.unlockedVehicles[vehicleId] = defaultUnlocked || oldPlayer || usedBefore || hasBlueprints;
    if (meta.unlockedVehicles[vehicleId] && required > 0) meta.blueprints[vehicleId] = required;
  });

  meta.selectedVehicle = cfg.VEHICLES[input.selectedVehicle] ? input.selectedVehicle : base.selectedVehicle;
  if (!meta.unlockedVehicles[meta.selectedVehicle]) meta.selectedVehicle = base.selectedVehicle;
  meta.blueprintWishlist = typeof input.blueprintWishlist === "string" ? input.blueprintWishlist : base.blueprintWishlist;
  meta.blueprintWishlist = normalizeBlueprintWishlist(meta, cfg);

  meta.achievements = boolTrueMap(input.achievements);
  meta.eventStats = sanitizeEventStats(input.eventStats, cfg);
  meta.questStats = sanitizeQuestStats(input.questStats, cfg);
  meta.questBaselines = sanitizeQuestBaselines(input.questBaselines, cfg);
  meta.questClaims = boolTrueMap(input.questClaims);
  meta.claimedMilestones = boolTrueMap(input.claimedMilestones);
  meta.trailerRoom = sanitizeTrailerRoom(input.trailerRoom, cfg);
  meta.settings = sanitizeSettings(input.settings, cfg);
  meta.tutorial = Object.assign({}, base.tutorial);
  if (input.tutorial && typeof input.tutorial === "object" && !Array.isArray(input.tutorial)) {
    Object.keys(base.tutorial).forEach((key) => {
      if (typeof input.tutorial[key] === "boolean") meta.tutorial[key] = input.tutorial[key];
    });
  }

  meta.lastRun = input.lastRun && typeof input.lastRun === "object" && !Array.isArray(input.lastRun) ? deepClone(input.lastRun) : null;
  meta.recovery = sanitizeRecovery(input.recovery);
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
  const damageDealt = finiteNumber(run.damageDealt, 0, { min: 0 });
  const vehicleId = cfg.VEHICLES[run.vehicleId] ? run.vehicleId : meta.selectedVehicle;
  const difficultyId = cfg.ECONOMY.difficultyRewardMul[run.difficultyId] ? run.difficultyId : "normal";
  const eventRewardMul = finiteNumber(run.eventRewardMul, 1, { min: 1, max: 2 });
  const eventParts = finiteNumber(run.eventParts, 0, {
    min: 0,
    max: cfg.ECONOMY.eventPartsCapPerRun || 12,
    integer: true
  });
  const supplyParts = finiteNumber(run.supplyParts, 0, {
    min: 0,
    max: (cfg.SUPPLY_DROPS && cfg.SUPPLY_DROPS.partsCapPerRun) || 12,
    integer: true
  });
  const supplyCratesCollected = finiteNumber(run.supplyCratesCollected, 0, { min: 0, integer: true });
  const supplyRewards = run.supplyRewards && typeof run.supplyRewards === "object" && !Array.isArray(run.supplyRewards)
    ? deepClone(run.supplyRewards)
    : {};
  const scavengeBreakdown = scavengeGoodsBreakdownForRun(run, cfg);
  const eventStats = sanitizeEventStats(run.eventStats, cfg);
  const deathContext = sanitizeDeathContext(run.deathContext);
  const damageTakenBy = sanitizeCountMap(run.damageTakenBy);
  const variantKills = sanitizeCountMap(run.variantKills);
  const damageBySource = sanitizeCountMap(run.damageBySource);
  const damageTimeline = sanitizeCountMap(run.damageTimeline, { maxKeys: 120, maxValue: 1000000 });
  const recentDamageEvents = sanitizeDamageEvents(run.recentDamageEvents);
  const duration = finiteNumber(run.duration, 0, { min: 0, max: 36000 });
  const previousRun = sourceMeta.lastRun && typeof sourceMeta.lastRun === "object"
    ? {
        wavesCleared: finiteNumber(sourceMeta.lastRun.wavesCleared, 0, { min: 0, integer: true }),
        kills: finiteNumber(sourceMeta.lastRun.kills, 0, { min: 0, integer: true }),
        score: finiteNumber(sourceMeta.lastRun.score, 0, { min: 0, integer: true }),
        earnedParts: finiteNumber(sourceMeta.lastRun.earnedParts, 0, { min: 0, integer: true })
      }
    : null;
  const normalizedRun = {
    wavesCleared,
    kills,
    bossesDefeated,
    score,
    vehicleId,
    difficultyId,
    eventRewardMul,
    eventParts,
    supplyParts,
    supplyCratesCollected
  };
  const partsBreakdown = rewardPartsBreakdownForRun(normalizedRun, cfg);
  const parts = partsBreakdown.total;

  const providedBlueprint = opts.blueprintResult && opts.blueprintResult.meta ? opts.blueprintResult : null;
  const blueprintResult = providedBlueprint
    ? {
        meta: migrateMeta(providedBlueprint.meta, { config: cfg }),
        drops: deepClone(providedBlueprint.drops || {}),
        unlocked: Array.isArray(providedBlueprint.unlocked) ? providedBlueprint.unlocked.slice() : []
      }
    : applyBlueprintDrops(meta, bossesDefeated, opts.rng, cfg);
  meta.blueprints = blueprintResult.meta.blueprints;
  meta.unlockedVehicles = blueprintResult.meta.unlockedVehicles;
  meta.bossBlueprintPity = blueprintResult.meta.bossBlueprintPity;
  meta.blueprintWishlist = blueprintResult.meta.blueprintWishlist;

  meta.totalRuns += 1;
  meta.totalKills += kills;
  meta.totalBossKills += bossesDefeated;
  meta.eventStats = mergeEventStats(meta.eventStats, eventStats, cfg);
  meta.questStats = applyQuestRunStats(meta, { vehicleId, wavesCleared, bossesDefeated, eventStats, supplyCratesCollected, variantKills }, cfg).questStats;
  meta.bestWave = Math.max(meta.bestWave, wavesCleared);
  meta.bestScore = Math.max(meta.bestScore, score);
  meta.selectedVehicle = vehicleId;
  meta.updatedAt = at;
  if (!meta.createdAt) meta.createdAt = at;

  const hasProgress = wavesCleared > 0 || kills > 0 || bossesDefeated > 0 || score > 0;
  const currentBest = meta.bestByVehicle[vehicleId];
  const isBest = hasProgress && (!currentBest || score > currentBest.score || wavesCleared > currentBest.wave);
  if (isBest) {
    meta.bestByVehicle[vehicleId] = {
      wave: wavesCleared,
      score,
      kills,
      bosses: bossesDefeated,
      at
    };
  }

  const achievementResult = applyAchievementRewards(meta, cfg);
  meta.achievements = achievementResult.meta.achievements;
  const achievementParts = achievementResult.parts;
  const totalParts = parts + achievementParts;
  meta.parts += totalParts;
  meta.trailerGoods += scavengeBreakdown.total;

  meta.lastRun = {
    vehicleId,
    wavesCleared,
    kills,
    bossesDefeated,
    score,
    damageDealt,
    eventRewardMul,
    eventParts,
    eventStats,
    supplyParts,
    supplyCratesCollected,
    supplyRewards,
    scavengeGoods: scavengeBreakdown.killGoods,
    scavengeBreakdown,
    deathContext,
    damageTakenBy,
    variantKills,
    damageBySource,
    damageTimeline,
    recentDamageEvents,
    duration,
    previousRun,
    earnedParts: totalParts,
    runParts: parts,
    achievementParts,
    partsBreakdown,
    blueprintDrops: deepClone(blueprintResult.drops),
    unlockedVehicles: blueprintResult.unlocked.slice(),
    unlockedAchievements: achievementResult.achievements.slice(),
    at
  };

  return {
    meta,
    reward: {
      parts,
      totalParts,
      achievementParts,
      partsBreakdown,
      blueprints: deepClone(blueprintResult.drops),
      unlockedVehicles: blueprintResult.unlocked.slice(),
      achievements: achievementResult.achievements,
      scavengeGoods: scavengeBreakdown.total,
      scavengeBreakdown,
      isBest
    }
  };
}

function getUpgradeCost(meta, vehicleId, track, config) {
  const cfg = getConfig(config);
  const upgrade = getUpgradeDefinition(vehicleId, track, cfg);
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
  if (!next.vehicleLevels[vehicleId]) next.vehicleLevels[vehicleId] = sanitizeVehicleLevels(null, vehicleId, cfg);
  if (!Number.isFinite(next.vehicleLevels[vehicleId][track])) next.vehicleLevels[vehicleId][track] = 0;
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
  resolveEnemyRangedAttack,
  resolveEnemyIncomingDamage,
  enemyPoolForWave,
  variantChanceForWave,
  applyEnemyVariantToSpawn,
  chooseEnvironmentEvent,
  rollSupplyDrop,
  chooseSupplyReward,
  stepSupplyDropMotion,
  applySupplyRewardById,
  rollScavengeDrop,
  scavengeGoodsBreakdownForRun,
  sanitizeTrailerRoom,
  calculateTrailerBonuses,
  getTrailerRoomState,
  buyTrailerFurniture,
  equipTrailerFurniture,
  selectAimAssistTarget,
  aimAssistStrength,
  recommendUpgradeForRun,
  createSafeRecoveryMeta,
  encodeSaveMeta,
  decodeSaveMeta,
  ensureQuestState,
  getQuestBoard,
  claimQuestReward,
  generateWave,
  defaultRunMods,
  blueprintRequiredForVehicle,
  isVehicleUnlocked,
  firstLockedBlueprintVehicle,
  normalizeBlueprintWishlist,
  applyBlueprintDrops,
  getUpgradeDefinition,
  getVehicleLevels,
  getVehicleStats,
  calculateShotStats,
  applyGateEffect,
  damageEnemy,
  applyVehicleDamage,
  rewardPartsBreakdownForRun,
  rewardPartsForRun,
  getAchievementProgress,
  getEventCodexProgress,
  sanitizeEventStats,
  mergeEventStats,
  migrateMeta,
  settleRunRewards,
  getUpgradeCost,
  buyUpgrade
};

if (typeof window !== "undefined") window.DSRules = DSRules;
if (typeof module !== "undefined" && module.exports) module.exports = DSRules;
