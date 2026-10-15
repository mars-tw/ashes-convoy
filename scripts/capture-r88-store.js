"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { harness } = require("./mobile-r87-harness");
const version = require("../src/version").APP_VERSION;
const phase = process.argv[2] || "after";
if (phase === "before" && version !== "R87") throw new Error("Before requires R87 source");
if (!["before", "after"].includes(phase)) throw new Error("Invalid phase");
const evidence = path.resolve(__dirname, "../docs/evidence/r88-store");
const screenshots = path.resolve(__dirname, "../docs/store/screenshots");
const sourceHashes = Object.fromEntries(["index.html", "src/version.js", "src/config.js", "src/game.js", "src/ui.js"].map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(path.resolve(__dirname, "..", file))).digest("hex")]));
fs.mkdirSync(evidence, { recursive: true });
harness(async (browser, url) => {
  const records = [];
  const sizes = phase === "before" ? [[390, 844], [844, 390], [1366, 600]] : [[390, 844], [844, 390], [1366, 600], [1290, 2796], [2064, 2752]];
  for (const [width, height] of sizes) {
    const store = width > 1200 && height > 2000;
    const ratio = store ? (width === 1290 ? 3 : 2) : 1;
    const context = await browser.newContext({ viewport: { width: width / ratio, height: height / ratio }, hasTouch: width < 1000 || store, isMobile: width < 1000 || store, serviceWorkers: "block", deviceScaleFactor: ratio });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.__test && window.__test.rasterAssetsReady(), null, { timeout: 180000 });
    await page.waitForTimeout(600);
    async function shot(scene) {
      const dir = store ? screenshots : evidence;
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${phase}-${width}x${height}-${scene}.png`);
      await page.screenshot({ path: file });
      records.push({ file: path.relative(path.resolve(__dirname, ".."), file), version, sourceHashes, width, height, cssViewport: [width / ratio, height / ratio], deviceScaleFactor: ratio, scene, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), state: await page.evaluate(() => ({ mode: window.__test.getState().mode, time: window.__test.getState().time, trial: window.__test.getState().convoyTrial || null })) });
    }
    await shot("base");
    if (phase === "after") {
      await page.locator("#convoyTrialBtn").click();
      await page.evaluate(() => window.AshesGame.setVirtualAim({ x: 0.7, y: 0 }));
      await page.waitForFunction(() => window.__test.getState().latch.latched >= 2, null, { timeout: 30000 });
      await page.evaluate(() => window.AshesGame.releaseVirtualAim());
      await shot("climbers");
      await page.evaluate(() => window.AshesGame.driftBurst(-1));
      await page.waitForTimeout(100);
      await shot("drift");
      await page.waitForSelector('#supplyChoiceOverlay:not([hidden]) [data-reward-id="repair_small"]');
      await page.waitForTimeout(400);
      await page.locator('[data-reward-id="repair_small"]').click();
      await page.waitForFunction(() => window.__test.getState().convoyTrial.stage === "complete");
      await shot("completed");
      await page.locator("#routeHudBtn").click();
      await shot("routes");
    }
    await context.close();
  }
  fs.writeFileSync(path.join(evidence, `${phase}-captures.json`), JSON.stringify(records, null, 2));
  console.log(`VERIFIED ${phase} ${records.length} actual screenshots`);
}).catch(error => { console.error(error); process.exitCode = 1; });
