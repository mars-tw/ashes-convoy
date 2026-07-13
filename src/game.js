"use strict";

(function attachGame(root) {
  const config = root.DSConfig;
  const rules = root.DSRules;
  const renderer = root.DSSpriteRenderer;
  const fx = root.DSFx;
  const audio = root.DSAudio || null;

  if (!config || !rules || !renderer || !fx) {
    throw new Error("AshesGame requires sprites, sprite-renderer, config, rules and fx to be loaded first.");
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
  const constrainedDevice = detectConstrainedDevice();
  let performanceState = {
    quality: constrainedDevice ? "low" : "high",
    fps: 60,
    lowFrames: 0,
    highFrames: 0,
    lastFloatingTextAt: -Infinity,
    reason: constrainedDevice ? "裝置預檢" : "穩定",
    constrainedDevice,
    downgradedWave: constrainedDevice ? 1 : null,
    history: []
  };
  let renderDebug = {
    messagesDrawn: 0,
    gateLabelsDrawn: 0,
    tutorialDrawn: false,
    enemyRasterDrawn: 0,
    enemyFallbackDrawn: 0,
    enemyShadowDrawn: 0,
    runTrailerRasterDrawn: false,
    runTrailerFallbackDrawn: false,
    runTrailerImageStatus: "none",
    runTrailerPose: null,
    companionRasterDrawn: false,
    companionFallbackDrawn: false,
    companionImageStatus: "none",
    companionPose: null,
    enemyImageStatus: {}
  };
  const environmentImages = {};
  const vehicleImages = {};
  const runTrailerImages = {};
  const companionImages = {};
  const fxTextureImages = {};
  const fxTextureTintCache = Object.create(null);
  const roadDetailImage = { image: null, status: "none" };

  function detectConstrainedDevice() {
    const navigatorInfo = root.navigator || {};
    const memory = Number(navigatorInfo.deviceMemory);
    const cores = Number(navigatorInfo.hardwareConcurrency);
    const saveData = !!(navigatorInfo.connection && navigatorInfo.connection.saveData);
    return saveData || (Number.isFinite(memory) && memory > 0 && memory <= 4) || (Number.isFinite(cores) && cores > 0 && cores <= 4);
  }
  const enemyImages = {};
  const enemySpriteOptions = { flipX: false, alpha: 1 };

  // ── DSFx 特效整合（固定粒子池 + 注入式 rng/time；全部掛在效能分級與畫面特效設定之下）──
  const FXC = config.FX || null;
  const TAU = Math.PI * 2;
  const fxPools = { high: null, low: null };
  let fxState = null;
  let fxRng = fx.createSeededRng(1);
  let fxTiltRad = 0;
  let fxMoveX = 0;
  let fxPrevVehicleX = null;
  let fxBossKillFx = null;
  let fxStarLayer;
  const fxScorches = new Array(12).fill(null).map(() => ({ active: false, x: 0, y: 0, scroll: 0, start: 0, life: 0, size: 0 }));
  let fxScorchCursor = 0;
  const fxScratch = { muzzle: {}, motion: {}, crate: {}, banner: {}, anchor: { x: 0, y: 0 } };
  const fxHitOpts = { x: 0, y: 0, angle: 0, vehicleId: "", color: null };
  const hudAnchors = {
    hp: { x: 32, y: 22, color: "#87d27d", icon: "+" },
    parts: { x: 164, y: 22, color: "#f0b64a", icon: "*" },
    weapon: { x: 98, y: 24, color: "#ffd27f", icon: "^" },
    supply: { x: 98, y: 24, color: "#5ed4cb", icon: "+" }
  };
  const fxTrailSpec = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0.22,
    size: 1.7,
    sizeEnd: 0.2,
    color: "#ffd76a",
    shape: "spark",
    stretch: 2.6
  };
  const fxExhaustLayers = {};
  const fxVignetteCache = {};

  function weaponVisual(mode) {
    const modes = (config.WEAPON_POWERUPS && config.WEAPON_POWERUPS.modes) || {};
    const requested = modes[mode] || modes.standard || {};
    return requested.visual || (modes.standard && modes.standard.visual) || {
      id: "standard", shape: "capsule", core: "#ffd36a", edge: "#fff1b8", trail: "#d5963f",
      trailShape: "spark", trailLife: 0.2, trailSize: 1.5, trailStretch: 2.4, length: 8, width: 3
    };
  }

  function hashSeed(text) {
    const source = String(text == null ? "seed" : text);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < source.length; i += 1) {
      h ^= source.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function fxLevelSetting() {
    const level = meta.settings && meta.settings.fxLevel;
    return level === "reduced" || level === "off" ? level : "full";
  }

  // ── DSAudio 音效整合：settings.sound === false 時完全靜音（不呼叫引擎、不建任何 node）──
  function soundEnabled() {
    return !(meta.settings && meta.settings.sound === false);
  }

  function playSound(name, variant) {
    if (!audio || !soundEnabled()) return;
    audio.play(name, variant ? { variant } : undefined);
  }

  function fxPoolQuality() {
    return performanceState.quality === "low" || fxLevelSetting() === "reduced" ? "low" : "high";
  }

  function ensureFxState() {
    const quality = fxPoolQuality();
    if (!fxPools[quality]) fxPools[quality] = fx.createFxState({ quality, fxConfig: FXC });
    if (fxState !== fxPools[quality]) {
      fxState = fxPools[quality];
      fx.resetFxState(fxState);
    }
    return fxState;
  }

  function syncFxStateForSettings() {
    const quality = fxPoolQuality();
    if (!fxPools[quality]) fxPools[quality] = fx.createFxState({ quality, fxConfig: FXC });
    fxState = fxPools[quality];
    return fxState;
  }

  function fxEnabled() {
    return !!fxState && fxLevelSetting() !== "off";
  }

  function flourishFxEnabled() {
    return !!FXC && fxLevelSetting() === "full" && !(meta.settings && meta.settings.reducedFlash);
  }

  function visualStateTime() {
    if (!state) return idleTime;
    return Number.isFinite(state.fxVisualTime) ? state.fxVisualTime : state.time;
  }

  function updateFxPresentationClock(dt) {
    if (!state) return;
    const logicEndTime = state.time + dt;
    if (!Number.isFinite(state.fxVisualTime)) state.fxVisualTime = state.time;

    let visualDt = dt;
    if (state.fxTimeScaleLeft > 0 && flourishFxEnabled()) {
      const consumed = Math.min(dt, state.fxTimeScaleLeft);
      const scale = Math.max(0.1, Math.min(1, state.fxTimeScale || 0.35));
      visualDt = consumed * scale + (dt - consumed);
      state.fxTimeScaleLeft = Math.max(0, state.fxTimeScaleLeft - consumed);
    } else {
      state.fxTimeScaleLeft = 0;
      state.fxTimeScale = 1;
      const lag = logicEndTime - state.fxVisualTime;
      if (lag > dt * 0.05) visualDt = Math.min(dt * 1.75, lag);
    }

    state.fxVisualTime = Math.min(logicEndTime, state.fxVisualTime + visualDt);
  }

  function resetRunFx(seed, vehicleX) {
    fxRng = fx.createSeededRng(hashSeed(seed));
    fxTiltRad = 0;
    fxMoveX = 0;
    fxPrevVehicleX = Number.isFinite(vehicleX) ? vehicleX : null;
    fxBossKillFx = null;
    fxScorchCursor = 0;
    for (let i = 0; i < fxScorches.length; i += 1) fxScorches[i].active = false;
    ensureFxState();
    fx.resetFxState(fxState);
  }

  function fxTrailColor(projectile) {
    if (projectile && projectile.color) return projectile.color;
    return weaponVisual(projectile && projectile.weaponMode).trail;
  }

  function fxExhaustLayer(environment, spec) {
    let layer = fxExhaustLayers[environment];
    if (!layer || layer.__spec !== spec) {
      layer = Object.assign({ id: `exhaust_${environment}` }, spec);
      layer.__spec = spec;
      fxExhaustLayers[environment] = layer;
    }
    return layer;
  }

  function fxVehicleVisualHeight(vehicleConfig) {
    const width = vehicleConfig.visualWidth || (vehicleConfig.visualHalfWidth || 36) * 2;
    const record = vehicleConfig.spriteImage ? vehicleImages[vehicleConfig.id] : null;
    if (record && record.image && record.image.naturalWidth > 0) {
      return width * (record.image.naturalHeight / record.image.naturalWidth);
    }
    return width * 1.6;
  }

  function fxLayerAnchor(layer, vehicle) {
    const anchor = fxScratch.anchor;
    // 載具貼圖以 y - 0.72h 為頂、y + 0.28h 為底（同 drawVehicle）；
    // 錨點必須落在貼圖輪廓外，粒子才不會被載具蓋住（船首白沫/船尾尾流）。
    const vehicleConfig = getVehicleConfig(state.vehicleId);
    const visualWidth = vehicleConfig.visualWidth || (vehicleConfig.visualHalfWidth || 36) * 2;
    const visualHeight = fxVehicleVisualHeight(vehicleConfig);
    const sideOffset = (layer.anchorSide || 0) * visualWidth * 0.3;
    if (layer.anchor === "vehicle_rear") {
      anchor.x = vehicle.x + sideOffset;
      anchor.y = vehicle.y + visualHeight * 0.28 + 6;
    } else if (layer.anchor === "vehicle_bow") {
      anchor.x = vehicle.x + sideOffset;
      anchor.y = vehicle.y - visualHeight * 0.72 - 4;
    } else if (layer.anchor === "road") {
      anchor.x = (config.LOGIC.roadLeft + config.LOGIC.roadRight) * 0.5;
      anchor.y = fxRng() * H * 0.7;
    } else if (layer.anchor === "water") {
      anchor.x = W * 0.5;
      anchor.y = H * 0.42;
    } else {
      anchor.x = W * 0.5;
      anchor.y = fxRng() * H * 0.55;
    }
    return anchor;
  }

  function updateFx(dt) {
    if (!FXC || !state) return;
    ensureFxState();
    if (fxLevelSetting() === "off") {
      if (fxState.activeCount > 0) fx.resetFxState(fxState);
      fxTiltRad = 0;
      fxMoveX = 0;
      fxPrevVehicleX = state.vehicle.x;
      return;
    }
    const vehicle = state.vehicle;
    const environment = currentEnvironment();

    // 載具水平速度平滑（供移動傾斜與排氣方向使用）
    if (fxPrevVehicleX == null) fxPrevVehicleX = vehicle.x;
    const instantVx = (vehicle.x - fxPrevVehicleX) / Math.max(0.0001, dt);
    fxPrevVehicleX = vehicle.x;
    fxMoveX += (instantVx - fxMoveX) * Math.min(1, 8 * dt);

    const motion = fx.vehicleMotion(FXC, environment, state.time, fxMoveX, fxScratch.motion);
    fxTiltRad += (motion.tiltRad - fxTiltRad) * Math.min(1, (motion.tiltEase || 8) * dt);

    // 環境動態層（parallax 星塵由渲染端直繪，不佔池）
    const layers = fx.environmentLayers(FXC, environment);
    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i];
      if (Array.isArray(layer.parallax)) continue;
      const anchor = fxLayerAnchor(layer, vehicle);
      fx.spawnEnvironmentLayer(fxState, layer, dt, anchor.x, anchor.y, fxRng);
    }

    // 排氣 / 噴焰（生成於載具貼圖底緣外，避免被載具蓋住）
    if (motion.exhaust) {
      const exhaustLayer = fxExhaustLayer(environment, motion.exhaust);
      const exhaustY = vehicle.y + fxVehicleVisualHeight(getVehicleConfig(state.vehicleId)) * 0.28 + 6;
      fx.spawnEnvironmentLayer(fxState, exhaustLayer, dt, vehicle.x, exhaustY, fxRng);
    }

    // 子彈曳光（trailEvery 於低品質自動抽疏）
    for (let i = 0; i < state.projectiles.length; i += 1) {
      const projectile = state.projectiles[i];
      const visual = weaponVisual(projectile.weaponMode);
      fxTrailSpec.x = projectile.x - projectile.vx * 0.012;
      fxTrailSpec.y = projectile.y - projectile.vy * 0.012;
      fxTrailSpec.vx = projectile.vx * 0.08;
      fxTrailSpec.vy = projectile.vy * 0.08;
      fxTrailSpec.life = visual.trailLife;
      fxTrailSpec.size = visual.trailSize;
      fxTrailSpec.sizeEnd = Math.max(0.2, visual.trailSize * 0.18);
      fxTrailSpec.stretch = visual.trailStretch;
      fxTrailSpec.shape = visual.trailShape;
      fxTrailSpec.color = fxTrailColor(projectile);
      fx.spawnTrailPoint(fxState, fxTrailSpec);
    }

    fx.updateParticles(fxState, dt);
  }

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

  function runTrailerSpec(vehicleConfig) {
    const runTrailer = config.RUN_TRAILER || {};
    const byEnvironment = runTrailer.byEnvironment || {};
    return vehicleConfig && vehicleConfig.environment ? byEnvironment[vehicleConfig.environment] || null : null;
  }

  function preloadRunTrailerImages() {
    if (typeof root.Image !== "function") return;
    const byEnvironment = (config.RUN_TRAILER && config.RUN_TRAILER.byEnvironment) || {};
    Object.keys(byEnvironment).forEach((environment) => {
      const spec = byEnvironment[environment];
      const src = spec && spec.spriteImage;
      if (!src || runTrailerImages[src]) return;
      const record = { image: new root.Image(), status: "loading", src };
      record.image.onload = () => {
        record.status = "loaded";
        draw();
      };
      record.image.onerror = () => {
        record.status = "failed";
        draw();
      };
      record.image.decoding = "async";
      record.image.src = src;
      runTrailerImages[src] = record;
    });
  }

  function runTrailerImageStatus(spec) {
    const src = spec && spec.spriteImage;
    const record = src ? runTrailerImages[src] : null;
    if (!record) return "none";
    if (record.status === "loaded" && record.image.complete && record.image.naturalWidth > 0) return "loaded";
    return record.status;
  }

  function preloadCompanionImages() {
    if (typeof root.Image !== "function") return;
    const spec = config.TRAILER_GUNNER || {};
    const src = spec.sprite;
    if (!src || companionImages[src]) return;
    const record = { image: new root.Image(), status: "loading", src };
    record.image.onload = () => {
      record.status = "loaded";
      draw();
    };
    record.image.onerror = () => {
      record.status = "failed";
      draw();
    };
    record.image.decoding = "async";
    record.image.src = src;
    companionImages[src] = record;
  }

  function companionImageStatus(spec) {
    const src = spec && spec.sprite;
    const record = src ? companionImages[src] : null;
    if (!record) return "none";
    if (record.status === "loaded" && record.image.complete && record.image.naturalWidth > 0) return "loaded";
    return record.status;
  }

  function preloadEnvironmentImages() {
    if (typeof root.Image !== "function") return;
    Object.keys(config.ENVIRONMENT_BACKGROUNDS || {}).forEach((environment) => {
      const src = config.ENVIRONMENT_BACKGROUNDS[environment];
      if (!src || environmentImages[environment]) return;
      const record = { image: new root.Image(), status: "loading", src };
      record.image.onload = () => {
        record.status = "loaded";
        draw();
      };
      record.image.onerror = () => {
        record.status = "failed";
        draw();
      };
      record.image.decoding = "async";
      record.image.src = src;
      environmentImages[environment] = record;
    });
  }

  function preloadRoadDetailImage() {
    const spec = config.ROAD_DETAIL_ATLAS;
    if (!spec || !spec.image || typeof root.Image !== "function" || roadDetailImage.image) return;
    roadDetailImage.image = new root.Image();
    roadDetailImage.status = "loading";
    roadDetailImage.image.onload = () => {
      roadDetailImage.status = "loaded";
      draw();
    };
    roadDetailImage.image.onerror = () => {
      roadDetailImage.status = "failed";
      draw();
    };
    roadDetailImage.image.decoding = "async";
    roadDetailImage.image.src = spec.image;
  }

  function environmentImageStatus(environment) {
    const record = environmentImages[environment];
    if (!record) return "none";
    if (record.status === "loaded" && record.image.complete && record.image.naturalWidth > 0) return "loaded";
    return record.status;
  }

  // Kenney 粒子紋理只在載入時建立固定 tint atlas；逐幀渲染僅 drawImage，不做 filter / 配色運算。
  function buildFxTextureTint(textureName, tint) {
    const record = fxTextureImages[textureName];
    if (!record || record.status !== "loaded" || !record.image.naturalWidth) return null;
    const key = `${textureName}:${tint || "base"}`;
    if (fxTextureTintCache[key]) return fxTextureTintCache[key];
    const buffer = root.document.createElement("canvas");
    buffer.width = record.image.naturalWidth;
    buffer.height = record.image.naturalHeight;
    const bufferCtx = buffer.getContext("2d");
    bufferCtx.imageSmoothingEnabled = true;
    bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
    bufferCtx.drawImage(record.image, 0, 0);
    if (tint) {
      bufferCtx.globalCompositeOperation = "multiply";
      bufferCtx.fillStyle = tint;
      bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
      bufferCtx.globalCompositeOperation = "destination-in";
      bufferCtx.drawImage(record.image, 0, 0);
      bufferCtx.globalCompositeOperation = "source-over";
    }
    fxTextureTintCache[key] = buffer;
    return buffer;
  }

  function prepareFxTextureTints(textureName) {
    buildFxTextureTint(textureName, null);
    const tints = (FXC && FXC.textureTints) || [];
    for (let i = 0; i < tints.length; i += 1) buildFxTextureTint(textureName, tints[i]);
  }

  function preloadFxTextures() {
    if (!FXC || typeof root.Image !== "function") return;
    const textures = FXC.textures || {};
    Object.keys(textures).forEach((textureName) => {
      const src = textures[textureName];
      if (!src || fxTextureImages[textureName]) return;
      const record = { image: new root.Image(), status: "loading", src };
      record.image.onload = () => {
        record.status = "loaded";
        prepareFxTextureTints(textureName);
        draw();
      };
      record.image.onerror = () => {
        record.status = "failed";
        draw();
      };
      record.image.decoding = "async";
      record.image.src = src;
      fxTextureImages[textureName] = record;
    });
  }

  function fxTextureStatus() {
    const names = Object.keys((FXC && FXC.textures) || {});
    if (!names.length) return "none";
    if (names.some((name) => !fxTextureImages[name] || fxTextureImages[name].status === "loading")) return "loading";
    if (names.some((name) => fxTextureImages[name].status !== "loaded")) return "failed";
    return "loaded";
  }

  function preloadEnemyImages() {
    if (typeof root.Image !== "function") return;
    Object.keys(config.ENEMIES).forEach((enemyId) => {
      const enemy = config.ENEMIES[enemyId];
      const animation = enemy.spriteAnimation || null;
      const src = (animation && animation.image) || enemy.spriteImage;
      if (!src || enemyImages[enemyId]) return;
      const record = { image: new root.Image(), status: "loading", src, tintCanvas: null };
      record.image.onload = () => {
        record.status = "loaded";
        buildEnemyAnimationTint(enemyId);
        draw();
      };
      record.image.onerror = () => {
        record.status = "failed";
        draw();
      };
      record.image.decoding = "async";
      record.image.src = src;
      enemyImages[enemyId] = record;
    });
  }

  // 每種敵人的廢土暖色只在貼圖載入時合成一次；150+ 實體共享同一張離屏 atlas。
  function buildEnemyAnimationTint(enemyId) {
    const record = enemyImages[enemyId];
    const enemy = config.ENEMIES[enemyId];
    const animation = enemy && enemy.spriteAnimation;
    if (!record || record.status !== "loaded" || !record.image.naturalWidth || !animation) return null;
    const buffer = root.document.createElement("canvas");
    buffer.width = record.image.naturalWidth;
    buffer.height = record.image.naturalHeight;
    const bufferCtx = buffer.getContext("2d");
    bufferCtx.imageSmoothingEnabled = false;
    bufferCtx.drawImage(record.image, 0, 0);
    if (animation.warmTint) {
      bufferCtx.globalCompositeOperation = "source-atop";
      bufferCtx.fillStyle = animation.warmTint;
      bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
      bufferCtx.globalCompositeOperation = "source-over";
    }
    record.tintCanvas = buffer;
    return buffer;
  }

  function enemyImageStatus(enemyId) {
    const record = enemyImages[enemyId];
    if (!record) return "none";
    if (record.status === "loaded" && record.image.complete && record.image.naturalWidth > 0) return "loaded";
    return record.status;
  }

  function addEffect(effect) {
    state.effects.push(effect);
    const cap = effectiveMaxEffects();
    if (state.effects.length > cap) {
      state.effects.splice(0, state.effects.length - cap);
    }
  }

  function addFloatingText(text, x, y, options) {
    if (meta.settings && meta.settings.reducedFlash) return;
    const opts = options || {};
    const minInterval = qualityProfile().floatingTextMinInterval || 0;
    if (minInterval > 0 && state && state.time - performanceState.lastFloatingTextAt < minInterval) return;
    if (opts.damageNumber) {
      const density = meta.settings && meta.settings.damageTextDensity ? meta.settings.damageTextDensity : "all";
      if (density === "off") return;
      if (density === "large" && rules.finiteNumber(opts.amount, 0, { min: 0 }) < 30) return;
    }
    performanceState.lastFloatingTextAt = state ? state.time : performanceState.lastFloatingTextAt;
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

  function addHudFlyEffect(target, x, y, label, color) {
    if (!flourishFxEnabled()) return;
    const anchor = hudAnchors[target] || hudAnchors.supply;
    addEffect({
      id: nextId("hudfly"),
      kind: "hud_fly",
      startX: Number.isFinite(x) ? x : W * 0.5,
      startY: Number.isFinite(y) ? y : H * 0.5,
      targetX: anchor.x,
      targetY: anchor.y,
      x: Number.isFinite(x) ? x : W * 0.5,
      y: Number.isFinite(y) ? y : H * 0.5,
      icon: anchor.icon,
      text: label || "",
      color: color || anchor.color,
      ttl: 0.62,
      age: 0,
      alpha: 1
    });
    addEffect({
      id: nextId("hudpop"),
      kind: "hud_pop",
      x: anchor.x,
      y: anchor.y,
      text: label || "",
      color: color || anchor.color,
      ttl: 0.34,
      age: 0,
      alpha: 1
    });
  }

  function triggerEnemyHitFlair(enemy, projectile) {
    enemy.hitFlash = flourishFxEnabled() ? 0.2 : 0.12;
    if (!flourishFxEnabled() || !projectile) return;
    const speed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy) || 1;
    enemy.hitFlashMax = 0.2;
    enemy.hitFlashColor = weaponVisual(projectile.weaponMode).core;
    enemy.hitDirectionX = projectile.vx / speed;
    enemy.hitDirectionY = projectile.vy / speed;
    const sizeMul = enemy.boss ? 0.55 : enemy.radius >= 13 ? 1.15 : 0.85;
    enemy.knockbackX = enemy.hitDirectionX * sizeMul * 1.7;
    enemy.knockbackY = enemy.hitDirectionY * sizeMul * 1.7;
  }

  function triggerVehicleRecoil(direction) {
    if (!flourishFxEnabled() || !direction) return;
    state.vehicle.recoilX = -direction.x * 1.5;
    state.vehicle.recoilY = -direction.y * 1.2;
    state.vehicle.recoilUntil = state.time + 0.12;
    state.vehicle.recoilStartedAt = state.time;
  }

  function updateCombo(enemy) {
    if (!state.combo) state.combo = { count: 0, lastKillAt: -1000000, best: 0 };
    const cfg = (FXC && FXC.combo) || {};
    const windowSeconds = cfg.windowSeconds || 2.25;
    const count = state.time - state.combo.lastKillAt <= windowSeconds ? state.combo.count + 1 : 1;
    state.combo.count = count;
    state.combo.lastKillAt = state.time;
    state.combo.best = Math.max(state.combo.best || 0, count);
    if (count >= 2 && flourishFxEnabled()) {
      addFloatingText(`COMBO x${count}`, enemy.x, enemy.y - enemy.radius - 18, {
        color: cfg.color || "#ffe08a",
        size: Math.min(13, 8 + Math.floor(count / 3)),
        ttl: 0.72,
        vy: -15
      });
    }
  }

  function addWaveCelebration(completedWave, partsDelta) {
    if (!flourishFxEnabled()) return;
    const amount = Math.max(0, Math.round(partsDelta || 0));
    addEffect({
      id: nextId("waveclear"),
      kind: "wave_celebration",
      text: `WAVE ${completedWave} CLEAR`,
      subtext: amount > 0 ? `PARTS +${amount}` : "",
      x: W * 0.5,
      y: H * 0.5 - 64,
      color: "#f2e6c8",
      ttl: 1.15,
      age: 0,
      alpha: 1
    });
    if (amount > 0) addHudFlyEffect("parts", W * 0.5, H * 0.5 - 40, `+${amount}`, "#f0b64a");
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

  function speakerName(speaker) {
    if (speaker === "xi") return "熹";
    if (speaker === "driver") return "壁爐";
    return "旁白";
  }

  function runBarksEnabled() {
    if (!config.RUN_BARKS) return false;
    if (meta.settings && meta.settings.showCompanion === false) return false;
    if (meta.settings && meta.settings.reducedFlash === true) return false;
    return true;
  }

  function pushRunBark(barkId) {
    if (!state || !runBarksEnabled()) return false;
    if (!state.runBarksSeen) state.runBarksSeen = {};
    if (state.runBarksSeen[barkId]) return false;
    const bark = config.RUN_BARKS[barkId];
    if (!bark || !Array.isArray(bark.lines) || !bark.lines.length) return false;
    state.runBarksSeen[barkId] = true;
    if (!state.stats.runBarks || typeof state.stats.runBarks !== "object") state.stats.runBarks = {};
    state.stats.runBarks[barkId] = 1;
    const title = speakerName(bark.lines[0].speaker);
    const body = bark.lines.map((line) => `${speakerName(line.speaker)}：「${line.text}」`).join(" ");
    state.messages.push({ text: body, time: state.time, ttl: bark.ttl || 1.8 });
    pushEventBanner(title, body, { kind: "story", ttl: bark.ttl || 1.8 });
    return true;
  }

  function triggerWaveStartBarks(wave) {
    if (wave === 10 || wave === 15) pushRunBark("deep_route");
  }

  function eventBarkLine(event) {
    if (!event || !Array.isArray(event.barks) || !event.barks.length) return "";
    const index = (state.wave + state.stats.environmentEvents.length) % event.barks.length;
    const line = event.barks[index];
    if (!line || !line.text) return "";
    return `${speakerName(line.speaker)}：「${line.text}」`;
  }

  function eventBannerBody(event) {
    if (!event) return "";
    const parts = [event.systemLine || `${event.label}：${event.description}`];
    const bark = eventBarkLine(event);
    if (bark) parts.push(bark);
    if (event.objective) parts.push(`目標：${event.objective}`);
    return parts.join(" ");
  }

  function applyOverflowReward(overflow, x, y) {
    if (!overflow || !Number.isFinite(overflow.amount) || overflow.amount <= 0) return;
    let label = "";
    let color = "#ffd27f";
    if (overflow.type === "goods") {
      state.stats.scavengeGoods += overflow.amount;
      label = `拾荒物資 +${overflow.amount}`;
      color = "#d7b56b";
    } else if (overflow.type === "heal") {
      const before = state.vehicle.hp;
      state.vehicle.hp = Math.min(state.vehicle.maxHp, state.vehicle.hp + overflow.amount);
      const healed = Math.max(0, Math.round(state.vehicle.hp - before));
      label = `HP +${healed}`;
      color = "#87d27d";
    } else if (overflow.type === "score") {
      state.stats.score += overflow.amount;
      label = `分數 +${overflow.amount}`;
      color = "#f0b64a";
    }
    if (!label) return;
    state.messages.push({ text: `溢出：${label}`, time: state.time, ttl: 1.45 });
    addFloatingText(label, Number.isFinite(x) ? x : state.vehicle.x, Number.isFinite(y) ? y : state.vehicle.y - 64, {
      color,
      size: 8,
      ttl: 0.72,
      vy: -13
    });
  }

  function pulseShake(amount, duration) {
    if (meta.settings && meta.settings.reducedFlash) return;
    if (meta.settings && meta.settings.screenShake === false) return;
    state.shakeAmp = Math.max(state.shakeAmp || 0, amount);
    state.shakeUntil = Math.max(state.shakeUntil || 0, state.time + duration);
  }

  function qualityProfile() {
    const profiles = config.PERFORMANCE.qualityProfiles || {};
    return profiles[performanceState.quality] || profiles.high || config.PERFORMANCE;
  }

  function effectiveMaxEffects() {
    return qualityProfile().maxEffects || config.PERFORMANCE.maxEffects;
  }

  function effectiveMaxEnemies() {
    return qualityProfile().maxEnemies || config.PERFORMANCE.maxEnemies;
  }

  function enemyAnimScale() {
    return qualityProfile().enemyAnimScale || 1;
  }

  function publicEntity(entity) {
    const copy = {};
    Object.keys(entity).forEach((key) => {
      if (
        key !== "hitFlash" && key !== "hitFlashMax" && key !== "hitFlashColor" &&
        key !== "hitDirectionX" && key !== "hitDirectionY" &&
        key !== "knockbackX" && key !== "knockbackY" && key !== "phaseTriggered"
      ) copy[key] = rules.deepClone(entity[key]);
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
      effectiveRunMods: rules.deepClone(effectiveRunMods()),
      runBarksSeen: rules.deepClone(state.runBarksSeen || {}),
      input: rules.deepClone(state.input),
      eventBanner: state.eventBanner ? rules.deepClone(state.eventBanner) : null,
      lastGateChoice: state.lastGateChoice ? rules.deepClone(state.lastGateChoice) : null,
      combo: state.combo ? rules.deepClone(state.combo) : null,
      fxTimeScaleLeft: state.fxTimeScaleLeft || 0,
      fxTimeScale: state.fxTimeScale || 1,
      fxVisualTime: visualStateTime(),
      gateChoice: state.gateChoice ? rules.deepClone(state.gateChoice) : null,
      supplyChoice: state.supplyChoice ? rules.deepClone(state.supplyChoice) : null,
      enemies: state.enemies.map(publicEntity),
      hazards: state.hazards.map(publicEntity),
      enemyProjectiles: state.enemyProjectiles.map(publicEntity),
      supplyDrops: state.supplyDrops.map(publicEntity),
      weaponPowerups: state.weaponPowerups.map(publicEntity),
      supplyBuffs: state.supplyBuffs.map(publicEntity),
      projectiles: state.projectiles.map(publicEntity),
      gates: state.gates.map(publicEntity),
      effects: state.effects.map(publicEntity),
      performance: {
        quality: performanceState.quality,
        fps: Math.round(performanceState.fps),
        mode: (meta.settings && meta.settings.performanceMode) || "auto",
        constrainedDevice: performanceState.constrainedDevice,
        maxEffects: effectiveMaxEffects(),
        maxEnemies: effectiveMaxEnemies(),
        capMultiplier: Math.round(
          Math.min(
            effectiveMaxEnemies() / Math.max(1, config.PERFORMANCE.maxEnemies),
            effectiveMaxEffects() / Math.max(1, config.PERFORMANCE.maxEffects)
          ) * 100
        ) / 100,
        reason: performanceState.reason,
        history: rules.deepClone(performanceState.history)
      },
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

  function effectiveRunMods() {
    const mods = rules.deepClone(state.runMods || rules.defaultRunMods());
    (state.supplyBuffs || []).forEach((buff) => {
      if (buff.until <= state.time) return;
      if (buff.type === "rate") mods.fireIntervalMul *= buff.fireIntervalMul || 1;
      if (buff.type === "damage") mods.damageAdd += buff.damageAdd || 0;
    });
    return mods;
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
        supplyParts: state.stats.supplyParts,
        supplyCratesCollected: state.stats.supplyCratesCollected,
        difficultyId: state.difficultyId
      },
      config
    );
  }

  function addStatMapValue(mapName, key, value) {
    if (!state || !state.stats) return;
    const safeKey = key || "unknown";
    if (!state.stats[mapName]) state.stats[mapName] = {};
    state.stats[mapName][safeKey] = (state.stats[mapName][safeKey] || 0) + (Number.isFinite(value) ? value : 0);
  }

  function addDamageSource(source, amount) {
    addStatMapValue("damageBySource", source || state.vehicleId || "weapon", amount);
  }

  function addDamageTaken(source, amount) {
    const key = source && source.type ? source.type : "unknown";
    addStatMapValue("damageTakenBy", key, amount);
  }

  function activeBuffLabels() {
    const labels = [];
    if (state.runMods.damageAdd > 0) labels.push("增傷門");
    if (state.runMods.fireIntervalMul < 0.999) labels.push("射速門");
    if (state.runMods.projectileAdd > 0) labels.push("多重彈");
    if (state.runMods.focusUntil > state.time) labels.push("校準門");
    state.supplyBuffs.forEach((buff) => {
      if (buff.until > state.time && buff.label) labels.push(buff.label);
    });
    return labels;
  }

  function recordRecentDamage(source, amount) {
    if (!state.stats.recentDamageEvents) state.stats.recentDamageEvents = [];
    state.stats.recentDamageEvents.push({
      time: state.time,
      source: source && source.type ? source.type : "unknown",
      enemyId: source && source.enemyId ? source.enemyId : "",
      amount,
      buffs: activeBuffLabels()
    });
    state.stats.recentDamageEvents = state.stats.recentDamageEvents.filter((event) => state.time - event.time <= 5);
  }

  function recordDamageTimeline(amount) {
    const value = Number.isFinite(amount) ? amount : 0;
    if (value <= 0) return;
    if (!state.stats.damageTimeline) state.stats.damageTimeline = {};
    const bucket = Math.max(0, Math.floor(state.time));
    state.stats.damageTimeline[bucket] = (state.stats.damageTimeline[bucket] || 0) + value;
  }

  function projectileDamageSources(runMods) {
    const totalDamageAdd = Math.max(0, runMods && runMods.damageAdd ? runMods.damageAdd : 0);
    const gateDamageAdd = Math.max(0, state.runMods && state.runMods.damageAdd ? state.runMods.damageAdd : 0);
    const supplyDamageAdd = Math.max(0, totalDamageAdd - gateDamageAdd);
    const totalMul = 1 + totalDamageAdd;
    const sources = [{ key: state.vehicleId, ratio: 1 / totalMul }];
    if (gateDamageAdd > 0) sources.push({ key: "gate_damage", ratio: gateDamageAdd / totalMul });
    if (supplyDamageAdd > 0) sources.push({ key: "supply_damage", ratio: supplyDamageAdd / totalMul });
    return sources;
  }

  function addProjectileDamageSource(projectile, amount) {
    const sources = projectile && Array.isArray(projectile.damageSources) ? projectile.damageSources : null;
    if (!sources || !sources.length) {
      addDamageSource((projectile && projectile.vehicleId) || "weapon", amount);
      return;
    }
    sources.forEach((source) => {
      addDamageSource(source.key, amount * source.ratio);
    });
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

  function recordRunEventStat(eventId, key) {
    if (!eventId || !state.stats.eventStats || !state.stats.eventStats[eventId]) return;
    state.stats.eventStats[eventId][key] += 1;
  }

  function activateWaveEnvironmentEvent() {
    if (!state || !state.wavePlan || !state.wavePlan.environmentEvent) return;
    if (state.activeEnvironmentEventWave === state.wave) return;
    const event = state.wavePlan.environmentEvent;
    state.activeEnvironmentEventWave = state.wave;
    if (!state.stats.environmentEvents.includes(event.id)) state.stats.environmentEvents.push(event.id);
    recordRunEventStat(event.id, "encounters");
    if (event.rewardMulAdd) {
      state.stats.eventRewardMul = Math.min(2, state.stats.eventRewardMul + event.rewardMulAdd);
    }
    if (event.id === "meteor_shower") spawnMeteorHazards(event);
    pushEventBanner(event.label || "環境事件", eventBannerBody(event), { kind: "event", ttl: 2.6 });
  }

  function completeCurrentEnvironmentEvent() {
    const event = state.wavePlan && state.wavePlan.environmentEvent;
    if (!event || state.completedEnvironmentEventWave === state.wave) return;
    state.completedEnvironmentEventWave = state.wave;
    recordRunEventStat(event.id, "completions");
    if (event.completeLine) {
      pushEventBanner("事件收束", event.completeLine, { kind: "event", ttl: 1.6 });
    }
  }

  function spawnSupplyDrop(x, y) {
    state.supplyDrops.push({
      id: nextId("supply"),
      x,
      y,
      vx: 0,
      vy: (config.SUPPLY_DROPS && config.SUPPLY_DROPS.crateSpeed) || 18,
      radius: 12,
      age: 0,
      ttl: (config.SUPPLY_DROPS && config.SUPPLY_DROPS.ttl) || 11,
      picked: false
    });
    addFloatingText("補給", x, y - 14, { color: "#5ed4cb", size: 8, ttl: 0.55, vy: -12 });
  }

  function maybeDropSupply(enemy) {
    const result = rules.rollSupplyDrop({
      killsSinceDrop: state.stats.supplyKillsSinceDrop,
      rng: state.rng,
      config
    });
    state.stats.supplyKillsSinceDrop = result.killsSinceDrop;
    if (result.dropped) {
      state.stats.supplyCratesDropped += 1;
      spawnSupplyDrop(enemy.x, enemy.y);
    }
  }

  function spawnWeaponPowerup(x, y, mode) {
    const powerups = config.WEAPON_POWERUPS || {};
    state.weaponPowerups.push({
      id: nextId("weapon_powerup"),
      mode,
      x,
      y,
      vx: 0,
      vy: powerups.crateSpeed || 24,
      radius: 12,
      age: 0,
      ttl: powerups.ttl || 14,
      picked: false
    });
    addFloatingText("彈種", x, y - 16, { color: "#ffd27f", size: 8, ttl: 0.55, vy: -12 });
  }

  function maybeDropWeaponPowerup(enemy) {
    const powerups = config.WEAPON_POWERUPS || {};
    const modes = Array.isArray(powerups.cycleModes) && powerups.cycleModes.length ? powerups.cycleModes : [];
    if (!modes.length) return;
    const killsSinceDrop = Math.max(0, state.stats.weaponPowerupKillsSinceDrop || 0) + 1;
    const pityKills = Math.max(1, powerups.pityKills || 30);
    const guaranteed = killsSinceDrop >= pityKills;
    const dropped = guaranteed || state.rng() < Math.max(0, Math.min(1, powerups.dropChancePerKill || 0));
    state.stats.weaponPowerupKillsSinceDrop = dropped ? 0 : killsSinceDrop;
    if (!dropped) return;
    const mode = modes[Math.min(modes.length - 1, Math.floor(state.rng() * modes.length))];
    state.stats.weaponPowerupsDropped += 1;
    spawnWeaponPowerup(enemy.x, enemy.y, mode);
  }

  function maybeDropScavenge(enemy) {
    const result = rules.rollScavengeDrop({
      killsSinceDrop: state.stats.scavengeKillsSinceDrop,
      rng: state.rng,
      config
    });
    state.stats.scavengeKillsSinceDrop = result.killsSinceDrop;
    if (!result.dropped) return;
    state.stats.scavengeGoods += result.goods;
    state.stats.scavengeDrops += 1;
    const label = `拾荒物資 +${result.goods}`;
    state.messages.push({ text: label, time: state.time, ttl: 1.3 });
    addFloatingText(label, enemy.x, enemy.y - enemy.radius - 10, { color: "#d7b56b", size: 7, ttl: 0.65, vy: -13 });
  }

  function openSupplyChoice(drop) {
    if (!drop || drop.picked || state.supplyChoice || state.gateChoice) return;
    drop.picked = true;
    state.supplyChoice = {
      dropId: drop.id,
      x: drop.x,
      y: drop.y,
      openedAt: state.time,
      rewardIds: Object.keys((config.SUPPLY_DROPS && config.SUPPLY_DROPS.rewards) || {})
    };
    // Keep combat moving: the compact supply strip is a one-tap, non-modal choice.
    pushEventBanner("補給箱", "選一項補給，戰鬥不中斷", { kind: "supply", ttl: 1.6 });
    emitState();
  }

  function chooseSupplyReward(rewardId) {
    if (!state || state.over || !state.supplyChoice) return getState();
    const choice = state.supplyChoice;
    const result = rules.applySupplyRewardById({
      rewardId,
      time: state.time,
      vehicle: state.vehicle,
      runMods: state.runMods,
      supplyBuffs: state.supplyBuffs,
      stats: state.stats,
      buffId: nextId("buff"),
      config
    });
    if (!result.ok) return getState();
    state.vehicle = result.vehicle || state.vehicle;
    state.runMods = result.runMods || state.runMods;
    state.supplyBuffs = result.supplyBuffs;
    state.stats = Object.assign(state.stats, result.stats);
    applyOverflowReward(result.overflow, choice.x, choice.y - 10);
    state.supplyChoice = null;
    state.messages.push({ text: `補給箱：${result.reward.label}`, time: state.time, ttl: 1.8 });
    pushEventBanner("補給箱", result.reward.label, { kind: "supply", ttl: 1.5 });
    pushRunBark("first_supply");
    playSound("pickup");
    if (result.partsGained > 0) addHudFlyEffect("parts", choice.x, choice.y, `+${result.partsGained}`, "#f0b64a");
    else if (result.heal > 0) addHudFlyEffect("hp", choice.x, choice.y, `+${result.heal}`, "#87d27d");
    else if (result.shieldGained > 0) addHudFlyEffect("hp", choice.x, choice.y, `+${result.shieldGained}`, "#5ed4cb");
    else addHudFlyEffect("supply", choice.x, choice.y, "+", "#5ed4cb");
    addEffect({
      id: nextId("effect"),
      kind: "supply_pickup",
      x: choice.x,
      y: choice.y,
      text: result.reward.label,
      color: "#5ed4cb",
      ttl: 0.55,
      age: 0,
      alpha: 1
    });
    if (result.shieldGained > 0) {
      addFloatingText(`護盾 +${result.shieldGained}`, state.vehicle.x, state.vehicle.y - 58, {
        color: "#5ed4cb",
        size: 8,
        ttl: 0.7,
        vy: -12
      });
    }
    updatePartsPreview();
    emitState();
    return getState();
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
        maxShield: Math.round(vehicleStats.maxHp * 0.6),
        armor: vehicleStats.armor,
        damageTakenMul: vehicleStats.damageTakenMul,
        radius: vehicleConfig.radius,
        x: W * 0.5,
        y: config.LOGIC.vehicleY,
        followX: W * 0.5,
        aimX: W * 0.5,
        aimY: 300,
        assistAimX: W * 0.5,
        assistAimY: 300,
        aimAssistTarget: null,
        weaponCooldown: 0,
        recentHitUntil: 0,
        slipstreamReadyAt: 0
      },
      runTrailerPose: null,
      runTrailerUpdatedAt: 0,
      companionPose: null,
      companionUpdatedAt: 0,
      companionCooldown: 0,
      companionFiringUntil: 0,
      runMods: rules.defaultRunMods(),
      enemies: [],
      hazards: [],
      enemyProjectiles: [],
      supplyDrops: [],
      weaponPowerups: [],
      supplyBuffs: [],
      gateChoice: null,
      supplyChoice: null,
      projectiles: [],
      gates: [],
      effects: [],
      runBarksSeen: {},
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
        eventStats: rules.sanitizeEventStats(null, config),
        supplyKillsSinceDrop: 0,
        supplyCratesDropped: 0,
        supplyCratesCollected: 0,
        supplyParts: 0,
        supplyRewards: {},
        lastSupplyReward: "",
        weaponPowerupKillsSinceDrop: 0,
        weaponPowerupsDropped: 0,
        weaponPowerupsCollected: 0,
        scavengeKillsSinceDrop: 0,
        scavengeDrops: 0,
        scavengeGoods: 0,
        damageTakenBy: {},
        damageBySource: {},
        damageTimeline: {},
        recentDamageEvents: [],
        variantKills: {},
        runBarks: {},
        deathContext: null,
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
      waveBannerKind: "wave",
      waveBannerStart: 0,
      waveBannerNumber: 1,
      combo: { count: 0, lastKillAt: -1000000, best: 0 },
      fxVisualTime: 0,
      fxTimeScaleLeft: 0,
      fxTimeScale: 1,
      lastBroadsideEchoAt: -1000000,
      messages: []
    };

    state = initial;
    state.wavePlan = makeWavePlan(1);
    if (state.wavePlan && state.wavePlan.boss) state.waveBannerKind = "boss";
    activateWaveEnvironmentEvent();
    resetRunFx(initial.seed, initial.vehicle.x);
    playSound("waveStart");
    state.messages.push({ text: "拖曳移動＋瞄準", time: 0, ttl: 2 });
    return state;
  }

  function setMeta(nextMeta) {
    meta = rules.migrateMeta(nextMeta || meta, { config });
    if (state) {
      updatePerformanceQuality(1 / 60);
      if (FXC) syncFxStateForSettings();
      if (FXC && fxLevelSetting() === "off" && fxState) fx.resetFxState(fxState);
      draw();
    }
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
    const behavior = enemyConfig.behavior ? rules.deepClone(enemyConfig.behavior) : null;
    if (behavior && Number.isFinite(opts.enemyProjectileSpeedMul) && Number.isFinite(behavior.projectileSpeed)) {
      behavior.projectileSpeed *= opts.enemyProjectileSpeedMul;
    }
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
      behavior,
      attackCooldown: Number.isFinite(opts.attackCooldown)
        ? opts.attackCooldown
        : enemyConfig.behavior && enemyConfig.behavior.type === "ranged"
          ? enemyConfig.behavior.cooldown * (0.45 + state.rng() * 0.55)
          : 0,
      shieldHp: Number.isFinite(opts.shieldHp)
        ? opts.shieldHp
        : enemyConfig.behavior && enemyConfig.behavior.type === "shield"
          ? enemyConfig.behavior.shieldHp
          : 0,
      phaseActive: false,
      score: enemyConfig.score,
      variantId: opts.variantId || null,
      variantLabel: opts.variantLabel || "",
      tint: opts.tint || enemyConfig.tint || "",
      filter: opts.filter || enemyConfig.filter || "",
      boss: enemyConfig.boss === true,
      dead: false,
      hitCooldown: 0,
      phaseTriggered: {},
      hitFlash: 0
    };
    if (state.enemies.length >= effectiveMaxEnemies()) return null;
    state.enemies.push(enemy);
    if (enemy.boss) {
      pushEventBanner("Boss 來襲", enemyConfig.name, { kind: "boss", ttl: 2.4 });
      state.messages.push({ text: `${enemyConfig.name} 逼近`, time: state.time, ttl: 2.1 });
      pushRunBark("boss_radio");
      playSound("bossWarn");
    }
    if (!opts.silent) emitState();
    return publicEntity(enemy);
  }

  function spawnEnemyProjectile(enemy, projectile) {
    if (!enemy || !projectile || state.enemyProjectiles.length >= 40) return null;
    const shot = {
      id: nextId("enemyshot"),
      enemyId: enemy.enemyId,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      damage: projectile.damage,
      radius: projectile.radius,
      life: projectile.life,
      kind: projectile.kind || "acid",
      age: 0
    };
    state.enemyProjectiles.push(shot);
    addEffect({
      id: nextId("effect"),
      sprite: "effect_hit",
      anim: "burst",
      x: shot.x,
      y: shot.y,
      scale: 0.72,
      ttl: 0.2,
      age: 0,
      alpha: 0.72
    });
    return shot;
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
    const left = spawnGate(ids[0], { pairId, x: config.LOGIC.roadLeft + gateHalf + 1, y: -42, silent: true });
    const right = spawnGate(ids[1], { pairId, x: config.LOGIC.roadRight - gateHalf - 1, y: -42, silent: true });
    openGateChoice(pairId, [left, right]);
    emitState();
    return [left, right];
  }

  function openGateChoice(pairId, gates) {
    if (!state || state.over || state.gateChoice) return;
    const options = (gates || [])
      .map((gate) => state.gates.find((item) => item.id === gate.id || item.gateId === gate.gateId))
      .filter(Boolean)
      .map((gate) => ({
        id: gate.id,
        gateId: gate.gateId,
        label: gate.label,
        x: gate.x,
        y: gate.y
      }));
    if (!options.length) return;
    state.gateChoice = {
      pairId,
      openedAt: state.time,
      gateIds: options.map((gate) => gate.gateId),
      options
    };
    // The road gates are the choice. Steering through a lane resolves it.
    state.mode = "playing";
    const labels = options.map((option) => config.GATES[option.gateId].shortLabel).join(" ｜ ");
    pushEventBanner("增益門逼近", `← ${labels} →`, { kind: "gate", ttl: 2.8 });
  }

  function grantGate(gateId, options) {
    if (!state) startRun(meta.selectedVehicle);
    const opts = options || {};
    const result = rules.applyGateEffect({
      gateId,
      runMods: state.runMods,
      vehicle: state.vehicle,
      vehicleId: state.vehicleId,
      vehicleLevels: rules.getVehicleLevels(meta, state.vehicleId, config),
      time: state.time,
      config
    });
    state.runMods = result.runMods;
    state.vehicle = result.vehicle || state.vehicle;
    applyOverflowReward(result.overflow, state.vehicle.x, state.vehicle.y - 66);
    state.stats.gatesTaken += 1;
    state.lastGateChoice = {
      gateId,
      label: config.GATES[gateId].label,
      time: state.time,
      ttl: 1.8
    };
    state.messages.push({ text: `已選：${config.GATES[gateId].label}`, time: state.time, ttl: 1.7 });
    pushEventBanner("增益已選", config.GATES[gateId].label, { kind: "gate", ttl: 1.6 });
    pushRunBark("first_gate");
    playSound("gateChoice");
    addFloatingText(config.GATES[gateId].shortLabel, state.vehicle.x, state.vehicle.y - 54, {
      color: "#f0b64a",
      size: 9,
      ttl: 0.75,
      vy: -14
    });
    if (!opts.silent) emitState();
    return rules.deepClone({ runMods: state.runMods, vehicle: state.vehicle });
  }

  function resolveGateChoice(gate) {
    if (!gate || gate.broken) return;
    gate.broken = true;
    if (state.gateChoice && state.gateChoice.pairId === gate.pairId) state.gateChoice = null;
    state.mode = "playing";
    grantGate(gate.gateId, { silent: true });
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
    if (!state || state.over || !state.gateChoice) return getState();
    const activePairId = state.gateChoice.pairId;
    const gate = state.gates.find((item) => {
      if (item.pairId !== activePairId) return false;
      return item.id === gateId || item.gateId === gateId;
    });
    if (gate) resolveGateChoice(gate);
    draw();
    emitState();
    return getState();
  }

  function damageVehicle(amount, source) {
    if (!state) startRun(meta.selectedVehicle);
    const passive = getVehicleConfig(state.vehicleId).passive;
    const passiveDamage = rules.resolveSlipstreamDamageFields({
      vehicle: state.vehicle,
      passive,
      incoming: amount,
      time: state.time
    });
    state.vehicle.slipstreamReadyAt = passiveDamage.readyAt;
    if (passiveDamage.triggered) {
      addEffect({
        id: nextId("effect"),
        sprite: "effect_shield",
        anim: "pulse",
        x: state.vehicle.x,
        y: state.vehicle.y - 16,
        scale: 1.05,
        ttl: 0.38,
        age: 0,
        alpha: 0.78
      });
      addFloatingText("滑流", state.vehicle.x, state.vehicle.y - 56, {
        color: "#9ad7ff",
        size: 8,
        ttl: 0.55,
        vy: -12
      });
    }
    const result = rules.resolveVehicleDamageFields(state.vehicle, passiveDamage.incomingDamage, state.vehicle.armor);
    state.vehicle.hp = result.hp;
    state.vehicle.shield = result.shield;
    addDamageTaken(source, result.damage);
    recordRecentDamage(source, result.damage);
    playSound("hurt");
    state.vehicle.recentHitUntil = state.time + 0.28;
    if (passive && passive.id === "revenge_fire") state.vehicle.recentHitUntil = state.time + passive.duration;
    pulseShake(fx.resolveShake(FXC, 1.2 + (FXC && FXC.shake ? FXC.shake.hitAmp * 0.5 : 0), meta.settings), 0.18);
    if (state.vehicle.hp > 0 && state.vehicle.hp <= state.vehicle.maxHp * 0.25) {
      pushRunBark("critical_hull");
    }
    if (state.vehicle.hp <= 0) {
      const kind = source && source.type ? source.type : "unknown";
      state.stats.deathContext = {
        type: kind,
        enemyId: source && source.enemyId ? source.enemyId : "",
        amount: result.damage,
        wave: state.wave
      };
      finishRun();
    }
    emitState();
    return result;
  }

  function applyEnemyIncomingDamage(enemy, damage, projectile, options) {
    const opts = options || {};
    const incoming = rules.resolveEnemyIncomingDamage({
      enemy,
      enemyConfig: config.ENEMIES[enemy.enemyId],
      damage,
      projectile: projectile || { vy: -1, sourceKind: "aoe" },
      shieldFacing: state && state.vehicle ? state.vehicle : null,
      config
    });
    enemy.hp = incoming.hp;
    enemy.shieldHp = incoming.shieldHp;
    triggerEnemyHitFlair(enemy, projectile);
    if (opts.trackStats !== false && incoming.appliedDamage > 0) {
      state.stats.damageDealt += incoming.appliedDamage;
      recordDamageTimeline(incoming.appliedDamage);
      if (projectile) {
        addProjectileDamageSource(projectile, incoming.appliedDamage);
      } else if (opts.sourceKey) {
        addDamageSource(opts.sourceKey, incoming.appliedDamage);
      }
    }
    return incoming;
  }

  function applyBroadsideEcho(enemy) {
    const passive = getVehicleConfig(state.vehicleId).passive;
    const echo = rules.resolveBroadsideEcho({
      enemy,
      enemies: state.enemies,
      passive,
      time: state.time,
      lastTriggeredAt: state.lastBroadsideEchoAt,
      rng: state.rng
    });
    if (!echo.triggered) return;
    state.lastBroadsideEchoAt = echo.lastTriggeredAt;
    addEffect({
      id: nextId("effect"),
      sprite: "effect_explosion_small",
      anim: "burst",
      x: echo.x,
      y: echo.y,
      scale: 1.2,
      ttl: 0.34,
      age: 0,
      alpha: 0.82
    });
    echo.hits.forEach((hit) => {
      const target = state.enemies.find((item) => item.id === hit.id);
      if (!target || target.dead) return;
      const incoming = applyEnemyIncomingDamage(target, hit.damage, null, { sourceKey: "broadside_echo" });
      addFloatingText(Math.round(incoming.appliedDamage), target.x, target.y - target.radius, {
        color: "#9ad7ff",
        size: 7,
        ttl: 0.45,
        vy: -11,
        damageNumber: true,
        amount: incoming.appliedDamage
      });
      if (target.hp <= 0) killEnemy(target, "broadside_echo");
    });
  }

  function killEnemy(enemy, cause) {
    if (!enemy || enemy.dead) return;
    const enemyConfig = config.ENEMIES[enemy.enemyId];
    enemy.dead = true;
    addScorch(enemy.x, enemy.y + enemy.radius * 0.35, enemy.radius);
    updateCombo(enemy);
    state.stats.kills += 1;
    state.stats.score += enemy.score + state.wave * 3;
    if (enemy.variantId) addStatMapValue("variantKills", enemy.variantId, 1);
    addFloatingText("+1", enemy.x, enemy.y - enemy.radius, { color: "#f0b64a", size: 8, ttl: 0.5, vy: -14 });
    const killShakeBase = enemy.boss ? 3 : 1.5;
    const killShakeBonus = FXC && FXC.shake ? (enemy.boss ? FXC.shake.bossKillAmp : FXC.shake.killAmp) : 0;
    pulseShake(fx.resolveShake(FXC, killShakeBase + killShakeBonus, meta.settings), enemy.boss ? 0.42 : 0.18);
    if (FXC && fxEnabled()) {
      const burstKind = fx.enemyFxKind(enemyConfig);
      const burstCount = enemy.boss ? 3 : enemy.radius >= 13 ? 2 : 1;
      for (let i = 0; i < burstCount; i += 1) {
        fx.spawnKillBurst(fxState, FXC, burstKind, enemy.x, enemy.y, fxRng);
      }
    }
    playSound(enemy.boss ? "bossKill" : "kill");
    if (enemy.boss) {
      // Boss 死亡演出：多段爆炸由 killBurst 的 delay 規格構成；此旗標驅動純視覺慢放感
      fxBossKillFx = { x: enemy.x, y: enemy.y, start: visualStateTime() };
      if (flourishFxEnabled()) {
        if (!Number.isFinite(state.fxVisualTime)) state.fxVisualTime = state.time;
        state.fxTimeScaleLeft = Math.max(state.fxTimeScaleLeft || 0, 0.2);
        state.fxTimeScale = 0.35;
      }
    }
    if (enemy.boss) {
      state.stats.bossesDefeated += 1;
      state.stats.score += 900;
      resolveBossBlueprintDrop(enemy);
      state.messages.push({ text: "Boss 已擊破", time: state.time, ttl: 1.8 });
      pushRunBark("boss_down");
    }
    applyBroadsideEcho(enemy);
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
          applyEnemyIncomingDamage(other, enemyConfig.deathBurst.damage, null, { trackStats: false });
          if (other.hp <= 0) killEnemy(other, "burst");
        }
      });
    }
    maybeDropSupply(enemy);
    maybeDropWeaponPowerup(enemy);
    maybeDropScavenge(enemy);
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
        damageDealt: state.stats.damageDealt,
        eventRewardMul: state.stats.eventRewardMul,
        eventParts: state.stats.eventParts,
        eventStats: state.stats.eventStats,
        supplyParts: state.stats.supplyParts,
        supplyCratesCollected: state.stats.supplyCratesCollected,
        supplyRewards: state.stats.supplyRewards,
        scavengeGoods: state.stats.scavengeGoods,
        scavengeDrops: state.stats.scavengeDrops,
        deathContext: state.stats.deathContext,
        damageTakenBy: state.stats.damageTakenBy,
        damageBySource: state.stats.damageBySource,
        damageTimeline: state.stats.damageTimeline,
        recentDamageEvents: state.stats.recentDamageEvents,
        variantKills: state.stats.variantKills,
        duration: state.time,
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
    state.waveBannerKind = state.wavePlan && state.wavePlan.boss ? "boss" : "wave";
    state.waveBannerStart = state.time;
    state.waveBannerNumber = state.wave;
    playSound("waveStart");
    triggerWaveStartBarks(state.wave);
    emitState();
    return getState();
  }

  function fireProjectiles(dt) {
    const vehicle = state.vehicle;
    const vehicleConfig = getVehicleConfig(state.vehicleId);
    const runMods = effectiveRunMods();
    const shot = rules.calculateShotStats({
      vehicleId: state.vehicleId,
      meta,
      runMods,
      time: state.time,
      config
    });
    const damageSources = projectileDamageSources(runMods);
    const idleMul = state.input.dragging ? 1 : 1.35;
    vehicle.weaponCooldown -= dt;
    if (vehicle.weaponCooldown > 0) return;

    const targetX = Number.isFinite(vehicle.assistAimX) ? vehicle.assistAimX : vehicle.aimX;
    const targetY = Number.isFinite(vehicle.assistAimY) ? vehicle.assistAimY : vehicle.aimY;
    const direction = normalize(targetX - vehicle.x, Math.min(targetY, vehicle.y - 60) - vehicle.y);
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
          damageSources,
          bonusProjectile,
          vehicleId: state.vehicleId,
          pierce: shot.pierce,
          hitIds: {},
          overloadPierce: shot.overloadPierce,
          overloadCritChance: shot.overloadCritChance,
          overloadCritMul: shot.overloadCritMul,
          homing: shot.homing,
          turnRate: shot.turnRate,
          weaponMode: shot.weaponMode,
          shardCount: shot.shardCount,
          shardDamageMul: shot.shardDamageMul,
          shardSpread: shot.shardSpread,
          shardSpeedMul: shot.shardSpeedMul,
          shardLife: shot.shardLife,
          burnTicks: shot.burnTicks,
          burnDamageMul: shot.burnDamageMul,
          burnInterval: shot.burnInterval,
          radius: shot.bulletSprite === "bullet_rocket" ? 9 : 6,
          rotation: angle,
          life: 1.45,
          splash: shot.splash,
          scale: shot.bulletSprite === "bullet_rocket" ? 1.1 : 1.05
        });
      }
      const muzzle = FXC ? fx.muzzleFlashParams(FXC, meta.settings, fxScratch.muzzle) : null;
      const muzzleBoost = muzzle && fxLevelSetting() !== "off";
      const muzzleOffset = shot.muzzleOffset + (muzzleBoost ? muzzle.offset : 0);
      addEffect({
        id: nextId("effect"),
        kind: "muzzle_flash",
        sprite: "effect_muzzle",
        anim: "burst",
        x: vehicle.x + direction.x * muzzleOffset,
        y: vehicle.y + direction.y * muzzleOffset,
        scale: 1.05 * (muzzleBoost ? muzzle.scale : 1),
        brightness: muzzleBoost ? muzzle.brightness : 1,
        flickerHz: muzzleBoost ? muzzle.flickerHz : 0,
        ttl: muzzle ? Math.max(0.08, muzzle.frames / 24) : 0.12,
        age: 0,
        alpha: 0.9
      });
      playSound("shoot", state.vehicleId);
      triggerVehicleRecoil(direction);
      vehicle.weaponCooldown += shot.fireInterval * idleMul;
      shots += 1;
    }
  }

  function processWaveEvents() {
    const plan = state.wavePlan;
    let spawnedAny = false;
    while (state.spawnIndex < plan.spawns.length && plan.spawns[state.spawnIndex].time <= state.waveElapsed) {
      if (state.enemies.length >= effectiveMaxEnemies()) break;
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
      updateEnemyBurn(enemy);
      if (enemy.dead) return;
      enemy.hitCooldown = Math.max(0, enemy.hitCooldown - dt);
      enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - dt);
      if (enemy.knockbackX || enemy.knockbackY) {
        const keep = Math.max(0, 1 - dt * 10);
        enemy.knockbackX *= keep;
        enemy.knockbackY *= keep;
        if (Math.abs(enemy.knockbackX) < 0.05) enemy.knockbackX = 0;
        if (Math.abs(enemy.knockbackY) < 0.05) enemy.knockbackY = 0;
      }
      const behavior = enemy.behavior || {};
      const behaviorType = behavior.type || "";
      const rangedHoldY = vehicle.y - (behavior.keepDistance || behavior.range || 126);
      const targetY = enemy.boss && enemy.y < 180 ? 250 : behaviorType === "ranged" ? rangedHoldY : vehicle.y - 14;
      const targetX = enemy.boss
        ? vehicle.x
        : rules.clamp(vehicle.x + enemy.laneOffset * 0.42, config.LOGIC.roadLeft + 8, config.LOGIC.roadRight - 8);
      const toTarget = normalize(targetX - enemy.x, targetY - enemy.y);
      const speedMul = enemy.boss && enemy.hp < enemy.maxHp * 0.33 ? 1.35 : 1;
      const animScale = enemyAnimScale();
      const behaviorSway =
        behaviorType === "swarm"
          ? Math.sin(state.time * (behavior.zigzagFreq || 4.8) + enemy.swayPhase) * (behavior.zigzagAmp || 12)
          : behaviorType === "phase"
            ? Math.sin(state.time * (behavior.strafeFreq || 2.2) + enemy.swayPhase) * (behavior.strafeAmp || 20)
            : 0;
      const sway = enemy.boss ? 0 : Math.sin(state.time * enemy.swayFreq + enemy.swayPhase) * enemy.swayAmp * animScale + behaviorSway;
      const eventDrift = enemy.eventDriftAmp ? Math.sin(state.time * 1.7 + enemy.swayPhase) * enemy.eventDriftAmp * animScale : 0;
      enemy.vx = toTarget.x * enemy.speed * speedMul * 0.62 + sway + eventDrift;
      enemy.vy =
        behaviorType === "ranged" && Math.abs(targetY - enemy.y) < 10
          ? Math.max(-enemy.speed * 0.18, Math.min(enemy.speed * 0.18, toTarget.y * enemy.speed * speedMul))
          : Math.max(enemy.speed * 0.35, toTarget.y * enemy.speed * speedMul);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (!enemy.boss) enemy.x = rules.clamp(enemy.x, config.LOGIC.roadLeft + 5, config.LOGIC.roadRight - 5);

      if (behaviorType === "phase") {
        const cycle = Math.max(0.1, behavior.phaseCycle || 3.2);
        const phaseTime = ((state.time + (enemy.animPhase || 0)) % cycle + cycle) % cycle;
        enemy.phaseActive = phaseTime <= (behavior.phaseDuration || 0.82);
      } else {
        enemy.phaseActive = false;
      }

      if (behaviorType === "brute" && distance(enemy, vehicle) <= (behavior.slowRadius || 0)) {
        vehicle.slowUntil = Math.max(vehicle.slowUntil || 0, state.time + 0.22);
        vehicle.slowMul = Math.min(vehicle.slowMul || 1, behavior.slowMul || 0.7);
      }

      if (behaviorType === "ranged") {
        const shot = rules.resolveEnemyRangedAttack({ enemy, vehicle, dt, config });
        enemy.attackCooldown = shot.cooldown;
        if (shot.fire && shot.projectile) {
          spawnEnemyProjectile(enemy, shot.projectile);
          enemy.anim = "attack";
        }
      }

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
            playSound("bossWarn");
          }
        });
      }

      if (distance(enemy, vehicle) <= enemy.radius + vehicle.radius) {
        if (enemy.boss) {
          if (enemy.hitCooldown <= 0) {
            damageVehicle(enemy.contactDamage, { type: "boss", enemyId: enemy.enemyId });
            enemy.hitCooldown = 1.15;
          }
        } else {
          const enemyConfig = config.ENEMIES[enemy.enemyId] || {};
          damageVehicle(enemy.contactDamage, { type: enemyConfig.deathBurst ? "burst" : "enemy", enemyId: enemy.enemyId });
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

  function applyBurnToEnemy(enemy, projectile, appliedDamage) {
    if (!enemy || enemy.dead || !projectile || projectile.source === "companion") return;
    const ticks = rules.finiteNumber(projectile.burnTicks, 0, { min: 0, max: 6, integer: true });
    const damageMul = rules.finiteNumber(projectile.burnDamageMul, 0, { min: 0, max: 0.5 });
    if (ticks <= 0 || damageMul <= 0 || appliedDamage <= 0) return;
    const tickDamage = Math.max(0.35, appliedDamage * damageMul);
    const interval = rules.finiteNumber(projectile.burnInterval, 0.42, { min: 0.1, max: 2 });
    const current = enemy.burn || null;
    if (current && current.ticksRemaining > ticks && current.damage >= tickDamage) return;
    enemy.burn = {
      ticksRemaining: ticks,
      damage: tickDamage,
      interval,
      nextAt: state.time + interval,
      vehicleId: projectile.vehicleId || state.vehicleId
    };
  }

  function updateEnemyBurn(enemy) {
    if (!enemy || enemy.dead || !enemy.burn) return;
    let guard = 0;
    while (enemy.burn && enemy.burn.ticksRemaining > 0 && state.time >= enemy.burn.nextAt && guard < 6) {
      const incoming = applyEnemyIncomingDamage(enemy, enemy.burn.damage, null, { sourceKey: "burn" });
      if (incoming.appliedDamage > 0) {
        addFloatingText(Math.max(1, Math.round(incoming.appliedDamage)).toString(), enemy.x - 4, enemy.y - enemy.radius - 8, {
          color: "#ff9f4a",
          size: 6,
          ttl: 0.38,
          vy: -10,
          damageNumber: true,
          amount: incoming.appliedDamage
        });
      }
      enemy.burn.ticksRemaining -= 1;
      enemy.burn.nextAt += enemy.burn.interval;
      guard += 1;
      if (enemy.hp <= 0) {
        killEnemy(enemy, "burn");
        return;
      }
    }
    if (enemy.burn && enemy.burn.ticksRemaining <= 0) enemy.burn = null;
  }

  function spawnFractureShards(projectile, target) {
    if (!projectile || projectile.fractureShard || !target) return;
    const count = rules.finiteNumber(projectile.shardCount, 0, { min: 0, max: 4, integer: true });
    const damageMul = rules.finiteNumber(projectile.shardDamageMul, 0, { min: 0, max: 1 });
    if (count <= 0 || damageMul <= 0) return;
    const spread = rules.finiteNumber(projectile.shardSpread, 0.3, { min: 0.05, max: 0.8 });
    const speed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy) *
      rules.finiteNumber(projectile.shardSpeedMul, 0.72, { min: 0.1, max: 2 });
    const life = rules.finiteNumber(projectile.shardLife, 0.36, { min: 0.05, max: 1 });
    const baseAngle = Math.atan2(projectile.vy, projectile.vx);
    for (let i = 0; i < count; i += 1) {
      if (state.projectiles.length >= config.PERFORMANCE.maxProjectiles) break;
      const side = i % 2 === 0 ? -1 : 1;
      const step = Math.floor(i / 2) + 1;
      const angle = baseAngle + side * spread * step;
      const hitIds = {};
      if (target.id != null) hitIds[String(target.id)] = true;
      state.projectiles.push({
        id: nextId("projectile"),
        source: "fracture",
        fractureShard: true,
        sprite: projectile.sprite || "bullet_pulse",
        x: projectile.x,
        y: projectile.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: projectile.damage * damageMul,
        damageSources: projectile.damageSources,
        bonusProjectile: true,
        vehicleId: projectile.vehicleId,
        weaponMode: "fracture",
        pierce: 0,
        hitIds,
        radius: 4,
        rotation: angle,
        life,
        splash: 0,
        scale: 0.78
      });
    }
  }

  function damageSplash(projectile, target) {
    if (!projectile.splash) return;
    state.enemies.forEach((enemy) => {
      if (enemy.dead || enemy.id === target.id) return;
      const d = distance(enemy, target);
      if (d <= projectile.splash) {
        const splashDamage = projectile.damage * (1 - d / projectile.splash) * 0.7;
        applyEnemyIncomingDamage(enemy, splashDamage, projectile);
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
        damageVehicle(22, { type: "hazard", enemyId: "meteor" });
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

  function updateSupplyDrops(dt) {
    state.supplyBuffs = state.supplyBuffs.filter((buff) => buff.until > state.time);
    if (!state.supplyDrops.length) return;
    const pickupRadius = (config.SUPPLY_DROPS && config.SUPPLY_DROPS.pickupRadius) || 34;
    for (let i = 0; i < state.supplyDrops.length; i += 1) {
      const drop = state.supplyDrops[i];
      if (state.supplyChoice) break;
      if (drop.picked) continue;
      const motion = rules.stepSupplyDropMotion({ drop, vehicle: state.vehicle, dt, config });
      Object.assign(drop, motion.drop);
      if (distance(drop, state.vehicle) <= pickupRadius + state.vehicle.radius) {
        openSupplyChoice(drop);
        break;
      }
    }
    state.supplyDrops = state.supplyDrops.filter((drop) => !drop.picked && drop.age < drop.ttl && drop.y < H + 40);
  }

  function collectWeaponPowerup(drop) {
    if (!drop || drop.picked) return;
    const picked = rules.applyWeaponPowerup({
      currentMode: state.runMods.weaponMode,
      currentLevel: state.runMods.weaponLevel,
      pickedMode: drop.mode,
      config
    });
    state.runMods.weaponMode = picked.mode;
    state.runMods.weaponLevel = picked.level;
    state.stats.weaponPowerupsCollected += 1;
    drop.picked = true;
    const mode = config.WEAPON_POWERUPS && config.WEAPON_POWERUPS.modes
      ? config.WEAPON_POWERUPS.modes[picked.mode]
      : null;
    state.runMods.burn = mode && Number.isFinite(mode.burnTicks) ? mode.burnTicks : 0;
    const label = `${mode && mode.label ? mode.label : picked.mode} Lv${picked.level}`;
    state.messages.push({ text: label, time: state.time, ttl: 1.5 });
    pushEventBanner("彈種切換", label, { kind: "supply", ttl: 1.4 });
    playSound("pickup");
    addHudFlyEffect("weapon", drop.x, drop.y, `Lv${picked.level}`, "#ffd27f");
    addFloatingText(label, state.vehicle.x, state.vehicle.y - 72, {
      color: "#ffd27f",
      size: 8,
      ttl: 0.75,
      vy: -13
    });
  }

  function updateWeaponPowerups(dt) {
    if (!state.weaponPowerups.length) return;
    const powerups = config.WEAPON_POWERUPS || {};
    const pickupRadius = powerups.pickupRadius || 30;
    const driftSpeed = 24;
    for (let i = 0; i < state.weaponPowerups.length; i += 1) {
      const drop = state.weaponPowerups[i];
      if (drop.picked) continue;
      const dx = state.vehicle.x - drop.x;
      const xStep = Math.min(Math.abs(dx), driftSpeed * dt);
      drop.x += Math.sign(dx) * xStep;
      drop.y += (drop.vy || powerups.crateSpeed || 24) * dt;
      drop.age += dt;
      if (distance(drop, state.vehicle) <= pickupRadius + state.vehicle.radius) {
        collectWeaponPowerup(drop);
      }
    }
    state.weaponPowerups = state.weaponPowerups.filter((drop) => !drop.picked && drop.age < drop.ttl && drop.y < H + 40);
  }

  function updateEnemyProjectiles(dt) {
    if (!state.enemyProjectiles.length) return;
    state.enemyProjectiles.forEach((shot) => {
      if (shot.dead) return;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.age += dt;
      shot.life -= dt;
      if (distance(shot, state.vehicle) <= shot.radius + state.vehicle.radius) {
        damageVehicle(shot.damage, { type: "projectile", enemyId: shot.enemyId });
        shot.dead = true;
        addEffect({
          id: nextId("effect"),
          sprite: "effect_hit",
          anim: "burst",
          x: shot.x,
          y: shot.y,
          scale: 0.9,
          ttl: 0.2,
          age: 0,
          alpha: 0.82
        });
      }
    });
    state.enemyProjectiles = state.enemyProjectiles.filter((shot) => {
      return !shot.dead && shot.life > 0 && shot.x > -28 && shot.x < W + 28 && shot.y > -36 && shot.y < H + 36;
    });
  }

  function angleDelta(target, current) {
    let delta = target - current;
    while (delta > Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;
    return delta;
  }

  function updateHomingProjectile(projectile, dt) {
    if (!projectile.homing || projectile.turnRate <= 0) return;
    let best = null;
    state.enemies.forEach((enemy) => {
      if (enemy.dead) return;
      const d = distance(projectile, enemy);
      if (!best || d < best.distance) best = { enemy, distance: d };
    });
    if (!best) return;
    const speed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy) || 1;
    const current = Math.atan2(projectile.vy, projectile.vx);
    const desired = Math.atan2(best.enemy.y - projectile.y, best.enemy.x - projectile.x);
    const maxTurn = projectile.turnRate * dt;
    const next = current + rules.clamp(angleDelta(desired, current), -maxTurn, maxTurn);
    projectile.vx = Math.cos(next) * speed;
    projectile.vy = Math.sin(next) * speed;
    projectile.rotation = next;
  }

  function updateProjectiles(dt) {
    state.projectiles.forEach((projectile) => {
      updateHomingProjectile(projectile, dt);
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life -= dt;

      for (let i = 0; i < state.hazards.length; i += 1) {
        const hazard = state.hazards[i];
        if (hazard.dead) continue;
        if (distance(projectile, hazard) <= projectile.radius + hazard.radius) {
          hazard.hp -= projectile.damage;
          projectile.life = -1;
          playSound("hit");
          if (FXC && fxEnabled()) {
            fxHitOpts.x = projectile.x;
            fxHitOpts.y = projectile.y;
            fxHitOpts.angle = projectile.rotation + Math.PI;
            fxHitOpts.vehicleId = projectile.vehicleId;
            fxHitOpts.color = weaponVisual(projectile.weaponMode).core;
            fx.spawnHitSpark(fxState, FXC, fxHitOpts, fxRng);
          }
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

      for (let i = 0; i < state.enemies.length; i += 1) {
        const enemy = state.enemies[i];
        if (enemy.dead) continue;
        if (!projectile.hitIds || typeof projectile.hitIds !== "object" || Array.isArray(projectile.hitIds)) {
          projectile.hitIds = {};
        }
        const hitKey = enemy.id == null ? "" : String(enemy.id);
        if (hitKey && projectile.hitIds[hitKey]) continue;
        if (distance(projectile, enemy) <= projectile.radius + enemy.radius) {
          if (hitKey) projectile.hitIds[hitKey] = true;
          let damage = projectile.damage;
          const projectileVehicle = getVehicleConfig(projectile.vehicleId);
          const critChance = Math.max(0, Math.min(1, projectile.overloadCritChance || 0));
          const crit = critChance > 0 && state.rng() < critChance;
          if (crit) damage *= projectile.overloadCritMul || 1.5;
          if (projectile.source !== "companion" && projectileVehicle.passive && projectileVehicle.passive.id === "armor_break_focus") {
            const passive = projectileVehicle.passive;
            const stacks = Math.min(passive.maxStacks, enemy.armorBreakStacks || 0);
            damage *= 1 + stacks * passive.armorBreakPerHit;
            enemy.armorBreakStacks = Math.min(passive.maxStacks, stacks + 1);
          }
          const incoming = rules.resolveEnemyIncomingDamage({
            enemy,
            enemyConfig: config.ENEMIES[enemy.enemyId],
            damage,
            projectile,
            shieldFacing: state.vehicle,
            config
          });
          damage = incoming.appliedDamage;
          enemy.hp = incoming.hp;
          enemy.shieldHp = incoming.shieldHp;
          triggerEnemyHitFlair(enemy, projectile);
          state.stats.damageDealt += damage;
          recordDamageTimeline(damage);
          addProjectileDamageSource(projectile, damage);
          applyBurnToEnemy(enemy, projectile, damage);
          if (incoming.shieldDamage > 0) {
            addFloatingText(incoming.shieldBroken ? "破盾" : "盾", enemy.x - 5, enemy.y - enemy.radius - 10, {
              color: incoming.shieldBroken ? "#ffd166" : "#9ad7ff",
              size: 6,
              ttl: 0.42,
              vy: -11,
              damageNumber: true,
              amount: incoming.shieldDamage
            });
          }
          addFloatingText(Math.round(damage).toString(), enemy.x + 3, enemy.y - enemy.radius - 2, {
            color: projectileVehicle.environment === "space" ? "#5ed4cb" : "#f4ead8",
            size: enemy.boss ? 10 : 6,
            ttl: enemy.boss ? 0.58 : 0.42,
            vy: enemy.boss ? -16 : -12,
            damageNumber: true,
            amount: damage
          });
          if (crit) {
            addFloatingText("暴擊", enemy.x + 8, enemy.y - enemy.radius - 12, {
              color: "#ffd76a",
              size: 7,
              ttl: 0.5,
              vy: -14,
              damageNumber: true,
              amount: damage
            });
          }
          playSound("hit");
          if (FXC && fxEnabled()) {
            fxHitOpts.x = projectile.x;
            fxHitOpts.y = projectile.y;
            fxHitOpts.angle = projectile.rotation + Math.PI;
            fxHitOpts.vehicleId = projectile.vehicleId;
            fxHitOpts.color = weaponVisual(projectile.weaponMode).core;
            fx.spawnHitSpark(fxState, FXC, fxHitOpts, fxRng);
          }
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
          spawnFractureShards(projectile, enemy);
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
    const crossingPairs = new Map();
    state.gates.forEach((gate) => {
      const previousY = gate.y;
      gate.y += config.WAVE.gateSpeed * dt;
      if (previousY < state.vehicle.y && gate.y >= state.vehicle.y) {
        const candidates = crossingPairs.get(gate.pairId) || [];
        candidates.push(gate);
        crossingPairs.set(gate.pairId, candidates);
      }
    });
    crossingPairs.forEach((gates) => {
      const selected = gates
        .slice()
        .sort((a, b) => Math.abs(a.x - state.vehicle.x) - Math.abs(b.x - state.vehicle.x))[0];
      if (!selected) return;
      const reach = (selected.touchRadius || selected.radius || 0) + (state.vehicle.radius || 0);
      if (Math.abs(selected.x - state.vehicle.x) <= reach) resolveGateChoice(selected);
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
      if (effect.kind === "hud_fly") {
        const t = Math.min(1, effect.age / Math.max(0.01, effect.ttl));
        const eased = 1 - Math.pow(1 - t, 3);
        effect.x = effect.startX + (effect.targetX - effect.startX) * eased;
        effect.y = effect.startY + (effect.targetY - effect.startY) * eased - Math.sin(t * Math.PI) * 18;
      }
      effect.alpha = Math.max(0, 1 - effect.age / effect.ttl);
    });
    state.effects = state.effects.filter((effect) => effect.age < effect.ttl);
    if (state.combo && state.combo.count > 0) {
      const cfg = (FXC && FXC.combo) || {};
      const resetAfter = (cfg.windowSeconds || 2.25) + (cfg.fadeSeconds || 0.45);
      if (state.time - state.combo.lastKillAt > resetAfter) state.combo.count = 0;
    }
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
      const completedWave = state.wave;
      const partsBefore = state.stats.partsPreview || 0;
      completeCurrentEnvironmentEvent();
      state.stats.wavesCleared = Math.max(state.stats.wavesCleared, state.wave);
      state.wave += 1;
      state.waveElapsed = 0;
      state.spawnIndex = 0;
      state.gateIndex = 0;
      state.wavePlan = makeWavePlan(state.wave);
      activateWaveEnvironmentEvent();
      state.waveBannerKind = state.wavePlan && state.wavePlan.boss ? "boss" : "wave";
      state.waveBannerStart = state.time;
      state.waveBannerNumber = state.wave;
      playSound("waveStart");
      triggerWaveStartBarks(state.wave);
      state.messages.push({ text: `第 ${state.wave} 波`, time: state.time, ttl: 1.4 });
      updatePartsPreview();
      addWaveCelebration(completedWave, (state.stats.partsPreview || 0) - partsBefore);
    }
  }

  function updateVehicleAim(dt) {
    const vehicleConfig = getVehicleConfig(state.vehicleId);
    const vehicle = state.vehicle;
    const half = vehicleConfig.visualHalfWidth || 24;
    const movementMul = vehicle.slowUntil && vehicle.slowUntil > state.time ? Math.max(0.35, vehicle.slowMul || 1) : 1;
    if (!vehicle.slowUntil || vehicle.slowUntil <= state.time) vehicle.slowMul = 1;
    if (!Number.isFinite(vehicle.followX)) vehicle.followX = vehicle.x;
    if (!state.input.dragging) {
      const followRate = Math.min(1, 0.018 * dt * 60);
      vehicle.followX += (vehicle.aimX - vehicle.followX) * followRate;
    }
    const targetX = rules.clamp(vehicle.followX, config.LOGIC.roadLeft + half, config.LOGIC.roadRight - half);
    vehicle.x += (targetX - vehicle.x) * Math.min(1, vehicleConfig.moveResponsiveness * 0.28 * movementMul * dt * 60);
    vehicle.x = rules.clamp(vehicle.x, config.LOGIC.roadLeft + half, config.LOGIC.roadRight - half);
    vehicle.aimY = rules.clamp(vehicle.aimY, config.LOGIC.aimMinY, config.LOGIC.aimMaxY);
    vehicle.assistAimX = vehicle.aimX;
    vehicle.assistAimY = vehicle.aimY;
    vehicle.aimAssistTarget = null;
    const assistBase = rules.aimAssistStrength(meta.settings);
    if (assistBase > 0) {
      const target = rules.selectAimAssistTarget({
        vehicle,
        enemies: state.enemies,
        maxDistance: config.LOGIC.height * 0.54,
        config
      });
      if (target) {
        const strength = state.input.dragging ? assistBase * 0.75 : assistBase;
        const lead = state.input.dragging ? 0.08 : 0.14;
        const enemy = state.enemies.find((item) => item.id === target.id);
        const targetXWithLead = target.x + (enemy ? (enemy.vx || 0) * lead : 0);
        const targetYWithLead = target.y + (enemy ? (enemy.vy || 0) * lead : 0);
        vehicle.assistAimX = rules.clamp(vehicle.aimX + (targetXWithLead - vehicle.aimX) * strength, 26, W - 26);
        vehicle.assistAimY = rules.clamp(
          vehicle.aimY + (targetYWithLead - vehicle.aimY) * strength,
          config.LOGIC.aimMinY,
          vehicle.y - 40
        );
        vehicle.aimAssistTarget = {
          id: target.id,
          enemyId: target.enemyId,
          reason: target.reason
        };
      }
    }
  }

  function companionEnabled() {
    const spec = config.TRAILER_GUNNER || {};
    if (spec.enabledDefault === false) return false;
    return !(meta.settings && meta.settings.showCompanion === false);
  }

  function updateCompanionPose(dt) {
    const previousUpdateAt = Number.isFinite(state.companionUpdatedAt) ? state.companionUpdatedAt : state.time;
    const poseDt = Number.isFinite(dt) ? dt : Math.max(0, state.time - previousUpdateAt);
    const pose = rules.resolveGunnerPose({
      vehicle: state.vehicle,
      previous: state.companionPose,
      dt: poseDt,
      time: stateTime(),
      gunnerConfig: config.TRAILER_GUNNER,
      simplified: performanceState.quality === "low" || fxLevelSetting() === "off",
      config
    });
    state.companionPose = pose;
    state.companionUpdatedAt = state.time;
    return pose;
  }

  function updateCompanion(dt) {
    if (!companionEnabled()) return;
    const spec = config.TRAILER_GUNNER || {};
    const weapon = spec.weapon || {};
    const pose = updateCompanionPose(dt);
    state.companionCooldown = Math.max(0, (state.companionCooldown || 0) - dt);
    if (state.companionCooldown > 0 || state.projectiles.length >= config.PERFORMANCE.maxProjectiles) return;
    const target = rules.selectGunnerTarget({
      gunner: pose,
      enemies: state.enemies,
      range: spec.targetRange,
      config
    });
    if (!target) return;
    const muzzleY = pose.y + (spec.muzzleOffsetY || -12);
    const spread = (weapon.spread || 0) * (state.rng() - 0.5);
    const direction = normalize(target.x - pose.x, target.y - muzzleY);
    const angle = Math.atan2(direction.y, direction.x) + spread;
    const speed = weapon.projectileSpeed || 300;
    state.projectiles.push({
      id: nextId("projectile"),
      source: "companion",
      sprite: weapon.bulletSprite || "bullet_machine",
      x: pose.x + Math.cos(angle) * 7,
      y: muzzleY + Math.sin(angle) * 7,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: weapon.damage || 6,
      damageSources: [{ key: "companion", ratio: 1 }],
      bonusProjectile: false,
      vehicleId: state.vehicleId,
      weaponMode: "standard",
      pierce: 0,
      hitIds: {},
      radius: weapon.projectileRadius || 3,
      rotation: angle,
      life: 1.2,
      splash: 0,
      scale: 0.78,
      color: weapon.color || "#ffd27f"
    });
    state.companionFiringUntil = state.time + (spec.firingFrameSeconds || 0.14);
    state.companionCooldown += weapon.fireInterval || 0.9;
  }

  function update(dt) {
    if (!state || state.paused || state.over) return;
    updateFxPresentationClock(dt);
    state.time += dt;
    state.waveElapsed += dt;
    if (state.time >= 3) pushRunBark("sortie_start");
    state.scroll = (state.scroll + 112 * dt) % 32;
    updateVehicleAim(dt);
    processWaveEvents();
    fireProjectiles(dt);
    updateCompanion(dt);
    updateHazards(dt);
    updateEnemyProjectiles(dt);
    updateSupplyDrops(dt);
    updateWeaponPowerups(dt);
    updateProjectiles(dt);
    updateEnemies(dt);
    updateGatesAndEffects(dt);
    updateFx(dt);
    completeWaveIfReady();
    updatePartsPreview();
    if (state.vehicle.hp <= 0) finishRun();
  }

  function recordPerformanceHistory(reason) {
    const time = state ? state.time : idleTime;
    performanceState.history.unshift({
      time: Math.round(time * 10) / 10,
      reason
    });
    if (performanceState.history.length > 5) performanceState.history.length = 5;
  }

  function updatePerformanceQuality(deltaSeconds) {
    const settings = meta.settings || {};
    const mode = settings.performanceMode || "auto";
    const dt = Math.max(0.001, deltaSeconds || 1 / 60);
    const instant = Math.min(120, 1 / dt);
    performanceState.fps = performanceState.fps * 0.88 + instant * 0.12;
    if (mode === "high") {
      performanceState.quality = "high";
      performanceState.reason = "鎖高";
      performanceState.lowFrames = 0;
      performanceState.highFrames = 0;
      return;
    }
    if (mode === "low") {
      performanceState.quality = "low";
      performanceState.reason = "鎖低";
      performanceState.lowFrames = 0;
      performanceState.highFrames = 0;
      return;
    }
    if (performanceState.constrainedDevice) {
      performanceState.quality = "low";
      performanceState.reason = "裝置預檢";
      performanceState.lowFrames = 0;
      performanceState.highFrames = 0;
      return;
    }
    if (performanceState.fps < config.PERFORMANCE.lowFpsFloor) {
      performanceState.lowFrames += 1;
      performanceState.highFrames = 0;
    } else if (performanceState.fps > config.PERFORMANCE.recoverFps) {
      performanceState.highFrames += 1;
      performanceState.lowFrames = 0;
    } else {
      performanceState.lowFrames = Math.max(0, performanceState.lowFrames - 1);
      performanceState.highFrames = Math.max(0, performanceState.highFrames - 1);
    }
    if (performanceState.lowFrames >= (config.PERFORMANCE.downgradeFrames || 18)) {
      const reason = `FPS ${Math.round(performanceState.fps)} 低於 ${config.PERFORMANCE.lowFpsFloor}`;
      if (performanceState.quality !== "low") recordPerformanceHistory(reason);
      performanceState.quality = "low";
      performanceState.reason = reason;
      performanceState.downgradedWave = state ? state.wave : null;
      performanceState.lowFrames = 0;
    } else if (
      performanceState.highFrames >= (config.PERFORMANCE.recoverFrames || 180) &&
      (!state || performanceState.downgradedWave == null || state.wave > performanceState.downgradedWave)
    ) {
      const reason = `FPS ${Math.round(performanceState.fps)} 回穩`;
      if (performanceState.quality !== "high") recordPerformanceHistory(reason);
      performanceState.quality = "high";
      performanceState.reason = reason;
      performanceState.downgradedWave = null;
      performanceState.highFrames = 0;
    }
  }

  function samplePerformanceFrames(frameSamples, options) {
    const settings = options || {};
    if (settings.reset) {
      performanceState = {
        quality: "high",
        fps: 60,
        lowFrames: 0,
        highFrames: 0,
        lastFloatingTextAt: -Infinity,
        reason: "測試重設",
        constrainedDevice: settings.constrainedDevice === true,
        downgradedWave: null,
        history: []
      };
    }
    (Array.isArray(frameSamples) ? frameSamples : []).forEach((frameMs) => {
      updatePerformanceQuality(Math.max(0.001, Number(frameMs) / 1000));
    });
    return rules.deepClone(performanceState);
  }

  function step(deltaMs) {
    if (!state) startRun(meta.selectedVehicle);
    const total = Math.max(0, Math.min(30000, Number(deltaMs) || 0)) / 1000;
    updatePerformanceQuality(total);
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

  function setAimFromPoint(point, pointerType) {
    if (!state || state.over) return;
    state.vehicle.aimX = rules.clamp(point.x, 26, W - 26);
    const touchOffsetY = pointerType === "touch" || pointerType === "pen" ? 28 : 0;
    state.vehicle.aimY = rules.clamp(point.y - touchOffsetY, config.LOGIC.aimMinY, state.vehicle.y - 40);
    state.vehicle.followX = state.vehicle.aimX;
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
      canvas.setPointerCapture(event.pointerId);
      state.input.dragging = true;
      state.input.lastPointer = event.pointerId;
      setAimFromPoint(point, event.pointerType);
      event.preventDefault();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!state || !state.input.dragging || state.input.lastPointer !== event.pointerId) return;
      setAimFromPoint(pointFromEvent(event), event.pointerType);
      event.preventDefault();
    });
    canvas.addEventListener("pointerup", (event) => {
      if (!state) return;
      if (state.input.lastPointer === event.pointerId) {
        setAimFromPoint(pointFromEvent(event), event.pointerType);
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
    const fontScale = meta.settings && meta.settings.fontSize === "large" ? 1.15 : meta.settings && meta.settings.fontSize === "small" ? 0.92 : 1;
    ctx.font = `800 ${(opts.size || 8) * fontScale}px system-ui, sans-serif`;
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
          : gate.gateId === "barrier"
            ? "+15%"
            : gate.gateId === "gate_focus"
              ? "10 秒"
              : "維修";
    ctx.save();
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = "rgba(7, 9, 13, 0.72)";
    ctx.strokeStyle =
      gate.gateId === "repair"
        ? "rgba(135,210,125,0.82)"
        : gate.gateId === "barrier"
          ? "rgba(94,212,203,0.82)"
          : "rgba(240,182,74,0.82)";
    ctx.lineWidth = 1;
    ctx.fillRect(gate.x - 25, gate.y - 33, 50, 30);
    ctx.strokeRect(gate.x - 25, gate.y - 33, 50, 30);
    ctx.restore();
    drawWorldText(gateConfig.shortLabel, gate.x, gate.y - 24, { size: 10, color: "#f4ead8" });
    drawWorldText(valueText, gate.x, gate.y - 11, { size: 12, color: gate.gateId === "repair" ? "#87d27d" : gate.gateId === "barrier" ? "#5ed4cb" : "#f0b64a" });
    drawWorldText("選擇後套用", gate.x, gate.y + 24, { size: 5, color: "#f4ead8", alpha: 0.72 });
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
    const guideX = Number.isFinite(state.vehicle.assistAimX) ? state.vehicle.assistAimX : state.vehicle.aimX;
    const guideY = Number.isFinite(state.vehicle.assistAimY) ? state.vehicle.assistAimY : state.vehicle.aimY;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#f0b64a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(state.vehicle.x, state.vehicle.y - 18);
    ctx.lineTo(guideX, guideY);
    ctx.stroke();
    ctx.strokeStyle = "#f4ead8";
    ctx.beginPath();
    ctx.arc(guideX, guideY, 8, 0, Math.PI * 2);
    ctx.moveTo(guideX - 12, guideY);
    ctx.lineTo(guideX + 12, guideY);
    ctx.moveTo(guideX, guideY - 12);
    ctx.lineTo(guideX, guideY + 12);
    ctx.stroke();
    if (state.time < 2) {
      drawWorldText("拖曳移動＋瞄準", W * 0.5, 113, { size: 9, alpha: 0.92, color: "#f4ead8" });
      drawWorldText("放開仍射擊（射速較慢）", W * 0.5, 124, { size: 7, alpha: 0.82, color: "#d7cdbb" });
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
    renderDebug.backgroundImageStatus = environmentImageStatus(environment);
    renderDebug.backgroundImagePath =
      config.ENVIRONMENT_BACKGROUNDS && config.ENVIRONMENT_BACKGROUNDS[environment]
        ? config.ENVIRONMENT_BACKGROUNDS[environment]
        : "";
    if (drawRasterEnvironmentBackground(environment)) return;
    renderDebug.backgroundFallbackDrawn = true;
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

  function drawRasterEnvironmentBackground(environment) {
    const record = environmentImages[environment];
    if (!record || environmentImageStatus(environment) !== "loaded") return false;
    const image = record.image;
    const tileHeight = W * (image.naturalHeight / Math.max(1, image.naturalWidth));
    if (!Number.isFinite(tileHeight) || tileHeight <= 0) return false;
    const scroll = ((state ? state.time * 112 : idleTime * 42) % tileHeight + tileHeight) % tileHeight;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let y = -tileHeight + scroll; y < H + tileHeight; y += tileHeight) {
      ctx.drawImage(image, 0, y, W, tileHeight);
    }
    ctx.restore();
    renderDebug.backgroundRasterDrawn = true;
    renderDebug.backgroundImageStatus = "loaded";
    return true;
  }

  // raster 與 fallback 共用的景深：固定幾何、只讀視覺時間，不消耗遊戲 RNG。
  function drawDepthLayers() {
    if (currentEnvironment() !== "land") return;
    const left = config.LOGIC.roadLeft;
    const right = config.LOGIC.roadRight;
    const scroll = state ? state.scroll : idleTime * 42;
    const low = performanceState.quality === "low" || fxLevelSetting() === "reduced";
    const off = fxLevelSetting() === "off";

    ctx.save();
    if (!off) {
      const farOffset = (scroll * 0.15) % 76;
      ctx.fillStyle = "rgba(42, 36, 28, 0.46)";
      for (let side = 0; side < 2; side += 1) {
        const baseX = side === 0 ? left - 22 : right + 22;
        for (let y = -76 + farOffset; y < H + 76; y += low ? 152 : 76) {
          const variant = Math.abs(Math.floor((y - farOffset) / 76) + side * 3) % 3;
          const w = 13 + variant * 4;
          const h = 7 + variant * 3;
          ctx.beginPath();
          ctx.moveTo(baseX - w, y + h);
          ctx.lineTo(baseX - w * 0.38, y - h * 0.25);
          ctx.lineTo(baseX + w * 0.18, y - h);
          ctx.lineTo(baseX + w, y + h);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    const haze = ctx.createLinearGradient(0, 0, 0, H);
    haze.addColorStop(0, "rgba(90, 78, 62, 0.22)");
    haze.addColorStop(0.48, "rgba(0, 0, 0, 0)");
    haze.addColorStop(1, "rgba(20, 16, 12, 0.12)");
    ctx.globalAlpha = off ? 0.55 : low ? 0.78 : 0.92 + Math.sin(visualStateTime() * 0.35) * 0.03;
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H);

    if (!off && !low) {
      const nearOffset = (scroll * 0.4) % 58;
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = "#1a1612";
      for (let side = 0; side < 2; side += 1) {
        const x = side === 0 ? left - 15 : right + 15;
        for (let y = -58 + nearOffset; y < H + 58; y += 58) {
          const notch = Math.abs(Math.floor((y - nearOffset) / 58) + side) % 3;
          ctx.fillRect(x - 7 - notch, y, 14 + notch * 2, 5 + notch);
          ctx.fillRect(x - 3, y - 4, 6, 4);
        }
      }
    }
    ctx.restore();
    renderDebug.depthLayersDrawn = true;
    renderDebug.depthLayerTier = off ? "off" : low ? "low" : "full";
  }

  // 路面細節疊層獨立於底圖，因此 raster / fallback 都能共享；固定幾何避免引入遊戲 RNG。
  function drawRoadDetailOverlay() {
    if (currentEnvironment() !== "land") return;
    const left = config.LOGIC.roadLeft;
    const right = config.LOGIC.roadRight;
    const roadWidth = right - left;
    const scroll = state ? state.scroll : (idleTime * 42) % 32;
    const low = performanceState.quality === "low" || fxLevelSetting() === "reduced";
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 0, roadWidth, H);
    ctx.clip();

    ctx.strokeStyle = "rgba(8, 10, 11, 0.2)";
    ctx.lineWidth = 2.1;
    const trackOffset = (scroll * 1.05) % 54;
    for (let y = -54 + trackOffset; y < H + 54; y += low ? 108 : 54) {
      const sway = Math.sin((y + 37) * 0.07) * 1.4;
      for (let lane = 0; lane < 2; lane += 1) {
        const x = left + roadWidth * (lane ? 0.68 : 0.32) + sway;
        ctx.beginPath();
        ctx.moveTo(x - 2.5, y);
        ctx.lineTo(x - 1.4, y + 38);
        ctx.moveTo(x + 2.5, y + 6);
        ctx.lineTo(x + 1.4, y + 44);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = "rgba(181, 160, 126, 0.17)";
    ctx.lineWidth = 0.8;
    const crackStep = low ? 132 : 88;
    for (let y = -crackStep + (scroll * 1.17) % crackStep; y < H + crackStep; y += crackStep) {
      const x = left + 14 + ((Math.abs(Math.floor(y / crackStep)) * 47 + 19) % Math.max(24, Math.floor(roadWidth - 28)));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 5, y + 8);
      ctx.lineTo(x + 1, y + 15);
      ctx.lineTo(x + 10, y + 24);
      ctx.moveTo(x + 4, y + 9);
      ctx.lineTo(x + 11, y + 7);
      ctx.moveTo(x + 2, y + 16);
      ctx.lineTo(x - 5, y + 21);
      ctx.stroke();
    }
    ctx.restore();
    renderDebug.roadDetailDrawn = true;
    renderDebug.roadDetailTier = low ? "low" : "high";
  }

  function drawRoadDebrisAtlas() {
    const spec = config.ROAD_DETAIL_ATLAS;
    const image = roadDetailImage.image;
    if (!state || currentEnvironment() !== "land" || !spec || roadDetailImage.status !== "loaded" || !image) return;
    const low = performanceState.quality === "low";
    const reduced = fxLevelSetting() !== "full";
    const step = low ? 310 : reduced ? 238 : 184;
    const scroll = state.scroll || 0;
    const offset = (scroll * 1.08) % step;
    let drawn = 0;
    ctx.save();
    ctx.globalAlpha = low ? 0.38 : reduced ? 0.48 : 0.58;
    ctx.imageSmoothingEnabled = false;
    for (let y = -step + offset; y < H + step && drawn < (low ? 2 : 4); y += step) {
      const slot = Math.abs(Math.floor((y - offset) / step));
      const frame = (slot * 3 + 1) % spec.frames;
      const side = slot % 2;
      const x = side ? config.LOGIC.roadRight - 10 : config.LOGIC.roadLeft + 10;
      const size = low ? 13 : 15 + (slot % 2) * 2;
      const rotation = side ? -0.12 : 0.1;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(rotation);
      ctx.drawImage(
        image,
        frame * spec.frameWidth,
        0,
        spec.frameWidth,
        spec.frameHeight,
        -size * 0.5,
        -size * 0.5,
        size,
        size
      );
      ctx.restore();
      drawn += 1;
    }
    ctx.restore();
    renderDebug.roadDebrisDrawn = drawn;
    renderDebug.roadDebrisStatus = roadDetailImage.status;
  }

  function addScorch(x, y, size) {
    if (!state || currentEnvironment() !== "land" || fxLevelSetting() === "off") return;
    const scorch = fxScorches[fxScorchCursor];
    fxScorchCursor = (fxScorchCursor + 1) % fxScorches.length;
    scorch.active = true;
    scorch.x = x;
    scorch.y = y;
    scorch.scroll = state.scroll;
    scorch.start = visualStateTime();
    scorch.life = 0.8 + Math.min(0.6, Math.max(0, size - 7) * 0.025);
    scorch.size = Math.min(18, Math.max(6, size * 0.72));
  }

  function drawScorchMarks() {
    if (!state || currentEnvironment() !== "land" || fxLevelSetting() === "off") return;
    const low = performanceState.quality === "low" || fxLevelSetting() === "reduced";
    const visibleCap = low ? 4 : fxScorches.length;
    let drawn = 0;
    for (let offset = 0; offset < fxScorches.length && drawn < visibleCap; offset += 1) {
      const index = (fxScorchCursor - 1 - offset + fxScorches.length) % fxScorches.length;
      const scorch = fxScorches[index];
      if (!scorch.active) continue;
      const age = visualStateTime() - scorch.start;
      if (age >= scorch.life) {
        scorch.active = false;
        continue;
      }
      const y = scorch.y + (state.scroll - scorch.scroll);
      if (y > H + scorch.size) {
        scorch.active = false;
        continue;
      }
      const alpha = (1 - age / scorch.life) * (low ? 0.3 : 0.48);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#17130f";
      ctx.beginPath();
      ctx.ellipse(scorch.x, y, scorch.size, scorch.size * 0.42, 0, 0, TAU);
      ctx.fill();
      if (!low) {
        ctx.globalAlpha = alpha * 0.52;
        ctx.strokeStyle = "#6d4a2b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(scorch.x, y, scorch.size * 0.72, scorch.size * 0.28, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      drawn += 1;
    }
    renderDebug.scorchMarksDrawn = drawn;
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

  function drawVehicleShield(vehicle, timeMs) {
    const shield = Number.isFinite(vehicle.shield) ? vehicle.shield : 0;
    const maxShield = Number.isFinite(vehicle.maxShield) ? vehicle.maxShield : Math.round((vehicle.maxHp || 0) * 0.6);
    if (shield <= 0 || maxShield <= 0) return;
    const pct = Math.max(0.2, Math.min(1, shield / maxShield));
    drawSprite("effect_shield", "pulse", timeMs, vehicle.x, vehicle.y - 15, 1.05 + pct * 0.18, {
      alpha: 0.22 + pct * 0.38
    });
    renderDebug.vehicleShieldDrawn = true;
  }

  // 車頭航行燈只存在於表現層；reduced 固定為單燈且不脈動，避免額外閃爍。
  function drawVehicleNavigationLights(vehicleConfig, vehicle) {
    if (fxLevelSetting() === "off") return;
    const environment = currentEnvironment();
    const reduced = !flourishFxEnabled();
    const width = vehicleConfig.visualWidth || (vehicleConfig.visualHalfWidth || 36) * 2;
    const height = width * (environment === "space" ? 1.65 : 1.9);
    const color = environment === "land" ? "255, 194, 104" : "184, 242, 255";
    const pulse = reduced ? 1 : 0.92 + Math.sin(visualStateTime() * 7.5) * 0.08;
    const count = reduced ? 1 : 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < count; i += 1) {
      const x = vehicle.x + (count === 1 ? 0 : (i === 0 ? -1 : 1) * width * 0.18);
      const y = vehicle.y - height * 0.54;
      const radius = (count === 1 ? 5.4 : 4.4) * pulse;
      const glow = ctx.createRadialGradient(x, y, 0.4, x, y, radius);
      glow.addColorStop(0, `rgba(${color}, ${reduced ? 0.72 : 0.92})`);
      glow.addColorStop(0.35, `rgba(${color}, ${reduced ? 0.32 : 0.48})`);
      glow.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    renderDebug.vehicleNavigationLightsDrawn += count;
  }

  // 低血車損煙固定直繪，不占粒子池；low/reduced 僅一縷且關閉火星，off 完全停用。
  function drawVehicleDamageSmoke(vehicleConfig, vehicle) {
    if (!vehicle || fxLevelSetting() === "off" || vehicle.maxHp <= 0 || vehicle.hp <= 0) return;
    const hpPct = vehicle.hp / vehicle.maxHp;
    if (hpPct >= 0.35) return;
    const low = performanceState.quality === "low" || fxLevelSetting() === "reduced";
    const width = vehicleConfig.visualWidth || (vehicleConfig.visualHalfWidth || 36) * 2;
    const count = low ? 1 : 2;
    const t = visualStateTime();
    ctx.save();
    for (let i = 0; i < count; i += 1) {
      const phase = low ? 0.5 : (t * 0.72 + i * 0.47) % 1;
      const x = vehicle.x + width * 0.16 + Math.sin(t * 2.3 + i * 2.1) * (low ? 0.6 : 1.5);
      const y = vehicle.y - width * (0.36 + phase * 0.42);
      const radius = (low ? 4.8 : 4.5 + phase * 3.8);
      const smoke = ctx.createRadialGradient(x, y, 0.5, x, y, radius);
      smoke.addColorStop(0, `rgba(90, 81, 75, ${low ? 0.42 : 0.54 * (1 - phase * 0.45)})`);
      smoke.addColorStop(0.55, `rgba(55, 51, 48, ${low ? 0.25 : 0.34 * (1 - phase)})`);
      smoke.addColorStop(1, "rgba(32, 30, 28, 0)");
      ctx.fillStyle = smoke;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }
    if (hpPct < 0.2 && !low && !(meta.settings && meta.settings.reducedFlash)) {
      const sparkOn = Math.floor(t * 7) % 5 === 0;
      if (sparkOn) {
        ctx.strokeStyle = "rgba(255, 178, 74, 0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(vehicle.x + width * 0.13, vehicle.y - width * 0.42);
        ctx.lineTo(vehicle.x + width * 0.19, vehicle.y - width * 0.55);
        ctx.stroke();
        renderDebug.vehicleDamageSparksDrawn = 1;
      }
    }
    ctx.restore();
    renderDebug.vehicleDamageSmokeDrawn = count;
  }

  function enemyVisualWidth(enemy, enemyConfig) {
    if (Number.isFinite(enemy.visualWidth)) return enemy.visualWidth;
    if (enemyConfig && Number.isFinite(enemyConfig.visualWidth)) return enemyConfig.visualWidth;
    return Math.max(14, enemy.radius * 2);
  }

  function drawEnemyShadow(enemy, width, lift, alpha, offsetX, offsetY) {
    const shadowScale = Math.max(0.74, 1 - Math.abs(lift) * 0.045);
    const ox = Number.isFinite(offsetX) ? offsetX : 0;
    const oy = Number.isFinite(offsetY) ? offsetY : 0;
    ctx.save();
    ctx.globalAlpha *= (enemy.boss ? 0.34 : 0.26) * (alpha == null ? 1 : alpha);
    ctx.fillStyle = "#050607";
    ctx.beginPath();
    ctx.ellipse(
      enemy.x + ox,
      enemy.y + oy + enemy.radius * (enemy.boss ? 0.62 : 0.52),
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

  function enemyAnimationFrame(enemy, animation) {
    const frames = Math.max(1, animation.frames || 1);
    if (performanceState.quality === "low") return { frame: 0, tier: "single" };
    const moving = Math.hypot(enemy.vx || 0, enemy.vy || 0) > 1;
    if (!moving) return { frame: 0, tier: "idle" };
    const reduced = fxLevelSetting() === "reduced" || (meta.settings && meta.settings.reducedFlash);
    const visibleFrames = reduced ? Math.min(2, frames) : frames;
    const phaseOffset = ((enemy.animPhase || 0) / TAU) * visibleFrames;
    const sequenceFrame = Math.floor(stateTime() * (animation.fps || 5) + phaseOffset) % visibleFrames;
    return {
      frame: reduced ? sequenceFrame * Math.ceil(frames / visibleFrames) : sequenceFrame,
      tier: reduced ? "reduced" : "full"
    };
  }

  function drawEnemyEntity(enemy, timeMs, alpha, anim) {
    const enemyConfig = config.ENEMIES[enemy.enemyId] || null;
    const animation = enemyConfig && enemyConfig.spriteAnimation ? enemyConfig.spriteAnimation : null;
    const record = enemyConfig && (enemyConfig.spriteImage || animation) ? enemyImages[enemy.enemyId] : null;
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
    const flash = enemy.hitFlash > 0 && flourishFxEnabled();
    const hitPulse = flash ? rules.clamp(enemy.hitFlash / Math.max(0.01, enemy.hitFlashMax || 0.2), 0, 1) : 0;
    const hitWeight = hitPulse * (enemy.boss ? 0.55 : 1);
    const impactX = Math.abs(enemy.hitDirectionX || 0);
    const impactY = Math.abs(enemy.hitDirectionY || 1);
    const hitScaleX = 1 - impactX * hitWeight * 0.12 + impactY * hitWeight * 0.08;
    const hitScaleY = 1 - impactY * hitWeight * 0.12 + impactX * hitWeight * 0.08;
    const hitColor = enemy.hitFlashColor || "#ffd36a";
    const knockX = flourishFxEnabled() ? enemy.knockbackX || 0 : 0;
    const knockY = flourishFxEnabled() ? enemy.knockbackY || 0 : 0;

    if (renderDebug.enemyImageStatus) renderDebug.enemyImageStatus[enemy.enemyId] = status;
    drawEnemyShadow(enemy, width, lift, drawAlpha, knockX, knockY);

    if (record && status === "loaded") {
      const image = record.tintCanvas || record.image;
      const frameState = animation ? enemyAnimationFrame(enemy, animation) : { frame: 0, tier: "static" };
      const frameWidth = animation ? animation.frameWidth : record.image.naturalWidth;
      const frameHeight = animation ? animation.frameHeight : record.image.naturalHeight;
      const height = width * (frameHeight / frameWidth);
      const faceLeft = (enemy.vx || 0) < -0.5;
      ctx.save();
      ctx.translate(enemy.x + knockX, enemy.y + knockY + lift);
      ctx.rotate(wobble);
      ctx.scale((faceLeft ? -1 : 1) * squashX * hitScaleX, squashY * hitScaleY);
      ctx.globalAlpha *= flash ? drawAlpha * 0.9 : drawAlpha;
      ctx.imageSmoothingEnabled = false;
      if (enemy.filter && performanceState.quality !== "low") ctx.filter = enemy.filter;
      ctx.drawImage(
        image,
        frameState.frame * frameWidth,
        0,
        frameWidth,
        frameHeight,
        -width * 0.5,
        -height * 0.5,
        width,
        height
      );
      if (enemy.tint) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = enemy.tint;
        ctx.fillRect(-width * 0.5, -height * 0.5, width, height);
        ctx.globalCompositeOperation = "source-over";
      }
      if (flash) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha *= 0.68;
        ctx.fillStyle = hitColor;
        ctx.fillRect(-width * 0.5, -height * 0.5, width, height);
      }
      ctx.restore();
      renderDebug.enemyRasterDrawn += 1;
      if (animation) {
        renderDebug.enemyAnimatedDrawn += 1;
        renderDebug.enemyAnimationFrames[enemy.enemyId] = frameState.frame;
        renderDebug.enemyAnimationTier = frameState.tier;
        if (animation.armored) renderDebug.enemyArmoredDrawn += 1;
        if (faceLeft) renderDebug.enemyFacingLeftDrawn += 1;
      }
      return;
    }

    ctx.save();
    ctx.translate(enemy.x + knockX, enemy.y + knockY + lift);
    ctx.rotate(wobble);
    ctx.scale(squashX * hitScaleX, squashY * hitScaleY);
    enemySpriteOptions.flipX = enemy.vx < -8;
    enemySpriteOptions.alpha = flash ? drawAlpha * 0.9 : drawAlpha;
    enemySpriteOptions.tint = flash ? hitColor : enemy.tint || null;
    if (enemy.filter && performanceState.quality !== "low") ctx.filter = enemy.filter;
    drawSprite(enemy.sprite, anim || enemy.anim || "walk", timeMs, 0, 0, enemy.scale, enemySpriteOptions);
    enemySpriteOptions.tint = null;
    ctx.restore();
    renderDebug.enemyFallbackDrawn += 1;
  }

  function drawEnemyCorpse(effect, timeMs) {
    const enemyConfig = config.ENEMIES[effect.enemyId] || null;
    const animation = enemyConfig && enemyConfig.spriteAnimation ? enemyConfig.spriteAnimation : null;
    const record = enemyConfig && (enemyConfig.spriteImage || animation) ? enemyImages[effect.enemyId] : null;
    const status = enemyImageStatus(effect.enemyId);
    const width = enemyVisualWidth(effect, enemyConfig);
    if (record && status === "loaded") {
      const image = record.tintCanvas || record.image;
      const frameWidth = animation ? animation.frameWidth : record.image.naturalWidth;
      const frameHeight = animation ? animation.frameHeight : record.image.naturalHeight;
      const height = width * (frameHeight / frameWidth);
      drawEnemyShadow(effect, width, 0, effect.alpha * 0.55);
      ctx.save();
      ctx.translate(effect.x, effect.y + Math.min(7, effect.radius * 0.18));
      ctx.rotate(effect.rotation || 0);
      ctx.scale(1.08, 0.9);
      ctx.globalAlpha *= effect.alpha * 0.78;
      ctx.imageSmoothingEnabled = false;
      if (effect.filter && performanceState.quality !== "low") ctx.filter = effect.filter;
      ctx.drawImage(image, 0, 0, frameWidth, frameHeight, -width * 0.5, -height * 0.5, width, height);
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

  // 補給箱重繪：像素木箱＋鐵帶＋補給圖示＋浮動＋光暈脈動（取代舊青色線框）。
  function drawEnemyProjectile(shot) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(Math.atan2(shot.vy || 1, shot.vx || 0));
    ctx.globalAlpha *= 0.96;
    ctx.fillStyle = "rgba(95, 228, 120, 0.22)";
    ctx.beginPath();
    ctx.ellipse(-shot.radius * 1.1, 0, shot.radius * 1.6, shot.radius * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#5fe478";
    ctx.strokeStyle = "#142319";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, shot.radius, shot.radius * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d8ff7a";
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function drawSupplyDrop(drop) {
    const visual = fx.supplyCrateVisual(FXC, stateTime() + drop.age * 0.35, fxScratch.crate);
    const style = visual.style || { fill: "#8a5a2b", edge: "#5d3a18", slat: "#a97b46", strap: "#3f2a14", icon: "#ffd76a" };
    const size = visual.size || 16;
    const half = size * 0.5;
    const y = drop.y + visual.bobY;
    ctx.save();
    if (visual.glowAlpha > 0 && fxLevelSetting() !== "off") {
      ctx.globalAlpha = visual.glowAlpha;
      ctx.fillStyle = visual.glowColor;
      ctx.beginPath();
      ctx.arc(drop.x, y, visual.glowRadius || 13, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, visual.glowAlpha * 1.6);
      ctx.beginPath();
      ctx.arc(drop.x, y, (visual.glowRadius || 13) * 0.55, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.translate(Math.round(drop.x), Math.round(y));
    ctx.fillStyle = style.fill;
    ctx.fillRect(-half, -half, size, size);
    ctx.fillStyle = style.slat;
    ctx.fillRect(-half + 1, -half + 2, size - 2, 3);
    ctx.fillRect(-half + 1, half - 5, size - 2, 3);
    ctx.fillStyle = style.strap;
    ctx.fillRect(-2, -half, 4, size);
    ctx.fillRect(-half, -2, size, 4);
    ctx.strokeStyle = style.edge;
    ctx.lineWidth = 1;
    ctx.strokeRect(-half + 0.5, -half + 0.5, size - 1, size - 1);
    ctx.fillStyle = style.icon;
    ctx.fillRect(-1, -4, 2, 8);
    ctx.fillRect(-4, -1, 8, 2);
    ctx.restore();
    renderDebug.supplyCrateDrawn += 1;
    renderDebug.supplyCrateStyle = "pixel_wood";
  }

  function drawWeaponPowerup(drop) {
    const mode = config.WEAPON_POWERUPS && config.WEAPON_POWERUPS.modes
      ? config.WEAPON_POWERUPS.modes[drop.mode]
      : null;
    const time = stateTime() + drop.age * 0.3;
    const visual = weaponVisual(drop.mode);
    const bobY = Math.sin(time * TAU * 1.2) * 1.3;
    const y = drop.y + bobY;
    ctx.save();
    if (fxLevelSetting() !== "off") {
      ctx.globalAlpha = 0.22 + 0.1 * Math.sin(time * TAU * 1.8);
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.arc(drop.x, y, 14, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.translate(Math.round(drop.x), Math.round(y));
    ctx.fillStyle = "#2a2831";
    ctx.fillRect(-8, -7, 16, 14);
    ctx.fillStyle = visual.trail;
    ctx.fillRect(-6, -5, 12, 4);
    ctx.fillStyle = visual.core;
    ctx.fillRect(-2, -7, 4, 14);
    ctx.strokeStyle = "#f4ead8";
    ctx.lineWidth = 1;
    ctx.strokeRect(-7.5, -6.5, 15, 13);
    ctx.save();
    ctx.translate(0, 1);
    ctx.scale(0.72, 0.72);
    traceWeaponShape(visual, 1);
    ctx.restore();
    ctx.restore();
    renderDebug.weaponPowerupDrawn += 1;
  }

  function traceWeaponShape(visual, scale) {
    const length = (visual.length || 8) * (scale || 1);
    const width = (visual.width || 3) * (scale || 1);
    ctx.beginPath();
    if (visual.shape === "diamond") {
      ctx.moveTo(length * 0.58, 0);
      ctx.lineTo(0, -width * 0.62);
      ctx.lineTo(-length * 0.58, 0);
      ctx.lineTo(0, width * 0.62);
      ctx.closePath();
    } else if (visual.shape === "beam") {
      ctx.rect(-length * 0.58, -width * 0.5, length * 1.16, width);
    } else if (visual.shape === "pellet") {
      ctx.moveTo(length * 0.52, 0);
      ctx.lineTo(-length * 0.42, -width * 0.58);
      ctx.lineTo(-length * 0.18, 0);
      ctx.lineTo(-length * 0.42, width * 0.58);
      ctx.closePath();
    } else if (visual.shape === "flame") {
      ctx.moveTo(length * 0.58, 0);
      ctx.bezierCurveTo(length * 0.1, -width * 0.75, -length * 0.18, -width * 0.55, -length * 0.56, 0);
      ctx.bezierCurveTo(-length * 0.12, width * 0.12, -length * 0.08, width * 0.78, length * 0.58, 0);
      ctx.closePath();
    } else if (visual.shape === "chevron") {
      ctx.moveTo(length * 0.56, 0);
      ctx.lineTo(-length * 0.26, -width * 0.65);
      ctx.lineTo(-length * 0.06, 0);
      ctx.lineTo(-length * 0.26, width * 0.65);
      ctx.closePath();
    } else {
      ctx.moveTo(length * 0.52, 0);
      ctx.arc(0, 0, width * 0.5, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-length * 0.52, width * 0.5);
      ctx.lineTo(-length * 0.52, -width * 0.5);
      ctx.closePath();
    }
    ctx.fillStyle = visual.core;
    ctx.fill();
    ctx.strokeStyle = visual.edge;
    ctx.lineWidth = Math.max(0.55, width * 0.18);
    ctx.stroke();
  }

  function drawProjectile(projectile) {
    const visual = weaponVisual(projectile.weaponMode);
    const scale = projectile.fractureShard ? 0.72 : projectile.scale || 1;
    const length = (visual.length || 8) * scale;
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(projectile.rotation || 0);
    ctx.lineCap = "round";
    ctx.strokeStyle = visual.trail;
    if (visual.id === "laser") {
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = 2.4 * scale;
      ctx.beginPath();
      ctx.moveTo(-length * 2.8, 0);
      ctx.lineTo(-length * 0.3, 0);
      ctx.stroke();
    } else if (visual.id === "fracture") {
      ctx.globalAlpha = 0.56;
      ctx.lineWidth = 1 * scale;
      ctx.beginPath();
      ctx.moveTo(-length * 2, -2 * scale);
      ctx.lineTo(-length * 0.28, 0);
      ctx.moveTo(-length * 1.55, 2 * scale);
      ctx.lineTo(-length * 0.28, 0);
      ctx.stroke();
    } else if (visual.id === "ember") {
      ctx.globalAlpha = 0.48;
      ctx.fillStyle = visual.trail;
      ctx.beginPath();
      ctx.arc(-length * 1.35, 0, 2.2 * scale, 0, TAU);
      ctx.arc(-length * 0.75, 0, 1.55 * scale, 0, TAU);
      ctx.fill();
    } else if (visual.id === "scatter") {
      ctx.globalAlpha = 0.54;
      ctx.fillStyle = visual.trail;
      [-1, 0, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(-length * (0.8 + Math.abs(side) * 0.35), side * 2.1 * scale, 0.9 * scale, 0, TAU);
        ctx.fill();
      });
    } else if (visual.id === "homing") {
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.moveTo(-length * 1.8, 2 * scale);
      ctx.quadraticCurveTo(-length, -3 * scale, -length * 0.25, 0);
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.48;
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.moveTo(-length * 1.8, 0);
      ctx.lineTo(-length * 0.25, 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    traceWeaponShape(visual, scale);
    ctx.fillStyle = visual.edge;
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.arc(length * 0.2, 0, Math.max(0.45, (visual.width || 3) * scale * 0.16), 0, TAU);
    ctx.fill();
    ctx.restore();
    const key = visual.id || "standard";
    renderDebug.projectileVisualModes[key] = (renderDebug.projectileVisualModes[key] || 0) + 1;
  }

  function drawSupplyPickup(effect) {
    ctx.save();
    ctx.globalAlpha *= effect.alpha == null ? 1 : effect.alpha;
    ctx.strokeStyle = "#5ed4cb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, 14 + effect.age * 20, 0, Math.PI * 2);
    ctx.stroke();
    drawWorldText(effect.text || "補給", effect.x, effect.y - 18, { size: 8, color: "#5ed4cb", alpha: effect.alpha });
    ctx.restore();
  }

  function drawHudFly(effect) {
    ctx.save();
    ctx.globalAlpha *= effect.alpha == null ? 1 : effect.alpha;
    ctx.fillStyle = effect.color || "#f4ead8";
    ctx.strokeStyle = "#1b1712";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, 5.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1b1712";
    ctx.font = "900 6px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(effect.icon || "+", effect.x, effect.y + 0.5);
    if (effect.text) {
      drawWorldText(effect.text, effect.x, effect.y - 9, { size: 7, color: effect.color || "#f4ead8", alpha: effect.alpha });
    }
    ctx.restore();
  }

  function drawHudPop(effect) {
    const t = Math.min(1, effect.age / Math.max(0.01, effect.ttl));
    const scale = 1 + Math.sin(t * Math.PI) * 0.55;
    ctx.save();
    ctx.globalAlpha *= effect.alpha == null ? 1 : effect.alpha;
    ctx.translate(effect.x, effect.y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = effect.color || "#f4ead8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.stroke();
    if (effect.text) drawWorldText(effect.text, 0, -13, { size: 7, color: effect.color || "#f4ead8", alpha: effect.alpha });
    ctx.restore();
  }

  function drawWaveCelebration(effect) {
    const t = Math.min(1, effect.age / Math.max(0.01, effect.ttl));
    const scale = 1 + Math.sin(t * Math.PI) * 0.12;
    ctx.save();
    ctx.globalAlpha *= effect.alpha == null ? 1 : effect.alpha;
    drawWorldText(effect.text, effect.x, effect.y, { size: Math.round(15 * scale), color: effect.color || "#f2e6c8", stroke: "#2a2118" });
    if (effect.subtext) drawWorldText(effect.subtext, effect.x, effect.y + 18, { size: 9, color: "#f0b64a", stroke: "#2a2118", alpha: effect.alpha });
    ctx.restore();
    renderDebug.waveCelebrationDrawn = true;
  }

  function drawComboCounter() {
    if (!state || !state.combo || state.combo.count < 2 || !flourishFxEnabled()) return;
    const cfg = (FXC && FXC.combo) || {};
    const elapsed = state.time - state.combo.lastKillAt;
    const windowSeconds = cfg.windowSeconds || 2.25;
    const fadeSeconds = cfg.fadeSeconds || 0.45;
    if (elapsed > windowSeconds + fadeSeconds) return;
    const fade = elapsed <= windowSeconds ? 1 : 1 - (elapsed - windowSeconds) / Math.max(0.01, fadeSeconds);
    const pulse = 1 + Math.max(0, 1 - elapsed * 4) * 0.28;
    drawWorldText(`COMBO x${state.combo.count}`, W * 0.5, H * 0.5 - 96, {
      size: Math.round((cfg.size || 13) * pulse),
      color: cfg.color || "#ffe08a",
      stroke: "#2a2118",
      alpha: fade
    });
    renderDebug.comboDrawn = true;
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

  // ── DSFx 渲染端 ──────────────────────────────────────────────

  function drawFxParticle(p) {
    if (p.texture) {
      if (p.texture === "flash" && meta.settings && meta.settings.reducedFlash) return;
      const image = fxTextureTintCache[`${p.texture}:${p.color}`] || fxTextureTintCache[`${p.texture}:base`];
      if (image) {
        const drawSize = Math.max(3, p.size * (p.texture === "flash" ? 2.5 : 2.15));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.alpha * (p.texture === "smoke" ? 0.48 : p.texture === "debris" ? 0.78 : 0.9);
        if (
          (p.texture === "fire" || p.texture === "flash") &&
          performanceState.quality !== "low" &&
          fxLevelSetting() === "full" &&
          !(meta.settings && meta.settings.reducedFlash)
        ) ctx.globalCompositeOperation = "lighter";
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, -drawSize * 0.5, -drawSize * 0.5, drawSize, drawSize);
        ctx.restore();
        renderDebug.texturedParticlesDrawn += 1;
        return;
      }
    }
    ctx.fillStyle = p.color;
    if (p.stretch > 1.01) {
      // 速度向拉伸（風速線 / 流星 / 曳光）
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      const nx = p.vx / speed;
      const ny = p.vy / speed;
      const len = Math.max(1, p.size * p.stretch * 0.5);
      ctx.globalAlpha = p.alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.5, p.size * 0.6);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x - nx * len, p.y - ny * len);
      ctx.lineTo(p.x + nx * len * 0.4, p.y + ny * len * 0.4);
      ctx.stroke();
    } else if (p.shape === "smoke" || p.shape === "dust" || p.shape === "foam") {
      ctx.globalAlpha = p.alpha * (p.shape === "smoke" ? 0.42 : 0.6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, p.size * 0.5), 0, TAU);
      ctx.fill();
    } else if (p.shape === "debris" || p.shape === "shard") {
      const s = Math.max(0.8, p.size);
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      const nx = p.vx / speed;
      const ny = p.vy / speed;
      const len = Math.max(1.2, s * (p.shape === "shard" ? 2.2 : 1.45));
      ctx.globalAlpha = p.alpha;
      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.45, s * (p.shape === "shard" ? 0.35 : 0.5));
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x - nx * len, p.y - ny * len);
      ctx.lineTo(p.x - nx * s * 0.18, p.y - ny * s * 0.18);
      ctx.stroke();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.beginPath();
      ctx.arc(0, 0, p.shape === "shard" ? s * 0.34 : s * 0.48, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (p.shape === "spark" || p.shape === "ember") {
      const s = Math.max(0.6, p.size);
      if (performanceState.quality === "low" || (meta.settings && meta.settings.reducedFlash)) {
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 0.5, 0, TAU);
        ctx.fill();
        return;
      }
      const radius = Math.max(1, s * 1.6);
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      gradient.addColorStop(0, p.color);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.globalCompositeOperation = "lighter";
      if (p.shape === "ember") {
        ctx.globalAlpha = p.alpha * 0.36;
        ctx.fillStyle = "#ff9a3a";
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 1.55, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = p.alpha;
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, TAU);
      ctx.fill();
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 0;
      if (speed > 4) {
        const nx = p.vx / speed;
        const ny = p.vy / speed;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.45, s * 0.36);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - nx * s * 2.1, p.y - ny * s * 2.1);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.fillStyle = "#fff6d8";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.35, s * 0.22), 0, TAU);
      ctx.fill();
      ctx.restore();
    } else {
      const s = Math.max(0.6, p.size);
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.5, 0, TAU);
      ctx.fill();
    }
  }

  function drawFxParticles() {
    if (!fxState || !fxEnabled()) return;
    ctx.save();
    fx.forEachActive(fxState, drawFxParticle);
    ctx.restore();
  }

  function drawVehicleShadow(vehicleConfig, vehicle, shadow) {
    if (!shadow) return;
    const width = vehicleConfig.visualWidth || (vehicleConfig.visualHalfWidth || 30) * 2;
    ctx.save();
    ctx.globalAlpha *= shadow.alpha == null ? 0.3 : shadow.alpha;
    ctx.fillStyle = shadow.color || "#000000";
    ctx.beginPath();
    ctx.ellipse(
      vehicle.x,
      // 以載具貼圖底緣為基準再加 offsetY，陰影才不會整顆藏在載具底下
      vehicle.y + fxVehicleVisualHeight(vehicleConfig) * 0.28 + (shadow.offsetY || 0),
      Math.max(6, width * (shadow.widthMul == null ? 0.9 : shadow.widthMul) * 0.5),
      Math.max(2, width * (shadow.heightMul == null ? 0.2 : shadow.heightMul) * 0.5),
      0,
      0,
      TAU
    );
    ctx.fill();
    ctx.restore();
  }

  function drawRunTrailerShadow(pose, width, height, shadow) {
    if (!shadow) return;
    ctx.save();
    ctx.globalAlpha *= shadow.alpha == null ? 0.24 : shadow.alpha;
    ctx.fillStyle = shadow.color || "#000000";
    ctx.beginPath();
    ctx.ellipse(
      pose.x,
      pose.y + pose.bobY + height * 0.26 + (shadow.offsetY || 0),
      Math.max(5, width * (shadow.widthMul == null ? 0.9 : shadow.widthMul) * 0.5),
      Math.max(2, width * (shadow.heightMul == null ? 0.22 : shadow.heightMul) * 0.5),
      0,
      0,
      TAU
    );
    ctx.fill();
    ctx.restore();
  }

  function drawRunTrailerFallback(pose, width, height, spec) {
    const scale = width / 23;
    drawRunTrailerShadow(pose, width, height, spec.shadow);
    ctx.save();
    ctx.translate(pose.x, pose.y + pose.bobY);
    ctx.rotate(pose.rotation);
    ctx.globalAlpha *= spec.alpha == null ? 0.92 : spec.alpha;
    ctx.fillStyle = "#3b3328";
    ctx.fillRect(-10 * scale, -18 * scale, 20 * scale, 31 * scale);
    ctx.fillStyle = "#6f6047";
    ctx.fillRect(-8 * scale, -15 * scale, 16 * scale, 19 * scale);
    ctx.fillStyle = "#1a2328";
    ctx.fillRect(-5 * scale, -8 * scale, 10 * scale, 7 * scale);
    ctx.fillStyle = "#9b2e25";
    ctx.fillRect(-7 * scale, 9 * scale, 4 * scale, 2 * scale);
    ctx.fillRect(3 * scale, 9 * scale, 4 * scale, 2 * scale);
    ctx.fillStyle = "#151210";
    ctx.fillRect(-13 * scale, 6 * scale, 4 * scale, 9 * scale);
    ctx.fillRect(9 * scale, 6 * scale, 4 * scale, 9 * scale);
    ctx.strokeStyle = "#94836a";
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.beginPath();
    ctx.moveTo(0, -18 * scale);
    ctx.lineTo(0, -25 * scale);
    ctx.stroke();
    ctx.restore();
    renderDebug.runTrailerFallbackDrawn = true;
  }

  function drawRunTrailer(vehicleConfig, vehicle) {
    if (!state || meta.settings.showRunTrailer === false) return;
    const spec = runTrailerSpec(vehicleConfig);
    if (!spec || !spec.spriteImage) return;
    const previousUpdateAt = Number.isFinite(state.runTrailerUpdatedAt) ? state.runTrailerUpdatedAt : state.time;
    const dt = Math.max(0, state.time - previousUpdateAt);
    const pose = rules.resolveTrailerFollowPose({
      vehicle,
      previous: state.runTrailerPose,
      dt,
      time: stateTime(),
      trailerConfig: spec,
      simplified: performanceState.quality === "low" || fxLevelSetting() === "off"
    });
    state.runTrailerPose = pose;
    state.runTrailerUpdatedAt = state.time;

    const status = runTrailerImageStatus(spec);
    const width = spec.visualWidth || 23;
    const record = runTrailerImages[spec.spriteImage];
    const height =
      record && record.image && record.image.naturalWidth > 0
        ? width * (record.image.naturalHeight / record.image.naturalWidth)
        : width * 1.82;
    renderDebug.runTrailerImageStatus = status;
    renderDebug.runTrailerPose = {
      x: Math.round(pose.x * 10) / 10,
      y: Math.round(pose.y * 10) / 10,
      targetY: Math.round(pose.targetY * 10) / 10,
      rotation: Math.round(pose.rotation * 1000) / 1000
    };

    if (record && status === "loaded") {
      drawRunTrailerShadow(pose, width, height, spec.shadow);
      ctx.save();
      ctx.translate(pose.x, pose.y + pose.bobY);
      ctx.rotate(pose.rotation);
      ctx.globalAlpha *= spec.alpha == null ? 0.94 : spec.alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(record.image, -width * 0.5, -height * 0.5, width, height);
      ctx.restore();
      renderDebug.runTrailerRasterDrawn = true;
      return;
    }

    drawRunTrailerFallback(pose, width, height, spec);
  }

  function drawCompanionFallback(pose, width, height) {
    ctx.save();
    ctx.translate(pose.x, pose.y + pose.bobY);
    ctx.rotate(pose.rotation);
    ctx.globalAlpha *= 0.92;
    ctx.fillStyle = "#35291c";
    ctx.fillRect(-width * 0.34, -height * 0.32, width * 0.68, height * 0.5);
    ctx.fillStyle = "#c5905d";
    ctx.fillRect(-width * 0.22, -height * 0.58, width * 0.44, height * 0.28);
    ctx.fillStyle = "#1d2530";
    ctx.fillRect(-width * 0.28, -height * 0.2, width * 0.56, height * 0.28);
    ctx.strokeStyle = "#ffd27f";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -height * 0.28);
    ctx.lineTo(0, -height * 0.58);
    ctx.stroke();
    ctx.restore();
    renderDebug.companionFallbackDrawn = true;
  }

  function drawCompanion(vehicleConfig, vehicle) {
    if (!state || !companionEnabled()) return;
    const spec = config.TRAILER_GUNNER || {};
    const pose = state.companionPose || updateCompanionPose(0);
    const status = companionImageStatus(spec);
    const record = spec.sprite ? companionImages[spec.sprite] : null;
    const frameCount = Math.max(1, Number.isFinite(spec.frames) ? Math.floor(spec.frames) : 1);
    const frameWidth = record && record.image && record.image.naturalWidth > 0
      ? record.image.naturalWidth / frameCount
      : 0;
    const width = spec.visualWidth || 30;
    const height =
      record && record.image && frameWidth > 0
        ? width * (record.image.naturalHeight / frameWidth)
        : width * 1.33;
    const frame = frameCount > 1 && state.companionFiringUntil > state.time ? 1 : 0;
    renderDebug.companionImageStatus = status;
    renderDebug.companionPose = {
      x: Math.round(pose.x * 10) / 10,
      y: Math.round(pose.y * 10) / 10,
      rotation: Math.round(pose.rotation * 1000) / 1000
    };
    renderDebug.companionFrame = frame;

    if (record && status === "loaded") {
      ctx.save();
      ctx.translate(pose.x, pose.y + pose.bobY);
      ctx.rotate(pose.rotation);
      ctx.globalAlpha *= spec.alpha == null ? 0.96 : spec.alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        record.image,
        frame * frameWidth,
        0,
        frameWidth,
        record.image.naturalHeight,
        -width * 0.5,
        -height * 0.64,
        width,
        height
      );
      ctx.restore();
      renderDebug.companionRasterDrawn = true;
      return;
    }

    drawCompanionFallback(pose, width, height);
  }

  function hexChannel(hex, index) {
    return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) || 0;
  }

  function drawVignette(environment, vignette) {
    const key = `${environment}:${vignette.color}:${vignette.strength}`;
    let gradient = fxVignetteCache[key];
    if (!gradient) {
      const r = hexChannel(vignette.color, 0);
      const g = hexChannel(vignette.color, 1);
      const b = hexChannel(vignette.color, 2);
      gradient = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.24, W * 0.5, H * 0.46, H * 0.66);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 1)`);
      fxVignetteCache[key] = gradient;
    }
    ctx.save();
    ctx.globalAlpha = vignette.strength;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    renderDebug.vignetteDrawn = true;
  }

  function drawPulseVignette(cacheName, color, alpha) {
    const key = `pulse:${cacheName}:${color}`;
    let gradient = fxVignetteCache[key];
    if (!gradient) {
      const r = hexChannel(color, 0);
      const g = hexChannel(color, 1);
      const b = hexChannel(color, 2);
      gradient = ctx.createRadialGradient(W * 0.5, H * 0.48, H * 0.2, W * 0.5, H * 0.48, H * 0.7);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      gradient.addColorStop(0.64, `rgba(${r}, ${g}, ${b}, 0.18)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 1)`);
      fxVignetteCache[key] = gradient;
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawBossArrivalVignette() {
    const spec = FXC && FXC.bossArrival;
    if (
      !state || !spec || state.waveBannerKind !== "boss" || fxLevelSetting() !== "full" ||
      performanceState.quality === "low" || (meta.settings && meta.settings.reducedFlash)
    ) return;
    const elapsed = state.time - state.waveBannerStart;
    if (elapsed < 0 || elapsed > spec.duration) return;
    const envelope = Math.sin(Math.PI * Math.min(1, elapsed / spec.duration));
    const pulse = 0.62 + 0.38 * Math.sin(elapsed * spec.pulseHz * TAU);
    drawPulseVignette("boss", spec.color, spec.strength * envelope * pulse);
    renderDebug.bossArrivalVignetteDrawn = true;
  }

  function drawLowHpPulse() {
    const spec = FXC && FXC.lowHpPulse;
    if (!state || !spec || fxLevelSetting() !== "full" || (meta.settings && meta.settings.reducedFlash)) return;
    const hpPct = state.vehicle.maxHp > 0 ? state.vehicle.hp / state.vehicle.maxHp : 0;
    if (hpPct <= 0 || hpPct > spec.threshold) return;
    const danger = 1 - hpPct / spec.threshold;
    const breath = 0.5 + 0.5 * Math.sin(state.time * spec.pulseHz * TAU - Math.PI * 0.5);
    const alpha = spec.minAlpha + (spec.maxAlpha - spec.minAlpha) * (0.35 + breath * 0.65) * (0.55 + danger * 0.45);
    drawPulseVignette("low_hp", spec.color, alpha);
    renderDebug.lowHpPulseDrawn = true;
  }

  function starDustLayer() {
    if (fxStarLayer !== undefined) return fxStarLayer;
    const layers = fx.environmentLayers(FXC, "space");
    fxStarLayer = null;
    for (let i = 0; i < layers.length; i += 1) {
      if (Array.isArray(layers[i].parallax)) fxStarLayer = layers[i];
    }
    return fxStarLayer;
  }

  // 星塵視差：三層不同速度/密度/亮度的確定性星點，直繪不佔粒子池。
  function drawStarDust() {
    const layer = starDustLayer();
    if (!layer) return;
    const time = stateTime();
    const density = fxState ? fxState.envDensityMul : 1;
    ctx.save();
    for (let li = 0; li < layer.parallax.length; li += 1) {
      const band = layer.parallax[li];
      const count = Math.max(4, Math.floor(W * band.density * density * 0.45));
      ctx.globalAlpha = Math.min(1, band.alpha * 0.9);
      ctx.fillStyle = layer.colors[li % layer.colors.length] || "#ffffff";
      for (let i = 0; i < count; i += 1) {
        const x = (i * 97 + li * 41) % W;
        const y = (i * 61 + li * 149 + time * band.speed) % H;
        ctx.fillRect(x, y, band.size, band.size);
      }
    }
    ctx.restore();
  }

  // Boss 死亡：擴散衝擊環＋短暫白閃＋上下黑邊，構成純視覺慢放感（不動邏輯時序）。
  function drawBossKillFx() {
    if (!fxBossKillFx || !state) return;
    const elapsed = visualStateTime() - fxBossKillFx.start;
    const duration = 0.55;
    if (elapsed < 0 || elapsed > duration) {
      fxBossKillFx = null;
      return;
    }
    if (fxLevelSetting() === "off") return;
    const t = elapsed / duration;
    const reduced = !!(meta.settings && meta.settings.reducedFlash);
    ctx.save();
    ctx.strokeStyle = "#ffe08a";
    ctx.globalAlpha = (1 - t) * 0.55;
    ctx.lineWidth = 2.5 * (1 - t) + 0.5;
    ctx.beginPath();
    ctx.arc(fxBossKillFx.x, fxBossKillFx.y, 12 + t * 92, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = (1 - t) * 0.32;
    ctx.beginPath();
    ctx.arc(fxBossKillFx.x, fxBossKillFx.y, 6 + t * 56, 0, TAU);
    ctx.stroke();
    if (!reduced) {
      ctx.globalAlpha = Math.max(0, 0.26 * (1 - t * 1.7));
      ctx.fillStyle = "#fff6e0";
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 0.3 * (1 - t);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, 24);
    ctx.fillRect(0, H - 24, W, 24);
    ctx.restore();
  }

  // 波次開場「第 N 波」大字與 Boss 紅色警告（flash/shake 受 reducedFlash 抑制）。
  function drawWaveBanner() {
    if (!FXC || !state || fxLevelSetting() === "off" || !state.waveBannerKind) return;
    const banner = fx.waveBanner(
      FXC,
      state.waveBannerKind,
      state.waveBannerNumber,
      state.time - state.waveBannerStart,
      meta.settings,
      fxScratch.banner
    );
    if (!banner.active) return;
    const shakeX = banner.shake ? Math.sin(state.time * 87) * banner.shake : 0;
    const shakeY = banner.shake ? Math.cos(state.time * 71) * banner.shake : 0;
    if (banner.flash > 0) {
      ctx.save();
      ctx.globalAlpha = banner.flash * 0.16 * banner.alpha;
      ctx.fillStyle = banner.color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    drawWorldText(banner.text, W * 0.5 + shakeX, H * 0.5 + banner.offsetY + shakeY, {
      size: Math.round(17 * banner.scale),
      alpha: banner.alpha,
      color: banner.color,
      stroke: banner.edge,
      strokeWidth: 3
    });
    renderDebug.waveBannerDrawn = true;
  }

  function drawEnvironmentEventOverlay() {
    if (!state || !state.wavePlan || !state.wavePlan.environmentEvent) return;
    const event = state.wavePlan.environmentEvent;
    const visibilityLoss = rules.clamp(Number(event.visibilityLoss) || 0, 0, 0.55);
    renderDebug.environmentOverlayDrawn = true;
    renderDebug.environmentVisibilityLoss = visibilityLoss;
    ctx.save();
    if (visibilityLoss > 0) {
      ctx.globalAlpha = 0.28 + visibilityLoss * 0.82;
      ctx.fillStyle = event.environment === "land" ? "#11100d" : "#07121c";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = visibilityLoss * 0.8;
      ctx.fillStyle = event.id === "land_blackout" ? "#050504" : "#d3a45f";
      ctx.fillRect(0, 0, W, H * 0.18);
      ctx.fillRect(0, H * 0.82, W, H * 0.18);
      const side = Math.max(12, W * visibilityLoss);
      ctx.fillRect(0, 0, side, H);
      ctx.fillRect(W - side, 0, side, H);
    }
    if (event.id === "sandstorm") {
      ctx.globalAlpha = performanceState.quality === "low" ? 0.2 : 0.3;
      ctx.fillStyle = "#c89443";
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
      ctx.globalAlpha = performanceState.quality === "low" ? 0.16 : 0.24;
      ctx.fillStyle = "#0a4264";
      ctx.fillRect(0, 0, W, H);
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
    } else if (event.id === "land_blackout") {
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = "#f1e2b0";
      for (let y = -16 + (state.scroll * 2) % 48; y < H + 48; y += 48) {
        ctx.beginPath();
        ctx.moveTo(W * 0.18, y);
        ctx.lineTo(W * 0.82, y + 24);
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
    state.enemyProjectiles.forEach(drawEnemyProjectile);
    state.supplyDrops.forEach(drawSupplyDrop);
    state.weaponPowerups.forEach(drawWeaponPowerup);
    state.projectiles.forEach(drawProjectile);
    state.enemies.forEach((enemy) => {
      const alpha = enemy.hitFlash > 0 && flourishFxEnabled() ? 0.7 : 1;
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
      } else if (effect.kind === "supply_pickup") {
        drawSupplyPickup(effect);
      } else if (effect.kind === "hud_fly") {
        drawHudFly(effect);
      } else if (effect.kind === "hud_pop") {
        drawHudPop(effect);
      } else if (effect.kind === "wave_celebration") {
        drawWaveCelebration(effect);
      } else if (effect.kind === "enemy_corpse") {
        drawEnemyCorpse(effect, timeMs);
      } else if (effect.kind === "muzzle_flash") {
        // 砲口閃焰放大增亮＋高頻閃爍（reducedFlash 時 flickerHz=0、縮回保守規格）
        const flicker = effect.flickerHz > 0 ? 1 + 0.18 * Math.sin(stateTime() * effect.flickerHz * TAU) : 1;
        const brightness = effect.brightness || 1;
        const flashAlpha = Math.min(1, effect.alpha * brightness);
        drawSprite(effect.sprite, effect.anim, timeMs, effect.x, effect.y, effect.scale * flicker, { alpha: flashAlpha });
        if (brightness > 1) {
          drawSprite(effect.sprite, effect.anim, timeMs, effect.x, effect.y, effect.scale * flicker * 0.68, {
            alpha: Math.min(1, flashAlpha * 0.6)
          });
        }
      } else {
        drawSprite(effect.sprite, effect.anim, timeMs, effect.x, effect.y, effect.scale, { alpha: effect.alpha });
      }
    });

    const vehicleConfig = getVehicleConfig(state.vehicleId);
    const vehicleAnim = state.vehicle.hp <= 0 ? "wreck" : state.vehicle.recentHitUntil > state.time ? "damage" : "move";
    // 載具生命感：底部橢圓陰影＋怠速浮動＋移動傾斜（純視覺，不動邏輯座標）
    const motion = FXC && fxLevelSetting() !== "off"
      ? fx.vehicleMotion(FXC, currentEnvironment(), stateTime(), fxMoveX, fxScratch.motion)
      : null;
    if (motion && motion.shadow) drawVehicleShadow(vehicleConfig, state.vehicle, motion.shadow);
    drawRunTrailer(vehicleConfig, state.vehicle);
    drawCompanion(vehicleConfig, state.vehicle);
    ctx.save();
    if (flourishFxEnabled() && state.vehicle.recoilUntil > state.time) {
      const startedAt = state.vehicle.recoilStartedAt || state.time;
      const total = Math.max(0.01, state.vehicle.recoilUntil - startedAt);
      const t = Math.max(0, Math.min(1, (state.time - startedAt) / total));
      const kick = (1 - t) * (0.72 + 0.28 * Math.sin(t * Math.PI * 5));
      ctx.translate((state.vehicle.recoilX || 0) * kick, (state.vehicle.recoilY || 0) * kick);
    }
    if (motion) {
      ctx.translate(state.vehicle.x, state.vehicle.y + motion.bobY);
      ctx.rotate(fxTiltRad);
      ctx.translate(-state.vehicle.x, -state.vehicle.y);
    }
    drawVehicle(vehicleConfig, state.vehicle, timeMs, {
      alpha: 1,
      anim: vehicleAnim,
      hitFlash: state.vehicle.recentHitUntil > state.time
    });
    drawVehicleDamageSmoke(vehicleConfig, state.vehicle);
    drawVehicleNavigationLights(vehicleConfig, state.vehicle);
    drawVehicleShield(state.vehicle, timeMs);
    ctx.restore();
    drawFxParticles();
    drawBossKillFx();
    drawAimGuide();
    drawEnvironmentEventOverlay();
    drawSprite(
      "effect_muzzle",
      "burst",
      timeMs,
      Number.isFinite(state.vehicle.assistAimX) ? state.vehicle.assistAimX : state.vehicle.aimX,
      Number.isFinite(state.vehicle.assistAimY) ? state.vehicle.assistAimY : state.vehicle.aimY,
      0.8,
      { alpha: state.input.dragging ? 0.62 : 0.35 }
    );
    drawWaveBanner();
    drawComboCounter();
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
      vehicleShieldDrawn: false,
      vehicleNavigationLightsDrawn: 0,
      vehicleDamageSmokeDrawn: 0,
      vehicleDamageSparksDrawn: 0,
      vehicleImageStatus: "none",
      runTrailerRasterDrawn: false,
      runTrailerFallbackDrawn: false,
      runTrailerImageStatus: "none",
      runTrailerPose: null,
      companionRasterDrawn: false,
      companionFallbackDrawn: false,
      companionImageStatus: "none",
      companionPose: null,
      companionFrame: 0,
      backgroundRasterDrawn: false,
      backgroundFallbackDrawn: false,
      backgroundImageStatus: "none",
      backgroundImagePath: "",
      enemyRasterDrawn: 0,
      enemyFallbackDrawn: 0,
      enemyShadowDrawn: 0,
      enemyImageStatus: {},
      enemyAnimatedDrawn: 0,
      enemyArmoredDrawn: 0,
      enemyFacingLeftDrawn: 0,
      enemyAnimationFrames: {},
      enemyAnimationTier: "none",
      enemyTintCacheCount: Object.values(enemyImages).filter((record) => !!record.tintCanvas).length,
      fxActive: fxState ? fxState.activeCount : 0,
      fxMaxParticles: fxState ? fxState.maxParticles : 0,
      fxQuality: fxState ? fxState.quality : "none",
      fxLevel: fxLevelSetting(),
      fxTextureStatus: fxTextureStatus(),
      fxTextureTintCount: Object.keys(fxTextureTintCache).length,
      texturedParticlesDrawn: 0,
      vignetteDrawn: false,
      bossArrivalVignetteDrawn: false,
      lowHpPulseDrawn: false,
      roadDetailDrawn: false,
      roadDetailTier: "none",
      roadDebrisDrawn: 0,
      roadDebrisStatus: roadDetailImage.status,
      depthLayersDrawn: false,
      depthLayerTier: "none",
      scorchMarksDrawn: 0,
      fxPriorityEvictions: fxState ? fxState.priorityEvictions : 0,
      projectileVisualModes: {},
      waveBannerDrawn: false,
      waveCelebrationDrawn: false,
      comboDrawn: false,
      environmentOverlayDrawn: false,
      environmentVisibilityLoss: 0,
      supplyCrateDrawn: 0,
      weaponPowerupDrawn: 0,
      supplyCrateStyle: ""
    };
    const timeMs = ((state ? visualStateTime() : idleTime) || 0) * 1000;
    ctx.clearRect(0, 0, W, H);
    if (
      state &&
      state.shakeUntil > state.time &&
      !(meta.settings && meta.settings.reducedFlash) &&
      !(meta.settings && meta.settings.screenShake === false)
    ) {
      const progress = Math.max(0, (state.shakeUntil - state.time) / Math.max(0.01, state.shakeUntil));
      const amp = (state.shakeAmp || 0) * progress;
      ctx.save();
      ctx.translate(Math.sin(state.time * 91) * amp, Math.cos(state.time * 73) * amp);
    }
    drawBackground(timeMs);
    drawDepthLayers();
    drawRoadDetailOverlay();
    drawRoadDebrisAtlas();
    drawScorchMarks();
    if (state && FXC && fxEnabled() && currentEnvironment() === "space") drawStarDust();
    if (state) drawGame(timeMs);
    else drawIdlePreview(timeMs);
    if (
      state &&
      state.shakeUntil > state.time &&
      !(meta.settings && meta.settings.reducedFlash) &&
      !(meta.settings && meta.settings.screenShake === false)
    ) ctx.restore();
    if (state && FXC && fxLevelSetting() === "full") {
      // per-environment 色彩分級薄疊；low 品質由 vignetteParams 回 null 整層關閉
      const vignette = fx.vignetteParams(FXC, currentEnvironment(), performanceState.quality);
      if (vignette) drawVignette(currentEnvironment(), vignette);
    }
    if (state) {
      drawBossArrivalVignette();
      drawLowHpPulse();
    }
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
      updatePerformanceQuality(delta);
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
    preloadEnvironmentImages();
    preloadRoadDetailImage();
    preloadVehicleImages();
    preloadRunTrailerImages();
    preloadCompanionImages();
    preloadEnemyImages();
    preloadFxTextures();
    bindInput();
    // 音效解鎖：首次 pointerdown / keydown resume AudioContext（autoplay 政策）
    if (audio && typeof audio.installUnlockHandlers === "function") audio.installUnlockHandlers(root);
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
      spawnGatePair,
      grantGate,
      chooseSupplyReward,
      chooseGate,
      damageVehicle,
      killAllEnemies,
      finishRun,
      pushWave,
      clearStorage,
      getRenderDebug: () => rules.deepClone(renderDebug),
      samplePerformanceFrames,
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
    spawnGatePair,
    grantGate,
    chooseSupplyReward,
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
