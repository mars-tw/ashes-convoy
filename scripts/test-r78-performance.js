"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");
const version = require("../src/version.js");

const rootDir = path.resolve(__dirname, "..");
const budgetMs = 18;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(rootDir, requestPath));
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

function percentile(values, pct) {
  const ordered = values.slice().sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * pct) - 1))];
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

async function prepareRun(page, performanceMode, fxLevel) {
  await page.evaluate(({ performanceMode, fxLevel }) => {
    window.__test.startRun("land_rig");
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = performanceMode;
    meta.settings.fxLevel = fxLevel;
    meta.settings.reducedFlash = fxLevel === "reduced";
    meta.settings.screenShake = false;
    window.__test.setMeta(meta);
    window.__test.samplePerformanceFrames([], { reset: true, constrainedDevice: false });
    const base = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      enemyProjectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      weaponPowerups: [],
      companionCooldown: 999,
      vehicle: {
        x: base.vehicle.x,
        followX: base.vehicle.x,
        hp: base.vehicle.maxHp,
        weaponCooldown: 999
      },
      wavePlan: { spawns: [], gates: [], duration: 300, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0
    });
    const ids = [
      "shambler", "runner", "bloater", "spore_spitter", "shield_husk", "swarm_mite",
      "tar_brute", "void_wraith", "ash_screamer", "chain_tether", "mirror_husk", "ember_tick"
    ];
    for (let index = 0; index < 54; index += 1) {
      const enemyId = ids[index % ids.length];
      const ranged = enemyId === "spore_spitter" || enemyId === "ash_screamer";
      window.__test.spawnEnemy(enemyId, {
        id: `perf_${index}`,
        x: 34 + (index % 9) * 16,
        y: ranged ? base.vehicle.y - 104 - (index % 3) * 4 : 48 + Math.floor(index / 9) * 38,
        speed: 0,
        hp: 9999,
        attackCooldown: ranged ? 0 : 999,
        silent: true
      });
    }
    window.__test.step(16);
  }, { performanceMode, fxLevel });
}

async function measureRun(page) {
  return page.evaluate(() => {
    let warmupFrameMs = 16;
    for (let index = 0; index < 60; index += 1) {
      const warmupStartedAt = performance.now();
      window.__test.step(warmupFrameMs);
      warmupFrameMs = Math.max(1, performance.now() - warmupStartedAt);
    }
    const samples = [];
    let attackAtlasSeen = false;
    for (let index = 0; index < 220; index += 1) {
      const startedAt = performance.now();
      window.__test.step(16);
      samples.push(performance.now() - startedAt);
      attackAtlasSeen = attackAtlasSeen || window.__test.getRenderDebug().enemyAttackAtlasDrawn > 0;
    }
    return {
      samples,
      attackAtlasSeen,
      enemies: window.__test.getState().enemies.length,
      render: window.__test.getRenderDebug(),
      quality: window.__test.samplePerformanceFrames([]).quality
    };
  });
}

(async () => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--disable-accelerated-2d-canvas"] });
  const scenarios = [
    { id: "auto-reduced", settings: { performanceMode: "auto", fxLevel: "reduced" } },
    { id: "low-reduced", settings: { performanceMode: "low", fxLevel: "reduced" } }
  ];
  const viewports = [
    { label: "desktop-1366x700", width: 1366, height: 700 },
    { label: "phone-390x844", width: 390, height: 844 }
  ];
  const results = [];
  try {
    for (const scenario of scenarios) {
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
        await page.waitForFunction(
          () => window.__test.rasterAssetsReady && window.__test.rasterAssetsReady(),
          null,
          { timeout: 120000 }
        );
        const runs = [];
        for (let run = 1; run <= 3; run += 1) {
          await prepareRun(page, scenario.settings.performanceMode, scenario.settings.fxLevel);
          await page.waitForFunction(
            () => window.__test.getRenderDebug().companionAttackAtlasStatus === "loaded",
            null,
            { timeout: 120000 }
          );
          const measured = await measureRun(page);
          const p95Ms = rounded(percentile(measured.samples, 0.95));
          runs.push({
            run,
            sampleCount: measured.samples.length,
            p50Ms: rounded(percentile(measured.samples, 0.5)),
            p95Ms,
            maxMs: rounded(Math.max(...measured.samples)),
            enemies: measured.enemies,
            quality: measured.quality,
            attackAtlasSeen: measured.attackAtlasSeen,
            enemyRasterDrawn: measured.render.enemyRasterDrawn,
            enemyFallbackDrawn: measured.render.enemyFallbackDrawn
          });
        }
        const medianP95Ms = percentile(runs.map((run) => run.p95Ms), 0.5);
        results.push({
          scenario: scenario.id,
          settings: scenario.settings,
          viewport,
          seededEnemies: 54,
          logicalEnemyCap: 72,
          runs,
          medianP95Ms,
          pass: medianP95Ms <= budgetMs && runs.every((run) => run.attackAtlasSeen && run.enemyFallbackDrawn === 0)
        });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const report = {
    createdAt: new Date().toISOString(),
    release: version.APP_VERSION,
    budgetMs,
    method: "Playwright Chromium synchronous window.__test.step(16) simulation+draw wall time; 60 warmup steps; 220 measured steps; 54 seeded raster enemies; browser launched with --disable-gpu --disable-accelerated-2d-canvas",
    results,
    pass: results.every((result) => result.pass)
  };
  const output = path.join(rootDir, "docs", "evidence", version.APP_VERSION, "perf-p95.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  assert(report.pass, `${version.APP_VERSION} performance gate failed: ${JSON.stringify(results)}`);
  console.log(`${version.APP_VERSION} performance PASS (${results.map((result) => `${result.scenario}/${result.viewport.label} ${result.medianP95Ms}ms`).join(", ")})`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
