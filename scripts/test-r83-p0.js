"use strict";

/* R83 P0 守門測試（永久回歸守門）
 *
 * 掃描根因（menuscan ashes P0-A/P0-B）：
 *   1. `.meta-panel.is-illustration{display:grid}` 與 `.panel[hidden]` 同權重且後出，
 *      蓋掉 hidden → 戰局中隱藏車庫面板攔截戰場點擊：
 *      快速升級輪盤「真實點擊」（page.mouse，非 dispatchEvent）在 390×844 / 844×390 都打不開。
 *   2. 跑局中誤觸「出擊」直接重開一局 → R83 兩段式確認（guardedSortie）。
 *   3. 844×390 橫向 .app 直欄鎖比例把遊戲擠成 180×390：
 *      無線電日誌塌陷不可達、補給 overlay 溢出、按鈕 <44px。
 *
 * 斷言全部以真實座標 click 驗證；任一紅燈即 exit 1。
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
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

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
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady(), null, { polling: 120, timeout: 180000 });
  await page.waitForFunction(() => { const p = document.getElementById("garagePanel"); return p && !p.hidden; }, null, { polling: 120, timeout: 180000 });
  await page.waitForFunction(() => {
    const state = window.__test.getShelterState();
    const image = document.getElementById("shelterImage");
    return state.backgroundMode === "image" && state.imageLoaded === true && image && !image.hidden && image.complete;
  }, null, { polling: 120, timeout: 180000 });
}

async function vehicleClientPoint(page) {
  return page.evaluate(() => {
    const state = window.__test.getState();
    const logic = window.DSConfig.LOGIC;
    const rect = document.getElementById("gameCanvas").getBoundingClientRect();
    return {
      x: rect.left + (state.vehicle.x / logic.width) * rect.width,
      y: rect.top + (state.vehicle.y / logic.height) * rect.height
    };
  });
}

async function checkWheelRealClick(page, label) {
  await page.evaluate(() => { window.__test.startRun("land_rig"); window.__test.step(30); });
  await page.waitForFunction(() => window.__test.getState().mode === "playing", null, { polling: 120, timeout: 30000 });
  // 戰局中：隱藏的車庫面板不得攔截戰場點擊
  const blocker = await page.evaluate(() => {
    const stage = document.getElementById("battleStage").getBoundingClientRect();
    const node = document.elementFromPoint(stage.left + stage.width / 2, stage.top + stage.height / 2);
    return node ? (node.id || node.className || node.tagName) : "";
  });
  assert.notStrictEqual(blocker, "shelterImage", `${label} 戰場中央點擊不得被 #shelterImage 攔截（實際命中 ${blocker}）`);
  const sortieRects = await page.evaluate(() => document.getElementById("sortieBtn").getClientRects().length);
  assert.strictEqual(sortieRects, 0, `${label} 跑局中 #sortieBtn 不得可命中`);

  // 真實點擊車輛開輪盤；RAF 與模擬同時推進偶發座標漂移，允許重讀座標重試一次（仍為真實 click）
  let wheelOpened = false;
  for (let attempt = 0; attempt < 2 && !wheelOpened; attempt += 1) {
    const target = await vehicleClientPoint(page);
    await page.mouse.click(target.x, target.y);
    wheelOpened = await page.waitForFunction(
      () => document.getElementById("quickUpgradeWheel").hidden === false,
      null,
      { polling: 120, timeout: 4000 }
    ).then(() => true, () => false);
  }
  assert(wheelOpened, `${label} 快速升級輪盤應以真實點擊開啟`);
  const pauseState = await page.evaluate(() => ({
    pausePanelHidden: document.getElementById("pausePanel").hidden,
    paused: window.__test.getState().mode === "paused"
  }));
  assert(pauseState.paused, `${label} 輪盤開啟應暫停戰局（R81 C-03）`);
  assert(pauseState.pausePanelHidden, `${label} 輪盤開啟不得彈出暫停面板`);
  const wheelBox = await page.locator("#quickUpgradeWheel").boundingBox();
  const viewport = page.viewportSize();
  assert(wheelBox && wheelBox.x >= -1 && wheelBox.y >= -1 &&
    wheelBox.x + wheelBox.width <= viewport.width + 1 && wheelBox.y + wheelBox.height <= viewport.height + 1,
    `${label} 快速升級輪盤應完整在視口內`);
  // 關閉鈕真實點擊可關
  const closeBox = await page.locator("#quickUpgradeCloseBtn").boundingBox();
  await page.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
  await page.waitForFunction(() => document.getElementById("quickUpgradeWheel").hidden === true, null, { polling: 120, timeout: 5000 });
  console.log(`PASS ${label} 快速升級輪盤真實點擊可開可關`);
}

async function checkSortieGuard(page, label) {
  // 跑局中經捷徑開抽屜（會顯示車庫＋出擊鈕）
  await page.evaluate(() => { window.__test.startRun("land_rig"); window.__test.step(6000); });
  await page.waitForFunction(() => window.__test.getState().mode === "playing", null, { polling: 120, timeout: 30000 });
  const beforeState = await page.evaluate(() => {
    // 模擬 rail 捷徑流程：跑局中顯示車庫（含出擊鈕）
    window.__test.showGarage();
    const state = window.__test.getState();
    return { wave: state.wave, time: state.time };
  });
  await page.waitForFunction(() => { const p = document.getElementById("garagePanel"); return p && !p.hidden; }, null, { polling: 120, timeout: 15000 });
  const sortieButton = page.locator("#sortieBtn");
  const sortie = await sortieButton.boundingBox();
  assert(sortie, `${label} 車庫畫面 #sortieBtn 應可見`);
  // locator.click 仍走真實 pointer action，並會等待背景圖切換造成的 layout shift 穩定；
  // 直接重用先前 boundingBox 座標在資源緊繃機器上可能點到相鄰的基地鈕。
  await sortieButton.click();
  await page.waitForTimeout(150);
  const armed = await page.evaluate(() => ({
    confirm: document.getElementById("sortieBtn").dataset.confirmSortie || "",
    text: document.getElementById("sortieBtn").textContent,
    time: window.__test.getState().time,
    mode: window.__test.getState().mode
  }));
  assert.strictEqual(armed.confirm, "1", `${label} 跑局中首按出擊應進入待確認態`);
  assert(armed.text.includes("再按一次"), `${label} 待確認文案應提示再按一次（實際 ${armed.text}）`);
  assert(armed.time >= beforeState.time - 0.001, `${label} 首按不得重開一局（time 不可倒退）`);
  await sortieButton.click();
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const state = window.__test.getState();
    return { time: state.time, mode: state.mode };
  });
  assert(
    after.mode === "playing" && after.time < beforeState.time,
    `${label} 二按應重開新局（time 應由 ${beforeState.time} 歸零，實際 ${after.time}）`
  );
  // 非跑局：單擊直發
  await page.evaluate(() => { window.__test.damageVehicle(999999); window.__test.step(400); });
  await page.waitForFunction(() => { const p = document.getElementById("settlementPanel"); return p && !p.hidden; }, null, { polling: 120, timeout: 20000 });
  await page.evaluate(() => window.__test.showGarage());
  await page.waitForFunction(() => { const p = document.getElementById("garagePanel"); return p && !p.hidden; }, null, { polling: 120, timeout: 15000 });
  const sortieButton2 = page.locator("#sortieBtn");
  const sortie2 = await sortieButton2.boundingBox();
  assert(sortie2, `${label} 結算後 #sortieBtn 應可見`);
  await sortieButton2.click();
  await page.waitForFunction(() => window.__test.getState().mode === "playing", null, { polling: 120, timeout: 8000 });
  console.log(`PASS ${label} 跑局中出擊兩段式確認、非跑局單擊直發`);
}

async function checkLandscapeReachability(page, label) {
  // 無線電日誌：橫向可達、可實捲
  await page.evaluate(() => window.__test.clearStorage());
  await waitReady(page);
  await page.evaluate(() => window.__test.openTrailerRoom());
  await page.waitForFunction(() => { const p = document.getElementById("trailerOverlay"); return p && !p.hidden; }, null, { polling: 120, timeout: 15000 });
  const logBtn = await page.locator("#storyLogBtn").boundingBox();
  assert(logBtn && logBtn.width >= 44 - 1 && logBtn.height >= 44 - 1, `${label} 無線電日誌鈕應 ≥44px`);
  await page.mouse.click(logBtn.x + logBtn.width / 2, logBtn.y + logBtn.height / 2);
  await page.waitForFunction(() => { const p = document.getElementById("storyLogSection"); return p && !p.hidden; }, null, { polling: 120, timeout: 15000 });
  const log = await page.evaluate(() => {
    const section = document.getElementById("storyLogSection");
    const list = document.getElementById("storyLogList");
    const rect = section.getBoundingClientRect();
    const before = list.scrollTop;
    list.scrollTop = 99999;
    const scrolled = list.scrollTop;
    list.scrollTop = before;
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      inViewport: rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
      scrollable: list.scrollHeight <= list.clientHeight + 4 || scrolled > before
    };
  });
  assert(log.height >= 96, `${label} 無線電日誌可視高度應 ≥96px（實際 ${log.height}px）`);
  assert(log.inViewport, `${label} 無線電日誌應完整在視口內`);
  assert(log.scrollable, `${label} 無線電日誌清單應可實捲`);
  await page.click("#closeTrailerRoomBtn");

  // 補給 overlay：5 鈕全在視口內且 ≥44px（沿用 e2e setState 慣例強制開啟）
  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      supplyChoice: { dropId: "R83_supply", x: 52, y: 120, openedAt: state.time, rewardIds: Object.keys(window.DSConfig.SUPPLY_DROPS.rewards) },
      paused: false
    });
    window.__test.step(1);
  });
  await page.waitForFunction(() => {
    const overlay = document.getElementById("supplyChoiceOverlay");
    return overlay && !overlay.hidden && overlay.querySelectorAll(".supply-choice-btn").length === 5;
  }, null, { polling: 120, timeout: 8000 });
  const buttons = await page.locator(".supply-choice-btn").all();
  assert(buttons.length === 5, `${label} 補給選項應為 5（實際 ${buttons.length}）`);
  const viewport = page.viewportSize();
  for (const button of buttons) {
    const box = await button.boundingBox();
    assert(box && box.width >= 44 && box.height >= 44, `${label} 補給鈕應 ≥44px（實際 ${box && `${Math.round(box.width)}x${Math.round(box.height)}`}）`);
    assert(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
      `${label} 補給鈕應完整在視口內`);
  }
  console.log(`PASS ${label} 無線電日誌／補給可達性`);
}

async function checkFinePointerSupplyHint(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitReady(page);
  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      supplyChoice: { dropId: "R83_hint", x: 52, y: 120, openedAt: state.time, rewardIds: Object.keys(window.DSConfig.SUPPLY_DROPS.rewards) },
      paused: false
    });
    window.__test.step(1);
  });
  await page.waitForFunction(() => {
    const overlay = document.getElementById("supplyChoiceOverlay");
    return overlay && !overlay.hidden && overlay.querySelectorAll(".supply-choice-btn").length === 5;
  }, null, { polling: 120, timeout: 8000 });
  const hint = await page.locator("#supplyChoiceHint").innerText();
  assert(hint.includes("1-5"), `fine-pointer 補給提示應含 1-5 快捷（實際 ${hint}）`);
  console.log("PASS fine-pointer 補給提示含 1-5 快捷");
  await context.close();
}

(async () => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ args: ["--disable-gpu", "--disable-accelerated-2d-canvas"] });
  const viewports = [
    { w: 390, h: 844, tag: "390x844" },
    { w: 844, h: 390, tag: "844x390" }
  ];
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        hasTouch: true,
        isMobile: true,
        serviceWorkers: "block"
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
      await waitReady(page);
      await checkWheelRealClick(page, vp.tag);
      await checkSortieGuard(page, vp.tag);
      if (vp.w > vp.h) await checkLandscapeReachability(page, vp.tag);
      assert.deepStrictEqual(errors, [], `${vp.tag} 不得有 page error`);
      await context.close();
    }
    await checkFinePointerSupplyHint(browser, url);
    console.log("R83 P0 guard PASS");
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
})().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
