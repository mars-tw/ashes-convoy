"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../src/config.js");
const version = require("../src/version.js");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const manifestPath = path.join(root, "assets", "ui", "start-art-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const artifact = manifest.artifacts[0];
const artifactPath = path.join(root, artifact.path);
const png = fs.readFileSync(artifactPath);

function readPngChunks(buffer) {
  assert.strictEqual(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "R79 atmosphere must be a PNG");
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert(dataEnd + 4 <= buffer.length, `R79 atmosphere has a truncated ${type} chunk`);
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

assert.strictEqual(version.APP_VERSION, "R79", "start-screen release guard must target R79");
assert.strictEqual(config.START_SCREEN.slug, "ashes-r79-start", "runtime config must record the R79 start-screen slug");
assert.strictEqual(config.START_SCREEN.atmosphere, artifact.path, "runtime atmosphere must match the asset manifest");
assert.strictEqual(config.START_SCREEN.manifest, "assets/ui/start-art-manifest.json", "runtime config must expose the asset manifest");
assert.strictEqual(manifest.release, "R79");
assert.strictEqual(manifest.slug, "ashes-r79-start");
assert.strictEqual(manifest.use_case_slug, "stylized-concept");
assert(fs.existsSync(artifactPath), `missing R79 atmosphere asset: ${artifact.path}`);

const chunks = readPngChunks(png);
const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
assert(ihdr, "R79 atmosphere must contain IHDR");
assert.strictEqual(ihdr.data.readUInt32BE(0), 2048, "R79 atmosphere width must be 2048");
assert.strictEqual(ihdr.data.readUInt32BE(4), 1152, "R79 atmosphere height must be 1152");
assert.strictEqual(ihdr.data[8], 8, "R79 atmosphere must use 8-bit channels");
assert.strictEqual(ihdr.data[9], 2, "R79 fullscreen atmosphere must be intentionally opaque RGB");
assert(!chunks.some((chunk) => chunk.type === "tRNS"), "R79 opaque atmosphere must not contain a tRNS alpha key");
assert(![4, 6].includes(ihdr.data[9]), "R79 opaque atmosphere must not carry an accidental alpha channel");

const digest = crypto.createHash("sha256").update(png).digest("hex");
assert.strictEqual(digest, artifact.sha256, "R79 atmosphere checksum must match its manifest");

const summaryIndex = html.indexOf('<div class="meta-summary panel-head">');
const artIndex = html.indexOf('<div class="start-art-stage">');
const actionsIndex = html.indexOf('<div class="hotspot-layer" id="hotspotLayer"');
assert(summaryIndex >= 0 && artIndex > summaryIndex && actionsIndex > artIndex, "R79 title, key art and controls must be separate ordered grid rows");
assert(html.includes("grid-template-rows: auto minmax(0, 1fr) auto"), "R79 start screen must reserve structural title/art/action rows");
assert(html.includes("object-fit: contain"), "R79 key art must remain fully visible");
assert(/\.start-art-stage\s*\{[\s\S]*?url\("assets\/ui\/start\.png"\) center \/ contain no-repeat/.test(html), "R79 key art stage must render start.png during image loading");
assert(html.includes("start-stat-chip") && html.includes("start-logo") && html.includes("cta-copy"), "R79 branded logo, chips and CTA treatments must exist");
assert(html.includes('url("assets/ui/start-atmosphere-r79.png")'), "R79 viewport must consume the atmosphere extension");
assert(sw.includes('"assets/ui/start-atmosphere-r79.png"') && sw.includes('"assets/ui/start-art-manifest.json"'), "R79 start assets must be cached for offline use");

console.log(`R79 start-screen asset/alpha gate PASS (${manifest.slug}, 2048x1152 opaque RGB, sha256 ${digest.slice(0, 12)})`);
