"use strict";

(function attachUi(root) {
  const config = root.DSConfig;
  const rules = root.DSRules;
  const game = root.AshesGame;

  if (!config || !rules || !game) {
    throw new Error("Ashes UI requires config, rules and game.");
  }

  let meta = rules.migrateMeta(null, { config });
  let latestState = null;
  let lastSettlement = null;
  let recommendedUpgradeTrack = "";
  let lastDrawerTrigger = null;
  let swRegistration = null;
  let swControllerChangeBound = false;
  let hadServiceWorkerControllerAtLoad = false;
  const swAutoReloadStartedAt = Date.now();
  const SW_AUTO_RELOAD_WINDOW_MS = 15000;
  const SW_AUTO_RELOAD_SESSION_KEY = "ashes_convoy_sw_auto_reload";
  const gateChoiceButtons = new Map();
  let lastGateChoiceKey = "";
  let lastSupplyChoiceKey = "";
  let trailerRoomMetrics = null;
  let trailerRedrawTimer = 0;
  let gateChoiceLayerSize = {
    width: config.LOGIC.displayWidth,
    height: config.LOGIC.displayHeight
  };

  const els = {};
  const shelter = {
    active: false,
    sceneReady: false,
    backgroundMode: "none",
    imageLoaded: false,
    imageFailed: false,
    imageTheme: "",
    rafId: 0,
    drawError: "",
    drawerKind: "garage",
    hotspotRects: {},
    metrics: null,
    lastOpts: null,
    lastDrawMs: 0
  };
  const START_BACKGROUND = Object.assign(
    {
      image: "assets/ui/start.png",
      alt: "灰燼護航開始畫面"
    },
    config.START_SCREEN || {}
  );

  function nowIso() {
    return new Date().toISOString();
  }

  function migrateUiMeta(raw) {
    return rules.migrateMeta(raw, { now: nowIso, config });
  }

  function loadMeta() {
    const raw = root.localStorage ? root.localStorage.getItem(config.STORAGE_KEY) : null;
    meta = migrateUiMeta(raw);
    return meta;
  }

  function saveMeta() {
    if (root.localStorage) root.localStorage.setItem(config.STORAGE_KEY, JSON.stringify(meta));
  }

  function setStatus(text) {
    els.garageStatus.textContent = text || "";
  }

  function applyFontSize() {
    const size = meta.settings && meta.settings.fontSize ? meta.settings.fontSize : "medium";
    root.document.body.classList.toggle("font-small", size === "small");
    root.document.body.classList.toggle("font-large", size === "large");
  }

  function handleGlobalErrorRecovery(message) {
    try {
      meta = rules.createSafeRecoveryMeta(meta, { message, at: nowIso() }, { config });
      saveMeta();
      if (els.garageStatus) setStatus("偵測到異常，已安全保留存檔。重新整理後可繼續。");
    } catch (error) {
      if (root.console && typeof root.console.error === "function") root.console.error(error);
    }
  }

  function installErrorRecovery() {
    if (root.__ashesRecoveryInstalled) return;
    root.__ashesRecoveryInstalled = true;
    root.addEventListener("error", (event) => {
      handleGlobalErrorRecovery(event && event.message ? event.message : "window error");
    });
    root.addEventListener("unhandledrejection", (event) => {
      const reason = event && event.reason;
      const message = reason && reason.message ? reason.message : String(reason || "unhandled rejection");
      handleGlobalErrorRecovery(message);
    });
  }

  function showUpdateAvailable() {
    setStatus("新版本可用，重新整理後套用。");
  }

  function sessionValue(key) {
    try {
      return root.sessionStorage ? root.sessionStorage.getItem(key) : root[`__${key}`] || "";
    } catch (error) {
      return root[`__${key}`] || "";
    }
  }

  function setSessionValue(key, value) {
    try {
      if (root.sessionStorage) root.sessionStorage.setItem(key, value);
      else root[`__${key}`] = value;
    } catch (error) {
      root[`__${key}`] = value;
    }
  }

  function installServiceWorkerControllerChangeHandler() {
    if (swControllerChangeBound || !("serviceWorker" in root.navigator)) return;
    swControllerChangeBound = true;
    hadServiceWorkerControllerAtLoad = !!root.navigator.serviceWorker.controller;
    root.navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadServiceWorkerControllerAtLoad) return;
      const guardValue = sessionValue(SW_AUTO_RELOAD_SESSION_KEY);
      const elapsed = Date.now() - swAutoReloadStartedAt;
      if (elapsed <= SW_AUTO_RELOAD_WINDOW_MS && guardValue !== config.CACHE_VERSION) {
        setSessionValue(SW_AUTO_RELOAD_SESSION_KEY, config.CACHE_VERSION);
        root.location.reload();
        return;
      }
      showUpdateAvailable();
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in root.navigator)) return;
    const params = new URLSearchParams(root.location.search || "");
    if (root.navigator.webdriver && !params.has("swtest")) return;
    installServiceWorkerControllerChangeHandler();
    root.navigator.serviceWorker.register("sw.js").then((registration) => {
      swRegistration = registration;
      if (registration.waiting) showUpdateAvailable();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && root.navigator.serviceWorker.controller) showUpdateAvailable();
        });
      });
    }).catch(() => {
      // PWA is optional; offline support failure should not block play.
    });
  }

  function checkForUpdate() {
    if (!swRegistration) {
      setStatus("此環境尚未啟用離線更新。");
      return;
    }
    if (swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
      root.location.reload();
      return;
    }
    swRegistration.update().then(() => {
      if (swRegistration.waiting) {
        swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
        root.location.reload();
      } else {
        setStatus("已是最新版本。");
      }
    }).catch(() => setStatus("檢查更新失敗，請稍後再試。"));
  }

  function getShelterApi() {
    return root.DSShelterScene;
  }

  function isShelterSceneAvailable() {
    const api = getShelterApi();
    return !!(
      api &&
      typeof api.drawShelterScene === "function" &&
      api.SHELTER_HOTSPOTS &&
      typeof api.SHELTER_HOTSPOTS === "object"
    );
  }

  function hasFullMetaBackground() {
    return shelter.backgroundMode === "image" || shelter.backgroundMode === "scene";
  }

  function setSectionVisibility(kind) {
    const compactMode = hasFullMetaBackground();
    els.metaSections.forEach((section) => {
      const sectionKind = section.dataset.metaSection;
      section.hidden = compactMode && sectionKind !== kind;
    });
    if (els.metaDrawerTitle) {
      els.metaDrawerTitle.textContent =
        kind === "upgrades"
          ? "升級工坊"
          : kind === "vehicle"
            ? "載具棚"
            : kind === "achievements"
              ? "成就牆"
              : kind === "operations"
                ? "任務與設定"
                : "基地管理";
    }
  }

  function openMetaDrawer(kind, trigger) {
    if (trigger && typeof trigger.focus === "function") lastDrawerTrigger = trigger;
    shelter.drawerKind = kind || "garage";
    setSectionVisibility(shelter.drawerKind);
    els.metaDrawer.hidden = false;
    if (hasFullMetaBackground() && els.closeMetaDrawer && typeof els.closeMetaDrawer.focus === "function") {
      els.closeMetaDrawer.focus();
    }
  }

  function closeMetaDrawer() {
    if (!hasFullMetaBackground()) {
      openMetaDrawer("garage");
      return;
    }
    els.metaDrawer.hidden = true;
    shelter.drawerKind = "";
    if (lastDrawerTrigger && typeof lastDrawerTrigger.focus === "function") lastDrawerTrigger.focus();
  }

  function applyMetaBackgroundMode(mode) {
    shelter.backgroundMode = mode;
    shelter.sceneReady = mode === "scene";
    els.garagePanel.classList.toggle("is-illustration", mode === "image");
    els.garagePanel.classList.toggle("is-shelter", mode === "scene");
    els.garagePanel.classList.toggle("is-fallback", mode === "none");
    els.shelterImage.hidden = mode !== "image";
    els.shelterCanvas.hidden = mode !== "scene";
    els.hotspotLayer.hidden = false;
    if (hasFullMetaBackground()) {
      closeMetaDrawer();
    } else {
      openMetaDrawer("garage");
    }
  }

  function collectActionRects() {
    const buttons = [
      els.sortieBtn,
      els.upgradeHotspotBtn,
      els.vehicleHotspotBtn,
      els.seriesHotspotBtn,
      els.trailerHotspotBtn,
      els.opsHotspotBtn,
      els.resetOverlayBtn
    ];
    const panelRect = els.garagePanel.getBoundingClientRect();
    shelter.hotspotRects = {};
    buttons.forEach((button) => {
      if (!button) return;
      const rect = button.getBoundingClientRect();
      shelter.hotspotRects[button.id] = {
        left: rect.left - panelRect.left,
        top: rect.top - panelRect.top,
        width: rect.width,
        height: rect.height
      };
    });
  }

  function showIllustrationBackground() {
    shelter.imageLoaded = true;
    shelter.imageFailed = false;
    shelter.drawError = "";
    stopShelterLoop();
    applyMetaBackgroundMode("image");
    collectActionRects();
  }

  function showNoBackgroundFallback(message) {
    stopShelterLoop();
    applyMetaBackgroundMode("none");
    if (message) setStatus(message);
    collectActionRects();
  }

  function drawShelterFrame(timeMs) {
    if (!shelter.active || !shelter.sceneReady) return;
    const canvas = els.shelterCanvas;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.imageSmoothingEnabled = false;

    const opts = {
      timeMs,
      width,
      height,
      pixelRatio: dpr,
      warmth: 1,
      theme: "shelter",
      reducedFlash: !!(meta.settings && meta.settings.reducedFlash),
      renderer: root.DSSpriteRenderer
    };

    try {
      shelter.lastOpts = opts;
      shelter.metrics = getShelterApi().drawShelterScene(ctx, opts);
      shelter.drawError = "";
      shelter.lastDrawMs = timeMs;
      collectActionRects();
      shelter.rafId = root.requestAnimationFrame(drawShelterFrame);
    } catch (error) {
      shelter.drawError = error && error.message ? error.message : String(error);
      shelter.active = false;
      shelter.sceneReady = false;
      showNoBackgroundFallback("避難所背景暫不可用，已切回車庫面板。");
    }
  }

  function startShelterLoop() {
    if (!isShelterSceneAvailable()) {
      showNoBackgroundFallback("避難所背景暫不可用，已切回車庫面板。");
      return;
    }
    applyMetaBackgroundMode("scene");
    if (shelter.active) return;
    shelter.active = true;
    shelter.rafId = root.requestAnimationFrame(drawShelterFrame);
  }

  function stopShelterLoop() {
    if (shelter.rafId) root.cancelAnimationFrame(shelter.rafId);
    shelter.rafId = 0;
    shelter.active = false;
  }

  function updateStartImageUi() {
    els.shelterImage.alt = START_BACKGROUND.alt || "灰燼護航開始畫面";
  }

  function loadStartImage() {
    const src = START_BACKGROUND.image || "assets/ui/start.png";
    updateStartImageUi();
    if (shelter.imageTheme === "start" && shelter.imageLoaded && els.shelterImage.complete && els.shelterImage.getAttribute("src") === src) {
      showIllustrationBackground();
      return;
    }

    shelter.imageTheme = "start";
    shelter.imageLoaded = false;
    shelter.imageFailed = false;
    els.shelterImage.onload = showIllustrationBackground;
    els.shelterImage.onerror = () => {
      shelter.imageLoaded = false;
      shelter.imageFailed = true;
      startShelterLoop();
    };
    els.shelterImage.src = src;
    if (els.shelterImage.complete && els.shelterImage.naturalWidth > 0) {
      showIllustrationBackground();
    } else {
      startShelterLoop();
    }
  }

  function startMetaBackground() {
    loadStartImage();
    collectActionRects();
  }

  function getShelterState() {
    return {
      active: shelter.active,
      sceneReady: shelter.sceneReady,
      backgroundMode: shelter.backgroundMode,
      imageLoaded: shelter.imageLoaded,
      imageFailed: shelter.imageFailed,
      imageTheme: shelter.imageTheme,
      imageSrc: els.shelterImage ? els.shelterImage.getAttribute("src") || "" : "",
      expectedImage: START_BACKGROUND.image || "assets/ui/start.png",
      shelterTheme: meta.shelterTheme,
      drawError: shelter.drawError,
      drawerKind: shelter.drawerKind,
      hotspotRects: rules.deepClone(shelter.hotspotRects),
      metrics: shelter.metrics ? rules.deepClone(shelter.metrics) : null,
      lastOpts: shelter.lastOpts
        ? {
            width: shelter.lastOpts.width,
            height: shelter.lastOpts.height,
            pixelRatio: shelter.lastOpts.pixelRatio,
            warmth: shelter.lastOpts.warmth,
            theme: shelter.lastOpts.theme,
            reducedFlash: shelter.lastOpts.reducedFlash
          }
        : null,
      lastDrawMs: shelter.lastDrawMs,
      trailerRoomMetrics: trailerRoomMetrics ? rules.deepClone(trailerRoomMetrics) : null
    };
  }

  function vehicleLine(vehicleId) {
    const vehicle = config.VEHICLES[vehicleId];
    const stats = rules.getVehicleStats(vehicleId, meta, config);
    const shot = rules.calculateShotStats({
      vehicleId,
      meta,
      runMods: rules.defaultRunMods(),
      config
    });
    const dps = Math.round((shot.damage * shot.projectiles * 10) / shot.fireInterval) / 10;
    const extras = [];
    if (shot.splash > 0) extras.push(`濺射 ${shot.splash}`);
    if (shot.pierce > 0) extras.push(`穿透 ${shot.pierce}`);
    return `${vehicle.environmentLabel || vehicle.environment} · HP ${stats.maxHp} · 護甲 ${stats.armor} · DPS ${dps}${extras.length ? ` · ${extras.join(" · ")}` : ""}`;
  }

  function gateValueText(gateId) {
    if (gateId === "damage_plus") return "+35%";
    if (gateId === "rate_plus") return "+25%";
    if (gateId === "multishot_plus") return "+1";
    if (gateId === "barrier") return "+15%";
    if (gateId === "gate_focus") return "10 秒";
    return "維修";
  }

  function supplyRewardValueText(reward) {
    if (!reward) return "";
    if (reward.type === "rate") return `${Math.round((1 - (reward.fireIntervalMul || 1)) * 100)}% 裝填加速`;
    if (reward.type === "damage") return `${Math.round((reward.damageAdd || 0) * 100)}% 傷害加成`;
    if (reward.type === "repair") return `${Math.round((reward.repairPct || 0) * 100)}% 立即維修`;
    if (reward.type === "parts") return `零件 +${reward.parts || 0}`;
    if (reward.type === "shield") return `${Math.round((reward.shieldPct || 0) * 100)}% 護盾`;
    return reward.type || "";
  }

  function supplyRewardDetailText(reward) {
    if (!reward) return "";
    if (reward.type === "rate" || reward.type === "damage") return `${reward.duration || 10} 秒`;
    if (reward.type === "repair") return "立即生效";
    if (reward.type === "parts") return "本局結算列入補給收益";
    if (reward.type === "shield") return "立即加到護盾上限";
    return "";
  }

  function syncGateChoiceLayerSize() {
    if (!els.gateChoiceLayer) return;
    const host = els.gateChoiceLayer.parentElement || els.gateChoiceLayer;
    const rect = host.getBoundingClientRect();
    gateChoiceLayerSize = {
      width: rect.width || config.LOGIC.displayWidth,
      height: rect.height || config.LOGIC.displayHeight
    };
  }

  function updateGateChoiceButtonPosition(button, gate) {
    const x = Math.round(((gate.x / config.LOGIC.width) * gateChoiceLayerSize.width) / 4) * 4;
    const y = Math.round(((gate.y / config.LOGIC.height) * gateChoiceLayerSize.height) / 4) * 4;
    button.style.setProperty("--gate-x", `${x}px`);
    button.style.setProperty("--gate-y", `${y}px`);
  }

  function removeGateChoiceButton(entityId) {
    const record = gateChoiceButtons.get(entityId);
    if (!record) return;
    record.button.removeEventListener("click", record.onClick);
    record.button.remove();
    gateChoiceButtons.delete(entityId);
  }

  function clearGateChoiceButtons() {
    Array.from(gateChoiceButtons.keys()).forEach(removeGateChoiceButton);
  }

  function achievementLabel(id) {
    return (config.ACHIEVEMENTS[id] && config.ACHIEVEMENTS[id].label) || id;
  }

  function isUnlocked(vehicleId) {
    return rules.isVehicleUnlocked(meta, vehicleId, config);
  }

  function blueprintLine(vehicleId) {
    const required = rules.blueprintRequiredForVehicle(vehicleId, config);
    if (required <= 0) return "";
    const count = Math.min(required, meta.blueprints[vehicleId] || 0);
    const wishlist = meta.blueprintWishlist === vehicleId ? " | 優先解鎖" : "";
    if (wishlist) return `藍圖 ${count} / ${required}${wishlist}`;
    return `藍圖 ${count} / ${required} · 擊敗 Boss 取得碎片`;
  }

  function previewUpgradeDelta(vehicleId, track, sourceMeta) {
    const beforeMeta = rules.migrateMeta(sourceMeta || meta, { config });
    const beforeStats = rules.getVehicleStats(vehicleId, beforeMeta, config);
    const beforeShot = rules.calculateShotStats({
      vehicleId,
      meta: beforeMeta,
      runMods: rules.defaultRunMods(),
      config
    });
    const afterMeta = rules.deepClone(beforeMeta);
    const levels = rules.getVehicleLevels(afterMeta, vehicleId, config);
    if (!afterMeta.vehicleLevels[vehicleId]) afterMeta.vehicleLevels[vehicleId] = levels;
    afterMeta.vehicleLevels[vehicleId][track] = Math.min(
      rules.getUpgradeDefinition(vehicleId, track, config).maxLevel,
      (levels[track] || 0) + 1
    );
    const afterStats = rules.getVehicleStats(vehicleId, afterMeta, config);
    const afterShot = rules.calculateShotStats({
      vehicleId,
      meta: afterMeta,
      runMods: rules.defaultRunMods(),
      config
    });

    if (track === "hull") return `HP ${beforeStats.maxHp} → ${afterStats.maxHp}`;
    if (track === "weapon") return `傷害 ${beforeShot.damage.toFixed(1)} → ${afterShot.damage.toFixed(1)}`;
    if (track === "energy") return `射擊間隔 ${Math.round(beforeShot.fireInterval * 1000)}ms → ${Math.round(afterShot.fireInterval * 1000)}ms`;
    if (track === "gate") {
      const beforeLevel = levels.gate || 0;
      return `增益效果 +${beforeLevel * 4}% → +${(beforeLevel + 1) * 4}%`;
    }
    if (track.indexOf("armor") >= 0) return `護甲 ${beforeStats.armor} → ${afterStats.armor}`;
    if (track.indexOf("resist") >= 0 || track.indexOf("evasion") >= 0) {
      return `承傷 ${Math.round(beforeStats.damageTakenMul * 100)}% → ${Math.round(afterStats.damageTakenMul * 100)}%`;
    }
    if (track.indexOf("splash") >= 0) return `濺射 ${beforeShot.splash} → ${afterShot.splash}`;
    if (track.indexOf("pierce") >= 0) return `穿透 ${beforeShot.pierce} → ${afterShot.pierce}`;
    if (track.indexOf("overload") >= 0 || track.indexOf("overclock") >= 0 || track.indexOf("depth") >= 0) {
      const beforeDps = Math.round((beforeShot.damage * beforeShot.projectiles * 10) / beforeShot.fireInterval) / 10;
      const afterDps = Math.round((afterShot.damage * afterShot.projectiles * 10) / afterShot.fireInterval) / 10;
      return `DPS ${beforeDps} → ${afterDps}`;
    }
    return "";
  }

  function recommendedUpgradeForRun(run) {
    const recommendation = rules.recommendUpgradeForRun({
      meta,
      run,
      affordableOnly: true,
      config
    });
    if (!recommendation) return null;
    return Object.assign({}, recommendation, {
      delta: previewUpgradeDelta(recommendation.vehicleId, recommendation.track, meta)
    });
  }

  function renderVehicles() {
    els.vehicleList.textContent = "";
    Object.keys(config.VEHICLES).forEach((vehicleId) => {
      const vehicle = config.VEHICLES[vehicleId];
      const unlocked = isUnlocked(vehicleId);
      const item = root.document.createElement("div");
      item.className = `vehicle${meta.selectedVehicle === vehicleId ? " is-selected" : ""}${unlocked ? "" : " is-locked"}`;

      if (vehicle.spriteImage) {
        const thumb = root.document.createElement("img");
        thumb.className = "vehicle-thumb";
        thumb.src = vehicle.spriteImage;
        thumb.alt = vehicle.name;
        thumb.loading = "lazy";
        thumb.decoding = "async";
        item.appendChild(thumb);
      }

      const text = root.document.createElement("div");
      const name = root.document.createElement("div");
      name.className = "vehicle-name";
      name.innerHTML = `<span>${vehicle.name}</span><small>${unlocked ? vehicleLine(vehicleId) : blueprintLine(vehicleId)}</small>`;
      const desc = root.document.createElement("small");
      desc.textContent = unlocked ? vehicle.role || "艦隊載具" : "未解鎖：Boss 掉落藍圖碎片，集滿 3 片啟用。";
      text.append(name, desc);

      const button = root.document.createElement("button");
      button.type = "button";
      button.textContent = unlocked ? (meta.selectedVehicle === vehicleId ? "已選" : "選擇") : "未解鎖";
      button.disabled = !unlocked;
      button.dataset.vehicle = vehicleId;
      button.addEventListener("click", () => selectVehicle(vehicleId));
      const actions = root.document.createElement("div");
      actions.className = "vehicle-actions";
      actions.appendChild(button);
      if (!unlocked && rules.blueprintRequiredForVehicle(vehicleId, config) > 0) {
        const wishlistBtn = root.document.createElement("button");
        wishlistBtn.type = "button";
        wishlistBtn.className = meta.blueprintWishlist === vehicleId ? "wishlist-btn is-active" : "wishlist-btn";
        wishlistBtn.textContent = meta.blueprintWishlist === vehicleId ? "優先中" : "設優先";
        wishlistBtn.dataset.blueprintWishlist = vehicleId;
        wishlistBtn.addEventListener("click", (event) => {
          event.preventDefault();
          setBlueprintWishlist(vehicleId);
        });
        actions.appendChild(wishlistBtn);
      }
      item.append(text, actions);
      els.vehicleList.appendChild(item);
    });
  }

  function renderUpgrades() {
    els.upgradeList.textContent = "";
    const tracks = ["hull", "weapon", "energy", "gate"].concat(
      Object.keys((config.ECONOMY.vehicleUpgradeTracks && config.ECONOMY.vehicleUpgradeTracks[meta.selectedVehicle]) || {})
    );
    tracks.forEach((track) => {
      const upgrade = rules.getUpgradeDefinition(meta.selectedVehicle, track, config);
      const levels = rules.getVehicleLevels(meta, meta.selectedVehicle, config);
      const cost = rules.getUpgradeCost(meta, meta.selectedVehicle, track, config);
      const item = root.document.createElement("div");
      item.className = `upgrade${upgrade.scope === "vehicle" ? " is-special" : ""}`;

      const text = root.document.createElement("div");
      const title = root.document.createElement("strong");
      title.textContent = `${upgrade.label} Lv.${levels[track]} / ${upgrade.maxLevel}`;
      const detail = root.document.createElement("small");
      detail.textContent =
        track === "hull"
          ? "每級 HP +8%"
          : track === "weapon"
            ? "每級基礎傷害 +7%"
            : track === "energy"
              ? "每級射速 +5%"
              : track === "gate"
                ? "每級增益門效果 +4%"
                : upgrade.description || "載具專屬改裝";
      text.append(title, root.document.createElement("br"), detail);

      const button = root.document.createElement("button");
      button.type = "button";
      button.textContent = cost == null ? "已滿" : `${cost} 零件`;
      button.disabled = cost == null || meta.parts < cost;
      button.dataset.upgrade = track;
      button.addEventListener("click", () => buyUpgrade(track));
      item.append(text, button);
      els.upgradeList.appendChild(item);
    });
  }

  function renderAchievements() {
    if (!els.achievementList) return;
    const progress = rules.getAchievementProgress(meta, config);
    els.achievementList.textContent = "";
    progress.forEach((entry) => {
      const item = root.document.createElement("div");
      item.className = `achievement${entry.done ? " is-done" : ""}`;
      const title = root.document.createElement("strong");
      title.innerHTML = `<span>${entry.label}</span><span>${entry.done ? "完成" : `${entry.value}/${entry.target}`}</span>`;
      const desc = root.document.createElement("small");
      desc.textContent = `${entry.description} · 獎勵 ${entry.rewardParts} 零件`;
      item.append(title, desc);
      els.achievementList.appendChild(item);
    });
  }

  function hasStoryBeatForWave(wave) {
    return ((config.STORY && config.STORY.beats) || []).some((beat) => {
      return beat.unlock && beat.unlock.type === "bestWave" && beat.unlock.value === wave;
    });
  }

  function nextStoryWaveLabel(sourceMeta) {
    if (typeof rules.getStoryProgress !== "function") return "";
    const next = rules.getStoryProgress(sourceMeta || meta, config).find((beat) => {
      return !beat.unlocked && /^第 \d+ 波$/.test(beat.unlockLabel || "");
    });
    return next ? next.unlockLabel : "";
  }

  function countNewlyUnlockedStory(beforeMeta, afterMeta) {
    if (typeof rules.getStoryProgress !== "function") return 0;
    const before = new Set(
      rules.getStoryProgress(beforeMeta || config.META_DEFAULT, config)
        .filter((beat) => beat.unlocked)
        .map((beat) => beat.id)
    );
    return rules.getStoryProgress(afterMeta || config.META_DEFAULT, config).filter((beat) => {
      return beat.unlocked && !before.has(beat.id);
    }).length;
  }

  function renderMilestones() {
    if (!els.milestoneList || typeof rules.getMilestoneProgress !== "function") return;
    const progress = rules.getMilestoneProgress(meta, config);
    els.milestoneList.textContent = "";
    progress.forEach((entry) => {
      const item = root.document.createElement("div");
      item.className = `achievement milestone${entry.claimed ? " is-done" : entry.ready ? " is-ready" : ""}`;
      const title = root.document.createElement("strong");
      title.innerHTML = `<span>${entry.label}</span><span>${entry.claimed ? "已領取" : entry.ready ? "可領取" : `${entry.value}/${entry.target}`}</span>`;
      const progressBar = root.document.createElement("div");
      progressBar.className = "milestone-progress";
      const progressFill = root.document.createElement("i");
      const pct = entry.claimed ? 1 : Math.max(0, Math.min(1, entry.value / Math.max(1, entry.target)));
      progressFill.style.width = `${Math.round(pct * 100)}%`;
      progressBar.appendChild(progressFill);
      const desc = root.document.createElement("small");
      desc.textContent = `${entry.description} · 獎勵 ${entry.rewardParts} 零件${hasStoryBeatForWave(entry.target) ? " ＋通訊碎片" : ""}`;
      item.append(title, progressBar, desc);
      els.milestoneList.appendChild(item);
    });
  }

  function syncQuestState() {
    const before = JSON.stringify(meta.questBaselines || {});
    const ensured = rules.ensureQuestState(meta, { now: nowIso, config });
    const after = JSON.stringify(ensured.questBaselines || {});
    if (before !== after) {
      meta = migrateUiMeta(ensured);
      saveMeta();
      game.setMeta(meta);
    }
  }

  function renderQuestBoard() {
    if (!els.questList) return;
    syncQuestState();
    const quests = rules.getQuestBoard(meta, { now: nowIso, config });
    els.questList.textContent = "";
    quests.forEach((quest) => {
      const item = root.document.createElement("div");
      item.className = `quest-card${quest.ready ? " is-ready" : ""}${quest.claimed ? " is-claimed" : ""}`;
      item.dataset.questInstance = quest.instanceId;
      const title = root.document.createElement("strong");
      title.innerHTML = `<span>${quest.period === "daily" ? "每日" : "每週"}｜${quest.label}</span><span>${quest.progress}/${quest.target}</span>`;
      const desc = root.document.createElement("small");
      desc.textContent = `${quest.description} · 獎勵 ${quest.rewardParts} 零件`;
      const button = root.document.createElement("button");
      button.type = "button";
      button.textContent = quest.claimed ? "已領取" : quest.ready ? "領取" : "未完成";
      button.disabled = quest.claimed || !quest.ready;
      button.dataset.questClaim = quest.instanceId;
      button.addEventListener("click", () => claimQuest(quest.instanceId));
      item.append(title, desc, button);
      els.questList.appendChild(item);
    });
  }

  function trailerPercent(value) {
    return `${Math.round(value * 1000) / 10}%`;
  }

  function trailerBonusLine(state) {
    const bonuses = state && state.bonuses ? state.bonuses : {};
    const fireBonus = 1 - (bonuses.fireIntervalMul || 1);
    const defenseBonus = 1 - (bonuses.damageTakenMul || 1);
    const hasBonus =
      (bonuses.maxHpPct || 0) > 0 ||
      (bonuses.damagePct || 0) > 0 ||
      fireBonus > 0 ||
      defenseBonus > 0;
    if (!hasBonus) return "佈置拾荒家具即可強化車體";
    return [
      `HP +${trailerPercent(bonuses.maxHpPct || 0)}`,
      `傷害 +${trailerPercent(bonuses.damagePct || 0)}`,
      `射速 +${trailerPercent(Math.max(0, fireBonus))}`,
      `承傷 -${trailerPercent(Math.max(0, defenseBonus))}`
    ].join(" · ");
  }

  function storySpeakerName(speaker) {
    if (speaker === "narration") return "旁白";
    const characters = (config.STORY && config.STORY.characters) || {};
    return (characters[speaker] && characters[speaker].name) || speaker;
  }

  function refreshStoryUnreadBadge() {
    if (!els.trailerUnreadBadge || typeof rules.countUnreadStory !== "function") return;
    const unread = rules.countUnreadStory(meta, config);
    els.trailerUnreadBadge.hidden = unread <= 0;
    els.trailerUnreadBadge.textContent = unread > 9 ? "9+" : String(unread);
    if (els.trailerHotspotBtn) els.trailerHotspotBtn.classList.toggle("has-unread", unread > 0);
  }

  function renderStoryLog() {
    if (!els.storyLogList || typeof rules.getStoryProgress !== "function") return;
    const progress = rules.getStoryProgress(meta, config);
    els.storyLogList.textContent = "";
    progress.forEach((beat) => {
      const node = beat.unlocked ? root.document.createElement("details") : root.document.createElement("div");
      node.className = `story-beat${beat.unlocked ? "" : " is-locked"}${beat.seen ? "" : " is-unread"}`;
      node.dataset.storyBeat = beat.id;
      if (beat.unlocked) node.open = true;

      const summary = beat.unlocked ? root.document.createElement("summary") : root.document.createElement("strong");
      summary.className = "story-summary";
      const chapter = beat.chapter ? `${beat.chapter} · ` : "";
      summary.textContent = beat.unlocked ? `${chapter}${beat.title}` : `${chapter}${beat.title}｜${beat.unlockLabel}`;
      node.appendChild(summary);

      if (beat.unlocked) {
        const lines = root.document.createElement("div");
        lines.className = "story-lines";
        beat.lines.forEach((line) => {
          const row = root.document.createElement("p");
          const speaker = line.speaker || "narration";
          row.className = `story-line speaker-${speaker}`;
          const label = root.document.createElement("b");
          label.textContent = storySpeakerName(speaker);
          const text = root.document.createElement("span");
          text.textContent = line.text || "";
          row.append(label, text);
          lines.appendChild(row);
        });
        node.appendChild(lines);
      }

      els.storyLogList.appendChild(node);
    });
  }

  function markUnlockedStorySeen() {
    if (typeof rules.getStoryProgress !== "function" || typeof rules.markStoryBeatsSeen !== "function") return 0;
    const progress = rules.getStoryProgress(meta, config);
    const unread = progress.filter((beat) => beat.unlocked && !beat.seen).length;
    const unlockedIds = progress.filter((beat) => beat.unlocked).map((beat) => beat.id);
    if (unlockedIds.length) {
      meta = migrateUiMeta(rules.markStoryBeatsSeen(meta, unlockedIds, { now: nowIso, config }));
      saveMeta();
      game.setMeta(meta);
    }
    refreshStoryUnreadBadge();
    return unread;
  }

  function openStoryLog() {
    if (!els.storyLogSection) return;
    els.storyLogSection.hidden = false;
    const unread = markUnlockedStorySeen();
    renderStoryLog();
    if (els.storyLogBtn) {
      els.storyLogBtn.textContent = "收合日誌";
      els.storyLogBtn.setAttribute("aria-expanded", "true");
    }
    if (unread > 0) setStatus(`已讀取 ${unread} 則無線電通訊`);
  }

  function toggleStoryLog() {
    if (!els.storyLogSection) return;
    if (els.storyLogSection.hidden) {
      openStoryLog();
      return;
    }
    els.storyLogSection.hidden = true;
    if (els.storyLogBtn) {
      els.storyLogBtn.textContent = "無線電日誌";
      els.storyLogBtn.setAttribute("aria-expanded", "false");
    }
  }

  function drawTrailerRoomCanvas(state) {
    if (!els.trailerRoomCanvas || !root.DSShelterScene || typeof root.DSShelterScene.drawTrailerRoom !== "function") return;
    const canvas = els.trailerRoomCanvas;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    trailerRoomMetrics = root.DSShelterScene.drawTrailerRoom(ctx, {
      width,
      height,
      pixelRatio: dpr,
      timeMs: root.performance && root.performance.now ? root.performance.now() : 0,
      roomState: state
    });
    if (trailerRoomMetrics && trailerRoomMetrics.assetsReady === false && !trailerRedrawTimer) {
      trailerRedrawTimer = root.setTimeout(() => {
        trailerRedrawTimer = 0;
        if (els.trailerOverlay && !els.trailerOverlay.hidden) renderTrailerRoom();
      }, 80);
    }
  }

  function renderTrailerRoom() {
    if (!els.trailerOverlay) return;
    const state = rules.getTrailerRoomState(meta, config);
    if (els.trailerGoodsText) {
      els.trailerGoodsText.textContent = `${state.resourceName} ${state.goods}`;
    }
    if (els.trailerBonusText) {
      els.trailerBonusText.textContent = trailerBonusLine(state);
    }
    if (els.trailerStarterText) {
      const ownedCount = Object.keys(state.room.owned || {}).length;
      els.trailerStarterText.textContent =
        state.room.seenIntro === false
          ? "熹：喂……有人嗎？這台車，後面的門是壞的。"
          : ownedCount === 0
          ? "破爛逃生倉：目前只有床和舊報紙。出勤拾荒後添購擺設，讓拖車慢慢變成自己的房間。"
          : `已添購 ${ownedCount} 件擺設，房間能力正在疊加到目前載具。`;
    }
    if (els.trailerSlotList) {
      els.trailerSlotList.textContent = "";
      Object.keys(state.slots).forEach((slotId) => {
        const slot = state.slots[slotId];
        const furnitureId = state.room.slots[slotId];
        const item = furnitureId ? config.TRAILER_ROOM.furniture[furnitureId] : null;
        const node = root.document.createElement("div");
        node.className = `trailer-slot${item ? " is-filled" : ""}`;
        node.dataset.trailerSlot = slotId;
        const title = root.document.createElement("strong");
        title.textContent = slot.label;
        const detail = root.document.createElement("small");
        detail.textContent = item ? `${item.name} · ${item.effectText}` : "空位";
        node.append(title, detail);
        els.trailerSlotList.appendChild(node);
      });
    }
    if (els.trailerFurnitureList) {
      els.trailerFurnitureList.textContent = "";
      state.items.forEach((item) => {
        const node = root.document.createElement("div");
        node.className = `trailer-furniture ${item.owned ? "is-owned" : ""}`;
        node.dataset.trailerFurniture = item.id;
        const text = root.document.createElement("div");
        const title = root.document.createElement("strong");
        title.textContent = `${item.name} · ${item.style}`;
        const desc = root.document.createElement("small");
        desc.textContent = `${item.description} ${item.effectText}`;
        text.append(title, desc);
        const button = root.document.createElement("button");
        button.type = "button";
        button.dataset.trailerBuy = item.id;
        if (item.owned) {
          button.textContent = item.equipped ? "已擺設" : "擺上";
          button.disabled = item.equipped;
          button.addEventListener("click", () => equipTrailerFurniture(item.id));
        } else {
          button.textContent = `${item.cost} ${state.resourceName}`;
          button.disabled = !item.affordable;
          button.addEventListener("click", () => buyTrailerFurniture(item.id));
        }
        node.append(text, button);
        els.trailerFurnitureList.appendChild(node);
      });
    }
    if (els.storyLogSection && !els.storyLogSection.hidden) renderStoryLog();
    drawTrailerRoomCanvas(state);
    return state;
  }

  function openTrailerRoom(trigger) {
    if (!els.trailerOverlay) return;
    if (trigger && typeof trigger.focus === "function") lastDrawerTrigger = trigger;
    renderTrailerRoom();
    els.trailerOverlay.hidden = false;
    root.requestAnimationFrame(() => {
      renderTrailerRoom();
      if (els.closeTrailerRoomBtn && typeof els.closeTrailerRoomBtn.focus === "function") els.closeTrailerRoomBtn.focus();
    });
  }

  function closeTrailerRoom() {
    if (!els.trailerOverlay) return;
    els.trailerOverlay.hidden = true;
    if (lastDrawerTrigger && typeof lastDrawerTrigger.focus === "function") lastDrawerTrigger.focus();
  }

  function buyTrailerFurniture(furnitureId) {
    const result = rules.buyTrailerFurniture({
      meta,
      furnitureId,
      now: nowIso,
      config
    });
    meta = migrateUiMeta(result.meta);
    saveMeta();
    game.setMeta(meta);
    if (result.purchase.ok) {
      setStatus(`${result.purchase.item.name} 已添購並擺上拖車`);
    } else if (result.purchase.reason === "goods") {
      setStatus("拾荒物資不足，先出勤蒐集掉落物。");
    } else {
      setStatus("這件擺設目前不能購買。");
    }
    renderGarage();
    renderTrailerRoom();
    return result;
  }

  function equipTrailerFurniture(furnitureId) {
    const result = rules.equipTrailerFurniture({
      meta,
      furnitureId,
      now: nowIso,
      config
    });
    meta = migrateUiMeta(result.meta);
    saveMeta();
    game.setMeta(meta);
    if (result.equip.ok) {
      setStatus(`${result.equip.item.name} 已擺上拖車`);
    } else {
      setStatus("這件擺設尚未擁有。");
    }
    renderGarage();
    renderTrailerRoom();
    return result;
  }

  function renderSettings() {
    if (!els.aimAssistLevelSelect) return;
    els.aimAssistLevelSelect.value = meta.settings.aimAssistLevel || (meta.settings.aimAssist ? "medium" : "off");
    els.screenShakeToggle.checked = meta.settings.screenShake !== false;
    if (els.reducedFlashToggle) els.reducedFlashToggle.checked = meta.settings.reducedFlash === true;
    if (els.soundToggle) els.soundToggle.checked = meta.settings.sound !== false;
    if (els.showRunTrailerToggle) els.showRunTrailerToggle.checked = meta.settings.showRunTrailer !== false;
    if (els.showCompanionToggle) els.showCompanionToggle.checked = meta.settings.showCompanion !== false;
    if (els.fxLevelSelect) els.fxLevelSelect.value = meta.settings.fxLevel || "full";
    els.damageTextDensitySelect.value = meta.settings.damageTextDensity || "all";
    els.performanceModeSelect.value = meta.settings.performanceMode || "auto";
    els.fontSizeSelect.value = meta.settings.fontSize || "medium";
    if (els.versionText) els.versionText.textContent = `版本 ${config.APP_VERSION}`;
    renderPerformanceDiagnostics();
  }

  function renderPerformanceDiagnostics(state) {
    if (!els.performanceDiagnosticText) return;
    const source = state || latestState || game.getState();
    const perf = source && source.performance;
    if (!perf) {
      els.performanceDiagnosticText.textContent = "FPS --｜品質 --｜cap --";
      return;
    }
    const locked = perf.mode === "auto" ? "自動" : perf.mode === "high" ? "鎖高" : "鎖低";
    const history = (perf.history || [])
      .slice(0, 5)
      .map((item) => `${item.time}s ${item.reason}`)
      .join(" / ");
    els.performanceDiagnosticText.textContent = `FPS ${perf.fps}｜品質 ${locked}/${perf.quality}｜原因 ${perf.reason || "穩定"}｜cap ${Math.round((perf.capMultiplier || 1) * 100)}%｜歷史 ${history || "無"}`;
  }

  function renderEventCodex() {
    if (!els.eventCodexList) return;
    const progress = rules.getEventCodexProgress(meta, config);
    els.eventCodexList.textContent = "";
    progress.forEach((entry) => {
      const item = root.document.createElement("div");
      item.className = "event-codex";
      item.dataset.eventId = entry.id;
      const title = root.document.createElement("strong");
      title.innerHTML = `<span>${entry.label}</span><span>遭遇 ${entry.encounters} / 完成 ${entry.completions}</span>`;
      const desc = root.document.createElement("small");
      desc.textContent = entry.description;
      item.append(title, desc);
      els.eventCodexList.appendChild(item);
    });
  }

  function countMapTotal(map) {
    return Object.keys(map || {}).reduce((sum, key) => sum + (Number(map[key]) || 0), 0);
  }

  function topCountMapEntry(map) {
    let best = null;
    Object.keys(map || {}).forEach((key) => {
      const value = Number(map[key]) || 0;
      if (value <= 0) return;
      if (!best || value > best.value) best = { key, value };
    });
    return best;
  }

  function supplyRewardSummary(rewards) {
    const labels = config.SUPPLY_DROPS && config.SUPPLY_DROPS.rewards ? config.SUPPLY_DROPS.rewards : {};
    const parts = Object.keys(rewards || {}).map((id) => {
      const reward = labels[id];
      return `${reward ? reward.label : id} x${rewards[id]}`;
    });
    return parts.length ? parts.join("、") : "本局無補給效果";
  }

  function eventAnalysisLine(run) {
    const events = config.ENVIRONMENT_EVENTS || {};
    const eventList = [];
    Object.values(events).forEach((event) => {
      if (!event) return;
      eventList.push(event);
      if (Array.isArray(event.alternates)) {
        event.alternates.forEach((alternate) => {
          if (alternate) eventList.push(alternate);
        });
      }
    });
    const lines = Object.keys(run.eventStats || {})
      .filter((id) => {
        const record = run.eventStats[id];
        return record && (record.encounters > 0 || record.completions > 0);
      })
      .map((id) => {
        const event = eventList.find((item) => item.id === id);
        const record = run.eventStats[id];
        return `${event ? event.label : id} 遭遇 ${record.encounters || 0} / 完成 ${record.completions || 0}`;
      });
    const bonus = run.partsBreakdown && run.partsBreakdown.eventBonus ? `，事件收益 +${run.partsBreakdown.eventBonus}` : "";
    return `${lines.length ? lines.join("、") : "本局無事件"}${bonus}`;
  }

  function variantAnalysisLine(run) {
    const total = countMapTotal(run.variantKills);
    if (!total) return "本局無變種擊殺";
    return Object.keys(run.variantKills)
      .map((id) => `${id} x${run.variantKills[id]}`)
      .join("、");
  }

  function damageSourceLine(run) {
    const top = topCountMapEntry(run.damageBySource);
    if (!top) return "尚無有效傷害來源資料";
    const labels = {
      gate_damage: "增益門傷害加成",
      supply_damage: "補給傷害加成"
    };
    const vehicle = config.VEHICLES[top.key];
    const total = countMapTotal(run.damageBySource) || top.value;
    const pct = Math.round((top.value / total) * 100);
    return `${vehicle ? vehicle.name : labels[top.key] || top.key} ${pct}%`;
  }

  function sourceLabel(source) {
    if (source === "boss") return "Boss";
    if (source === "enemy") return "小怪";
    if (source === "burst") return "爆裂";
    if (source === "hazard") return "環境";
    return "未知";
  }

  function damageTakenDistributionLine(run) {
    const taken = run.damageTakenBy || {};
    const keys = ["boss", "enemy", "burst"];
    const total = keys.reduce((sum, key) => sum + (Number(taken[key]) || 0), 0);
    if (!total) return "Boss 0% / 小怪 0% / 爆裂 0%";
    return keys
      .map((key) => `${sourceLabel(key)} ${Math.round(((Number(taken[key]) || 0) / total) * 100)}%`)
      .join(" / ");
  }

  function deathSummaryLine(run) {
    const events = Array.isArray(run.recentDamageEvents) ? run.recentDamageEvents : [];
    if (!events.length) return "死前 5 秒無受傷記錄";
    const total = events.reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
    const bySource = {};
    const buffs = new Set();
    let hardest = null;
    events.forEach((event) => {
      bySource[event.source || "unknown"] = (bySource[event.source || "unknown"] || 0) + (Number(event.amount) || 0);
      (event.buffs || []).forEach((buff) => buffs.add(buff));
      if (!hardest || (Number(event.amount) || 0) > (Number(hardest.amount) || 0)) hardest = event;
    });
    const top = topCountMapEntry(bySource);
    const enemy = hardest && hardest.enemyId && config.ENEMIES[hardest.enemyId] ? config.ENEMIES[hardest.enemyId].name : "";
    return `受傷 ${Math.round(total)}，主要來自 ${sourceLabel(top ? top.key : "unknown")}${enemy ? `（${enemy}）` : ""}，增益：${buffs.size ? Array.from(buffs).join("、") : "無"}`;
  }

  function damageStatsLine(run) {
    const timeline = run.damageTimeline || {};
    const peak = Math.round(Math.max(0, ...Object.keys(timeline).map((key) => Number(timeline[key]) || 0)));
    const total = Number(run.damageDealt) || countMapTotal(timeline);
    const duration = Math.max(1, Number(run.duration) || 1);
    const average = Math.round(total / duration);
    return `主要傷害來源：${damageSourceLine(run)}，平均 ${average}/秒，峰值 ${peak}/秒`;
  }

  function comparisonLine(run) {
    const previous = run.previousRun;
    if (!previous) return "上局比較：尚無上一局資料";
    const waveDelta = (run.wavesCleared || 0) - (previous.wavesCleared || 0);
    const scoreDelta = (run.score || 0) - (previous.score || 0);
    if (waveDelta > 0 || scoreDelta > 0) return `上局比較：更好（波次 ${waveDelta >= 0 ? "+" : ""}${waveDelta}，分數 ${scoreDelta >= 0 ? "+" : ""}${scoreDelta}）`;
    if (waveDelta < 0 || scoreDelta < 0) return `上局比較：更差（波次 ${waveDelta}，分數 ${scoreDelta}）`;
    return "上局比較：持平";
  }

  function renderRunAnalysis(run) {
    if (!els.runAnalysisPanel || !run) return;
    const supplyParts = run.partsBreakdown && run.partsBreakdown.supplyParts ? run.partsBreakdown.supplyParts : run.supplyParts || 0;
    const sections = [
      ["死前5秒", deathSummaryLine(run)],
      ["受傷", damageTakenDistributionLine(run)],
      ["事件", eventAnalysisLine(run)],
      ["補給", `補給箱 ${run.supplyCratesCollected || 0} 個，零件 +${supplyParts}，${supplyRewardSummary(run.supplyRewards)}`],
      ["變種", variantAnalysisLine(run)],
      ["傷害", damageStatsLine(run)],
      ["比較", comparisonLine(run)]
    ];
    els.runAnalysisPanel.textContent = "";
    sections.forEach(([title, body]) => {
      const section = root.document.createElement("div");
      section.className = "run-analysis-section";
      section.dataset.analysisSection = title;
      const strong = root.document.createElement("strong");
      strong.textContent = title;
      const small = root.document.createElement("small");
      small.textContent = body;
      section.append(strong, small);
      els.runAnalysisPanel.appendChild(section);
    });
    els.runAnalysisPanel.hidden = true;
    if (els.runAnalysisToggleBtn) els.runAnalysisToggleBtn.textContent = "本局分析";
  }

  function renderGarage() {
    applyFontSize();
    els.garageMeta.textContent = `廢土零件 ${meta.parts} · 拾荒物資 ${meta.trailerGoods || 0} · 最遠第 ${meta.bestWave} 波 · 擊殺 ${meta.totalKills}`;
    updateStartImageUi();
    renderVehicles();
    renderUpgrades();
    renderEventCodex();
    renderAchievements();
    renderMilestones();
    renderQuestBoard();
    renderSettings();
    refreshStoryUnreadBadge();
    if (meta.recovery && meta.recovery.pending) {
      setStatus("偵測到上次異常，已保留存檔。");
    }
    if (!hasFullMetaBackground()) {
      setSectionVisibility("garage");
    } else if (!els.metaDrawer.hidden && shelter.drawerKind) {
      setSectionVisibility(shelter.drawerKind);
    }
    if (els.trailerOverlay && !els.trailerOverlay.hidden) renderTrailerRoom();
  }

  function renderGateChoices(state) {
    if (!els.gateChoiceLayer) return;
    els.gateChoiceLayer.hidden = true;
    clearGateChoiceButtons();
  }

  function renderGateChoiceOverlay(state) {
    if (!els.gateChoiceOverlay || !els.gateChoiceList) return;
    const choice = state && state.gateChoice;
    if (!choice) {
      els.gateChoiceOverlay.hidden = true;
      els.gateChoiceList.textContent = "";
      lastGateChoiceKey = "";
      return;
    }
    const gateIds = Array.isArray(choice.gateIds) && choice.gateIds.length
      ? choice.gateIds
      : (choice.options || []).map((option) => option.gateId).filter(Boolean);
    const key = `${choice.pairId}:${gateIds.join(",")}`;
    if (lastGateChoiceKey !== key) {
      els.gateChoiceList.textContent = "";
      gateIds.forEach((gateId, index) => {
        const gate = config.GATES[gateId];
        if (!gate) return;
        const optionState = rules.gateOptionState({
          gateId,
          runMods: state.runMods,
          vehicle: state.vehicle,
          vehicleLevels: rules.getVehicleLevels(state.meta, state.vehicleId, config),
          config
        });
        const button = root.document.createElement("button");
        button.type = "button";
        button.className = "supply-choice-btn gate-option-btn";
        if (optionState.maxed) button.classList.add("is-maxed");
        button.dataset.gateId = gateId;
        button.setAttribute("aria-label", `${gate.label} ${gateValueText(gateId)}`);
        button.innerHTML = `<b>${index + 1}. ${gate.label}</b><span>${gateValueText(gateId)}</span><small>選擇後立即套用</small>`;
        if (optionState.maxed && optionState.overflowText) {
          button.insertAdjacentHTML("beforeend", `<em class="choice-overflow-badge">已滿 → 溢出：${optionState.overflowText}</em>`);
        }
        button.addEventListener("click", () => {
          game.chooseGate(gateId);
        });
        els.gateChoiceList.appendChild(button);
      });
      lastGateChoiceKey = key;
      root.requestAnimationFrame(() => {
        const first = els.gateChoiceList.querySelector(".gate-option-btn");
        if (first && typeof first.focus === "function") first.focus();
      });
    }
    els.gateChoiceOverlay.hidden = false;
  }

  function renderSupplyChoice(state) {
    if (!els.supplyChoiceOverlay || !els.supplyChoiceList) return;
    const choice = state && state.supplyChoice;
    if (!choice) {
      els.supplyChoiceOverlay.hidden = true;
      els.supplyChoiceList.textContent = "";
      lastSupplyChoiceKey = "";
      return;
    }
    const rewardIds = Array.isArray(choice.rewardIds)
      ? choice.rewardIds
      : Object.keys((config.SUPPLY_DROPS && config.SUPPLY_DROPS.rewards) || {});
    const key = `${choice.dropId}:${rewardIds.join(",")}`;
    if (lastSupplyChoiceKey !== key) {
      els.supplyChoiceList.textContent = "";
      rewardIds.forEach((rewardId, index) => {
        const reward = config.SUPPLY_DROPS.rewards[rewardId];
        if (!reward) return;
        const optionState = rules.supplyOptionState({
          rewardId,
          runMods: state.runMods,
          vehicle: state.vehicle,
          config
        });
        const button = root.document.createElement("button");
        button.type = "button";
        button.className = "supply-choice-btn";
        if (optionState.maxed) button.classList.add("is-maxed");
        button.dataset.rewardId = rewardId;
        button.setAttribute("aria-label", `${reward.label} ${supplyRewardValueText(reward)}`);
        button.innerHTML = `<b>${index + 1}. ${reward.label}</b><span>${supplyRewardValueText(reward)}</span><small>${supplyRewardDetailText(reward)}</small>`;
        if (optionState.maxed && optionState.overflowText) {
          button.insertAdjacentHTML("beforeend", `<em class="choice-overflow-badge">已滿 → 溢出：${optionState.overflowText}</em>`);
        }
        button.addEventListener("click", () => {
          game.chooseSupplyReward(rewardId);
        });
        els.supplyChoiceList.appendChild(button);
      });
      lastSupplyChoiceKey = key;
      root.requestAnimationFrame(() => {
        const first = els.supplyChoiceList.querySelector(".supply-choice-btn");
        if (first && typeof first.focus === "function") first.focus();
      });
    }
    els.supplyChoiceOverlay.hidden = false;
  }

  function handleGateChoiceKey(event) {
    if (!els.gateChoiceOverlay || els.gateChoiceOverlay.hidden) return false;
    const buttons = Array.from(els.gateChoiceList.querySelectorAll(".gate-option-btn"));
    if (!buttons.length) return false;
    const activeIndex = Math.max(0, buttons.indexOf(root.document.activeElement));
    function focusAt(index) {
      buttons[(index + buttons.length) % buttons.length].focus();
    }
    if (/^[1-2]$/.test(event.key)) {
      const button = buttons[Number(event.key) - 1];
      if (button) button.click();
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      focusAt(activeIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      focusAt(activeIndex - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      (buttons[activeIndex] || buttons[0]).click();
    } else if (event.key === "Escape") {
      // Gate choices are mandatory once presented.
    } else {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function handleSupplyChoiceKey(event) {
    if (!els.supplyChoiceOverlay || els.supplyChoiceOverlay.hidden) return false;
    const buttons = Array.from(els.supplyChoiceList.querySelectorAll(".supply-choice-btn"));
    if (!buttons.length) return false;
    const activeIndex = Math.max(0, buttons.indexOf(root.document.activeElement));
    function focusAt(index) {
      buttons[(index + buttons.length) % buttons.length].focus();
    }
    if (/^[1-4]$/.test(event.key)) {
      const button = buttons[Number(event.key) - 1];
      if (button) button.click();
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      focusAt(activeIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      focusAt(activeIndex - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      (buttons[activeIndex] || buttons[0]).click();
    } else if (event.key === "Escape") {
      // Supply choices are mandatory once picked up.
    } else {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function renderEventBanner(state) {
    if (!els.eventBanner) return;
    const banner = state && state.eventBanner;
    if (!banner) {
      els.eventBanner.hidden = true;
      els.eventBannerTitle.textContent = "";
      els.eventBannerBody.textContent = "";
      return;
    }
    els.eventBanner.hidden = false;
    els.eventBanner.dataset.kind = banner.kind || "info";
    els.eventBannerTitle.textContent = banner.title || "";
    els.eventBannerBody.textContent = banner.body || "";
  }

  function setAnimatedHudValue(element, text, value, reduced) {
    if (!element) return;
    const next = String(value);
    const previous = element.dataset.hudValue;
    element.textContent = text;
    element.dataset.hudValue = next;
    if (reduced || previous == null || previous === next) return;
    element.classList.remove("hud-number-pop");
    void element.offsetWidth;
    element.classList.add("hud-number-pop");
  }

  function renderHud(state) {
    if (!state || (state.mode !== "playing" && state.mode !== "paused")) {
      els.hud.classList.remove("is-visible");
      els.hud.classList.remove("is-reduced");
      renderGateChoices(null);
      renderGateChoiceOverlay(null);
      renderEventBanner(null);
      renderSupplyChoice(null);
      return;
    }
    els.hud.classList.add("is-visible");
    const reducedMotion = !!(meta.settings && meta.settings.reducedFlash);
    els.hud.classList.toggle("is-reduced", reducedMotion);
    renderGateChoices(state);
    renderGateChoiceOverlay(state);
    renderEventBanner(state);
    renderSupplyChoice(state);
    const vehicle = config.VEHICLES[state.vehicleId];
    const hpPct = state.vehicle.maxHp > 0 ? Math.max(0, state.vehicle.hp / state.vehicle.maxHp) : 0;
    const maxShield = Number.isFinite(state.vehicle.maxShield) ? state.vehicle.maxShield : Math.round((state.vehicle.maxHp || 0) * 0.6);
    const shield = Math.max(0, Number.isFinite(state.vehicle.shield) ? state.vehicle.shield : 0);
    const shieldPct = maxShield > 0 ? Math.max(0, Math.min(1, shield / maxShield)) : 0;
    els.hudVehicle.textContent = vehicle.name;
    const hpValue = Math.ceil(state.vehicle.hp);
    setAnimatedHudValue(
      els.hudHpText,
      shield > 0 ? `HP ${hpValue} / ${state.vehicle.maxHp} · 盾 ${Math.ceil(shield)}` : `HP ${hpValue} / ${state.vehicle.maxHp}`,
      `${hpValue}:${Math.ceil(shield)}`,
      reducedMotion
    );
    els.hpBar.style.width = `${Math.round(hpPct * 100)}%`;
    if (els.shieldBar && els.shieldBarWrap) {
      els.shieldBarWrap.hidden = shield <= 0;
      els.shieldBar.style.width = `${Math.round(shieldPct * 100)}%`;
    }
    setAnimatedHudValue(els.hudWave, `第 ${state.wave} 波`, state.wave, reducedMotion);
    setAnimatedHudValue(els.hudKills, `擊殺 ${state.stats.kills}`, state.stats.kills, reducedMotion);
    setAnimatedHudValue(els.hudParts, `零件 ${state.stats.partsPreview}`, state.stats.partsPreview, reducedMotion);
    const mods = [];
    const effectiveMods = state.effectiveRunMods || state.runMods;
    if (state.runMods.weaponMode && state.runMods.weaponMode !== "standard") {
      const mode = config.WEAPON_POWERUPS && config.WEAPON_POWERUPS.modes
        ? config.WEAPON_POWERUPS.modes[state.runMods.weaponMode]
        : null;
      mods.push(`${mode && mode.label ? mode.label : state.runMods.weaponMode} Lv${state.runMods.weaponLevel || 1}`);
    }
    if (state.runMods.overload > 0) mods.push(`超載 ${state.runMods.overload}`);
    if (state.runMods.damageAdd > 0) mods.push(`火力 x${(1 + state.runMods.damageAdd).toFixed(2)}`);
    if (state.runMods.fireIntervalMul < 1) mods.push(`射速 x${(1 / state.runMods.fireIntervalMul).toFixed(2)}`);
    if (state.runMods.projectileAdd > 0) mods.push(`彈道 +${state.runMods.projectileAdd}`);
    els.hudMods.textContent = `增益：${mods.length ? mods.join(" · ") : "無"}`;
    const currentMode = state.runMods.weaponMode || "standard";
    const currentModeConfig = config.WEAPON_POWERUPS && config.WEAPON_POWERUPS.modes
      ? config.WEAPON_POWERUPS.modes[currentMode] || config.WEAPON_POWERUPS.modes.standard
      : null;
    const currentVisual = currentModeConfig && currentModeConfig.visual;
    els.hud.dataset.weaponMode = (currentVisual && currentVisual.id) || currentMode;
    els.hudMods.style.color = currentVisual ? currentVisual.edge : "";
    els.hudMods.style.borderColor = currentVisual ? `${currentVisual.core}99` : "";
    els.hudMods.style.boxShadow = currentVisual ? `inset 3px 0 ${currentVisual.core}, 0 6px 16px rgba(0, 0, 0, 0.22)` : "";

    const boss = state.enemies.find((enemy) => enemy.boss);
    if (boss) {
      const pct = Math.max(0, boss.hp / boss.maxHp);
      els.bossHud.classList.add("is-visible");
      els.bossName.textContent = boss.name || (config.ENEMIES[boss.enemyId] && config.ENEMIES[boss.enemyId].name) || "Boss";
      setAnimatedHudValue(els.bossHpText, `${Math.round(pct * 100)}%`, Math.round(pct * 100), reducedMotion);
      els.bossBar.style.width = `${Math.round(pct * 100)}%`;
      els.bossTelegraph.textContent = boss.telegraphText || (boss.pendingPhase && boss.pendingPhase.label) || "";
    } else {
      els.bossHud.classList.remove("is-visible");
      els.bossTelegraph.textContent = "";
    }
  }

  function showGarage() {
    latestState = game.getState();
    els.garagePanel.hidden = false;
    els.pausePanel.hidden = true;
    els.settlementPanel.hidden = true;
    renderHud(null);
    renderGarage();
    startMetaBackground();
  }

  function showPlaying() {
    stopShelterLoop();
    els.garagePanel.hidden = true;
    els.pausePanel.hidden = true;
    els.settlementPanel.hidden = true;
    renderHud(latestState);
  }

  function showPause() {
    els.pausePanel.hidden = false;
  }

  function renderSettlement(result) {
    const run = result && result.meta ? result.meta.lastRun : meta.lastRun;
    if (!run) return;
    const reward = result && result.reward ? result.reward : null;
    const breakdown = run.partsBreakdown || (reward && reward.partsBreakdown) || rules.rewardPartsBreakdownForRun(run, config);
    const hasProgress = run.wavesCleared > 0 || run.score > 0;
    const isBest = hasProgress && (reward ? reward.isBest : meta.bestWave <= run.wavesCleared || meta.bestScore <= run.score);
    els.settlementSummary.textContent = `本局獲得 ${run.earnedParts} 廢土零件。${isBest ? "新紀錄！" : ""}`;
    const affordableUpgrade = ["hull", "weapon", "energy", "gate"].some((track) => {
      const cost = rules.getUpgradeCost(meta, meta.selectedVehicle, track, config);
      return cost != null && meta.parts >= cost;
    });
    els.againBtn.textContent = affordableUpgrade ? "再跑一趟" : "再拚一局";
    els.garageBtn.textContent = affordableUpgrade ? "進車庫升級" : "回車庫";
    els.againBtn.className = affordableUpgrade ? "secondary" : "primary";
    els.garageBtn.className = affordableUpgrade ? "primary" : "secondary";
    const rows = [
      ["波次", `第 ${run.wavesCleared} 波`],
      ["擊殺", `${run.kills}`],
      ["Boss", `${run.bossesDefeated}`],
      ["零件", `${run.earnedParts}`],
      ["行動零件", `+${run.runParts == null ? breakdown.total : run.runParts}`],
      ["成就零件", `+${run.achievementParts || 0}`],
      ["里程碑零件", `+${run.milestoneParts || 0}`],
      ["波次零件", `+${breakdown.waveParts}`],
      ["擊殺零件", `+${breakdown.killParts}`],
      ["Boss 零件", `+${breakdown.bossParts}`],
      ["難度加成", breakdown.difficultyBonus === 0 ? "+0" : `${breakdown.difficultyBonus > 0 ? "+" : ""}${breakdown.difficultyBonus}`]
    ];
    if (breakdown.eventBonus > 0) rows.splice(Math.max(0, rows.length - 1), 0, ["事件零件", `+${breakdown.eventBonus}`]);
    if (run.supplyCratesCollected > 0 || breakdown.supplyCrates > 0) {
      rows.splice(Math.max(0, rows.length - 1), 0, [
        `補給箱 x${run.supplyCratesCollected || breakdown.supplyCrates || 0}`,
        `+${breakdown.supplyParts || 0}`
      ]);
    }
    els.settlementList.textContent = "";
    rows.forEach(([label, value]) => {
      const item = root.document.createElement("div");
      item.className = "settlement-item";
      item.innerHTML = `<b>${value}</b><small>${label}</small>`;
      els.settlementList.appendChild(item);
    });

    const achievements = run.unlockedAchievements || (reward && reward.achievements) || [];
    const milestones = run.unlockedMilestones || (reward && reward.milestones) || [];
    els.settlementBadges.textContent = "";
    const blueprintDrops = run.blueprintDrops || (reward && reward.blueprints) || {};
    Object.keys(blueprintDrops).forEach((vehicleId) => {
      if (!blueprintDrops[vehicleId]) return;
      const badge = root.document.createElement("div");
      badge.className = "settlement-badge";
      badge.textContent = `藍圖取得：${config.VEHICLES[vehicleId].name} +${blueprintDrops[vehicleId]}（${meta.blueprints[vehicleId] || 0}/${rules.blueprintRequiredForVehicle(vehicleId, config)}）`;
      els.settlementBadges.appendChild(badge);
    });
    const unlockedVehicles = run.unlockedVehicles || (reward && reward.unlockedVehicles) || [];
    unlockedVehicles.forEach((vehicleId) => {
      const badge = root.document.createElement("div");
      badge.className = "settlement-badge";
      badge.textContent = `載具解鎖：${config.VEHICLES[vehicleId].name}`;
      els.settlementBadges.appendChild(badge);
    });
    if (achievements.length) {
      achievements.forEach((id) => {
        const badge = root.document.createElement("div");
        badge.className = "settlement-badge";
        badge.textContent = `成就解鎖：${achievementLabel(id)}（+${config.ACHIEVEMENTS[id].rewardParts} 零件）`;
        els.settlementBadges.appendChild(badge);
      });
    }
    if (milestones.length) {
      milestones.forEach((id) => {
        const milestone = config.MILESTONES && config.MILESTONES[id];
        const badge = root.document.createElement("div");
        badge.className = "settlement-badge";
        badge.textContent = `里程碑達成：${milestone ? milestone.label : id}（+${milestone ? milestone.rewardParts : 0} 零件）`;
        els.settlementBadges.appendChild(badge);
      });
    }
    const nextProgress = rules.getAchievementProgress(meta, config).find((entry) => !entry.done);
    if (nextProgress) {
      const badge = root.document.createElement("div");
      badge.className = "settlement-badge";
      badge.textContent = `下一成就：${nextProgress.label} ${nextProgress.value}/${nextProgress.target}`;
      els.settlementBadges.appendChild(badge);
    }
    if (typeof rules.getMilestoneProgress === "function") {
      const nextMilestone = rules.getMilestoneProgress(meta, config).find((entry) => !entry.claimed);
      if (nextMilestone) {
        const badge = root.document.createElement("div");
        badge.className = "settlement-badge";
        badge.textContent = `下一里程碑：${nextMilestone.label} ${nextMilestone.value}/${nextMilestone.target}`;
        els.settlementBadges.appendChild(badge);
      }
    }
    const storyWave = nextStoryWaveLabel(meta);
    if (storyWave) {
      const badge = root.document.createElement("div");
      badge.className = "settlement-badge";
      badge.textContent = `下一段通訊：${storyWave}`;
      els.settlementBadges.appendChild(badge);
    }
    if (els.settlementBadges.childElementCount > 0) {
      els.settlementBadges.hidden = false;
    } else {
      els.settlementBadges.hidden = true;
    }

    const recommendation = recommendedUpgradeForRun(run);
    recommendedUpgradeTrack = recommendation ? recommendation.track : "";
    if (recommendation) {
      els.settlementRecommendationTitle.textContent = `建議升級：${recommendation.label}`;
      els.settlementRecommendationDetail.textContent = `${config.VEHICLES[recommendation.vehicleId].name} · ${recommendation.delta} · ${recommendation.reason} · 消耗 ${recommendation.cost} 零件`;
      els.recommendedUpgradeBtn.textContent = `前往升級 ${recommendation.label}`;
      els.settlementRecommendation.hidden = false;
    } else {
      els.settlementRecommendation.hidden = true;
      els.settlementRecommendationTitle.textContent = "";
      els.settlementRecommendationDetail.textContent = "";
    }
    renderRunAnalysis(run);
  }

  function showSettlement(result) {
    stopShelterLoop();
    els.garagePanel.hidden = true;
    els.pausePanel.hidden = true;
    els.settlementPanel.hidden = false;
    renderSettlement(result);
    renderHud(null);
    if (els.againBtn && typeof els.againBtn.focus === "function") els.againBtn.focus();
  }

  function claimQuest(instanceId) {
    const result = rules.claimQuestReward({
      meta,
      instanceId,
      now: nowIso,
      config
    });
    meta = migrateUiMeta(result.meta);
    saveMeta();
    game.setMeta(meta);
    if (result.claim.ok) {
      setStatus(`任務完成：+${result.claim.rewardParts} 零件`);
    } else if (result.claim.reason === "claimed") {
      setStatus("這個任務已領取。");
    } else {
      setStatus("任務尚未完成。");
    }
    renderGarage();
    openMetaDrawer("operations");
  }

  function updateSetting(key, value) {
    const settings = Object.assign({}, meta.settings);
    settings[key] = value;
    if (key === "aimAssistLevel") settings.aimAssist = value !== "off";
    meta = migrateUiMeta(Object.assign({}, meta, { settings }));
    saveMeta();
    game.setMeta(meta);
    renderSettings();
    applyFontSize();
    setStatus("設定已更新。");
  }

  function exportSave() {
    const code = rules.encodeSaveMeta(meta, { config });
    els.saveCodeBox.value = code;
    if (root.navigator.clipboard && typeof root.navigator.clipboard.writeText === "function") {
      root.navigator.clipboard.writeText(code).catch(() => {});
    }
    setStatus("存檔代碼已匯出。");
    return code;
  }

  function importSave() {
    const code = els.saveCodeBox.value || "";
    const decoded = rules.decodeSaveMeta(code, { config });
    if (!decoded.ok || !decoded.meta) {
      setStatus("匯入失敗：存檔代碼無效。");
      return { ok: false, reason: decoded.reason };
    }
    if (root.localStorage) {
      root.localStorage.setItem(`${config.STORAGE_KEY}_backup`, JSON.stringify(meta));
      root.localStorage.setItem(config.STORAGE_KEY, JSON.stringify(decoded.meta));
    }
    meta = migrateUiMeta(decoded.meta);
    game.setMeta(meta);
    setStatus("匯入成功，重新載入中。");
    if (root.__test && root.__test.skipImportReload) {
      renderGarage();
    } else {
      root.location.reload();
    }
    return { ok: true };
  }

  function setBlueprintWishlist(vehicleId) {
    if (!config.VEHICLES[vehicleId] || rules.blueprintRequiredForVehicle(vehicleId, config) <= 0) return;
    if (isUnlocked(vehicleId)) return;
    meta = migrateUiMeta(Object.assign({}, meta, { blueprintWishlist: vehicleId }));
    saveMeta();
    game.setMeta(meta);
    setStatus(`${config.VEHICLES[vehicleId].name} 已設為優先解鎖`);
    renderGarage();
  }

  function selectVehicle(vehicleId) {
    if (!config.VEHICLES[vehicleId]) return;
    if (!isUnlocked(vehicleId)) {
      setStatus(`${config.VEHICLES[vehicleId].name} 尚未解鎖`);
      return;
    }
    meta = migrateUiMeta(Object.assign({}, meta, { selectedVehicle: vehicleId }));
    saveMeta();
    game.setMeta(meta);
    setStatus(`${config.VEHICLES[vehicleId].name} 已就緒`);
    renderGarage();
  }

  function buyUpgrade(track) {
    const beforeMeta = rules.deepClone(meta);
    const vehicleId = meta.selectedVehicle;
    const result = rules.buyUpgrade({
      meta,
      vehicleId,
      track,
      now: nowIso,
      config
    });
    meta = migrateUiMeta(result.meta);
    saveMeta();
    game.setMeta(meta);
    if (result.purchase.ok) {
      const label = rules.getUpgradeDefinition(vehicleId, track, config).label;
      const delta = previewUpgradeDelta(vehicleId, track, beforeMeta);
      setStatus(`${label} 升到 Lv.${result.purchase.level}${delta ? `（${delta}）` : ""}`);
    } else if (result.purchase.reason === "parts") {
      setStatus("零件不足");
    } else {
      setStatus("此升級已達上限");
    }
    renderGarage();
  }

  function startSelectedRun() {
    setStatus("");
    stopShelterLoop();
    latestState = game.startRun(meta.selectedVehicle, meta);
    showPlaying();
  }

  function clearStorage() {
    if (root.localStorage) root.localStorage.removeItem(config.STORAGE_KEY);
    meta = migrateUiMeta(null);
    lastSettlement = null;
    game.setMeta(meta);
    game.clearStorage();
    showGarage();
    setStatus("存檔已清除");
    return game.getState();
  }

  function openRecommendedUpgrade() {
    showGarage();
    openMetaDrawer("upgrades");
    if (recommendedUpgradeTrack) {
      const button = els.upgradeList.querySelector(`[data-upgrade="${recommendedUpgradeTrack}"]`);
      if (button && typeof button.focus === "function") button.focus();
    }
  }

  function onState(state) {
    latestState = state;
    if (state.mode === "playing") {
      els.pausePanel.hidden = true;
      renderHud(state);
      renderPerformanceDiagnostics(state);
    } else if (state.mode === "paused") {
      renderHud(state);
      renderPerformanceDiagnostics(state);
      if (state.supplyChoice || state.gateChoice) els.pausePanel.hidden = true;
      else showPause();
    }
  }

  function onRunEnd(result) {
    const storyUnlocks = countNewlyUnlockedStory(meta, result && result.meta ? result.meta : meta);
    meta = migrateUiMeta(result.meta);
    lastSettlement = Object.assign({}, result, { meta });
    saveMeta();
    game.setMeta(meta);
    showSettlement(lastSettlement);
    refreshStoryUnreadBadge();
    if (storyUnlocks > 0) setStatus(`已接收 ${storyUnlocks} 則新無線電通訊`);
  }

  function bindEvents() {
    els.startBtn.addEventListener("click", startSelectedRun);
    els.sortieBtn.addEventListener("click", startSelectedRun);
    els.upgradeHotspotBtn.addEventListener("click", () => openMetaDrawer("upgrades", els.upgradeHotspotBtn));
    els.vehicleHotspotBtn.addEventListener("click", () => openMetaDrawer("vehicle", els.vehicleHotspotBtn));
    els.seriesHotspotBtn.addEventListener("click", () => openMetaDrawer("achievements", els.seriesHotspotBtn));
    els.trailerHotspotBtn.addEventListener("click", () => openTrailerRoom(els.trailerHotspotBtn));
    els.opsHotspotBtn.addEventListener("click", () => openMetaDrawer("operations", els.opsHotspotBtn));
    els.resetOverlayBtn.addEventListener("click", clearStorage);
    els.closeMetaDrawer.addEventListener("click", closeMetaDrawer);
    if (els.storyLogBtn) els.storyLogBtn.addEventListener("click", toggleStoryLog);
    els.closeTrailerRoomBtn.addEventListener("click", closeTrailerRoom);
    root.addEventListener("resize", syncGateChoiceLayerSize);
    root.addEventListener("ashes-trailer-asset-ready", () => {
      if (els.trailerOverlay && !els.trailerOverlay.hidden) renderTrailerRoom();
    });
    els.pauseBtn.addEventListener("click", () => game.togglePause());
    els.resumeBtn.addEventListener("click", () => {
      game.resume();
      showPlaying();
    });
    els.quitBtn.addEventListener("click", () => game.finishRun());
    els.againBtn.addEventListener("click", startSelectedRun);
    els.garageBtn.addEventListener("click", showGarage);
    els.recommendedUpgradeBtn.addEventListener("click", openRecommendedUpgrade);
    els.runAnalysisToggleBtn.addEventListener("click", () => {
      els.runAnalysisPanel.hidden = !els.runAnalysisPanel.hidden;
      els.runAnalysisToggleBtn.textContent = els.runAnalysisPanel.hidden ? "本局分析" : "收合分析";
      els.runAnalysisToggleBtn.setAttribute("aria-label", els.runAnalysisPanel.hidden ? "展開本局分析" : "收合本局分析");
    });
    els.resetBtn.addEventListener("click", clearStorage);
    els.aimAssistLevelSelect.addEventListener("change", () => updateSetting("aimAssistLevel", els.aimAssistLevelSelect.value));
    els.screenShakeToggle.addEventListener("change", () => updateSetting("screenShake", els.screenShakeToggle.checked));
    if (els.reducedFlashToggle) els.reducedFlashToggle.addEventListener("change", () => updateSetting("reducedFlash", els.reducedFlashToggle.checked));
    els.soundToggle.addEventListener("change", () => updateSetting("sound", els.soundToggle.checked));
    els.showRunTrailerToggle.addEventListener("change", () => updateSetting("showRunTrailer", els.showRunTrailerToggle.checked));
    if (els.showCompanionToggle) els.showCompanionToggle.addEventListener("change", () => updateSetting("showCompanion", els.showCompanionToggle.checked));
    els.fxLevelSelect.addEventListener("change", () => updateSetting("fxLevel", els.fxLevelSelect.value));
    els.damageTextDensitySelect.addEventListener("change", () => updateSetting("damageTextDensity", els.damageTextDensitySelect.value));
    els.performanceModeSelect.addEventListener("change", () => updateSetting("performanceMode", els.performanceModeSelect.value));
    els.fontSizeSelect.addEventListener("change", () => updateSetting("fontSize", els.fontSizeSelect.value));
    els.checkUpdateBtn.addEventListener("click", checkForUpdate);
    els.exportSaveBtn.addEventListener("click", exportSave);
    els.importSaveBtn.addEventListener("click", importSave);
    els.selectSkiffBtn.addEventListener("click", () => {
      const ids = Object.keys(config.VEHICLES).filter((vehicleId) => isUnlocked(vehicleId));
      const index = Math.max(0, ids.indexOf(meta.selectedVehicle));
      const next = ids[(index + 1) % ids.length];
      selectVehicle(next);
    });
    root.document.addEventListener("keydown", (event) => {
      if (handleGateChoiceKey(event)) return;
      if (handleSupplyChoiceKey(event)) return;
      if (event.key !== "Escape") return;
      if (els.trailerOverlay && !els.trailerOverlay.hidden) {
        event.preventDefault();
        closeTrailerRoom();
        return;
      }
      if (!els.metaDrawer.hidden && hasFullMetaBackground()) {
        event.preventDefault();
        closeMetaDrawer();
        return;
      }
      if (!els.pausePanel.hidden) {
        event.preventDefault();
        game.resume();
        showPlaying();
        return;
      }
      if (!els.runAnalysisPanel.hidden) {
        event.preventDefault();
        els.runAnalysisPanel.hidden = true;
        els.runAnalysisToggleBtn.textContent = "本局分析";
        els.runAnalysisToggleBtn.setAttribute("aria-label", "展開本局分析");
        els.runAnalysisToggleBtn.focus();
      }
    });
  }

  function exposeTestApi() {
    root.__test = Object.assign({}, root.__test || {}, {
      getMeta: () => rules.deepClone(meta),
      setMeta: (nextMeta) => {
        meta = migrateUiMeta(nextMeta);
        saveMeta();
        game.setMeta(meta);
        renderGarage();
        startMetaBackground();
        return rules.deepClone(meta);
      },
      buyUpgrade: (vehicleId, track) => {
        if (vehicleId && config.VEHICLES[vehicleId]) selectVehicle(vehicleId);
        buyUpgrade(track);
        return rules.deepClone(meta);
      },
      setBlueprintWishlist: (vehicleId) => {
        setBlueprintWishlist(vehicleId);
        return rules.deepClone(meta);
      },
      exportSave,
      importSave,
      skipImportReload: false,
      startRun: (vehicleId) => {
        if (vehicleId && config.VEHICLES[vehicleId]) selectVehicle(vehicleId);
        startSelectedRun();
        return game.getState();
      },
      clearStorage,
      showGarage: () => {
        showGarage();
        return getShelterState();
      },
      openMetaPanel: (kind) => {
        openMetaDrawer(kind);
        return getShelterState();
      },
      openTrailerRoom: () => {
        openTrailerRoom(els.trailerHotspotBtn);
        return rules.getTrailerRoomState(meta, config);
      },
      openStoryLog: () => {
        openStoryLog();
        return rules.getStoryProgress(meta, config);
      },
      closeTrailerRoom: () => {
        closeTrailerRoom();
        return rules.getTrailerRoomState(meta, config);
      },
      buyTrailerFurniture: (furnitureId) => buyTrailerFurniture(furnitureId),
      equipTrailerFurniture: (furnitureId) => equipTrailerFurniture(furnitureId),
      getStoryProgress: () => rules.deepClone(rules.getStoryProgress(meta, config)),
      getTrailerRoomState: () => rules.deepClone(rules.getTrailerRoomState(meta, config)),
      getTrailerRoomMetrics: () => (trailerRoomMetrics ? rules.deepClone(trailerRoomMetrics) : null),
      getShelterState,
      getLastSettlement: () => rules.deepClone(lastSettlement)
    });
  }

  function collectElements() {
    [
      "hud",
      "hudVehicle",
      "hudHpText",
      "hpBar",
      "shieldBarWrap",
      "shieldBar",
      "hudWave",
      "hudKills",
      "hudParts",
      "hudMods",
      "bossHud",
      "bossName",
      "bossHpText",
      "bossBar",
      "bossTelegraph",
      "eventBanner",
      "eventBannerTitle",
      "eventBannerBody",
      "gateChoiceLayer",
      "gateChoiceOverlay",
      "gateChoiceTitle",
      "gateChoiceHint",
      "gateChoiceList",
      "supplyChoiceOverlay",
      "supplyChoiceTitle",
      "supplyChoiceHint",
      "supplyChoiceList",
      "pauseBtn",
      "garagePanel",
      "shelterCanvas",
      "shelterImage",
      "hotspotLayer",
      "sortieBtn",
      "upgradeHotspotBtn",
      "vehicleHotspotBtn",
      "seriesHotspotBtn",
      "trailerHotspotBtn",
      "trailerUnreadBadge",
      "opsHotspotBtn",
      "resetOverlayBtn",
      "trailerOverlay",
      "trailerRoomCanvas",
      "trailerGoodsText",
      "trailerBonusText",
      "trailerStarterText",
      "storyLogBtn",
      "storyLogSection",
      "xiPortrait",
      "storyLogList",
      "trailerSlotList",
      "trailerFurnitureList",
      "closeTrailerRoomBtn",
      "metaDrawer",
      "metaDrawerTitle",
      "closeMetaDrawer",
      "garageMeta",
      "vehicleList",
      "upgradeList",
      "eventCodexList",
      "achievementList",
      "milestoneList",
      "questList",
      "settingsPanel",
      "aimAssistLevelSelect",
      "reducedFlashToggle",
      "screenShakeToggle",
      "soundToggle",
      "showRunTrailerToggle",
      "showCompanionToggle",
      "fxLevelSelect",
      "damageTextDensitySelect",
      "performanceModeSelect",
      "fontSizeSelect",
      "versionText",
      "checkUpdateBtn",
      "performanceDiagnosticText",
      "saveManager",
      "saveCodeBox",
      "exportSaveBtn",
      "importSaveBtn",
      "startBtn",
      "resetBtn",
      "selectSkiffBtn",
      "garageStatus",
      "pausePanel",
      "resumeBtn",
      "quitBtn",
      "settlementPanel",
      "settlementSummary",
      "settlementList",
      "settlementBadges",
      "settlementRecommendation",
      "settlementRecommendationTitle",
      "settlementRecommendationDetail",
      "recommendedUpgradeBtn",
      "runAnalysisToggleBtn",
      "runAnalysisPanel",
      "againBtn",
      "garageBtn"
    ].forEach((id) => {
      els[id] = root.document.getElementById(id);
    });
    els.metaSections = Array.from(root.document.querySelectorAll("[data-meta-section]"));
  }

  function init() {
    collectElements();
    syncGateChoiceLayerSize();
    installErrorRecovery();
    loadMeta();
    bindEvents();
    game.init({
      canvas: root.document.getElementById("gameCanvas"),
      meta,
      now: nowIso,
      onState,
      onRunEnd
    });
    exposeTestApi();
    showGarage();
    registerServiceWorker();
  }

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
