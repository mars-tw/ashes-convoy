"""Read-only peer/native audit. Writes evidence only under this repo."""
from pathlib import Path
import hashlib
import json
import os
import re
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/evidence/r88-store"
PEERS = ["rift-survivors", "storm-apocalypse", "tower-defense", "skill", "pixel-idle-farm-skill", "village-siege", "seven-district-reckoning", "rift-forge-3d", "taiwan-island-drive", "taiwan-train-math", "夜行列車_重製企劃_20261002", "island-flight-school", "taiwan-train-school"]
SKIP = {".git", "node_modules", "Library", "Temp", "Logs", "obj", "bin", "Build", "build", "docs", ".audit-tmp", "tmp", "output", "dist", "references", "tools", "scripts", "Packages"}
EXTS = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".wav", ".mp3", ".ogg", ".ttf", ".woff", ".woff2", ".js", ".css", ".html", ".gd", ".cs"}

def files(base):
    for folder, dirs, names in os.walk(base):
        dirs[:] = sorted(d for d in dirs if d not in SKIP and not d.startswith("."))
        for name in sorted(names):
            p = Path(folder) / name
            if p.suffix.lower() in EXTS:
                yield p

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    own = list(files(ROOT))
    own_hashes = {}
    sizes = set()
    for p in own:
        sizes.add(p.stat().st_size)
        own_hashes.setdefault(sha(p), []).append(p.relative_to(ROOT).as_posix())
    matches = []
    peers = []
    excerpts = []
    style_matches = []
    own_css = set(re.sub(r"\s+", " ", body).strip() for _, body in re.findall(r"([^{}]+)\{([^{}]+)\}", (ROOT / "index.html").read_text(encoding="utf-8")) if len(body.strip()) > 100)
    for name in PEERS:
        base = ROOT.parent / name
        scanned = 0
        candidates = list(files(base))
        native_night = ROOT.parent / "game-store-publisher/native-kit/apps/night-train-watch-protocol/web"
        if name == "夜行列車_重製企劃_20261002":
            candidates += list(files(native_night))
        for p in candidates:
            scanned += 1
            if p.stat().st_size not in sizes:
                continue
            digest = sha(p)
            for mine in own_hashes.get(digest, []):
                peer_file = p.relative_to(base).as_posix() if p.is_relative_to(base) else "native-web/" + p.relative_to(native_night).as_posix()
                matches.append({"file": mine, "peer": name, "peerFile": peer_file, "sha256": digest})
        peers.append({"repo": name, "exists": base.exists(), "filesScanned": scanned, "additionalNativeWeb": str(native_night) if name == "夜行列車_重製企劃_20261002" else None})
        readme = base / "README.md"
        if readme.exists():
            excerpts.append({"repo": name, "source": str(readme), "sha256": sha(readme), "excerpt": readme.read_text(encoding="utf-8")[:1800]})
        for p in base.glob("*.html"):
            text = p.read_text(encoding="utf-8", errors="replace")
            for selector, body in re.findall(r"([^{}]+)\{([^{}]+)\}", text):
                normalized = re.sub(r"\s+", " ", body).strip()
                if normalized in own_css:
                    style_matches.append({"peer": name, "file": str(p), "selector": selector.strip()[-100:], "css": normalized})
    sources = [ROOT / "index.html", ROOT / "sw.js", *sorted((ROOT / "src").glob("*.js"))]
    patterns = {}
    for p in sources:
        hits = []
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"https?://|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|indexedDB|TODO|Lorem|coming soon|敬請期待", line, re.I):
                hits.append({"line": i, "text": line.strip()[:240]})
        if hits:
            patterns[p.relative_to(ROOT).as_posix()] = hits
    native = ROOT.parent / "game-store-publisher/native-kit/apps/ashes-convoy"
    native_files = ["capacitor.config.json", "ios/App/App/PrivacyInfo.xcprivacy", "ios/App/App/Info.plist", "android/app/src/main/AndroidManifest.xml", "package.json", "web/src/version.js", "web/native-host.js"]
    native_records = []
    for name in native_files:
        p = native / name
        native_records.append({"path": str(p), "exists": p.exists(), "sha256": sha(p) if p.exists() else None, "text": p.read_text(encoding="utf-8") if p.exists() else None})
    report = {"status": "VERIFIED", "method": "Exact SHA-256; runtime source/media only; excluded third-party/generated/history trees; not a semantic or full binary comparison", "ownFiles": len(own), "peers": peers, "matches": matches, "runtimePatterns": patterns, "nativeReadOnly": native_records, "artCapability": {"requestedModel": "gpt-image-2", "status": "BLOCKED", "reason": "Two built-in imagegen attempts produced independent poses; unchanged C2PA verifier rejected softwareAgent ChatGPT / gpt-image, which does not attest gpt-image-2. Unverified masters quarantined under ignored tools/asset_sources/imagegen_r88_unverified, not runtime.", "missing": ["assets/enemies/oga_runner_latch.png", "assets/enemies/oga_shambler_latch.png"]}}
    report.update({"capturedAt": datetime.now(timezone.utc).isoformat(), "peerReadmeEvidence": excerpts, "exactLongCssRuleMatches": style_matches})
    (OUT / "shared-native-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ownFiles": len(own), "peers": peers, "matches": matches}, ensure_ascii=False))

if __name__ == "__main__":
    main()
