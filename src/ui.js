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
  const gateChoiceButtons = new Map();
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
              : "基地管理";
    }
  }

  function openMetaDrawer(kind) {
    shelter.drawerKind = kind || "garage";
    setSectionVisibility(shelter.drawerKind);
    els.metaDrawer.hidden = false;
  }

  function closeMetaDrawer() {
    if (!hasFullMetaBackground()) {
      openMetaDrawer("garage");
      return;
    }
    els.metaDrawer.hidden = true;
    shelter.drawerKind = "";
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
    const buttons = [els.sortieBtn, els.upgradeHotspotBtn, els.vehicleHotspotBtn, els.seriesHotspotBtn, els.resetOverlayBtn];
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
      lastDrawMs: shelter.lastDrawMs
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
    return "維修";
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
    if (wishlist) return `?? ${count} / ${required}${wishlist}`;
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
    const vehicleId = run && config.VEHICLES[run.vehicleId] ? run.vehicleId : meta.selectedVehicle;
    const specialTracks = Object.keys((config.ECONOMY.vehicleUpgradeTracks && config.ECONOMY.vehicleUpgradeTracks[vehicleId]) || {});
    const priority = ["hull", "weapon", "energy", "gate"].concat(specialTracks);
    for (let i = 0; i < priority.length; i += 1) {
      const track = priority[i];
      const cost = rules.getUpgradeCost(meta, vehicleId, track, config);
      if (cost != null && meta.parts >= cost) {
        const def = rules.getUpgradeDefinition(vehicleId, track, config);
        return {
          vehicleId,
          track,
          cost,
          label: def.label,
          delta: previewUpgradeDelta(vehicleId, track, meta)
        };
      }
    }
    return null;
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

  function renderGarage() {
    els.garageMeta.textContent = `廢土零件 ${meta.parts} · 最遠第 ${meta.bestWave} 波 · 擊殺 ${meta.totalKills}`;
    updateStartImageUi();
    renderVehicles();
    renderUpgrades();
    renderAchievements();
    if (!hasFullMetaBackground()) {
      setSectionVisibility("garage");
    } else if (!els.metaDrawer.hidden && shelter.drawerKind) {
      setSectionVisibility(shelter.drawerKind);
    }
  }

  function renderGateChoices(state) {
    if (!els.gateChoiceLayer) return;
    const gates = state && state.mode === "playing" ? state.gates.filter((gate) => !gate.broken) : [];
    if (!gates.length) {
      els.gateChoiceLayer.hidden = true;
      clearGateChoiceButtons();
      return;
    }
    syncGateChoiceLayerSize();
    const activeIds = new Set();
    gates.forEach((gate) => {
      const gateConfig = config.GATES[gate.gateId];
      if (!gateConfig) return;
      activeIds.add(gate.id);
      let record = gateChoiceButtons.get(gate.id);
      if (!record) {
      const button = root.document.createElement("button");
      button.type = "button";
      button.className = "gate-choice-btn";
      button.dataset.gateId = gate.gateId;
      button.dataset.entityId = gate.id;
      button.style.left = "0";
      button.style.top = "0";
      button.innerHTML = `<b>${gateConfig.shortLabel}</b><span>${gateValueText(gate.gateId)}</span><small>點選取得</small>`;
      const onClick = (event) => {
        event.preventDefault();
        game.chooseGate(gate.id);
      };
      button.addEventListener("click", onClick);
      record = { button, onClick };
      gateChoiceButtons.set(gate.id, record);
      els.gateChoiceLayer.appendChild(button);
      }
      updateGateChoiceButtonPosition(record.button, gate);
    });
    Array.from(gateChoiceButtons.keys()).forEach((entityId) => {
      if (!activeIds.has(entityId)) removeGateChoiceButton(entityId);
    });
    els.gateChoiceLayer.hidden = false;
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

  function renderHud(state) {
    if (!state || (state.mode !== "playing" && state.mode !== "paused")) {
      els.hud.classList.remove("is-visible");
      renderGateChoices(null);
      renderEventBanner(null);
      return;
    }
    els.hud.classList.add("is-visible");
    renderGateChoices(state);
    renderEventBanner(state);
    const vehicle = config.VEHICLES[state.vehicleId];
    const hpPct = state.vehicle.maxHp > 0 ? Math.max(0, state.vehicle.hp / state.vehicle.maxHp) : 0;
    els.hudVehicle.textContent = vehicle.name;
    els.hudHpText.textContent = `HP ${Math.ceil(state.vehicle.hp)} / ${state.vehicle.maxHp}`;
    els.hpBar.style.width = `${Math.round(hpPct * 100)}%`;
    els.hudWave.textContent = `第 ${state.wave} 波`;
    els.hudKills.textContent = `擊殺 ${state.stats.kills}`;
    els.hudParts.textContent = `零件 ${state.stats.partsPreview}`;
    const mods = [];
    if (state.runMods.damageAdd > 0) mods.push(`火力 x${(1 + state.runMods.damageAdd).toFixed(2)}`);
    if (state.runMods.fireIntervalMul < 1) mods.push(`射速 x${(1 / state.runMods.fireIntervalMul).toFixed(2)}`);
    if (state.runMods.projectileAdd > 0) mods.push(`彈道 +${state.runMods.projectileAdd}`);
    els.hudMods.textContent = `增益：${mods.length ? mods.join(" · ") : "無"}`;

    const boss = state.enemies.find((enemy) => enemy.boss);
    if (boss) {
      const pct = Math.max(0, boss.hp / boss.maxHp);
      els.bossHud.classList.add("is-visible");
      els.bossName.textContent = boss.name || (config.ENEMIES[boss.enemyId] && config.ENEMIES[boss.enemyId].name) || "Boss";
      els.bossHpText.textContent = `${Math.round(pct * 100)}%`;
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
      ["波次零件", `+${breakdown.waveParts}`],
      ["擊殺零件", `+${breakdown.killParts}`],
      ["Boss 零件", `+${breakdown.bossParts}`],
      ["難度加成", breakdown.difficultyBonus === 0 ? "+0" : `${breakdown.difficultyBonus > 0 ? "+" : ""}${breakdown.difficultyBonus}`]
    ];
    if (breakdown.eventBonus > 0) rows.splice(Math.max(0, rows.length - 1), 0, ["事件零件", `+${breakdown.eventBonus}`]);
    els.settlementList.textContent = "";
    rows.forEach(([label, value]) => {
      const item = root.document.createElement("div");
      item.className = "settlement-item";
      item.innerHTML = `<b>${value}</b><small>${label}</small>`;
      els.settlementList.appendChild(item);
    });

    const achievements = run.unlockedAchievements || (reward && reward.achievements) || [];
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
    const nextProgress = rules.getAchievementProgress(meta, config).find((entry) => !entry.done);
    if (nextProgress) {
      const badge = root.document.createElement("div");
      badge.className = "settlement-badge";
      badge.textContent = `下一成就：${nextProgress.label} ${nextProgress.value}/${nextProgress.target}`;
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
      els.settlementRecommendationDetail.textContent = `${config.VEHICLES[recommendation.vehicleId].name} · ${recommendation.delta} · 消耗 ${recommendation.cost} 零件`;
      els.recommendedUpgradeBtn.textContent = `前往升級 ${recommendation.label}`;
      els.settlementRecommendation.hidden = false;
    } else {
      els.settlementRecommendation.hidden = true;
      els.settlementRecommendationTitle.textContent = "";
      els.settlementRecommendationDetail.textContent = "";
    }
  }

  function showSettlement(result) {
    stopShelterLoop();
    els.garagePanel.hidden = true;
    els.pausePanel.hidden = true;
    els.settlementPanel.hidden = false;
    renderSettlement(result);
    renderHud(null);
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
      renderHud(state);
    } else if (state.mode === "paused") {
      renderHud(state);
      showPause();
    }
  }

  function onRunEnd(result) {
    meta = migrateUiMeta(result.meta);
    lastSettlement = Object.assign({}, result, { meta });
    saveMeta();
    game.setMeta(meta);
    showSettlement(lastSettlement);
  }

  function bindEvents() {
    els.startBtn.addEventListener("click", startSelectedRun);
    els.sortieBtn.addEventListener("click", startSelectedRun);
    els.upgradeHotspotBtn.addEventListener("click", () => openMetaDrawer("upgrades"));
    els.vehicleHotspotBtn.addEventListener("click", () => openMetaDrawer("vehicle"));
    els.seriesHotspotBtn.addEventListener("click", () => openMetaDrawer("achievements"));
    els.resetOverlayBtn.addEventListener("click", clearStorage);
    els.closeMetaDrawer.addEventListener("click", closeMetaDrawer);
    root.addEventListener("resize", syncGateChoiceLayerSize);
    els.pauseBtn.addEventListener("click", () => game.togglePause());
    els.resumeBtn.addEventListener("click", () => {
      game.resume();
      showPlaying();
    });
    els.quitBtn.addEventListener("click", () => game.finishRun());
    els.againBtn.addEventListener("click", startSelectedRun);
    els.garageBtn.addEventListener("click", showGarage);
    els.recommendedUpgradeBtn.addEventListener("click", openRecommendedUpgrade);
    els.resetBtn.addEventListener("click", clearStorage);
    els.selectSkiffBtn.addEventListener("click", () => {
      const ids = Object.keys(config.VEHICLES).filter((vehicleId) => isUnlocked(vehicleId));
      const index = Math.max(0, ids.indexOf(meta.selectedVehicle));
      const next = ids[(index + 1) % ids.length];
      selectVehicle(next);
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
      "pauseBtn",
      "garagePanel",
      "shelterCanvas",
      "shelterImage",
      "hotspotLayer",
      "sortieBtn",
      "upgradeHotspotBtn",
      "vehicleHotspotBtn",
      "seriesHotspotBtn",
      "resetOverlayBtn",
      "metaDrawer",
      "metaDrawerTitle",
      "closeMetaDrawer",
      "garageMeta",
      "vehicleList",
      "upgradeList",
      "achievementList",
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
  }

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
