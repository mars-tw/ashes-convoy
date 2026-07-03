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
  let renderDebug = { messagesDrawn: 0, gateLabelsDrawn: 0, tutorialDrawn: false };

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
      enemies: state.enemies.map(publicEntity),
      projectiles: state.projectiles.map(publicEntity),
      gates: state.gates.map(publicEntity),
      effects: state.effects.map(publicEntity),
      stats: rules.deepClone(state.stats),
      wavePlan: state.wavePlan
        ? {
            wave: state.wavePlan.wave,
            duration: state.wavePlan.duration,
            boss: state.wavePlan.boss,
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
        difficultyId: state.difficultyId
      },
      config
    );
  }

  function makeWavePlan(wave) {
    return rules.generateWave({
      wave,
      rng: state.rng,
      config
    });
  }

  function makeInitialState(vehicleId, nextMeta, seed) {
    const safeMeta = rules.migrateMeta(nextMeta || meta, { config });
    const selectedVehicle = config.VEHICLES[vehicleId] ? vehicleId : safeMeta.selectedVehicle;
    const vehicleConfig = config.VEHICLES[selectedVehicle];
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
        radius: vehicleConfig.radius,
        x: W * 0.5,
        y: config.LOGIC.vehicleY,
        aimX: W * 0.5,
        aimY: 300,
        weaponCooldown: 0,
        recentHitUntil: 0
      },
      runMods: rules.defaultRunMods(),
      enemies: [],
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
        partsPreview: config.ECONOMY.minRunParts
      },
      input: {
        dragging: false,
        lastPointer: null
      },
      scroll: 0,
      shakeAmp: 0,
      shakeUntil: 0,
      messages: []
    };

    state = initial;
    state.wavePlan = makeWavePlan(1);
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
      name: enemyConfig.name,
      sprite: enemyConfig.sprite,
      anim: enemyConfig.boss ? "walk" : "walk",
      x: Number.isFinite(opts.x) ? opts.x : config.LOGIC.roadLeft + state.rng() * (config.LOGIC.roadRight - config.LOGIC.roadLeft),
      y: Number.isFinite(opts.y) ? opts.y : -40,
      vx: 0,
      vy: scaled.speed,
      laneOffset: Number.isFinite(opts.laneOffset) ? opts.laneOffset : 0,
      swayPhase: Number.isFinite(opts.swayPhase) ? opts.swayPhase : state.rng() * Math.PI * 2,
      swayAmp: Number.isFinite(opts.swayAmp) ? opts.swayAmp : 4 + state.rng() * 3,
      swayFreq: Number.isFinite(opts.swayFreq) ? opts.swayFreq : 1.1 + state.rng() * 0.7,
      hp: Number.isFinite(opts.hp) ? opts.hp : scaled.hp,
      maxHp: Number.isFinite(opts.hp) ? opts.hp : scaled.hp,
      speed: Number.isFinite(opts.speed) ? opts.speed : scaled.speed,
      contactDamage: Number.isFinite(opts.contactDamage) ? opts.contactDamage : enemyConfig.contactDamage,
      radius: Number.isFinite(opts.radius) ? opts.radius : enemyConfig.radius,
      scale: Number.isFinite(opts.scale) ? opts.scale : enemyConfig.scale,
      score: enemyConfig.score,
      boss: enemyConfig.boss === true,
      dead: false,
      hitCooldown: 0,
      phaseTriggered: {},
      hitFlash: 0
    };
    if (state.enemies.length >= config.PERFORMANCE.maxEnemies) return null;
    state.enemies.push(enemy);
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
      radius: 20,
      scale: 1.5,
      broken: false
    };
    state.gates.push(gate);
    if (!opts.silent) emitState();
    return publicEntity(gate);
  }

  function spawnGatePair(options) {
    const pairId = nextId("gatepair");
    const ids = options && options.length ? options : ["damage_plus", "repair"];
    const gateHalf = 32 * 1.5 * 0.5;
    const left = spawnGate(ids[0], { pairId, x: config.LOGIC.roadLeft + gateHalf, y: 104, silent: true });
    const right = spawnGate(ids[1], { pairId, x: config.LOGIC.roadRight - gateHalf, y: 104, silent: true });
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
    state.messages.push({ text: config.GATES[gateId].label, time: state.time, ttl: 1.7 });
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

  function damageVehicle(amount) {
    if (!state) startRun(meta.selectedVehicle);
    const result = rules.applyVehicleDamage(state.vehicle, amount, state.vehicle.armor);
    state.vehicle = result.vehicle;
    state.vehicle.recentHitUntil = state.time + 0.28;
    if (state.vehicleId === "iron_crow") state.vehicle.recentHitUntil = state.time + config.VEHICLES.iron_crow.passive.duration;
    pulseShake(1.2, 0.18);
    if (state.vehicle.hp <= 0) finishRun();
    emitState();
    return result;
  }

  function killEnemy(enemy, cause) {
    if (!enemy || enemy.dead) return;
    enemy.dead = true;
    state.stats.kills += 1;
    state.stats.score += enemy.score + state.wave * 3;
    addFloatingText("+1", enemy.x, enemy.y - enemy.radius, { color: "#f0b64a", size: 8, ttl: 0.5, vy: -14 });
    pulseShake(enemy.boss ? 3 : 1.5, enemy.boss ? 0.35 : 0.16);
    if (enemy.boss) {
      state.stats.bossesDefeated += 1;
      state.stats.score += 900;
      state.messages.push({ text: "Boss 已擊破", time: state.time, ttl: 1.8 });
    }
    if (cause !== "burst") {
      addEffect({
        id: nextId("effect"),
        sprite: enemy.sprite,
        anim: "death",
        x: enemy.x,
        y: enemy.y,
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

    const enemyConfig = config.ENEMIES[enemy.enemyId];
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
        difficultyId: state.difficultyId
      },
      overrides || {}
    );
    const result = rules.settleRunRewards({
      meta,
      run,
      rng: state.rng,
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
    emitState();
    return getState();
  }

  function fireProjectiles(dt) {
    const vehicle = state.vehicle;
    const vehicleConfig = config.VEHICLES[state.vehicleId];
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
      enemy.vx = toTarget.x * enemy.speed * speedMul * 0.62 + sway;
      enemy.vy = Math.max(enemy.speed * 0.35, toTarget.y * enemy.speed * speedMul);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (!enemy.boss) enemy.x = rules.clamp(enemy.x, config.LOGIC.roadLeft + 5, config.LOGIC.roadRight - 5);

      if (enemy.boss) {
        const enemyConfig = config.ENEMIES[enemy.enemyId];
        enemyConfig.phases.forEach((phase) => {
          if (enemy.hp <= enemy.maxHp * phase.hpPct && !enemy.phaseTriggered[phase.action]) {
            enemy.phaseTriggered[phase.action] = true;
            enemy.anim = phase.action === "charge" ? "rage" : "attack";
            if (phase.action === "summon") {
              [-38, 0, 38].forEach((offset) => spawnEnemy("shambler", { x: enemy.x + offset, y: enemy.y + 30 }));
            }
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

  function updateProjectiles(dt) {
    state.projectiles.forEach((projectile) => {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life -= dt;

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
          if (projectile.vehicleId === "dawn_skiff") {
            const passive = config.VEHICLES.dawn_skiff.passive;
            const stacks = Math.min(passive.maxStacks, enemy.armorBreakStacks || 0);
            damage *= 1 + stacks * passive.armorBreakPerHit;
            enemy.armorBreakStacks = Math.min(passive.maxStacks, stacks + 1);
          }
          enemy.hp -= damage;
          enemy.hitFlash = 0.12;
          state.stats.damageDealt += damage;
          addFloatingText(Math.round(damage).toString(), enemy.x + 3, enemy.y - enemy.radius - 2, {
            color: projectile.vehicleId === "dawn_skiff" ? "#5ed4cb" : "#f4ead8",
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
      effect.alpha = Math.max(0, 1 - effect.age / effect.ttl);
    });
    state.effects = state.effects.filter((effect) => effect.age < effect.ttl);
    state.messages = state.messages.filter((message) => state.time - message.time <= message.ttl);
  }

  function completeWaveIfReady() {
    const plan = state.wavePlan;
    const spawnedAll = state.spawnIndex >= plan.spawns.length;
    const bossAlive = state.enemies.some((enemy) => enemy.boss);
    const normalClear = state.enemies.length === 0 || state.waveElapsed > plan.duration + 8;
    if (state.waveElapsed >= plan.duration && spawnedAll && !bossAlive && normalClear) {
      state.stats.wavesCleared = Math.max(state.stats.wavesCleared, state.wave);
      state.wave += 1;
      state.waveElapsed = 0;
      state.spawnIndex = 0;
      state.gateIndex = 0;
      state.wavePlan = makeWavePlan(state.wave);
      state.messages.push({ text: `第 ${state.wave} 波`, time: state.time, ttl: 1.4 });
      updatePartsPreview();
    }
  }

  function updateVehicleAim(dt) {
    const vehicleConfig = config.VEHICLES[state.vehicleId];
    const vehicle = state.vehicle;
    const half = vehicleConfig.visualHalfWidth || 24;
    const targetX = rules.clamp(vehicle.aimX, config.LOGIC.roadLeft + half, config.LOGIC.roadRight - half);
    vehicle.x += (targetX - vehicle.x) * Math.min(1, vehicleConfig.moveResponsiveness * dt * 60);
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
      canvas.setPointerCapture(event.pointerId);
      state.input.dragging = true;
      state.input.lastPointer = event.pointerId;
      setAimFromPoint(pointFromEvent(event));
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
        state.vehicle.aimX -= 18;
      } else if (state && !state.paused && !state.over && event.key === "ArrowRight") {
        state.vehicle.aimX += 18;
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
    drawWorldText(gateConfig.shortLabel, gate.x, gate.y - 16, { size: 7, color: "#f4ead8" });
    const valueText =
      gate.gateId === "damage_plus"
        ? "+35%"
        : gate.gateId === "rate_plus"
          ? "+25%"
          : gate.gateId === "multishot_plus"
            ? "+1"
            : "維修";
    drawWorldText(valueText, gate.x, gate.y - 5, { size: 8, color: gate.gateId === "repair" ? "#87d27d" : "#f0b64a" });
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

  function drawBackground(timeMs) {
    const scroll = state ? state.scroll : (idleTime * 42) % 32;
    const sideScroll = (scroll * 1.32) % 32;
    const farScroll = (scroll * 0.24) % 32;

    for (let y = -32 + sideScroll; y < H + 32; y += 32) {
      for (let x = 16; x < W; x += 32) {
        if (x > config.LOGIC.roadLeft - 6 && x < config.LOGIC.roadRight + 6) continue;
        drawSprite("tile_wasteland", "idle", timeMs, x, y, 1, { origin: "center", alpha: 0.96 });
      }
    }

    const roadWidth = config.LOGIC.roadRight - config.LOGIC.roadLeft;
    const laneCount = 4;
    const laneWidth = roadWidth / laneCount;
    const roadTileScale = laneWidth / 32;
    const roadStep = 32 * roadTileScale;
    drawClipped(config.LOGIC.roadLeft, 0, roadWidth, H, () => {
      for (let y = -roadStep + (scroll % roadStep); y < H + roadStep; y += roadStep) {
        for (let lane = 0; lane < laneCount; lane += 1) {
          const x = config.LOGIC.roadLeft + laneWidth * (lane + 0.5);
          drawSprite("tile_road", "idle", timeMs, x, y, roadTileScale, { origin: "center" });
        }
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
  }

  function drawIdlePreview(timeMs) {
    const selected = config.VEHICLES[meta.selectedVehicle] || config.VEHICLES.iron_crow;
    drawSprite(selected.sprite, "move", timeMs, W * 0.5, config.LOGIC.vehicleY, selected.kind === "train" ? 1.25 : 1.55, {
      alpha: 0.92
    });
    drawSprite("zombie_shambler", "walk", timeMs, 64, 112 + Math.sin(idleTime * 2) * 4, 1.3, { alpha: 0.85 });
    drawSprite("zombie_runner", "walk", timeMs, 125, 88 + Math.cos(idleTime * 2) * 4, 1.25, { alpha: 0.85 });
    drawSprite("gate_damage", "idle", timeMs, 98, 178, 0.95, { alpha: 0.9 });
  }

  function drawGame(timeMs) {
    state.gates.forEach((gate) => {
      drawSprite(gate.sprite, "idle", timeMs, gate.x, gate.y, gate.scale, { alpha: 0.95 });
      drawGateLabel(gate);
    });
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
      drawSprite(enemy.sprite, anim, timeMs, enemy.x, enemy.y, enemy.scale, {
        flipX: enemy.vx < -8,
        alpha
      });
    });
    state.effects.forEach((effect) => {
      if (effect.kind === "text") {
        drawWorldText(effect.text, effect.x, effect.y, {
          size: effect.size,
          alpha: effect.alpha,
          color: effect.color
        });
      } else {
        drawSprite(effect.sprite, effect.anim, timeMs, effect.x, effect.y, effect.scale, { alpha: effect.alpha });
      }
    });

    const vehicleConfig = config.VEHICLES[state.vehicleId];
    const vehicleAnim = state.vehicle.hp <= 0 ? "wreck" : state.vehicle.recentHitUntil > state.time ? "damage" : "move";
    const vehicleScale = vehicleConfig.kind === "train" ? 1.25 : 1.55;
    drawSprite(vehicleConfig.sprite, vehicleAnim, timeMs, state.vehicle.x, state.vehicle.y, vehicleScale, { alpha: 1 });
    drawAimGuide();
    drawSprite("effect_muzzle", "burst", timeMs, state.vehicle.aimX, state.vehicle.aimY, 0.8, { alpha: state.input.dragging ? 0.62 : 0.35 });
    drawMessages();
  }

  function draw() {
    if (!ctx || !displayCtx) return;
    renderDebug = { messagesDrawn: 0, gateLabelsDrawn: 0, tutorialDrawn: false };
    const timeMs = ((state ? state.time : idleTime) || 0) * 1000;
    ctx.clearRect(0, 0, W, H);
    if (state && state.shakeUntil > state.time && !(meta.settings && meta.settings.reducedFlash)) {
      const progress = Math.max(0, (state.shakeUntil - state.time) / Math.max(0.01, state.shakeUntil));
      const amp = (state.shakeAmp || 0) * progress;
      ctx.save();
      ctx.translate(Math.sin(state.time * 91) * amp, Math.cos(state.time * 73) * amp);
    }
    drawBackground(timeMs);
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
    damageVehicle,
    killAllEnemies,
    finishRun,
    pushWave,
    clearStorage,
    spritesReady
  };

  root.AshesGame = api;
})(window);
