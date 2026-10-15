"use strict";

// R86 證據截圖（headless）：四視口各拍「攀車中」「甩飛瞬間」兩張。
// 用法：先起本機伺服器（例：python -m http.server 5102），再 node scripts/capture-r86.js [baseUrl]
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.argv[2] || "http://127.0.0.1:5102/";
const outDir = path.resolve(__dirname, "..", "docs", "evidence", "r86", "after");
fs.mkdirSync(outDir, { recursive: true });
const VIEWPORTS = [
  { name: "desktop-1366x768", width: 1366, height: 768, touch: false },
  { name: "laptop-1366x600", width: 1366, height: 600, touch: false },
  { name: "phone-390x844", width: 390, height: 844, touch: true },
  { name: "phone-land-844x390", width: 844, height: 390, touch: true }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: "block", reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady(), null, { timeout: 120000 });
    await page.evaluate(() => {
      window.__test.clearStorage();
      const meta = window.__test.getMeta();
      meta.tutorial = Object.assign({}, meta.tutorial, { seenQuickUpgrade: true });
      window.__test.setMeta(meta);
      window.__test.startRun("land_rig");
      window.__test.setState({ enemies: [], projectiles: [], gates: [], wavePlan: { spawns: [], gates: [], duration: 999, boss: false, environmentEvent: null }, spawnIndex: 0, gateIndex: 0, waveElapsed: 0 });
      const s = window.__test.getState();
      window.__test.spawnEnemy("runner", { x: s.vehicle.x - 6, y: s.vehicle.y - 2, hp: 400 });
      window.__test.spawnEnemy("shambler", { x: s.vehicle.x + 6, y: s.vehicle.y - 2, hp: 400 });
      window.__test.spawnEnemy("runner", { x: s.vehicle.x - 4, y: s.vehicle.y + 40, hp: 400 });
      [-38, 38, -30, 30].forEach((dx, i) => window.__test.spawnEnemy(i < 2 ? "shambler" : "runner", { x: s.vehicle.x + dx, y: s.vehicle.y - 40 - i * 14, hp: 400, speed: 0.01, noLatch: true }));
      window.__test.step(60);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, `${vp.name}-latch.png`) });
    const latched = await page.evaluate(() => window.__test.getState().latch.latched);
    await page.evaluate(() => window.__test.driftBurst(-1));
    await page.waitForTimeout(140);
    await page.screenshot({ path: path.join(outDir, `${vp.name}-fling.png`) });
    const after = await page.evaluate(() => { const s = window.__test.getState(); return { flung: s.stats.flung, bowled: s.stats.flingBowled }; });
    report.push({ viewport: vp.name, latched, ...after });
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "capture-r86.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
})().catch((error) => { console.error(error); process.exit(1); });
