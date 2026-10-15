"""Local source/evidence checks, with no credential access or external writes."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/evidence/r88-store"

def main():
    files = [*sorted((ROOT / "src").glob("*.js")), *sorted((ROOT / "scripts").glob("*.js"))]
    for p in files:
        subprocess.run(["node", "-c", str(p)], cwd=ROOT, check=True, capture_output=True)
    subprocess.run(["git", "diff", "--check"], cwd=ROOT, check=True, capture_output=True)
    version_files = [ROOT / p for p in ["src/version.js", "src/config.js", "index.html", "sw.js", "package.json", "package-lock.json"]]
    stale = [p.relative_to(ROOT).as_posix() for p in version_files if re.search(r"R87|r87-v1|0\.87\.0", p.read_text(encoding="utf-8"))]
    assert not stale, stale
    assert json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"] == "0.88.0"
    # Never print matched secret values. Existing user playtest files are outside
    # this task; generated/untrusted tools and caches are not release sources.
    pattern = re.compile(r"sk-proj-[A-Za-z0-9_-]{20}|sk-[a-z0-9]{40}")
    hits, scanned = [], 0
    allowed = {".js", ".json", ".md", ".html", ".css", ".svg", ".py", ".yml", ".yaml", ".webmanifest", ".txt", ".log"}
    for p in ROOT.rglob("*"):
        rel = p.relative_to(ROOT)
        if any(part in {".git", "node_modules", "tools", "tmp"} for part in rel.parts) or rel.as_posix().startswith("docs/playtest/"):
            continue
        if not p.is_file() or p.suffix not in allowed:
            continue
        scanned += 1
        if pattern.search(p.read_text(encoding="utf-8", errors="replace")):
            hits.append(rel.as_posix())
    assert not hits, f"Secret scan hit files (values suppressed): {hits}"
    records = json.loads((OUT / "after-captures.json").read_text(encoding="utf-8"))
    store_records = [r for r in records if r["file"].replace("\\", "/").startswith("docs/store/screenshots/")]
    assert len(store_records) == 10
    for r in records:
        p = ROOT / r["file"]
        assert Image.open(p).size == (r["width"], r["height"])
        assert hashlib.sha256(p.read_bytes()).hexdigest() == r["sha256"]
        assert r["version"] == "R88"
        for source, digest in r["sourceHashes"].items():
            assert hashlib.sha256((ROOT / source).read_bytes()).hexdigest() == digest, source
    metadata = (ROOT / "docs/store/STORE_METADATA_ZH_TW.md").read_text(encoding="utf-8")
    names = {key: re.search(rf"^{key}：(.+)$", metadata, re.M).group(1) for key in ["名稱", "副標題"]}
    assert all(len(value) <= 30 for value in names.values()), names
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert not re.findall(r'<a\b[^>]*href=["\']https?://', html, re.I)
    assert not re.search(r">[^<]*(?:Lorem|敬請期待|Coming soon)[^<]*<", html, re.I)
    reviewer = json.loads((OUT / "reviewer-path.json").read_text(encoding="utf-8"))
    assert reviewer["status"] == "VERIFIED" and len(reviewer["results"]) == 12
    assert not reviewer["errors"] and not reviewer["externalRequests"]
    art = json.loads((ROOT / "docs/store/ART_ASSET_STATUS.json").read_text(encoding="utf-8"))
    assert art["status"] == "BLOCKED" and art["approved_new_runtime_assets"] == []
    assert all(not entry["runtime_enabled"] for entry in art["attempts"])
    report = {"status": "VERIFIED", "scope": "local R88 source/evidence only; store readiness has explicit blockers", "capturedAt": datetime.now(timezone.utc).isoformat(), "syntaxFiles": len(files), "diffCheck": True, "staleRuntimeVersions": stale, "secretScan": {"files": scanned, "hits": 0, "exclusions": [".git", "node_modules", "tools", "tmp", "pre-existing docs/playtest"]}, "screenshots": {"total": len(records), "store": len(store_records), "dimensionsAndHashesVerified": True}, "metadataLengths": {key: len(value) for key, value in names.items()}, "reviewerScenarios": len(reviewer["results"]), "artStatus": "BLOCKED: model provenance not gpt-image-2 attested"}
    (OUT / "repository-gates.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))

if __name__ == "__main__":
    main()
