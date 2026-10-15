"use strict";
const fs = require("fs");
const path = require("path");
const { harness, boot, outDir } = require("./mobile-r87-harness");
const phase = process.argv[2] || "after";
if (!["before", "after"].includes(phase)) throw new Error("Expected before or after");
if (phase === "before" && require("../src/version").APP_VERSION !== "R86") throw new Error("Before evidence requires the historical R86 source; preserve the existing baseline captures.");
harness(async (browser, url) => {
  const metrics = [];
  for (const [width, height] of [[390, 844], [844, 390], [1366, 600]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000, serviceWorkers: "block" });
    const page = await context.newPage();
    await boot(page, url);
    await page.evaluate(() => {
      const s = window.__test.getState();
      window.__test.spawnEnemy("runner", { x: s.vehicle.x - 6, y: s.vehicle.y - 2, hp: 900 });
      window.__test.spawnEnemy("shambler", { x: s.vehicle.x + 6, y: s.vehicle.y + 32, hp: 900 });
      window.__test.step(100);
    });
    await page.screenshot({ path: path.join(outDir, `${phase}-${width}x${height}-combat.png`) });
    metrics.push(await page.evaluate(() => ({ viewport: [innerWidth, innerHeight], controls: ["virtualJoystick", "touchBoostBtn", "touchSkillBtn", "touchWeaponBtn", "touchPauseBtn", "routeHudBtn"].map(id => ({ id, box: document.getElementById(id)?.getBoundingClientRect().toJSON() })) })));
    if (phase === "after") {
      await page.locator("#routeHudBtn").click();
      await page.screenshot({ path: path.join(outDir, `${phase}-${width}x${height}-routes.png`) });
      await page.locator('[data-route-id="rescue"]').click();
      await page.evaluate(() => window.__test.step(100));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `${phase}-${width}x${height}-supply.png`) });
    }
    await context.close();
  }
  fs.writeFileSync(path.join(outDir, `${phase}-geometry.json`), JSON.stringify(metrics, null, 2));
  console.log(`VERIFIED ${phase}: ${metrics.length} viewport captures`);
}).catch(error => { console.error(error); process.exitCode = 1; });
