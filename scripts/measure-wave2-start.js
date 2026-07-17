"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const outputArg = process.argv[2] || "docs/evidence/R80/start-fast3g-after.json";
const outputPath = path.resolve(rootDir, outputArg);
const MIME = {
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
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": MIME[path.extname(filePath)] || "application/octet-stream"
      });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

function percentile(values, ratio) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function settleWithin(promise, timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

async function measureOnce(browser, url, run) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 700 },
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 1.6 * 1024 * 1024 / 8,
    uploadThroughput: 750 * 1024 / 8,
    connectionType: "cellular3g"
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__wave2NavigationEpoch = performance.now();
  });
  const wallStart = Date.now();
  try {
    await page.goto(url, { waitUntil: "commit", timeout: 60000 });
    let focusTimedOut = false;
    await page.waitForFunction(() => {
      const stage = document.querySelector(".start-art-stage");
      const mark = performance.getEntriesByName("ashes-start-focus-visible").at(-1);
      return !!(stage && mark && getComputedStyle(stage).backgroundImage.includes("start-focus-low.png"));
    }, null, { timeout: 15000 }).catch(() => { focusTimedOut = true; });
    const focusVisibleMs = focusTimedOut
      ? 15000
      : await page.evaluate(() => performance.getEntriesByName("ashes-start-focus-visible").at(-1).startTime);
    let interactiveTimedOut = focusTimedOut;
    if (!focusTimedOut) {
      await page.waitForFunction(() => {
        const start = document.getElementById("startBtn");
        return !!(window.__test && start && !start.disabled && getComputedStyle(start).pointerEvents !== "none");
      }, null, { timeout: 15000 }).catch(() => { interactiveTimedOut = true; });
    }
    const interactiveMs = interactiveTimedOut
      ? 15000
      : await page.evaluate(() => {
          const mark = performance.getEntriesByName("ashes-start-interactive").at(-1);
          return mark ? mark.startTime : performance.now();
        });
    const nav = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      const focus = performance.getEntriesByName("ashes-start-focus-visible").at(-1);
      const interactive = performance.getEntriesByName("ashes-start-interactive").at(-1);
      return {
        domContentLoadedMs: entry ? entry.domContentLoadedEventEnd : null,
        loadEventMs: entry ? entry.loadEventEnd : null,
        appFocusMarkMs: focus ? focus.startTime : null,
        appInteractiveMarkMs: interactive ? interactive.startTime : null
      };
    });
    return {
      run,
      focusVisibleMs: Math.round(focusVisibleMs * 10) / 10,
      interactiveMs: Math.round(interactiveMs * 10) / 10,
      focusTimedOut,
      interactiveTimedOut,
      wallMs: Date.now() - wallStart,
      ...nav
    };
  } finally {
    await settleWithin(context.close().catch(() => {}));
  }
}

(async () => {
  const { server, url } = await startServer();
  const channel = process.env.PLAYWRIGHT_CHANNEL || "chrome";
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const runs = [];
    const runCount = Math.max(1, Math.min(5, Number(process.env.WAVE2_RUNS || 3)));
    for (let index = 1; index <= runCount; index += 1) {
      runs.push(await measureOnce(browser, url, index));
      console.log(`WAVE2 START PERF SAMPLE ${index}/${runCount}: focus=${runs.at(-1).focusVisibleMs}ms interactive=${runs.at(-1).interactiveMs}ms`);
    }
    const focusValues = runs.map((item) => item.focusVisibleMs);
    const interactiveValues = runs.map((item) => item.interactiveMs);
    const result = {
      profile: {
        viewport: "1366x700",
        network: "Fast 3G (150ms RTT, 1.6Mbps down, 750Kbps up)",
        cpuThrottle: "4x",
        browserChannel: channel,
        concurrencyNote: "Local machine measurement; any concurrent load makes timing advisory. Clean-machine audit remains authoritative."
      },
      runs,
      summary: {
        focusVisibleP95Ms: percentile(focusValues, 0.95),
        interactiveP95Ms: percentile(interactiveValues, 0.95),
        focusWithin3000Ms: percentile(focusValues, 0.95) <= 3000
      }
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    const status = result.summary.focusWithin3000Ms ? "PASS" : "FAIL";
    console.log(`WAVE2 START PERF ${status} focus p95=${result.summary.focusVisibleP95Ms}ms interactive p95=${result.summary.interactiveP95Ms}ms -> ${path.relative(rootDir, outputPath)}`);
    if (!result.summary.focusWithin3000Ms && process.env.WAVE2_ALLOW_FAIL !== "1") {
      assert.fail(`start focus p95 ${result.summary.focusVisibleP95Ms}ms exceeds 3000ms`);
    }
  } finally {
    await settleWithin(browser.close().catch(() => {}));
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
