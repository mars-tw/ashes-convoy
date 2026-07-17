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
const c2paEvidence = JSON.parse(fs.readFileSync(path.join(root, manifest.master.c2pa.evidence), "utf8"));

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

assert.strictEqual(version.APP_VERSION, "R80", "R79.1 start-screen asset must remain governed in the R80 release");
assert.strictEqual(config.START_SCREEN.slug, "ashes-r79-start", "runtime config must record the R79 start-screen slug");
assert.strictEqual(config.START_SCREEN.atmosphere, artifact.runtime_url, "runtime atmosphere must match the content-hashed asset manifest URL");
assert.strictEqual(config.START_SCREEN.manifest, "assets/ui/start-art-manifest.json", "runtime config must expose the asset manifest");
assert.strictEqual(manifest.release, "R79.1");
assert.strictEqual(manifest.slug, "ashes-r79-start");
assert.strictEqual(manifest.model_slug, "gpt-image-2");
assert.strictEqual(manifest.use_case_slug, "stylized-concept");
assert.strictEqual(manifest.master.c2pa.softwareAgent, "gpt-image 2.0");
assert.strictEqual(manifest.master.c2pa.pass, true);
assert.strictEqual(c2paEvidence.pass, true, "Python C2PA evidence must pass");
assert.strictEqual(c2paEvidence.results[0].softwareAgent.name, "gpt-image");
assert.match(c2paEvidence.results[0].softwareAgent.version, /^2\./);
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
assert.strictEqual(digest, artifact.runtime_sha256, "R79 atmosphere runtime checksum must match its manifest");
assert.strictEqual(manifest.master.sha256, artifact.master_sha256, "R79 master/runtime double-layer hash must be connected");
manifest.artifacts.forEach((entry) => {
  const runtime = fs.readFileSync(path.join(root, entry.path));
  const runtimeDigest = crypto.createHash("sha256").update(runtime).digest("hex");
  assert.strictEqual(runtimeDigest, entry.runtime_sha256, `${entry.quality} runtime checksum must match`);
  assert.strictEqual(entry.master_sha256, manifest.master.sha256, `${entry.quality} must derive from the verified master`);
  assert.strictEqual(entry.runtime_url, `${entry.path}?v=${entry.runtime_sha256.slice(0, 8)}`, `${entry.quality} URL must use the runtime hash prefix`);
  assert.strictEqual(config.START_SCREEN.atmosphereQuality[entry.quality], entry.runtime_url, `${entry.quality} config URL must match manifest`);
});

const summaryIndex = html.indexOf('<div class="meta-summary panel-head">');
const artIndex = html.indexOf('<div class="start-art-stage">');
const actionsIndex = html.indexOf('<div class="hotspot-layer" id="hotspotLayer"');
assert(summaryIndex >= 0 && artIndex > summaryIndex && actionsIndex > artIndex, "R79 title, key art and controls must be separate ordered grid rows");
assert(html.includes("grid-template-rows: auto minmax(0, 1fr) auto"), "R79 start screen must reserve structural title/art/action rows");
assert(html.includes("object-fit: contain"), "R79 key art must remain fully visible");
assert(/\.start-art-stage\s*\{[\s\S]*?url\("assets\/ui\/start-focus-low\.png\?v=6a1e8997"\) center \/ contain no-repeat/.test(html), "R79 key art stage must render the content-hashed low-bandwidth key art during image loading");
assert(html.includes("start-stat-chip") && html.includes("start-logo") && html.includes("cta-copy"), "R79 branded logo, chips and CTA treatments must exist");
assert(html.includes('url("assets/ui/start-atmosphere-r79.png?v=31cbd67f")'), "R79 viewport must consume the content-hashed high atmosphere");
assert(html.includes('url("assets/ui/start-atmosphere-r79-medium.png?v=115410f5")'), "R79 viewport must expose a real medium atmosphere");
assert(html.includes('url("assets/ui/start-atmosphere-r79-low.png?v=b58b835b")'), "R79 viewport must expose a real low atmosphere");
assert(html.includes('rel="preload" as="image" href="assets/ui/start-focus-low.png?v=6a1e8997" fetchpriority="high"'), "R79 low-bandwidth central key art must be preloaded at high priority");
assert(html.includes("markDecodedStartFocus") && html.includes('image.onload = function ()'), "R79 must mark the decoded CSS key-art paint before deferred UI startup");
assert(html.includes("var(--start-atmosphere-image)"), "R79 viewport must select a quality-specific atmosphere");
assert(sw.includes('"assets/ui/start-atmosphere-r79.png?v=31cbd67f"') && sw.includes('"assets/ui/start-art-manifest.json"'), "R79 start assets must be cached for offline use");
const ui = fs.readFileSync(path.join(root, "src", "ui.js"), "utf8");
assert(ui.includes('markPerformanceOnce("ashes-start-focus-visible")'), "R79 must mark the painted start focus");
assert(ui.includes('markPerformanceOnce("ashes-start-interactive")'), "R79 must mark start interactivity");

console.log(`R79.1 provenance/asset/alpha gate PASS (${manifest.model_slug}, gpt-image ${c2paEvidence.results[0].softwareAgent.version}, sha256 ${digest.slice(0, 12)})`);
