"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "docs/evidence/r87-mobile");
async function harness(run) {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(rootDir, `.${name === "/" ? "/index.html" : name}`);
    if (!file.startsWith(rootDir + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      const type = { ".js": "text/javascript", ".html": "text/html", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" }[path.extname(file)] || "application/octet-stream";
      res.setHeader("Content-Type", type); res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--disable-accelerated-2d-canvas"] });
  fs.mkdirSync(outDir, { recursive: true });
  try { await run(browser, `http://127.0.0.1:${server.address().port}/`); }
  finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
async function boot(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady(), null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.setState({ enemies: [], projectiles: [], gates: [], hazards: [], enemyProjectiles: [], wavePlan: { spawns: [], gates: [], duration: 999, boss: false, environmentEvent: null } });
  });
}
module.exports = { harness, boot, outDir };
