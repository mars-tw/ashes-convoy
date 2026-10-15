"use strict";

// R86 攀車屍＋甩尾真瀏覽器守門（headless）：
// 1. 奔屍貼車會攀附（不再自爆），啃咬走攻擊真幀、命中幀才扣血。
// 2. 桌機：真實滑鼠左右急甩把攀車屍甩飛；飛出的屍體撞到後方屍群。
// 3. 桌機：空白鍵甩尾衝撞（冷卻守門）。
// 4. 觸控：真實 tap「甩」按鈕甩飛；按鈕顯示冷卻環。
// 5. 結算顯示甩飛數。
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(rootDir, decodeURIComponent(requestPath)));
    if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (error, body) => {
      if (error) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

async function boot(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady(), null, { timeout: 180000 });
}

// 乾淨戰場＋兩隻奔屍貼在車身兩側，推進到攀附完成。
async function latchTwo(page) {
  return page.evaluate(() => {
    window.__test.clearStorage();
    const meta = window.__test.getMeta();
    meta.tutorial = Object.assign({}, meta.tutorial, { seenQuickUpgrade: true });
    window.__test.setMeta(meta);
    window.__test.startRun("land_rig");
    window.__test.setState({
      enemies: [], projectiles: [], gates: [], hazards: [], enemyProjectiles: [],
      wavePlan: { spawns: [], gates: [], duration: 999, boss: false, environmentEvent: null },
      spawnIndex: 0, gateIndex: 0, waveElapsed: 0
    });
    const s = window.__test.getState();
    window.__test.spawnEnemy("runner", { x: s.vehicle.x - 6, y: s.vehicle.y - 2, hp: 400 });
    window.__test.spawnEnemy("runner", { x: s.vehicle.x + 6, y: s.vehicle.y - 2, hp: 400 });
    window.__test.step(50);
    const after = window.__test.getState();
    return { latched: after.latch.latched, enemies: after.enemies.map((e) => ({ latched: !!e.latched, dead: e.dead })), hp: after.vehicle.hp };
  });
}

async function checkLatchAndBite(page) {
  const result = await latchTwo(page);
  assert.strictEqual(result.latched, 2, `兩隻奔屍貼車應攀附：${JSON.stringify(result)}`);
  assert(result.enemies.every((e) => e.latched && !e.dead), "攀附不是自爆");
  const bite = await page.evaluate(async () => {
    window.__test.pause && window.__test.pause();
    const hp0 = window.__test.getState().vehicle.hp;
    // 推進到第一口：前搖期間不扣血，命中幀才扣。
    let sawAnticipationWithoutDamage = false;
    let damagedAt = null;
    for (let i = 0; i < 80; i += 1) {
      window.__test.step(16);
      const s = window.__test.getState();
      const biting = s.enemies.find((e) => e.latched && e.attackState);
      if (biting && biting.attackState.phase === "anticipation" && s.vehicle.hp === hp0) sawAnticipationWithoutDamage = true;
      if (s.vehicle.hp < hp0) { damagedAt = biting ? biting.attackState.phase : "none"; break; }
    }
    const debug = window.__test.getRenderDebug();
    return { hp0, hp1: window.__test.getState().vehicle.hp, sawAnticipationWithoutDamage, damagedAt, latchedDrawn: debug.latchedDrawn, attackAtlas: debug.enemyAttackAtlasDrawn, prompt: debug.latchPromptDrawn };
  });
  assert(bite.hp1 < bite.hp0, `攀車啃咬應扣血：${JSON.stringify(bite)}`);
  assert(bite.hp0 - bite.hp1 >= 4, `重裝車也要有感（穿甲）：${bite.hp0 - bite.hp1}`);
  assert(bite.sawAnticipationWithoutDamage, "前搖期間不得扣血");
  assert.notStrictEqual(bite.damagedAt, "anticipation", "傷害發生在命中幀");
  assert.strictEqual(bite.latchedDrawn, 2, "攀附屍畫在車上");
  assert(bite.attackAtlas >= 1, "啃咬使用攻擊真幀 atlas");
  assert.strictEqual(bite.prompt, true, "攀附時畫出甩動提示");
  console.log("PASS R86 攀附＋命中幀啃咬");
}

async function canvasPoint(page, worldX, worldY) {
  return page.evaluate(([x, y]) => {
    const rect = gameCanvas.getBoundingClientRect();
    const logic = window.DSConfig.LOGIC;
    if (rect.width > rect.height) return { x: rect.left + (1 - y / logic.height) * rect.width, y: rect.top + (x / logic.width) * rect.height };
    return { x: rect.left + (x / logic.width) * rect.width, y: rect.top + (y / logic.height) * rect.height };
  }, [worldX, worldY]);
}

async function checkMouseShake(page) {
  await latchTwo(page);
  // 在車左前方放一隻屍體，驗證飛出的屍體會撞到牠。
  await page.evaluate(() => {
    const s = window.__test.getState();
    window.__test.spawnEnemy("shambler", { x: s.vehicle.x - 34, y: s.vehicle.y - 8, hp: 400, speed: 0.01, noLatch: true });
  });
  const left = await canvasPoint(page, 40, 250);
  const right = await canvasPoint(page, 155, 250);
  await page.mouse.move(left.x, left.y);
  await page.mouse.down();
  let flung = 0;
  for (let i = 0; i < 10 && !flung; i += 1) {
    const target = i % 2 ? left : right;
    await page.mouse.move(target.x, target.y, { steps: 3 });
    await page.waitForTimeout(110);
    flung = await page.evaluate(() => window.__test.getState().stats.flung || 0);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => {
    const s = window.__test.getState();
    return { flung: s.stats.flung, latched: s.latch.latched, bowled: s.stats.flingBowled, chain: s.stats.bestFlingChain, eventParts: s.stats.eventParts };
  });
  assert(after.flung >= 2, `真實滑鼠左右急甩應甩飛攀車屍：${JSON.stringify(after)}`);
  assert.strictEqual(after.latched, 0, "甩完車上沒有屍體");
  assert(after.chain >= 2 && after.eventParts >= 1, "一次甩飛 2 隻給額外零件");
  assert(after.bowled >= 1, `飛出的屍體應撞到後方屍群：${JSON.stringify(after)}`);
  console.log("PASS R86 滑鼠急甩甩飛＋保齡球撞擊");
}

async function checkSpaceDrift(page) {
  await latchTwo(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(80);
  const first = await page.evaluate(() => {
    const s = window.__test.getState();
    return { flung: s.stats.flung, drifts: s.stats.drifts, readyAt: s.latch.driftReadyAt, time: s.time };
  });
  assert.strictEqual(first.drifts, 1, "空白鍵觸發甩尾");
  assert(first.flung >= 2, "甩尾同時甩飛攀車屍");
  assert(first.readyAt > first.time, "甩尾進入冷卻");
  await page.keyboard.press("Space");
  const second = await page.evaluate(() => window.__test.getState().stats.drifts);
  assert.strictEqual(second, 1, "冷卻中不能連發");
  console.log("PASS R86 空白鍵甩尾＋冷卻");
}

async function checkTouchDrift(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  const page = await context.newPage();
  await boot(page, url);
  await latchTwo(page);
  await page.waitForSelector("#touchBoostBtn", { state: "visible" });
  const label = await page.locator("#touchBoostBtn").innerText();
  assert.strictEqual(label.trim(), "甩", "觸控按鈕標示「甩」");
  await page.locator("#touchBoostBtn").tap();
  await page.waitForTimeout(120);
  const state = await page.evaluate(() => ({
    flung: window.__test.getState().stats.flung,
    progress: getComputedStyle(document.getElementById("touchBoostBtn")).getPropertyValue("--drift-progress").trim(),
    ready: document.getElementById("touchBoostBtn").classList.contains("is-ready"),
    box: document.getElementById("touchBoostBtn").getBoundingClientRect().toJSON()
  }));
  assert(state.flung >= 2, `觸控「甩」應甩飛：${JSON.stringify(state)}`);
  assert(Number(state.progress) < 1 && !state.ready, `按下後顯示冷卻環：${JSON.stringify(state)}`);
  assert(state.box.width >= 44 && state.box.height >= 44, "甩按鈕命中 ≥44px");
  await context.close();
  console.log("PASS R86 觸控甩按鈕＋冷卻環");
}

async function checkSettlementRow(page) {
  await latchTwo(page);
  await page.keyboard.press("Space");
  await page.evaluate(() => window.__test.finishRun());
  await page.waitForSelector("#settlementPanel:not([hidden])");
  const text = await page.locator("#settlementList").innerText();
  assert(/甩飛/.test(text), `結算應列出甩飛：${text}`);
  console.log("PASS R86 結算列出甩飛");
}

(async () => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--disable-accelerated-2d-canvas"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await boot(page, url);
    await checkLatchAndBite(page);
    await checkMouseShake(page);
    await checkSpaceDrift(page);
    await checkSettlementRow(page);
    await context.close();
    await checkTouchDrift(browser, url);
    assert.deepStrictEqual(errors, [], `不得有頁面錯誤：${errors.join(" | ")}`);
    console.log("R86 latch e2e PASS");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
