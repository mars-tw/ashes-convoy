"use strict";

(function attachGame(root) {
  const config = root.DSConfig;
  const rules = root.DSRules;
  const renderer = root.DSSpriteRenderer;

  if (!config || !rules || !renderer) {
    throw new Error("AshesGame requires sprites, sprite-renderer, config and rules to be loaded first.");
  }

  const W = config.LOGIC.width;
  const H = config.LOGIC.height;
  const DISPLAY_W = config.LOGIC.displayWidth;
  const DISPLAY_H = config.LOGIC.displayHeight;
  const MAX_STEP = 1 / 30;

  let canvas = null;
  let displayCtx = null;
  let worldCanvas = null;
  let ctx = null;
  let callbacks = {};
  let meta = rules.migrateMeta(null, { config });
  let state = null;
  let idleTime = 0;
  let rafStarted = false;
  let lastFrameMs = null;
  let boundInput = false;
  let renderDebug = {
    messagesDrawn: 0,
    gateLabelsDrawn: 0,
    tutorialDrawn: false,
    enemyRasterDrawn: 0,
    enemyFallbackDrawn: 0,
    enemyShadowDrawn: 0,
    enemyImageStatus: {}
  };
  const vehicleImages = {};
  const enemyImages = {};
  const enemySpriteOptions = { flipX: false, alpha: 1 };

  function emitState() {
    if (callbacks.onState) callbacks.onState(getState());
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function normalize(dx, dy) {
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  function baseProjectileIndexSet(count, baseProjectiles) {
    return new Set(
      Array.from({ length: count }, (_, index) => ({
        index,
        distance: Math.abs(index - (count - 1) / 2)
      }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
        .slice(0, Math.min(count, baseProjectiles))
        .map((item) => item.index)
    );
  }

  function nextId(prefix) {
    state.nextEntityId += 1;
    return `${prefix}_${state.nextEntityId}`;
  }

  function createWorldCanvas() {
    const buffer = root.document.createElement("canvas");
    buffer.width = W;
    buffer.height = H;
    return buffer;
  }

  function defaultVehicleId() {
    return config.META_DEFAULT && config.VEHICLES[config.META_DEFAULT.selectedVehicle]
      ? config.META_DEFAULT.selectedVehicle
      : Object.keys(config.VEHICLES)[0];
  }

  function getVehicleConfig(vehicleId) {
    return config.VEHICLES[vehicleId] || config.VEHICLES[defaultVehicleId()];
  }

  function preloadVehicleImages() {
    if (typeof root.Image !== "function") return;
    Object.keys(config.VEHICLES).forEach((vehicleId) => {
      const vehicle = config.VEHICLES[vehicleId];
      if (!vehicle.spriteImage || vehicleImages[vehicleId]) return;
      const record = { image: new root.Image(), status: "loading" };
      record.image.onload = () => {
        record.status = "loaded";
        draw();
      };
      record.image.onerror = () => {
        record.status = "failed";
        draw();
      };
      record.image.decoding = "async";
      record.image.src = vehicle.spriteImage;
      vehicleImages[vehicleId] = record;
    });
  }

  function vehicleImageStatus(vehicleId) {
    const record = vehicleImages[vehicleId];
    if (!record) return "none";
    if (record.status === "loaded" && record.image.complete && record.image.naturalWidth > 0) return "loaded";
    return record.status;
  }

  function preloadEnemyImages() {
    if (typeof root.Image !== "function") return;
    Object.keys(config.ENEMIES).forEach((enemyId) => {
      const enemy = config.ENEMIES[enemyId];
      if (!enemy.spriteImage || enemyImages[enemyId]) return;
      const record = { image: new root.Image(), status: "loading" };
      record.image.onload = () => {
        record.status = "loaded";
        draw();
      };
      record.image.onerror = () => {
        record.status = "failed";
        draw();
      };
      record.image.decoding = "async";
      record.image.src = enemy.spriteImage;
      enemyImages[enemyId] = record;
    });
  }

  function enemyImageStatus(enemyId) {
    const record = enemyImages[enemyId];
    if (!record) return "none";
    if (record.status === "loaded" && record.image.complete && record.image.naturalWidth > 0) return "loaded";
    return record.status;
  }

  function addEffect(effect) {
    state.effects.push(effect);
    if (state.effects.length > config.PERFORMANCE.maxEffects) {
      state.effects.splice(0, state.effects.length - config.PERFORMANCE.maxEffects);
    }
  }

  function addFloatingText(text, x, y, options) {
    if (meta.settings && meta.settings.reducedFlash) return;
    const opts = options || {};
    addEffect({
      id: nextId("text"),
      kind: "text",
      text,
      x,
      y,
      vy: Number.isFinite(opts.vy) ? opts.vy : -18,
      color: opts.color || "#f4ead8",
      size: opts.size || 8,
      ttl: opts.ttl || 0.55,
      age: 0,
      alpha: 1
    });
  }

  function pushEventBanner(title, body, options) {
    if (!state) return;
    const opts = options || {};
    state.eventBanner = {
      title,
      body: body || "",
      kind: opts.kind || "info",
      time: state.time,
      ttl: Number.isFinite(opts.ttl) ? opts.ttl : 1.8
    };
  }

  function pulseShake(amount, duration) {
    if (meta.settings && meta.settings.reducedFlash) return;
    state.shakeAmp = Math.max(state.shakeAmp || 0, amount);
    state.shakeUntil = Math.max(state.shakeUntil || 0, state.time + duration);
  }

  function publicEntity(entity) {
    const copy = {};
    Object.keys(entity).forEach((key) => {
      if (key !== "hitFlash" && key !== "phaseTriggered") copy[key] = rules.deepClone(entity[key]);
    });
    return copy;
  }

  function getState() {
    if (!state) {
      return {
        mode: "garage",
        ready: true,
        time: idleTime,
        selectedVehicle: meta.selectedVehicle,
        meta: rules.deepClone(meta)
      };
    }
    return {
      mode: state.mode,
      seed: state.seed,
      time: state.time,
      paused: state.paused,
      over: state.over,
      wave: state.wave,
      waveElapsed: state.waveElapsed,
      difficultyId: state.difficultyId,
      vehicleId: state.vehicleId,
      vehicle: rules.deepClone(state.vehicle),
      runMods: rules.deepClone(state.runMods),
      input: rules.deepClone(state.input),
      eventBanner: state.eventBanner ? rules.deepClone(state.eventBanner) : null,
      lastGateChoice: state.lastGateChoice ? rules.deepClone(state.lastGateChoice) : null,
      enemies: state.enemies.map(publicEntity),
      hazards: state.hazards.map(publicEntity),
      projectiles: state.projectiles.map(publicEntity),
      gates: state.gates.map(publicEntity),
      effects: state.effects.map(publicEntity),
      stats: rules.deepClone(state.stats),
      wavePlan: state.wavePlan
        ? {
            wave: state.wavePlan.wave,
            duration: state.wavePlan.duration,
            boss: state.wavePlan.boss,
            environmentEvent: state.wavePlan.environmentEvent ? rules.deepClone(state.wavePlan.environmentEvent) : null,
            remainingSpawns: Math.max(0, state.wavePlan.spawns.length - state.spawnIndex)
          }
        : null,
      meta: rules.deepClone(meta)
    };
  }

  function updatePartsPreview() {
    if (!state) return;
    state.stats.partsPreview = rules.rewardPartsForRun(
      {
        wavesCleared: state.stats.wavesCleared,
        kills: state.stats.kills,
        bossesDefeated: state.stats.bossesDefeated,
        eventRewardMul: state.stats.eventRewardMul,
        eventParts: state.stats.eventParts,
        difficultyId: state.difficultyId
      },
      config
    );
  }

  function makeWavePlan(wave) {
    return rules.generateWave({
      wave,
      vehicleId: state.vehicleId,
      rng: state.rng,
      config
    });
  }

  function mergeBlueprintDrops(target, source) {
    Object.keys(source || {}).forEach((vehicleId) => {
      target[vehicleId] = (target[vehicleId] || 0) + source[vehicleId];
    });
  }

  function addBlueprintDropNotice(drops, sourceX, sourceY) {
    Object.keys(drops || {}).forEach((vehicleId) => {
      const amount = drops[vehicleId];
      if (!amount) return;
      const required = rules.blueprintRequiredForVehicle(vehicleId, config);
      const count =
        (state.blueprintPreviewMeta && state.blueprintPreviewMeta.blueprints && state.blueprintPreviewMeta.blueprints[vehicleId]) ||
        0;
      const vehicle = config.VEHICLES[vehicleId];
      const body = `${vehicle.name} ${count}/${required}`;
      const title = `藍圖碎片 +${amount}`;
      state.messages.push({ text: `${title} (${body})`, time: state.time, ttl: 2.4 });
      pushEventBanner(title, body, { kind: "blueprint", ttl: 2.2 });
      addEffect({
        id: nextId("effect"),
        kind: "blueprint_drop",
        text: "+1",
        x: sourceX,
        y: sourceY,
        startX: sourceX,
        startY: sourceY,
        targetX: W - 22,
        targetY: 28,
        color: "#5ed4cb",
        ttl: 1.05,
        age: 0,
        alpha: 1
      });
    });
  }

  function resolveBossBlueprintDrop(enemy) {
    if (!state.blueprintPreviewMeta) state.blueprintPreviewMeta = rules.deepClone(meta);
    const result = rules.applyBlueprintDrops(state.blueprintPreviewMeta, 1, state.rng, config);
    state.blueprintPreviewMeta = result.meta;
    mergeBlueprintDrops(state.blueprintDrops, result.drops);
    result.unlocked.forEach((vehicleId) => {
      if (!state.blueprintUnlocks.includes(vehicleId)) state.blueprintUnlocks.push(vehicleId);
    });
    state.blueprintBossesResolved += 1;
    if (Object.keys(result.drops).length) addBlueprintDropNotice(result.drops, enemy.x, enemy.y);
  }

  function spawnMeteorHazards(event) {
    const count = rules.finiteNumber(event.hazardCount, 3, { min: 1, max: 6, integer: true });
    const hp = rules.finiteNumber(event.hazardHp, 20, { min: 4, integer: true });
    const parts = rules.finiteNumber(event.hazardParts, 2, { min: 0, max: 6, integer: true });
    for (let i = 0; i < count; i += 1) {
      const lane = (i + 1) / (count + 1);
      state.hazards.push({
        id: nextId("hazard"),
        kind: "meteor",
        x: config.LOGIC.roadLeft + (config.LOGIC.roadRight - config.LOGIC.roadLeft) * lane + (state.rng() - 0.5) * 14,
        y: -42 - i * 62,
        vx: -18 + state.rng() * 36,
        vy: 62 + state.rng() * 22,
        hp,
        maxHp: hp,
        radius: 13,
        parts,
        rotation: state.rng() * Math.PI * 2,
        spin: -1.8 + state.rng() * 3.6,
        dead: false
      });
    }
  }

  function activateWaveEnvironmentEvent() {
    if (!state || !state.wavePlan || !state.wavePlan.environmentEvent) return;
    if (state.activeEnvironmentEventWave === state.wave) return;
    const event = state.wavePlan.environmentEvent;
    state.activeEnvironmentEventWave = state.wave;
    if (!state.stats.environmentEvents.includes(event.id)) state.stats.environmentEvents.push(event.id);
    if (event.rewardMulAdd) {
      state.stats.eventRewardMul = Math.min(2, state.stats.eventRewardMul + event.rewardMulAdd);
    }
    if (event.id === "meteor_shower") spawnMeteorHazards(event);
    pushEventBanner("環境事件", `${event.label}：${event.description}`, { kind: "event", ttl: 2.4 });
  }

  function makeInitialState(vehicleId, nextMeta, seed) {
    const safeMeta = rules.migrateMeta(nextMeta || meta, { config });
    const requestedVehicle = config.VEHICLES[vehicleId] ? vehicleId : safeMeta.selectedVehicle;
    const selectedVehicle = rules.isVehicleUnlocked(safeMeta, requestedVehicle, config) ? requestedVehicle : safeMeta.selectedVehicle;
    const vehicleConfig = getVehicleConfig(selectedVehicle);
    const vehicleStats = rules.getVehicleStats(selectedVehicle, safeMeta, config);
    const rng = rules.createSeededRng(seed || `${selectedVehicle}-${safeMeta.totalRuns + 1}`);

    const initial = {
      mode: "playing",
      seed: seed || `${selectedVehicle}-${safeMeta.totalRuns + 1}`,
      rng,
      time: 0,
      paused: false,
      over: false,
      wave: 1,
      waveElapsed: 0,
      spawnIndex: 0,
      gateIndex: 0,
      nextEntityId: 0,
      difficultyId: "normal",
      vehicleId: selectedVehicle,
      vehicle: {
        hp: vehicleStats.maxHp,
        maxHp: vehicleStats.maxHp,
        shield: 0,
        armor: vehicleStats.armor,
        damageTakenMul: vehicleStats.damageTakenMul,
        radius: vehicleConfig.radius,
        x: W * 0.5,
        y: config.LOGIC.vehicleY,
        followX: W * 0.5,
        aimX: W * 0.5,
        aimY: 300,
        weaponCooldown: 0,
        recentHitUntil: 0
      },
      runMods: rules.defaultRunMods(),
      enemies: [],
      hazards: [],
      projectiles: [],
      gates: [],
      effects: [],
      stats: {
        kills: 0,
        bossesDefeated: 0,
        damageDealt: 0,
        gatesTaken: 0,
        score: 0,
        wavesCleared: 0,
        eventRewardMul: 1,
        eventParts: 0,
        environmentEvents: [],
        partsPreview: config.ECONOMY.minRunParts
      },
      blueprintPreviewMeta: rules.deepClone(safeMeta),
      blueprintDrops: {},
      blueprintUnlocks: [],
      blueprintBossesResolved: 0,
      input: {
        dragging: false,
        lastPointer: null
      },
      scroll: 0,
      shakeAmp: 0,
      shakeUntil: 0,
      eventBanner: null,
      lastGateChoice: null,
      messages: []
    };

    state = initial;
    state.wavePlan = makeWavePlan(1);
    activateWaveEnvironmentEvent();
    state.messages.push({ text: "拖曳瞄準", time: 0, ttl: 2 });
    return state;
  }

  function setMeta(nextMeta) {
    meta = rules.migrateMeta(nextMeta || meta, { config });
    emitState();
  }

  function startRun(vehicleId, nextMeta, seed) {
    if (nextMeta) setMeta(nextMeta);
    makeInitialState(vehicleId || meta.selectedVehicle, meta, seed);
    draw();
    emitState();
    return getState();
  }

  function pause() {
    if (!state || state.over) return;
    state.paused = true;
    state.mode = "paused";
    emitState();
  }

  function resume() {
    if (!state || state.over) return;
    state.paused = false;
    state.mode = "playing";
    emitState();
  }

  function togglePause() {
    if (!state || state.over) return;
    if (state.paused) resume();
    else pause();
  }

  function spawnEnemy(enemyId, overrides) {
    if (!state) startRun(meta.selectedVehicle);
    const enemyConfig = config.ENEMIES[enemyId];
    if (!enemyConfig) throw new Error(`Unknown enemy "${enemyId}".`);
    const scaled = rules.scaledEnemyStats(enemyId, state.wave, config);
    const opts = overrides || {};
    const enemy = {
      id: opts.id || nextId("enemy"),
      enemyId,
      name: opts.variantLabel ? `${enemyConfig.name} ${opts.variantLabel}` : enemyConfig.name,
      sprite: enemyConfig.sprite,
      anim: enemyConfig.boss ? "walk" : "walk",
      x: Number.isFinite(opts.x) ? opts.x : config.LOGIC.roadLeft + state.rng() * (config.LOGIC.roadRight - config.LOGIC.roadLeft),
      y: Number.isFinite(opts.y) ? opts.y : -40,
      vx: 0,
      vy: scaled.speed,
      laneOffset: Number.isFinite(opts.laneOffset) ? opts.laneOffset : 0,
      eventDriftAmp: Number.isFinite(opts.eventDriftAmp) ? opts.eventDriftAmp : 0,
      swayPhase: Number.isFinite(opts.swayPhase) ? opts.swayPhase : state.rng() * Math.PI * 2,
      swayAmp: Number.isFinite(opts.swayAmp) ? opts.swayAmp : 4 + state.rng() * 3,
      swayFreq: Number.isFinite(opts.swayFreq) ? opts.swayFreq : 1.1 + state.rng() * 0.7,
      animPhase: Number.isFinite(opts.animPhase) ? opts.animPhase : state.rng() * Math.PI * 2,
      animFreq: Number.isFinite(opts.animFreq)
        ? opts.animFreq
        : enemyConfig.boss
          ? 1.35
          : enemyId === "runner"
            ? 4.2
            : enemyId === "bloater"
              ? 1.85
              : 2.75,
      hp: Number.isFinite(opts.hp) ? opts.hp : scaled.hp,
      maxHp: Number.isFinite(opts.hp) ? opts.hp : scaled.hp,
      speed: Number.isFinite(opts.speed) ? opts.speed : scaled.speed,
      contactDamage: Number.isFinite(opts.contactDamage) ? opts.contactDamage : enemyConfig.contactDamage,
      radius: Number.isFinite(opts.radius) ? opts.radius : enemyConfig.radius,
      scale: Number.isFinite(opts.scale) ? opts.scale : enemyConfig.scale,
      score: enemyConfig.score,
      variantId: opts.variantId || null,
      variantLabel: opts.variantLabel || "",
      tint: opts.tint || "",
      filter: opts.filter || "",
      boss: enemyConfig.boss === true,
      dead: false,
      hitCooldown: 0,
      phaseTriggered: {},
      hitFlash: 0
    };
    if (state.enemies.length >= config.PERFORMANCE.maxEnemies) return null;
    state.enemies.push(enemy);
    if (enemy.boss) {
      pushEventBanner("Boss 來襲", enemyConfig.name, { kind: "boss", ttl: 2.4 });
      state.messages.push({ text: `${enemyConfig.name} 逼近`, time: state.time, ttl: 2.1 });
    }
    if (!opts.silent) emitState();
    return publicEntity(enemy);
  }

  function spawnGate(gateId, overrides) {
    if (!state) startRun(meta.selectedVehicle);
    const gateConfig = config.GATES[gateId];
    if (!gateConfig) throw new Error(`Unknown gate "${gateId}".`);
    const opts = overrides || {};
    const pairId = opts.pairId || nextId("gatepair");
    const gate = {
      id: opts.id || nextId("gate"),
      pairId,
      gateId,
      label: gateConfig.label,
      sprite: gateConfig.sprite,
      x: Number.isFinite(opts.x) ? opts.x : W * 0.5,
      y: Number.isFinite(opts.y) ? opts.y : -42,
      hp: Number.isFinite(opts.hp) ? opts.hp : Math.round(gateConfig.coreHp * Math.pow(config.WAVE.gateHpGrowth, state.wave - 1)),
      maxHp: Number.isFinite(opts.hp) ? opts.hp : Math.round(gateConfig.coreHp * Math.pow(config.WAVE.gateHpGrowth, state.wave - 1)),
      radius: Number.isFinite(opts.radius) ? opts.radius : 29,
      touchRadius: Number.isFinite(opts.touchRadius) ? opts.touchRadius : 31,
      scale: Number.isFinite(opts.scale) ? opts.scale : 1.75,
      broken: false
    };
    state.gates.push(gate);
    if (!opts.silent) emitState();
    return publicEntity(gate);
  }

  function spawnGatePair(options) {
    const pairId = nextId("gatepair");
    const ids = options && options.length ? options : ["damage_plus", "repair"];
    const gateHalf = 32 * 1.75 * 0.5;
    const left = spawnGate(ids[0], { pairId, x: config.LOGIC.roadLeft + gateHalf + 1, y: 104, silent: true });
    const right = spawnGate(ids[1], { pairId, x: config.LOGIC.roadRight - gateHalf - 1, y: 104, silent: true });
    emitState();
    return [left, right];
  }

  function grantGate(gateId) {
    if (!state) startRun(meta.selectedVehicle);
    const result = rules.applyGateEffect({
      gateId,
      runMods: state.runMods,
      vehicle: state.vehicle,
      vehicleId: state.vehicleId,
      vehicleLevels: rules.getVehicleLevels(meta, state.vehicleId, config),
      config
    });
    state.runMods = result.runMods;
    state.vehicle = result.vehicle || state.vehicle;
    state.stats.gatesTaken += 1;
    state.lastGateChoice = {
      gateId,
      label: config.GATES[gateId].label,
      time: state.time,
      ttl: 1.8
    };
    state.messages.push({ text: `已選：${config.GATES[gateId].label}`, time: state.time, ttl: 1.7 });
    pushEventBanner("增益已選", config.GATES[gateId].label, { kind: "gate", ttl: 1.6 });
    addFloatingText(config.GATES[gateId].shortLabel, state.vehicle.x, state.vehicle.y - 54, {
      color: "#f0b64a",
      size: 9,
      ttl: 0.75,
      vy: -14
    });
    emitState();
    return rules.deepClone({ runMods: state.runMods, vehicle: state.vehicle });
  }

  function triggerGate(gate) {
    if (!gate || gate.broken) return;
    gate.broken = true;
    grantGate(gate.gateId);
    addEffect({
      id: nextId("effect"),
      sprite: "effect_shield",
      anim: "pulse",
      x: gate.x,
      y: gate.y,
      scale: 1.25,
      ttl: 0.45,
      age: 0,
      alpha: 0.85
    });
    state.gates = state.gates.filter((other) => other.pairId !== gate.pairId);
  }

  function chooseGate(gateId) {
    if (!state || state.over || state.paused) return getState();
    const gate = state.gates.find((item) => item.id === gateId || item.gateId === gateId);
    if (gate) triggerGate(gate);
    draw();
    emitState();
    return getState();
  }

  function damageVehicle(amount) {
    if (!state) startRun(meta.selectedVehicle);
    const result = rules.applyVehicleDamage(state.vehicle, amount, state.vehicle.armor);
    state.vehicle = result.vehicle;
    state.vehicle.recentHitUntil = state.time + 0.28;
    const passive = getVehicleConfig(state.vehicleId).passive;
    if (passive && passive.id === "revenge_fire") state.vehicle.recentHitUntil = state.time + passive.duration;
    pulseShake(1.2, 0.18);
    if (state.vehicle.hp <= 0) finishRun();
    emitState();
    return result;
  }

  function killEnemy(enemy, cause) {
    if (!enemy || enemy.dead) return;
    const enemyConfig = config.ENEMIES[enemy.enemyId];
    enemy.dead = true;
    state.stats.kills += 1;
    state.stats.score += enemy.score + state.wave * 3;
    addFloatingText("+1", enemy.x, enemy.y - enemy.radius, { color: "#f0b64a", size: 8, ttl: 0.5, vy: -14 });
    pulseShake(enemy.boss ? 3 : 1.5, enemy.boss ? 0.35 : 0.16);
    if (enemy.boss) {
      state.stats.bossesDefeated += 1;
      state.stats.score += 900;
      resolveBossBlueprintDrop(enemy);
      state.messages.push({ text: "Boss 已擊破", time: state.time, ttl: 1.8 });
    }
    if (cause !== "burst") {
      addEffect({
        id: nextId("effect"),
        kind: "enemy_corpse",
        enemyId: enemy.enemyId,
        sprite: enemy.sprite,
        anim: "death",
        x: enemy.x,
        y: enemy.y,
        radius: enemy.radius,
        visualWidth: enemyVisualWidth(enemy, enemyConfig),
        boss: enemy.boss,
        tint: enemy.tint || "",
        filter: enemy.filter || "",
        rotation: Math.sin((enemy.animPhase || 0) + state.time) * (enemy.boss ? 0.08 : 0.18),
        scale: enemy.scale,
        ttl: config.PERFORMANCE.corpseFadeSeconds,
        age: 0,
        alpha: 0.88
      });
      addEffect({
        id: nextId("effect"),
        sprite: enemy.boss ? "effect_explosion_small" : "effect_hit",
        anim: "burst",
        x: enemy.x,
        y: enemy.y,
        scale: enemy.boss ? 2.1 : 1.25,
        ttl: enemy.boss ? 0.65 : 0.35,
        age: 0,
        alpha: 0.95
      });
    }
    if (enemyConfig && enemyConfig.deathBurst) {
      addEffect({
        id: nextId("effect"),
        sprite: "effect_explosion_small",
        anim: "burst",
        x: enemy.x,
        y: enemy.y,
        scale: 1.5,
        ttl: 0.45,
        age: 0,
        alpha: 0.9
      });
      state.enemies.forEach((other) => {
        if (other.id === enemy.id || other.dead) return;
        if (distance(enemy, other) <= enemyConfig.deathBurst.radius) {
          other.hp -= enemyConfig.deathBurst.damage;
          other.hitFlash = 0.12;
          if (other.hp <= 0) killEnemy(other, "burst");
        }
      });
    }
    updatePartsPreview();
  }

  function killAllEnemies() {
    if (!state) return getState();
    state.enemies.forEach((enemy) => killEnemy(enemy, "test"));
    state.enemies = [];
    updatePartsPreview();
    emitState();
    return getState();
  }

  function finishRun(overrides) {
    if (!state) startRun(meta.selectedVehicle);
    if (state.over && !overrides) return getState();
    const run = Object.assign(
      {
        vehicleId: state.vehicleId,
        wavesCleared: state.stats.wavesCleared,
        kills: state.stats.kills,
        bossesDefeated: state.stats.bossesDefeated,
        score: state.stats.score,
        eventRewardMul: state.stats.eventRewardMul,
        eventParts: state.stats.eventParts,
        difficultyId: state.difficultyId
      },
      overrides || {}
    );
    const blueprintResult =
      state.blueprintBossesResolved >= (run.bossesDefeated || 0) && state.blueprintPreviewMeta
        ? {
            meta: state.blueprintPreviewMeta,
            drops: state.blueprintDrops,
            unlocked: state.blueprintUnlocks
          }
        : null;
    const result = rules.settleRunRewards({
      meta,
      run,
      rng: state.rng,
      blueprintResult,
      now: callbacks.now || null,
      config
    });
    meta = result.meta;
    state.over = true;
    state.paused = true;
    state.mode = "settlement";
    state.vehicle.hp = Math.max(0, state.vehicle.hp);
    updatePartsPreview();
    if (callbacks.onRunEnd) callbacks.onRunEnd(rules.deepClone(result));
    emitState();
    return getState();
  }

  function pushWave(wave) {
    if (!state) startRun(meta.selectedVehicle);
    state.wave = rules.finiteNumber(wave, 1, { min: 1, integer: true });
    state.waveElapsed = 0;
    state.spawnIndex = 0;
    state.gateIndex = 0;
    state.wavePlan = makeWavePlan(state.wave);
    activateWaveEnvironmentEvent();
    emitState();
    return getState();
  }

  function fireProjectiles(dt) {
    const vehicle = state.vehicle;
    const vehicleConfig = getVehicleConfig(state.vehicleId);
    const shot = rules.calculateShotStats({
      vehicleId: state.vehicleId,
      meta,
      runMods: state.runMods,
      config
    });
    const idleMul = state.input.dragging ? 1 : 1.35;
    vehicle.weaponCooldown -= dt;
    if (vehicle.weaponCooldown > 0) return;

    const direction = normalize(vehicle.aimX - vehicle.x, Math.min(vehicle.aimY, vehicle.y - 60) - vehicle.y);
    const centerAngle = Math.atan2(direction.y, direction.x);
    const count = shot.projectiles;
    const fullDamageIndices = baseProjectileIndexSet(count, shot.baseProjectiles);
    const passiveDamageMul =
      vehicleConfig.passive &&
      vehicleConfig.passive.id === "revenge_fire" &&
      vehicle.recentHitUntil > state.time
        ? 1 + vehicleConfig.passive.damageMul
        : 1;
    const maxShotsThisFrame = 3;
    let shots = 0;

    while (vehicle.weaponCooldown <= 0 && shots < maxShotsThisFrame) {
      for (let i = 0; i < count; i += 1) {
        if (state.projectiles.length >= config.PERFORMANCE.maxProjectiles) break;
        const offsetIndex = i - (count - 1) / 2;
        const angle = centerAngle + offsetIndex * (0.11 + shot.spread);
        const vx = Math.cos(angle) * shot.projectileSpeed;
        const vy = Math.sin(angle) * shot.projectileSpeed;
        const bonusProjectile = !fullDamageIndices.has(i);
        state.projectiles.push({
          id: nextId("projectile"),
          sprite: shot.bulletSprite,
          x: vehicle.x + Math.cos(angle) * shot.muzzleOffset,
          y: vehicle.y + Math.sin(angle) * shot.muzzleOffset,
          vx,
          vy,
          damage: shot.damage * (bonusProjectile ? 0.55 : 1) * passiveDamageMul,
          bonusProjectile,
          vehicleId: state.vehicleId,
          pierce: shot.pierce,
          radius: shot.bulletSprite === "bullet_rocket" ? 9 : 6,
          rotation: angle,
          life: 1.45,
          splash: shot.splash,
          scale: shot.bulletSprite === "bullet_rocket" ? 1.1 : 1.05
        });
      }
      addEffect({
        id: nextId("effect"),
        sprite: "effect_muzzle",
        anim: "burst",
        x: vehicle.x + direction.x * shot.muzzleOffset,
        y: vehicle.y + direction.y * shot.muzzleOffset,
        scale: 1.05,
        ttl: 0.12,
        age: 0,
        alpha: 0.9
      });
      vehicle.weaponCooldown += shot.fireInterval * idleMul;
      shots += 1;
    }
  }

  function processWaveEvents() {
    const plan = state.wavePlan;
    let spawnedAny = false;
    while (state.spawnIndex < plan.spawns.length && plan.spawns[state.spawnIndex].time <= state.waveElapsed) {
      if (state.enemies.length >= config.PERFORMANCE.maxEnemies) break;
      const spawn = plan.spawns[state.spawnIndex];
      spawnEnemy(spawn.enemyId, Object.assign({}, spawn, { silent: true }));
      state.spawnIndex += 1;
      spawnedAny = true;
    }
    if (spawnedAny) emitState();
    while (state.gateIndex < plan.gates.length && plan.gates[state.gateIndex].time <= state.waveElapsed) {
      spawnGatePair(plan.gates[state.gateIndex].options);
      state.gateIndex += 1;
    }
  }

  function bossPhaseLabel(action) {
    if (action === "summon") return "召喚屍群";
    if (action === "charge") return "狂暴衝撞";
    return "變換階段";
  }

  function executeBossPhase(enemy, action) {
    if (action === "summon") {
      [-38, 0, 38].forEach((offset) => spawnEnemy("shambler", { x: enemy.x + offset, y: enemy.y + 30 }));
      enemy.anim = "attack";
    } else if (action === "charge") {
      enemy.anim = "rage";
      enemy.rageUntil = state.time + 2.2;
    }
    enemy.pendingPhase = null;
  }

  function updateEnemies(dt) {
    const vehicle = state.vehicle;
    state.enemies.forEach((enemy) => {
      if (enemy.dead) return;
      enemy.hitCooldown = Math.max(0, enemy.hitCooldown - dt);
      enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - dt);
      const targetY = enemy.boss && enemy.y < 180 ? 250 : vehicle.y - 14;
      const targetX = enemy.boss
        ? vehicle.x
        : rules.clamp(vehicle.x + enemy.laneOffset * 0.42, config.LOGIC.roadLeft + 8, config.LOGIC.roadRight - 8);
      const toTarget = normalize(targetX - enemy.x, targetY - enemy.y);
      const speedMul = enemy.boss && enemy.hp < enemy.maxHp * 0.33 ? 1.35 : 1;
      const sway = enemy.boss ? 0 : Math.sin(state.time * enemy.swayFreq + enemy.swayPhase) * enemy.swayAmp;
      const eventDrift = enemy.eventDriftAmp ? Math.sin(state.time * 1.7 + enemy.swayPhase) * enemy.eventDriftAmp : 0;
      enemy.vx = toTarget.x * enemy.speed * speedMul * 0.62 + sway + eventDrift;
      enemy.vy = Math.max(enemy.speed * 0.35, toTarget.y * enemy.speed * speedMul);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (!enemy.boss) enemy.x = rules.clamp(enemy.x, config.LOGIC.roadLeft + 5, config.LOGIC.roadRight - 5);

      if (enemy.boss) {
        const enemyConfig = config.ENEMIES[enemy.enemyId];
        if (!enemy.phaseTriggered) enemy.phaseTriggered = {};
        if (enemy.pendingPhase && state.time >= enemy.pendingPhase.executeAt) {
          executeBossPhase(enemy, enemy.pendingPhase.action);
        }
        if (enemy.telegraphUntil && state.time > enemy.telegraphUntil) {
          enemy.telegraphText = "";
          enemy.telegraphUntil = 0;
        }
        enemyConfig.phases.forEach((phase) => {
          if (enemy.hp <= enemy.maxHp * phase.hpPct && !enemy.phaseTriggered[phase.action] && !enemy.pendingPhase) {
            enemy.phaseTriggered[phase.action] = true;
            enemy.anim = "attack";
            enemy.pendingPhase = {
              action: phase.action,
              label: bossPhaseLabel(phase.action),
              executeAt: state.time + 0.95
            };
            enemy.telegraphText = bossPhaseLabel(phase.action);
            enemy.telegraphUntil = state.time + 1.15;
            pushEventBanner("Boss 前搖", `${enemyConfig.name}：${enemy.telegraphText}`, { kind: "boss", ttl: 1.4 });
          }
        });
      }

      if (distance(enemy, vehicle) <= enemy.radius + vehicle.radius) {
        if (enemy.boss) {
          if (enemy.hitCooldown <= 0) {
            damageVehicle(enemy.contactDamage);
            enemy.hitCooldown = 1.15;
          }
        } else {
          damageVehicle(enemy.contactDamage);
          enemy.dead = true;
          addEffect({
            id: nextId("effect"),
            sprite: "effect_hit",
            anim: "burst",
            x: enemy.x,
            y: enemy.y,
            scale: 1.1,
            ttl: 0.22,
            age: 0,
            alpha: 0.8
          });
        }
      }
    });
    state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.y < H + 52);
  }

  function damageSplash(projectile, target) {
    if (!projectile.splash) return;
    state.enemies.forEach((enemy) => {
      if (enemy.dead || enemy.id === target.id) return;
      const d = distance(enemy, target);
      if (d <= projectile.splash) {
        enemy.hp -= projectile.damage * (1 - d / projectile.splash) * 0.7;
        enemy.hitFlash = 0.12;
        if (enemy.hp <= 0) killEnemy(enemy, "splash");
      }
    });
    addEffect({
      id: nextId("effect"),
      sprite: "effect_explosion_small",
      anim: "burst",
      x: target.x,
      y: target.y,
      scale: 1.35,
      ttl: 0.4,
      age: 0,
      alpha: 0.9
    });
  }

  function destroyHazard(hazard) {
    if (!hazard || hazard.dead) return;
    hazard.dead = true;
    const earned = Math.min(
      hazard.parts || 0,
      Math.max(0, (config.ECONOMY.eventPartsCapPerRun || 12) - (state.stats.eventParts || 0))
    );
    state.stats.eventParts += earned;
    state.stats.score += earned * 18;
    if (earned > 0) addFloatingText(`+${earned}`, hazard.x, hazard.y - hazard.radius, { color: "#5ed4cb", size: 8, ttl: 0.62 });
    addEffect({
      id: nextId("effect"),
      sprite: "effect_explosion_small",
      anim: "burst",
      x: hazard.x,
      y: hazard.y,
      scale: 1.25,
      ttl: 0.35,
      age: 0,
      alpha: 0.9
    });
    updatePartsPreview();
  }

  function updateHazards(dt) {
    if (!state.hazards.length) return;
    state.hazards.forEach((hazard) => {
      if (hazard.dead) return;
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
      hazard.rotation += (hazard.spin || 0) * dt;
      if (distance(hazard, state.vehicle) <= hazard.radius + state.vehicle.radius) {
        damageVehicle(22);
        hazard.dead = true;
        addEffect({
          id: nextId("effect"),
          sprite: "effect_hit",
          anim: "burst",
          x: hazard.x,
          y: hazard.y,
          scale: 1.1,
          ttl: 0.24,
          age: 0,
          alpha: 0.86
        });
      }
    });
    state.hazards = state.hazards.filter((hazard) => !hazard.dead && hazard.y < H + 44 && hazard.x > -36 && hazard.x < W + 36);
  }

  function updateProjectiles(dt) {
    state.projectiles.forEach((projectile) => {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life -= dt;

      for (let i = 0; i < state.hazards.length; i += 1) {
        const hazard = state.hazards[i];
        if (hazard.dead) continue;
        if (distance(projectile, hazard) <= projectile.radius + hazard.radius) {
          hazard.hp -= projectile.damage;
          projectile.life = -1;
          addEffect({
            id: nextId("effect"),
            sprite: "effect_hit",
            anim: "burst",
            x: projectile.x,
            y: projectile.y,
            scale: 0.9,
            ttl: 0.18,
            age: 0,
            alpha: 0.82
          });
          if (hazard.hp <= 0) destroyHazard(hazard);
          return;
        }
      }

      for (let i = 0; i < state.gates.length; i += 1) {
        const gate = state.gates[i];
        if (gate.broken) continue;
        if (distance(projectile, gate) <= projectile.radius + gate.radius) {
          gate.hp -= projectile.damage;
          projectile.life = -1;
          addEffect({
            id: nextId("effect"),
            sprite: "effect_hit",
            anim: "burst",
            x: projectile.x,
            y: projectile.y,
            scale: 1,
            ttl: 0.2,
            age: 0,
            alpha: 0.85
          });
          if (gate.hp <= 0) triggerGate(gate);
          return;
        }
      }

      for (let i = 0; i < state.enemies.length; i += 1) {
        const enemy = state.enemies[i];
        if (enemy.dead) continue;
        if (distance(projectile, enemy) <= projectile.radius + enemy.radius) {
          let damage = projectile.damage;
          const projectileVehicle = getVehicleConfig(projectile.vehicleId);
          if (projectileVehicle.passive && projectileVehicle.passive.id === "armor_break_focus") {
            const passive = projectileVehicle.passive;
            const stacks = Math.min(passive.maxStacks, enemy.armorBreakStacks || 0);
            damage *= 1 + stacks * passive.armorBreakPerHit;
            enemy.armorBreakStacks = Math.min(passive.maxStacks, stacks + 1);
          }
          enemy.hp -= damage;
          enemy.hitFlash = 0.12;
          state.stats.damageDealt += damage;
          addFloatingText(Math.round(damage).toString(), enemy.x + 3, enemy.y - enemy.radius - 2, {
            color: projectileVehicle.environment === "space" ? "#5ed4cb" : "#f4ead8",
            size: 6,
            ttl: 0.42,
            vy: -12
          });
          addEffect({
            id: nextId("effect"),
            sprite: "effect_hit",
            anim: "burst",
            x: projectile.x,
            y: projectile.y,
            scale: 1,
            ttl: 0.18,
            age: 0,
            alpha: 0.85
          });
          if (enemy.hp <= 0) killEnemy(enemy, "projectile");
          damageSplash(projectile, enemy);
          if (projectile.pierce > 0) {
            projectile.pierce -= 1;
          } else {
            projectile.life = -1;
            return;
          }
        }
      }
    });

    state.projectiles = state.projectiles.filter((projectile) => {
      return projectile.life > 0 && projectile.x > -30 && projectile.x < W + 30 && projectile.y > -45 && projectile.y < H + 35;
    });
    state.hazards = state.hazards.filter((hazard) => !hazard.dead);
    state.enemies = state.enemies.filter((enemy) => !enemy.dead);
  }

  function updateGatesAndEffects(dt) {
    state.gates.forEach((gate) => {
      gate.y += config.WAVE.gateSpeed * dt;
    });
    state.gates = state.gates.filter((gate) => gate.y < H + 70 && !gate.broken);
    state.effects.forEach((effect) => {
      effect.age += dt;
      if (effect.kind === "text") effect.y += (effect.vy || 0) * dt;
      if (effect.kind === "blueprint_drop") {
        const t = Math.min(1, effect.age / Math.max(0.01, effect.ttl));
        const eased = 1 - Math.pow(1 - t, 3);
        effect.x = effect.startX + (effect.targetX - effect.startX) * eased;
        effect.y = effect.startY + (effect.targetY - effect.startY) * eased - Math.sin(t * Math.PI) * 24;
      }
      effect.alpha = Math.max(0, 1 - effect.age / effect.ttl);
    });
    state.effects = state.effects.filter((effect) => effect.age < effect.ttl);
    state.messages = state.messages.filter((message) => state.time - message.time <= message.ttl);
    if (state.eventBanner && state.time - state.eventBanner.time > state.eventBanner.ttl) state.eventBanner = null;
    if (state.lastGateChoice && state.time - state.lastGateChoice.time > state.lastGateChoice.ttl) state.lastGateChoice = null;
  }

  function completeWaveIfReady() {
    const plan = state.wavePlan;
    const spawnedAll = state.spawnIndex >= plan.spawns.length;
    const bossAlive = state.enemies.some((enemy) => enemy.boss);
    const enemiesCleared = state.enemies.length === 0;
    const timerExpired = state.waveElapsed >= plan.duration;
    const staleWave = state.waveElapsed > plan.duration + 8;
    if (spawnedAll && !bossAlive && (enemiesCleared || staleWave) && (timerExpired || enemiesCleared)) {
      state.stats.wavesCleared = Math.max(state.stats.wavesCleared, state.wave);
      state.wave += 1;
      state.waveElapsed = 0;
      state.spawnIndex = 0;
      state.gateIndex = 0;
      state.wavePlan = makeWavePlan(state.wave);
      activateWaveEnvironmentEvent();
      state.messages.push({ text: `第 ${state.wave} 波`, time: state.time, ttl: 1.4 });
      updatePartsPreview();
    }
  }

  function updateVehicleAim(dt) {
    const vehicleConfig = getVehicleConfig(state.vehicleId);
    const vehicle = state.vehicle;
    const half = vehicleConfig.visualHalfWidth || 24;
    if (!Number.isFinite(vehicle.followX)) vehicle.followX = vehicle.x;
    if (!state.input.dragging) {
      const followRate = Math.min(1, 0.018 * dt * 60);
      vehicle.followX += (vehicle.aimX - vehicle.followX) * followRate;
    }
    const targetX = rules.clamp(vehicle.followX, config.LOGIC.roadLeft + half, config.LOGIC.roadRight - half);
    vehicle.x += (targetX - vehicle.x) * Math.min(1, vehicleConfig.moveResponsiveness * 0.28 * dt * 60);
    vehicle.x = rules.clamp(vehicle.x, config.LOGIC.roadLeft + half, config.LOGIC.roadRight - half);
    vehicle.aimY = rules.clamp(vehicle.aimY, config.LOGIC.aimMinY, config.LOGIC.aimMaxY);
  }

  function update(dt) {
    if (!state || state.paused || state.over) return;
    state.time += dt;
    state.waveElapsed += dt;
    state.scroll = (state.scroll + 112 * dt) % 32;
    updateVehicleAim(dt);
    processWaveEvents();
    fireProjectiles(dt);
    updateHazards(dt);
    updateProjectiles(dt);
    updateEnemies(dt);
    updateGatesAndEffects(dt);
    completeWaveIfReady();
    updatePartsPreview();
    if (state.vehicle.hp <= 0) finishRun();
  }

  function step(deltaMs) {
    if (!state) startRun(meta.selectedVehicle);
    const total = Math.max(0, Math.min(30000, Number(deltaMs) || 0)) / 1000;
    let remaining = total;
    while (remaining > 0) {
      const dt = Math.min(MAX_STEP, remaining);
      update(dt);
      remaining -= dt;
      if (state.over) break;
    }
    draw();
    emitState();
    return getState();
  }

  function setAimFromPoint(point) {
    if (!state || state.over) return;
    state.vehicle.aimX = rules.clamp(point.x, 26, W - 26);
    state.vehicle.aimY = rules.clamp(point.y, config.LOGIC.aimMinY, state.vehicle.y - 40);
  }

  function gateAtPoint(point) {
    if (!state || !point) return null;
    return (
      state.gates.find((gate) => {
        if (gate.broken) return false;
        return distance(point, gate) <= (gate.touchRadius || gate.radius || 24);
      }) || null
    );
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H
    };
  }

  function bindInput() {
    if (boundInput || !canvas) return;
    boundInput = true;
    canvas.addEventListener("pointerdown", (event) => {
      if (!state || state.over || state.paused) return;
      const point = pointFromEvent(event);
      const gate = gateAtPoint(point);
      if (gate) {
        triggerGate(gate);
        draw();
        emitState();
        event.preventDefault();
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      state.input.dragging = true;
      state.input.lastPointer = event.pointerId;
      setAimFromPoint(point);
      event.preventDefault();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!state || !state.input.dragging || state.input.lastPointer !== event.pointerId) return;
      setAimFromPoint(pointFromEvent(event));
      event.preventDefault();
    });
    canvas.addEventListener("pointerup", (event) => {
      if (!state) return;
      if (state.input.lastPointer === event.pointerId) {
        setAimFromPoint(pointFromEvent(event));
        state.input.dragging = false;
        state.input.lastPointer = null;
      }
      event.preventDefault();
    });
    canvas.addEventListener("pointercancel", () => {
      if (state) {
        state.input.dragging = false;
        state.input.lastPointer = null;
      }
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        togglePause();
      } else if (event.key === "r" || event.key === "R") {
        startRun(meta.selectedVehicle);
      } else if (state && !state.paused && !state.over && event.key === "ArrowLeft") {
        state.vehicle.followX = rules.clamp((state.vehicle.followX || state.vehicle.x) - 18, 26, W - 26);
      } else if (state && !state.paused && !state.over && event.key === "ArrowRight") {
        state.vehicle.followX = rules.clamp((state.vehicle.followX || state.vehicle.x) + 18, 26, W - 26);
      } else if (state && !state.paused && !state.over && (event.key === "1" || event.key === "2")) {
        const index = Number(event.key) - 1;
        const gate = state.gates[index];
        if (gate) triggerGate(gate);
      }
    });
  }

  function drawSprite(name, anim, timeMs, x, y, scale, options) {
    renderer.drawSpriteAnim(ctx, name, anim, timeMs, x, y, scale, options || {});
  }

  function drawWorldText(text, x, y, options) {
    const opts = options || {};
    ctx.save();
    ctx.globalAlpha *= opts.alpha == null ? 1 : opts.alpha;
    ctx.font = `800 ${opts.size || 8}px system-ui, sans-serif`;
    ctx.textAlign = opts.align || "center";
    ctx.textBaseline = opts.baseline || "middle";
    ctx.lineWidth = opts.strokeWidth || 2;
    ctx.strokeStyle = opts.stroke || "rgba(0,0,0,0.78)";
    ctx.fillStyle = opts.color || "#f4ead8";
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawGateLabel(gate) {
    const gateConfig = config.GATES[gate.gateId];
    if (!gateConfig) return;
    const valueText =
      gate.gateId === "damage_plus"
        ? "+35%"
        : gate.gateId === "rate_plus"
          ? "+25%"
          : gate.gateId === "multishot_plus"
            ? "+1"
            : "維修";
    ctx.save();
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = "rgba(7, 9, 13, 0.72)";
    ctx.strokeStyle = gate.gateId === "repair" ? "rgba(135,210,125,0.82)" : "rgba(240,182,74,0.82)";
    ctx.lineWidth = 1;
    ctx.fillRect(gate.x - 25, gate.y - 33, 50, 30);
    ctx.strokeRect(gate.x - 25, gate.y - 33, 50, 30);
    ctx.restore();
    drawWorldText(gateConfig.shortLabel, gate.x, gate.y - 24, { size: 10, color: "#f4ead8" });
    drawWorldText(valueText, gate.x, gate.y - 11, { size: 12, color: gate.gateId === "repair" ? "#87d27d" : "#f0b64a" });
    drawWorldText("點選/射擊", gate.x, gate.y + 24, { size: 5, color: "#f4ead8", alpha: 0.72 });
    renderDebug.gateLabelsDrawn += 1;
  }

  function drawMessages() {
    if (!state) return;
    state.messages.forEach((message, index) => {
      const elapsed = state.time - message.time;
      const ttl = message.ttl || 1;
      const fade = Math.min(1, Math.max(0, Math.min(elapsed / 0.14, (ttl - elapsed) / 0.32)));
      if (fade <= 0) return;
      drawWorldText(message.text, W * 0.5, 74 + index * 13, {
        size: 13,
        alpha: fade,
        color: "#f0b64a",
        strokeWidth: 3
      });
      renderDebug.messagesDrawn += 1;
    });
  }

  function drawAimGuide() {
    if (!state || state.over) return;
    const alpha = state.time < 2 ? 0.72 : 0.32;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#f0b64a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(state.vehicle.x, state.vehicle.y - 18);
    ctx.lineTo(state.vehicle.aimX, state.vehicle.aimY);
    ctx.stroke();
    ctx.strokeStyle = "#f4ead8";
    ctx.beginPath();
    ctx.arc(state.vehicle.aimX, state.vehicle.aimY, 8, 0, Math.PI * 2);
    ctx.moveTo(state.vehicle.aimX - 12, state.vehicle.aimY);
    ctx.lineTo(state.vehicle.aimX + 12, state.vehicle.aimY);
    ctx.moveTo(state.vehicle.aimX, state.vehicle.aimY - 12);
    ctx.lineTo(state.vehicle.aimX, state.vehicle.aimY + 12);
    ctx.stroke();
    if (state.time < 2) {
      drawWorldText("拖曳瞄準", W * 0.5, 118, { size: 10, alpha: 0.92, color: "#f4ead8" });
      ctx.strokeStyle = "#f4ead8";
      ctx.beginPath();
      ctx.moveTo(W * 0.5, 142);
      ctx.lineTo(W * 0.68, 92);
      ctx.lineTo(W * 0.64, 98);
      ctx.moveTo(W * 0.68, 92);
      ctx.lineTo(W * 0.69, 101);
      ctx.stroke();
      renderDebug.tutorialDrawn = true;
    }
    ctx.restore();
  }

  function drawClipped(x, y, width, height, drawFn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  function currentEnvironment() {
    const vehicleId = state ? state.vehicleId : meta.selectedVehicle;
    return getVehicleConfig(vehicleId).environment || "land";
  }

  function drawBackground(timeMs) {
    const environment = currentEnvironment();
    renderDebug.environment = environment;
    if (environment === "air") {
      drawAirBackground(timeMs);
    } else if (environment === "sea") {
      drawSeaBackground(timeMs);
    } else if (environment === "space") {
      drawSpaceBackground(timeMs);
    } else {
      drawLandBackground(timeMs);
    }
  }

  function drawLandBackground(timeMs) {
    const scroll = state ? state.scroll : (idleTime * 42) % 32;
    const sideScroll = (scroll * 1.32) % 32;
    const farScroll = (scroll * 0.24) % 32;
    const roadWidth = config.LOGIC.roadRight - config.LOGIC.roadLeft;
    const landGradient = ctx.createLinearGradient(0, 0, 0, H);
    landGradient.addColorStop(0, "#544737");
    landGradient.addColorStop(0.52, "#8a735d");
    landGradient.addColorStop(1, "#3b332b");
    ctx.fillStyle = landGradient;
    ctx.fillRect(0, 0, W, H);

    for (let y = -32 + sideScroll; y < H + 32; y += 32) {
      for (let x = 16; x < W; x += 32) {
        if (x > config.LOGIC.roadLeft - 6 && x < config.LOGIC.roadRight + 6) continue;
        drawSprite("tile_wasteland", "idle", timeMs, x, y, 1, { origin: "center", alpha: 0.96 });
      }
    }

    const laneCount = 4;
    const laneWidth = roadWidth / laneCount;
    const roadTileScale = laneWidth / 32;
    const roadStep = 32 * roadTileScale;
    drawClipped(config.LOGIC.roadLeft, 0, roadWidth, H, () => {
      const roadShade = ctx.createLinearGradient(config.LOGIC.roadLeft, 0, config.LOGIC.roadRight, 0);
      roadShade.addColorStop(0, "rgba(0,0,0,0.34)");
      roadShade.addColorStop(0.5, "rgba(255,255,255,0.04)");
      roadShade.addColorStop(1, "rgba(0,0,0,0.32)");
      ctx.fillStyle = "#20262a";
      ctx.fillRect(config.LOGIC.roadLeft, 0, roadWidth, H);
      for (let y = -roadStep + (scroll % roadStep); y < H + roadStep; y += roadStep) {
        for (let lane = 0; lane < laneCount; lane += 1) {
          const x = config.LOGIC.roadLeft + laneWidth * (lane + 0.5);
          drawSprite("tile_road", "idle", timeMs, x, y, roadTileScale, { origin: "center" });
        }
      }
      ctx.fillStyle = roadShade;
      ctx.fillRect(config.LOGIC.roadLeft, 0, roadWidth, H);
      ctx.strokeStyle = "rgba(238, 210, 132, 0.48)";
      ctx.lineWidth = 1;
      [config.LOGIC.roadLeft + 4, config.LOGIC.roadRight - 4].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      });
      ctx.strokeStyle = "rgba(12, 14, 16, 0.55)";
      for (let y = -46 + (scroll * 1.15) % 46; y < H + 46; y += 46) {
        const x = config.LOGIC.roadLeft + 12 + ((y * 13) % Math.max(20, roadWidth - 24));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 8, y + 8);
        ctx.lineTo(x + 3, y + 19);
        ctx.lineTo(x + 16, y + 30);
        ctx.stroke();
      }
    });

    for (let y = -32 + sideScroll * 1.2; y < H + 32; y += 64) {
      drawSprite("tile_wasteland", "idle", timeMs, config.LOGIC.roadLeft - 18, y, 0.72, { origin: "center", alpha: 0.82 });
      drawSprite("tile_wasteland", "idle", timeMs, config.LOGIC.roadRight + 18, y + 16, 0.72, { origin: "center", alpha: 0.82 });
    }

    for (let x = -64; x < W + 80; x += 84) {
      drawSprite("bg_ruins_strip", "scroll", timeMs, x, 30 + farScroll * 0.15, 0.72, {
        origin: "top-left",
        alpha: 0.55
      });
    }

    drawClipped(0, 0, config.LOGIC.roadLeft - 8, H, () => {
      for (let y = 86 + farScroll; y < H; y += 118) {
        drawSprite("bg_ruins_strip", "scroll", timeMs, -18, y, 0.58, { origin: "top-left", alpha: 0.5 });
      }
    });
    drawClipped(config.LOGIC.roadRight + 8, 0, W - config.LOGIC.roadRight - 8, H, () => {
      for (let y = 72 + farScroll; y < H; y += 126) {
        drawSprite("bg_ruins_strip", "scroll", timeMs, config.LOGIC.roadRight + 8, y, 0.58, {
          origin: "top-left",
          alpha: 0.5
        });
      }
    });
    ctx.save();
    ctx.globalAlpha = 0.72;
    for (let y = -70 + (sideScroll * 1.35) % 96; y < H + 96; y += 96) {
      const left = config.LOGIC.roadLeft - 30;
      const right = config.LOGIC.roadRight + 14;
      ctx.fillStyle = "#33251d";
      ctx.fillRect(left, y + 8, 18, 7);
      ctx.fillRect(right, y + 48, 20, 6);
      ctx.fillStyle = "#d7b35f";
      ctx.fillRect(left + 2, y + 10, 10, 2);
      ctx.fillStyle = "#6f7a74";
      ctx.fillRect(right + 5, y + 54, 2, 13);
      ctx.fillStyle = "#a7b1aa";
      ctx.fillRect(right + 1, y + 45, 14, 8);
      ctx.strokeStyle = "rgba(25, 18, 14, 0.55)";
      ctx.beginPath();
      ctx.moveTo(left - 4, y + 34);
      ctx.lineTo(left + 10, y + 44);
      ctx.moveTo(left + 11, y + 34);
      ctx.lineTo(left - 3, y + 44);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAirBackground() {
    const scroll = state ? state.scroll : (idleTime * 42) % 32;
    const farScroll = (scroll * 0.18) % 64;
    const cloudScroll = (scroll * 0.62) % 72;
    const nearScroll = (scroll * 1.22) % 46;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#496f94");
    sky.addColorStop(0.55, "#78a8c6");
    sky.addColorStop(1, "#d69a62");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    const sun = ctx.createRadialGradient(W * 0.72, H * 0.18, 4, W * 0.72, H * 0.18, 86);
    sun.addColorStop(0, "rgba(255, 223, 147, 0.48)");
    sun.addColorStop(0.45, "rgba(255, 183, 100, 0.18)");
    sun.addColorStop(1, "rgba(255, 183, 100, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(39, 78, 102, 0.36)";
    for (let x = -30; x < W + 42; x += 52) {
      const y = 80 + Math.sin((x + farScroll) * 0.03) * 5 + farScroll * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, y + 28);
      ctx.lineTo(x + 26, y);
      ctx.lineTo(x + 58, y + 30);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#f4ead8";
    for (let y = -64 + farScroll; y < H + 80; y += 76) {
      for (let x = -42; x < W + 60; x += 84) {
        ctx.beginPath();
        ctx.ellipse(x, y, 34, 10, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 24, y + 3, 28, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.48;
    for (let y = -46 + cloudScroll; y < H + 58; y += 72) {
      for (let x = -26; x < W + 52; x += 78) {
        ctx.beginPath();
        ctx.ellipse(x, y, 25, 8, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 20, y + 2, 20, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#f7d39b";
    ctx.lineWidth = 1;
    for (let y = -46 + nearScroll; y < H + 46; y += 46) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(46, y + 12, 98, y - 12, W, y + 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#fff1c7";
    for (let y = -30 + (nearScroll * 1.3) % 90; y < H + 90; y += 90) {
      ctx.beginPath();
      ctx.moveTo(W * 0.72, y);
      ctx.lineTo(W * 0.54, y + 52);
      ctx.moveTo(W * 0.72, y);
      ctx.lineTo(W * 0.9, y + 46);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSeaBackground() {
    const scroll = state ? state.scroll : (idleTime * 42) % 32;
    const farScroll = (scroll * 0.22) % 48;
    const waveScroll = (scroll * 0.82) % 32;
    const foamScroll = (scroll * 1.34) % 52;
    const water = ctx.createLinearGradient(0, 0, 0, H);
    water.addColorStop(0, "#17495e");
    water.addColorStop(0.54, "#126a7a");
    water.addColorStop(1, "#0b354d");
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#082c39";
    for (let x = -40; x < W + 50; x += 92) {
      const y = 58 + farScroll * 0.35 + Math.sin(x * 0.04) * 5;
      ctx.fillRect(x + 8, y, 34, 7);
      ctx.fillRect(x + 19, y - 8, 5, 8);
      ctx.fillRect(x + 43, y + 4, 18, 3);
    }
    ctx.lineWidth = 1;
    for (let y = -48 + farScroll; y < H + 54; y += 48) {
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = "#b9e7e1";
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= W + 12; x += 18) ctx.lineTo(x, y + Math.sin((x + y) * 0.08) * 4);
      ctx.stroke();
    }
    for (let y = -32 + waveScroll; y < H + 38; y += 32) {
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = "#82d4cb";
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= W + 8; x += 14) ctx.lineTo(x, y + Math.sin((x * 0.17) + stateTime()) * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = "#e7fbf0";
    for (let y = -52 + foamScroll; y < H + 52; y += 52) {
      for (let x = 10; x < W; x += 46) {
        ctx.fillRect(x + Math.sin((y + x) * 0.05) * 5, y, 10, 1);
        ctx.fillRect(x + 18, y + 7, 6, 1);
      }
    }
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#d9fff2";
    for (let y = -26 + (foamScroll * 1.15) % 64; y < H + 64; y += 64) {
      for (let x = 4; x < W; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 10, y + 5, x + 24, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawSpaceBackground() {
    const scroll = state ? state.scroll : (idleTime * 42) % 32;
    const farScroll = (scroll * 0.18) % H;
    const starScroll = (scroll * 0.68) % H;
    const meteorScroll = (scroll * 1.4) % (H + 80);
    const voidGradient = ctx.createLinearGradient(0, 0, 0, H);
    voidGradient.addColorStop(0, "#070812");
    voidGradient.addColorStop(0.52, "#14152f");
    voidGradient.addColorStop(1, "#090a18");
    ctx.fillStyle = voidGradient;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    const nebula = ctx.createRadialGradient(W * 0.68, H * 0.24, 6, W * 0.68, H * 0.24, 92);
    nebula.addColorStop(0, "rgba(94, 212, 203, 0.26)");
    nebula.addColorStop(0.5, "rgba(112, 82, 176, 0.18)");
    nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "rgba(154, 96, 204, 0.45)";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(-20, 105 + farScroll * 0.1);
    ctx.bezierCurveTo(42, 78, 95, 130, W + 22, 88);
    ctx.stroke();
    ctx.strokeStyle = "rgba(70, 198, 205, 0.28)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-16, 234 + farScroll * 0.16);
    ctx.bezierCurveTo(48, 205, 112, 274, W + 20, 230);
    ctx.stroke();

    for (let i = 0; i < 70; i += 1) {
      const x = (i * 37) % W;
      const baseY = (i * 61) % H;
      const y = (baseY + farScroll) % H;
      ctx.globalAlpha = 0.32 + ((i % 5) * 0.11);
      ctx.fillStyle = i % 7 === 0 ? "#5ed4cb" : "#f4ead8";
      ctx.fillRect(x, y, i % 9 === 0 ? 2 : 1, 1);
    }
    for (let i = 0; i < 36; i += 1) {
      const x = (i * 53 + 17) % W;
      const y = ((i * 79) + starScroll) % H;
      ctx.globalAlpha = 0.52;
      ctx.fillStyle = "#f4ead8";
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 0.36;
    ctx.strokeStyle = "#f0b64a";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      const y = (meteorScroll + i * 136) % (H + 80) - 40;
      const x = 28 + i * 52;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 28, y - 18);
      ctx.stroke();
    }
    ctx.restore();
  }

  function stateTime() {
    return state ? state.time : idleTime;
  }

  function drawVehicle(vehicleConfig, vehicle, timeMs, options) {
    const opts = options || {};
    const record = vehicleConfig.spriteImage ? vehicleImages[vehicleConfig.id] : null;
    if (record && vehicleImageStatus(vehicleConfig.id) === "loaded") {
      const image = record.image;
      const width = vehicleConfig.visualWidth || (vehicleConfig.visualHalfWidth || 36) * 2;
      const height = width * (image.naturalHeight / image.naturalWidth);
      const x = vehicle.x - width * 0.5;
      const y = vehicle.y - height * 0.72;
      ctx.save();
      ctx.globalAlpha *= opts.alpha == null ? 1 : opts.alpha;
      ctx.imageSmoothingEnabled = false;
      if (opts.hitFlash) {
        ctx.globalAlpha *= 0.76;
      }
      ctx.drawImage(image, x, y, width, height);
      ctx.restore();
      renderDebug.vehicleRasterDrawn = true;
      renderDebug.vehicleImageStatus = "loaded";
      return;
    }

    const sprite = vehicleConfig.sprite || "vehicle_iron_crow";
    const fallbackScale = sprite === "vehicle_iron_crow" ? 1.25 : 1.55;
    drawSprite(sprite, opts.anim || "move", timeMs, vehicle.x, vehicle.y, fallbackScale, { alpha: opts.alpha == null ? 1 : opts.alpha });
    renderDebug.vehicleFallbackDrawn = true;
    renderDebug.vehicleImageStatus = record ? record.status : "none";
  }

  function enemyVisualWidth(enemy, enemyConfig) {
    if (Number.isFinite(enemy.visualWidth)) return enemy.visualWidth;
    if (enemyConfig && Number.isFinite(enemyConfig.visualWidth)) return enemyConfig.visualWidth;
    return Math.max(14, enemy.radius * 2);
  }

  function drawEnemyShadow(enemy, width, lift, alpha) {
    const shadowScale = Math.max(0.74, 1 - Math.abs(lift) * 0.045);
    ctx.save();
    ctx.globalAlpha *= (enemy.boss ? 0.34 : 0.26) * (alpha == null ? 1 : alpha);
    ctx.fillStyle = "#050607";
    ctx.beginPath();
    ctx.ellipse(
      enemy.x,
      enemy.y + enemy.radius * (enemy.boss ? 0.62 : 0.52),
      Math.max(4, width * (enemy.boss ? 0.42 : 0.36) * shadowScale),
      Math.max(2, enemy.radius * (enemy.boss ? 0.2 : 0.16) * shadowScale),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
    renderDebug.enemyShadowDrawn += 1;
  }

  function drawEnemyEntity(enemy, timeMs, alpha, anim) {
    const enemyConfig = config.ENEMIES[enemy.enemyId] || null;
    const record = enemyConfig && enemyConfig.spriteImage ? enemyImages[enemy.enemyId] : null;
    const status = enemyImageStatus(enemy.enemyId);
    const width = enemyVisualWidth(enemy, enemyConfig);
    const phase = stateTime() * (enemy.animFreq || (enemy.boss ? 1.35 : 2.75)) + (enemy.animPhase || 0);
    const bobAmp = enemy.boss ? 1.1 : enemy.enemyId === "runner" ? 2.6 : enemy.enemyId === "bloater" ? 1.25 : 2.0;
    const lift = Math.sin(phase) * bobAmp;
    const pulse = Math.sin(phase + Math.PI * 0.5);
    const squashX = 1 + pulse * (enemy.boss ? 0.022 : 0.045);
    const squashY = 1 - pulse * (enemy.boss ? 0.018 : 0.055);
    const speedLean = rules.clamp((enemy.vx || 0) / Math.max(1, enemy.speed || 1), -1, 1) * 0.035;
    const wobble = Math.sin(phase * 0.52) * (enemy.boss ? 0.022 : 0.075) + speedLean;
    const drawAlpha = alpha == null ? 1 : alpha;
    const flash = enemy.hitFlash > 0 && !(meta.settings && meta.settings.reducedFlash);

    if (renderDebug.enemyImageStatus) renderDebug.enemyImageStatus[enemy.enemyId] = status;
    drawEnemyShadow(enemy, width, lift, drawAlpha);

    if (record && status === "loaded") {
      const image = record.image;
      const height = width * (image.naturalHeight / image.naturalWidth);
      ctx.save();
      ctx.translate(enemy.x, enemy.y + lift);
      ctx.rotate(wobble);
      ctx.scale(squashX, squashY);
      ctx.globalAlpha *= flash ? drawAlpha * 0.82 : drawAlpha;
      ctx.imageSmoothingEnabled = false;
      if (enemy.filter) ctx.filter = enemy.filter;
      ctx.drawImage(image, -width * 0.5, -height * 0.5, width, height);
      if (enemy.tint) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = enemy.tint;
        ctx.fillRect(-width * 0.5, -height * 0.5, width, height);
        ctx.globalCompositeOperation = "source-over";
      }
      if (flash) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(255, 244, 214, 0.36)";
        ctx.fillRect(-width * 0.5, -height * 0.5, width, height);
      }
      ctx.restore();
      renderDebug.enemyRasterDrawn += 1;
      return;
    }

    ctx.save();
    ctx.translate(enemy.x, enemy.y + lift);
    ctx.rotate(wobble);
    enemySpriteOptions.flipX = enemy.vx < -8;
    enemySpriteOptions.alpha = flash ? drawAlpha * 0.78 : drawAlpha;
    enemySpriteOptions.tint = enemy.tint || null;
    if (enemy.filter) ctx.filter = enemy.filter;
    drawSprite(enemy.sprite, anim || enemy.anim || "walk", timeMs, 0, 0, enemy.scale * Math.max(0.94, Math.min(1.08, squashY)), enemySpriteOptions);
    enemySpriteOptions.tint = null;
    ctx.restore();
    renderDebug.enemyFallbackDrawn += 1;
  }

  function drawEnemyCorpse(effect, timeMs) {
    const enemyConfig = config.ENEMIES[effect.enemyId] || null;
    const record = enemyConfig && enemyConfig.spriteImage ? enemyImages[effect.enemyId] : null;
    const status = enemyImageStatus(effect.enemyId);
    const width = enemyVisualWidth(effect, enemyConfig);
    if (record && status === "loaded") {
      const image = record.image;
      const height = width * (image.naturalHeight / image.naturalWidth);
      drawEnemyShadow(effect, width, 0, effect.alpha * 0.55);
      ctx.save();
      ctx.translate(effect.x, effect.y + Math.min(7, effect.radius * 0.18));
      ctx.rotate(effect.rotation || 0);
      ctx.scale(1.08, 0.9);
      ctx.globalAlpha *= effect.alpha * 0.78;
      ctx.imageSmoothingEnabled = false;
      if (effect.filter) ctx.filter = effect.filter;
      ctx.drawImage(image, -width * 0.5, -height * 0.5, width, height);
      if (effect.tint) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = effect.tint;
        ctx.fillRect(-width * 0.5, -height * 0.5, width, height);
      }
      ctx.restore();
      return;
    }
    drawSprite(effect.sprite, effect.anim, timeMs, effect.x, effect.y, effect.scale, { alpha: effect.alpha, tint: effect.tint || null });
  }

  function drawHazard(hazard) {
    ctx.save();
    ctx.translate(hazard.x, hazard.y);
    ctx.rotate(hazard.rotation || 0);
    ctx.globalAlpha *= hazard.dead ? 0.35 : 0.96;
    ctx.fillStyle = "#6e625d";
    ctx.strokeStyle = "#f0b64a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 7; i += 1) {
      const angle = (Math.PI * 2 * i) / 7;
      const radius = hazard.radius * (0.74 + ((i * 17) % 5) * 0.08);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(240, 182, 74, 0.42)";
    ctx.fillRect(-4, -2, 8, 3);
    ctx.restore();
  }

  function drawBlueprintDrop(effect) {
    ctx.save();
    ctx.globalAlpha *= effect.alpha == null ? 1 : effect.alpha;
    ctx.translate(effect.x, effect.y);
    ctx.fillStyle = "rgba(94, 212, 203, 0.92)";
    ctx.strokeStyle = "#f4ead8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawWorldText(effect.text || "+1", 0, 14, { size: 7, color: "#5ed4cb", alpha: effect.alpha });
    ctx.restore();
  }

  function drawEnvironmentEventOverlay() {
    if (!state || !state.wavePlan || !state.wavePlan.environmentEvent) return;
    const event = state.wavePlan.environmentEvent;
    ctx.save();
    if (event.id === "sandstorm") {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#d3a45f";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = "#f0d199";
      for (let y = -20 + (state.scroll * 1.8) % 44; y < H + 40; y += 22) {
        ctx.beginPath();
        ctx.moveTo(-10, y);
        ctx.lineTo(W + 10, y + 18);
        ctx.stroke();
      }
    } else if (event.id === "turbulence") {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "#f4ead8";
      for (let y = -30 + (state.scroll * 2.2) % 54; y < H + 30; y += 27) {
        ctx.beginPath();
        ctx.moveTo(8, y);
        ctx.bezierCurveTo(58, y + 12, 128, y - 14, W - 8, y + 8);
        ctx.stroke();
      }
    } else if (event.id === "undertow") {
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = "#b9fff2";
      for (let y = -20 + (state.scroll * 1.6) % 58; y < H + 58; y += 29) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 16) {
          const yy = y + Math.sin(x * 0.12 + state.time * 3) * 5;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawIdlePreview(timeMs) {
    const selected = getVehicleConfig(meta.selectedVehicle);
    drawVehicle(selected, { x: W * 0.5, y: config.LOGIC.vehicleY }, timeMs, { alpha: 0.92, anim: "move" });
    drawEnemyEntity(
      {
        enemyId: "shambler",
        sprite: "zombie_shambler",
        anim: "walk",
        x: 64,
        y: 112,
        vx: 0,
        speed: 24,
        radius: config.ENEMIES.shambler.radius,
        scale: 1.3,
        animPhase: 0.4,
        animFreq: 2.5,
        hitFlash: 0
      },
      timeMs,
      0.85
    );
    drawEnemyEntity(
      {
        enemyId: "runner",
        sprite: "zombie_runner",
        anim: "walk",
        x: 125,
        y: 88,
        vx: 0,
        speed: 42,
        radius: config.ENEMIES.runner.radius,
        scale: 1.25,
        animPhase: 1.2,
        animFreq: 4,
        hitFlash: 0
      },
      timeMs,
      0.85
    );
    drawSprite("gate_damage", "idle", timeMs, 98, 178, 0.95, { alpha: 0.9 });
  }

  function drawGame(timeMs) {
    state.gates.forEach((gate) => {
      drawSprite(gate.sprite, "idle", timeMs, gate.x, gate.y, gate.scale, { alpha: 0.95 });
      drawGateLabel(gate);
    });
    state.hazards.forEach(drawHazard);
    state.projectiles.forEach((projectile) => {
      drawSprite(projectile.sprite, "move", timeMs, projectile.x - projectile.vx * 0.034, projectile.y - projectile.vy * 0.034, projectile.scale, {
        rotation: projectile.rotation,
        alpha: 0.18
      });
      drawSprite(projectile.sprite, "move", timeMs, projectile.x - projectile.vx * 0.018, projectile.y - projectile.vy * 0.018, projectile.scale, {
        rotation: projectile.rotation,
        alpha: 0.34
      });
      drawSprite(projectile.sprite, "move", timeMs, projectile.x, projectile.y, projectile.scale, {
        rotation: projectile.rotation,
        alpha: 0.98
      });
    });
    state.enemies.forEach((enemy) => {
      const alpha = enemy.hitFlash > 0 ? 0.7 : 1;
      const anim = enemy.boss && enemy.hp < enemy.maxHp * 0.33 ? "rage" : enemy.anim || "walk";
      drawEnemyEntity(enemy, timeMs, alpha, anim);
    });
    state.effects.forEach((effect) => {
      if (effect.kind === "text") {
        drawWorldText(effect.text, effect.x, effect.y, {
          size: effect.size,
          alpha: effect.alpha,
          color: effect.color
        });
      } else if (effect.kind === "blueprint_drop") {
        drawBlueprintDrop(effect);
      } else if (effect.kind === "enemy_corpse") {
        drawEnemyCorpse(effect, timeMs);
      } else {
        drawSprite(effect.sprite, effect.anim, timeMs, effect.x, effect.y, effect.scale, { alpha: effect.alpha });
      }
    });

    const vehicleConfig = getVehicleConfig(state.vehicleId);
    const vehicleAnim = state.vehicle.hp <= 0 ? "wreck" : state.vehicle.recentHitUntil > state.time ? "damage" : "move";
    drawVehicle(vehicleConfig, state.vehicle, timeMs, {
      alpha: 1,
      anim: vehicleAnim,
      hitFlash: state.vehicle.recentHitUntil > state.time
    });
    drawAimGuide();
    drawSprite("effect_muzzle", "burst", timeMs, state.vehicle.aimX, state.vehicle.aimY, 0.8, { alpha: state.input.dragging ? 0.62 : 0.35 });
    drawMessages();
  }

  function draw() {
    if (!ctx || !displayCtx) return;
    renderDebug = {
      messagesDrawn: 0,
      gateLabelsDrawn: 0,
      tutorialDrawn: false,
      environment: currentEnvironment(),
      vehicleRasterDrawn: false,
      vehicleFallbackDrawn: false,
      vehicleImageStatus: "none",
      enemyRasterDrawn: 0,
      enemyFallbackDrawn: 0,
      enemyShadowDrawn: 0,
      enemyImageStatus: {}
    };
    const timeMs = ((state ? state.time : idleTime) || 0) * 1000;
    ctx.clearRect(0, 0, W, H);
    if (state && state.shakeUntil > state.time && !(meta.settings && meta.settings.reducedFlash)) {
      const progress = Math.max(0, (state.shakeUntil - state.time) / Math.max(0.01, state.shakeUntil));
      const amp = (state.shakeAmp || 0) * progress;
      ctx.save();
      ctx.translate(Math.sin(state.time * 91) * amp, Math.cos(state.time * 73) * amp);
    }
    drawBackground(timeMs);
    if (state) drawEnvironmentEventOverlay();
    if (state) drawGame(timeMs);
    else drawIdlePreview(timeMs);
    if (state && state.shakeUntil > state.time && !(meta.settings && meta.settings.reducedFlash)) ctx.restore();
    displayCtx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.drawImage(worldCanvas, 0, 0, W, H, 0, 0, DISPLAY_W, DISPLAY_H);
  }

  function loop(frameMs) {
    if (lastFrameMs == null) lastFrameMs = frameMs;
    const delta = Math.min(0.05, Math.max(0, (frameMs - lastFrameMs) / 1000));
    lastFrameMs = frameMs;
    idleTime += delta;
    if (state && !state.paused && !state.over) {
      update(delta);
      emitState();
    }
    draw();
    root.requestAnimationFrame(loop);
  }

  function setState(partial) {
    if (!state) startRun(meta.selectedVehicle);
    function merge(target, source) {
      Object.keys(source || {}).forEach((key) => {
        if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) && target[key]) {
          merge(target[key], source[key]);
        } else {
          target[key] = rules.deepClone(source[key]);
        }
      });
    }
    merge(state, partial || {});
    if (partial && Object.prototype.hasOwnProperty.call(partial, "wave")) pushWave(partial.wave);
    emitState();
    return getState();
  }

  function init(options) {
    callbacks = options || {};
    canvas = callbacks.canvas || root.document.getElementById("gameCanvas");
    if (!canvas) throw new Error("AshesGame could not find #gameCanvas.");
    displayCtx = canvas.getContext("2d");
    displayCtx.imageSmoothingEnabled = false;
    canvas.width = DISPLAY_W;
    canvas.height = DISPLAY_H;
    worldCanvas = createWorldCanvas();
    ctx = worldCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    if (callbacks.meta) meta = rules.migrateMeta(callbacks.meta, { config });
    renderer.preRenderSprites({ pixelRatio: 1, smoothing: false });
    preloadVehicleImages();
    preloadEnemyImages();
    bindInput();
    draw();
    if (!rafStarted) {
      rafStarted = true;
      root.requestAnimationFrame(loop);
    }
    exposeTestApi();
    emitState();
    return api;
  }

  function clearStorage() {
    if (root.localStorage) root.localStorage.removeItem(config.STORAGE_KEY);
    meta = rules.migrateMeta(null, { config });
    state = null;
    draw();
    emitState();
  }

  function spritesReady() {
    try {
      renderer.getSprite("vehicle_iron_crow");
      renderer.getSprite("vehicle_dawn_skiff");
      renderer.getSprite("boss_hive_titan");
      renderer.getSprite("gate_damage");
      return true;
    } catch (error) {
      return false;
    }
  }

  function exposeTestApi() {
    root.__test = Object.assign({}, root.__test || {}, {
      getState,
      setState,
      step,
      spawnEnemy,
      spawnGate,
      grantGate,
      chooseGate,
      damageVehicle,
      killAllEnemies,
      finishRun,
      pushWave,
      clearStorage,
      getRenderDebug: () => rules.deepClone(renderDebug),
      config,
      spritesReady
    });
  }

  const api = {
    init,
    setMeta,
    getState,
    startRun,
    pause,
    resume,
    togglePause,
    step,
    spawnEnemy,
    spawnGate,
    grantGate,
    chooseGate,
    damageVehicle,
    killAllEnemies,
    finishRun,
    pushWave,
    clearStorage,
    spritesReady
  };

  root.AshesGame = api;
})(window);
