"use strict";

/* R46 RWD 矩陣守門測試（永久回歸守門）
 *
 * 以 9 視口矩陣稽核 index.html 的互動元素可達性與版面溢出：
 *   1. 所有可互動元素（button/select/input/textarea/a[href]/[role=button]/[onclick]）
 *      必須「完整在視口內」，或位於一個「自身完整可見、overflow-y 可捲」的容器內。
 *   2. 頁級捲動歸零：documentElement.scrollHeight <= innerHeight + 8（app-shell：body 不捲、區域內捲）。
 *   3. 水平溢出 <= 2px。
 *
 * 稽核狀態：
 *   - meta-shelter：避難所主畫面（與 R46 基準稽核相同的狀態）。
 *   - meta-ops-drawer：任務/設定抽屜開啟（設定/存檔控件須可達，抽屜本身可內捲）。
 *
 * 教學/導覽 overlay 的前置關閉步驟寫在 closeTutorialOverlays()：本作教學為
 * canvas 內繪製（無 DOM overlay），此處防禦性地標記教學旗標為已讀、收合事件橫幅，
 * 未來若新增 DOM 教學/導覽疊層，請在該函式內先行關閉再稽核。
 *
 * 零違規才 exit 0；任何 CLIPPED / PAGE_SCROLL / 頁捲超標 / 橫溢超標立即紅燈。
 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

const VIEWPORTS = [
  { w: 1920, h: 1080, kind: "desktop" },
  { w: 1366, h: 700, kind: "desktop" },
  { w: 1280, h: 720, kind: "desktop" },
  { w: 1024, h: 768, kind: "desktop" },
  { w: 820, h: 1180, kind: "tablet" },
  { w: 768, h: 1024, kind: "tablet" },
  { w: 390, h: 844, kind: "mobile" },
  { w: 360, h: 640, kind: "mobile" },
  { w: 844, h: 390, kind: "landscape" }
];

const PAGE_SCROLL_TOLERANCE = 8;
const OVERFLOW_X_TOLERANCE = 2;
const MIN_INTERACTIVE_TOTAL = 10;

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(rootDir, decodeURIComponent(requestPath)));
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(body);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

async function waitForMetaSettled(page) {
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  await page.waitForSelector("#garagePanel:not([hidden])");
  await page.waitForFunction(() => {
    if (!window.__test || !window.__test.getShelterState) return false;
    const state = window.__test.getShelterState();
    if (state.backgroundMode === "image") return state.imageLoaded === true;
    if (state.backgroundMode === "scene") return state.lastDrawMs > 0;
    return state.backgroundMode === "none";
  });
}

async function closeTutorialOverlays(page) {
  // 教學/導覽 overlay 前置關閉：先標記教學旗標為已讀，再收合可能開啟的瞬態疊層。
  await page.evaluate(() => {
    try {
      if (window.__test && window.__test.getMeta && window.__test.setMeta) {
        const meta = window.__test.getMeta();
        if (meta && meta.tutorial && typeof meta.tutorial === "object") {
          let changed = false;
          Object.keys(meta.tutorial).forEach((key) => {
            if (meta.tutorial[key] !== true) {
              meta.tutorial[key] = true;
              changed = true;
            }
          });
          if (changed) window.__test.setMeta(meta);
        }
      }
    } catch (error) {
      // 教學旗標僅為防禦性關閉；失敗不影響版面稽核本身
    }
    const banner = document.getElementById("eventBanner");
    if (banner && !banner.hidden) banner.hidden = true;
    const drawer = document.getElementById("metaDrawer");
    const closeDrawerBtn = document.getElementById("closeMetaDrawer");
    if (drawer && !drawer.hidden && closeDrawerBtn) closeDrawerBtn.click();
  });
}

const STATES = [
  {
    name: "meta-shelter",
    prepare: async () => {
      // 預設避難所主畫面，無需額外操作
    }
  },
  {
    name: "meta-ops-drawer",
    prepare: async (page) => {
      await page.click("#baseToggleBtn");
      await page.waitForSelector("#opsHotspotBtn", { state: "visible" });
      await page.click("#opsHotspotBtn");
      await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])');
    }
  },
  {
    name: "meta-trailer-room",
    prepare: async (page) => {
      await page.evaluate(() => {
        const meta = window.__test.getMeta();
        meta.trailerGoods = 200;
        window.__test.setMeta(meta);
      });
      await page.click("#baseToggleBtn");
      await page.waitForSelector("#trailerHotspotBtn", { state: "visible" });
      await page.click("#trailerHotspotBtn");
      await page.waitForSelector("#trailerOverlay:not([hidden]) #trailerFurnitureList");
    }
  }
];

async function auditViewport(page) {
  return page.evaluate(() => {
    const tol = 2;
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    const els = [...document.querySelectorAll('button, select, input, textarea, a[href], [role="button"], [onclick]')];
    const results = [];
    const seen = new Set();
    for (const el of els) {
      if (seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.disabled) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (+cs.opacity === 0) continue;
      let anc = el.parentElement;
      let hidden = false;
      let scrollHost = null;
      while (anc && anc !== document.body) {
        const acs = getComputedStyle(anc);
        if (acs.display === "none" || acs.visibility === "hidden" || +acs.opacity === 0) {
          hidden = true;
          break;
        }
        if (!scrollHost && /(auto|scroll)/.test(acs.overflowY) && anc.scrollHeight > anc.clientHeight + 4) scrollHost = anc;
        anc = anc.parentElement;
      }
      if (hidden) continue;
      const inVp = r.top >= -tol && r.left >= -tol && r.bottom <= ih + tol && r.right <= iw + tol;
      const label = (el.id ? "#" + el.id : "") ||
        (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).toString().trim().slice(0, 28);
      let status;
      if (inVp) status = "OK";
      else if (scrollHost) {
        const hr = scrollHost.getBoundingClientRect();
        const hostVisible = hr.top >= -tol && hr.bottom <= ih + tol && hr.left >= -tol && hr.right <= iw + tol;
        status = hostVisible ? "SCROLLABLE_OK" : "PAGE_SCROLL";
      } else {
        status = r.top >= ih || r.bottom <= 0 ? "PAGE_SCROLL" : "CLIPPED";
      }
      if (status !== "OK" && status !== "SCROLLABLE_OK") {
        results.push({
          label,
          status,
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right)
        });
      }
    }
    return {
      violations: results,
      pageScrollY: Math.max(0, document.documentElement.scrollHeight - ih),
      overflowX: Math.max(0, document.documentElement.scrollWidth - iw),
      total: seen.size
    };
  });
}

async function runMatrix(browser, baseUrl) {
  for (const state of STATES) {
    for (const vp of VIEWPORTS) {
      const isTouch = vp.kind === "mobile" || vp.kind === "landscape";
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        hasTouch: isTouch,
        isMobile: isTouch
      });
      const page = await context.newPage();
      const label = `${state.name} ${vp.w}x${vp.h} (${vp.kind})`;
      try {
        await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
        await waitForMetaSettled(page);
        await closeTutorialOverlays(page);
        await waitForMetaSettled(page);
        await state.prepare(page);
        await page.waitForTimeout(300);
        const res = await auditViewport(page);
        const appBox = await page.locator("#app").boundingBox();
        assert(appBox, `${label} app shell 應可見`);
        assert(appBox.height >= vp.h * 0.9, `${label} app 高度 ${appBox.height}px 應至少佔視口 90%`);
        assert(Math.abs(appBox.width / appBox.height - 390 / 844) < 0.01, `${label} app 應維持 390:844 等比，實際 ${appBox.width}x${appBox.height}`);
        assert.strictEqual(
          res.violations.length,
          0,
          `${label} 有 ${res.violations.length} 項互動元素違規: ${JSON.stringify(res.violations)}`
        );
        assert(
          res.pageScrollY <= PAGE_SCROLL_TOLERANCE,
          `${label} 頁級垂直捲動 ${res.pageScrollY}px 應 <= ${PAGE_SCROLL_TOLERANCE}px`
        );
        assert(
          res.overflowX <= OVERFLOW_X_TOLERANCE,
          `${label} 水平溢出 ${res.overflowX}px 應 <= ${OVERFLOW_X_TOLERANCE}px`
        );
        assert(
          res.total >= MIN_INTERACTIVE_TOTAL,
          `${label} 互動元素僅 ${res.total} 個，頁面可能未正確載入`
        );
        console.log(`RWD PASS ${label} 元素 ${res.total} 頁捲 ${res.pageScrollY} 橫溢 ${res.overflowX}`);
      } finally {
        await context.close();
      }
    }
  }
}

(async () => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ args: ["--disable-gpu", "--disable-accelerated-2d-canvas"] });
  try {
    await runMatrix(browser, url);
    console.log("RWD matrix tests PASS");
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
