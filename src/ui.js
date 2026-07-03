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

  const els = {};

  function nowIso() {
    return new Date().toISOString();
  }

  function loadMeta() {
    const raw = root.localStorage ? root.localStorage.getItem(config.STORAGE_KEY) : null;
    meta = rules.migrateMeta(raw, { now: nowIso, config });
    return meta;
  }

  function saveMeta() {
    if (root.localStorage) root.localStorage.setItem(config.STORAGE_KEY, JSON.stringify(meta));
  }

  function setStatus(text) {
    els.garageStatus.textContent = text || "";
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
    return `${vehicle.kind === "train" ? "列車" : "飛船"} · HP ${stats.maxHp} · 傷害 ${Math.round(shot.damage)} · ${shot.projectiles} 彈道`;
  }

  function renderVehicles() {
    els.vehicleList.textContent = "";
    Object.keys(config.VEHICLES).forEach((vehicleId) => {
      const vehicle = config.VEHICLES[vehicleId];
      const item = root.document.createElement("div");
      item.className = `vehicle${meta.selectedVehicle === vehicleId ? " is-selected" : ""}`;

      const text = root.document.createElement("div");
      const name = root.document.createElement("div");
      name.className = "vehicle-name";
      name.innerHTML = `<span>${vehicle.name}</span><small>${vehicleLine(vehicleId)}</small>`;
      const desc = root.document.createElement("small");
      desc.textContent =
        vehicleId === "iron_crow" ? "厚重耐打，穩定中速火力。" : "機動快速，脈衝彈幕較密。";
      text.append(name, desc);

      const button = root.document.createElement("button");
      button.type = "button";
      button.textContent = meta.selectedVehicle === vehicleId ? "已選" : "選擇";
      button.dataset.vehicle = vehicleId;
      button.addEventListener("click", () => selectVehicle(vehicleId));
      item.append(text, button);
      els.vehicleList.appendChild(item);
    });
  }

  function renderUpgrades() {
    els.upgradeList.textContent = "";
    ["hull", "weapon"].forEach((track) => {
      const upgrade = config.ECONOMY.upgradeTracks[track];
      const levels = rules.getVehicleLevels(meta, meta.selectedVehicle, config);
      const cost = rules.getUpgradeCost(meta, meta.selectedVehicle, track, config);
      const item = root.document.createElement("div");
      item.className = "upgrade";

      const text = root.document.createElement("div");
      const title = root.document.createElement("strong");
      title.textContent = `${upgrade.label} Lv.${levels[track]} / ${upgrade.maxLevel}`;
      const detail = root.document.createElement("small");
      detail.textContent = track === "hull" ? "每級 HP +8%" : "每級基礎傷害 +7%";
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

  function renderGarage() {
    els.garageMeta.textContent = `廢土零件 ${meta.parts} · 最遠第 ${meta.bestWave} 波 · 擊殺 ${meta.totalKills}`;
    renderVehicles();
    renderUpgrades();
  }

  function renderHud(state) {
    if (!state || (state.mode !== "playing" && state.mode !== "paused")) {
      els.hud.classList.remove("is-visible");
      return;
    }
    els.hud.classList.add("is-visible");
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
      els.bossHpText.textContent = `${Math.round(pct * 100)}%`;
      els.bossBar.style.width = `${Math.round(pct * 100)}%`;
    } else {
      els.bossHud.classList.remove("is-visible");
    }
  }

  function showGarage() {
    latestState = game.getState();
    els.garagePanel.hidden = false;
    els.pausePanel.hidden = true;
    els.settlementPanel.hidden = true;
    renderHud(null);
    renderGarage();
  }

  function showPlaying() {
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
    els.settlementSummary.textContent = `本局獲得 ${run.earnedParts} 廢土零件。`;
    const rows = [
      ["波次", `第 ${run.wavesCleared} 波`],
      ["擊殺", `${run.kills}`],
      ["Boss", `${run.bossesDefeated}`],
      ["零件", `${run.earnedParts}`]
    ];
    els.settlementList.textContent = "";
    rows.forEach(([label, value]) => {
      const item = root.document.createElement("div");
      item.className = "settlement-item";
      item.innerHTML = `<b>${value}</b><small>${label}</small>`;
      els.settlementList.appendChild(item);
    });
  }

  function showSettlement(result) {
    els.garagePanel.hidden = true;
    els.pausePanel.hidden = true;
    els.settlementPanel.hidden = false;
    renderSettlement(result);
    renderHud(null);
  }

  function selectVehicle(vehicleId) {
    if (!config.VEHICLES[vehicleId]) return;
    meta = rules.migrateMeta(Object.assign({}, meta, { selectedVehicle: vehicleId }), { config });
    saveMeta();
    game.setMeta(meta);
    setStatus(`${config.VEHICLES[vehicleId].name} 已就緒`);
    renderGarage();
  }

  function buyUpgrade(track) {
    const result = rules.buyUpgrade({
      meta,
      vehicleId: meta.selectedVehicle,
      track,
      now: nowIso,
      config
    });
    meta = result.meta;
    saveMeta();
    game.setMeta(meta);
    if (result.purchase.ok) {
      const label = config.ECONOMY.upgradeTracks[track].label;
      setStatus(`${label} 升到 Lv.${result.purchase.level}`);
    } else if (result.purchase.reason === "parts") {
      setStatus("零件不足");
    } else {
      setStatus("此升級已達上限");
    }
    renderGarage();
  }

  function startSelectedRun() {
    setStatus("");
    latestState = game.startRun(meta.selectedVehicle, meta);
    showPlaying();
  }

  function clearStorage() {
    if (root.localStorage) root.localStorage.removeItem(config.STORAGE_KEY);
    meta = rules.migrateMeta(null, { config });
    lastSettlement = null;
    game.setMeta(meta);
    game.clearStorage();
    showGarage();
    setStatus("存檔已清除");
    return game.getState();
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
    lastSettlement = result;
    meta = result.meta;
    saveMeta();
    game.setMeta(meta);
    showSettlement(result);
  }

  function bindEvents() {
    els.startBtn.addEventListener("click", startSelectedRun);
    els.pauseBtn.addEventListener("click", () => game.togglePause());
    els.resumeBtn.addEventListener("click", () => {
      game.resume();
      showPlaying();
    });
    els.quitBtn.addEventListener("click", () => game.finishRun());
    els.againBtn.addEventListener("click", startSelectedRun);
    els.garageBtn.addEventListener("click", showGarage);
    els.resetBtn.addEventListener("click", clearStorage);
    els.selectSkiffBtn.addEventListener("click", () => {
      const next = meta.selectedVehicle === "iron_crow" ? "dawn_skiff" : "iron_crow";
      selectVehicle(next);
    });
  }

  function exposeTestApi() {
    root.__test = Object.assign({}, root.__test || {}, {
      getMeta: () => rules.deepClone(meta),
      setMeta: (nextMeta) => {
        meta = rules.migrateMeta(nextMeta, { config });
        saveMeta();
        game.setMeta(meta);
        renderGarage();
        return rules.deepClone(meta);
      },
      buyUpgrade: (vehicleId, track) => {
        if (vehicleId && config.VEHICLES[vehicleId]) selectVehicle(vehicleId);
        buyUpgrade(track);
        return rules.deepClone(meta);
      },
      startRun: (vehicleId) => {
        if (vehicleId && config.VEHICLES[vehicleId]) selectVehicle(vehicleId);
        return game.startRun(meta.selectedVehicle, meta);
      },
      clearStorage,
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
      "bossHpText",
      "bossBar",
      "pauseBtn",
      "garagePanel",
      "garageMeta",
      "vehicleList",
      "upgradeList",
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
      "againBtn",
      "garageBtn"
    ].forEach((id) => {
      els[id] = root.document.getElementById(id);
    });
  }

  function init() {
    collectElements();
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
