"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const evidenceDir = path.join(rootDir, "docs", "evidence", "R80");
const phase = process.argv[2];
assert(["before", "after"].includes(phase), "usage: node scripts/capture-r80-room.js <before|after>");

const viewports = [
  { label: "desktop-1366x700", width: 1366, height: 700 },
  { label: "tablet-820x1180", width: 820, height: 1180 },
  { label: "phone-390x844", width: 390, height: 844 }
];

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.normalize(path.join(rootDir, requestPath));
    if (!filePath.startsWith(rootDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "content-type": mime[path.extname(filePath)] || "application/octet-stream" });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

function settleWithin(promise, timeoutMs = 10000) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

async function closeHarness(browser, server) {
  await settleWithin(browser.close().catch(() => {}));
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await settleWithin(new Promise((resolve) => server.close(resolve)));
}

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
  const records = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.width <= 390,
        isMobile: viewport.width <= 390,
        serviceWorkers: "block"
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => window.__test && typeof window.__test.openTrailerRoom === "function", null, { timeout: 60000 });
      await page.evaluate(({ phaseName, viewportWidth }) => {
        if (phaseName === "after") {
          const meta = window.__test.getMeta();
          meta.settings.performanceMode = viewportWidth >= 1200 ? "high" : viewportWidth <= 390 ? "low" : "auto";
          window.__test.setMeta(meta);
        }
        window.__test.openTrailerRoom();
      }, { phaseName: phase, viewportWidth: viewport.width });
      await page.waitForFunction(() => {
        const metrics = window.__test.getTrailerRoomMetrics();
        return metrics && metrics.baseReady && metrics.characterCount === 1;
      }, null, { timeout: 60000 });
      await page.waitForTimeout(160);
      const overlay = page.locator("#trailerOverlay");
      const record = await page.evaluate(() => ({
        appVersion: window.DSConfig.APP_VERSION,
        metrics: window.__test.getTrailerRoomMetrics(),
        overlayHidden: document.querySelector("#trailerOverlay").hidden,
        overlayRect: (() => {
          const rect = document.querySelector("#trailerOverlay").getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        })(),
        canvas: (() => {
          const canvas = document.querySelector("#trailerRoomCanvas");
          const rect = canvas.getBoundingClientRect();
          return { cssWidth: rect.width, cssHeight: rect.height, width: canvas.width, height: canvas.height };
        })(),
        contrastStyles: (() => {
          const panel = document.querySelector(".trailer-panel");
          const overlay = document.querySelector(".trailer-overlay");
          const primary = document.querySelector(".trailer-head h2");
          const muted = document.querySelector(".trailer-resources");
          return {
            panelBackground: getComputedStyle(panel).backgroundColor,
            overlayBackground: getComputedStyle(overlay).backgroundColor,
            pageBackground: getComputedStyle(document.body).backgroundColor,
            primaryColor: getComputedStyle(primary).color,
            mutedColor: getComputedStyle(muted).color
          };
        })()
      }));
      assert.strictEqual(record.overlayHidden, false);
      assert.strictEqual(record.metrics.characterCount, 1);
      records.push({ viewport, ...record });
      await overlay.screenshot({ path: path.join(evidenceDir, `${phase}-${viewport.label}.png`) });
      await context.close();
      console.log(`R80 ${phase.toUpperCase()} EVIDENCE PASS ${viewport.label}`);
    }
    fs.writeFileSync(path.join(evidenceDir, `${phase}-layout.json`), `${JSON.stringify(records, null, 2)}\n`);
  } finally {
    await closeHarness(browser, server);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
