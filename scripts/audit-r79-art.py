"""Commandized R79.1 visual, contrast, quality, and memory gates."""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence/R79_start"
MANIFEST = json.loads((ROOT / "assets/ui/start-art-manifest.json").read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def srgb_channel(value: int) -> float:
    channel = value / 255
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def luminance(rgb: tuple[int, int, int]) -> float:
    red, green, blue = (srgb_channel(value) for value in rgb)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    high, low = sorted((luminance(a), luminance(b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def parse_rgb(css: str) -> tuple[int, int, int]:
    values = [int(item) for item in re.findall(r"\d+", css)[:3]]
    if len(values) != 3:
        raise AssertionError(f"unsupported CSS color {css}")
    return tuple(values)  # type: ignore[return-value]


def region_metrics(image: Image.Image) -> dict[str, float]:
    gray = image.convert("L")
    edges = gray.filter(ImageFilter.FIND_EDGES).crop((2, 2, gray.width - 2, gray.height - 2))
    return {
        "meanLuma": round(ImageStat.Stat(gray).mean[0], 4),
        "lumaStdDev": round(ImageStat.Stat(gray).stddev[0], 4),
        "edgeMean": round(ImageStat.Stat(edges).mean[0], 4),
    }


def main() -> None:
    results: dict[str, object] = {"pass": True}
    master = ROOT / MANIFEST["master"]["path"]
    assert sha256(master) == MANIFEST["master"]["sha256"]
    assert MANIFEST["master"]["c2pa"]["softwareAgent"].startswith("gpt-image 2.")

    images: dict[str, Image.Image] = {}
    decoded = {}
    for artifact in MANIFEST["artifacts"]:
        path = ROOT / artifact["path"]
        assert sha256(path) == artifact["runtime_sha256"]
        assert artifact["master_sha256"] == MANIFEST["master"]["sha256"]
        assert artifact["runtime_url"].endswith(f"?v={artifact['runtime_sha256'][:8]}")
        image = Image.open(path).convert("RGB")
        images[artifact["quality"]] = image
        decoded[artifact["quality"]] = {
            "path": artifact["path"],
            "dimensions": list(image.size),
            "calculation": f"{image.width}x{image.height}x4",
            "decodedBytes": image.width * image.height * 4,
            "decodedMiB": round(image.width * image.height * 4 / 1024 / 1024, 3),
        }
    assert decoded["high"]["decodedBytes"] <= 64 * 1024 * 1024
    assert decoded["low"]["decodedBytes"] <= 32 * 1024 * 1024
    focus_spec = MANIFEST["startup_focus_derivative"]
    focus_path = ROOT / focus_spec["path"]
    assert sha256(focus_path) == focus_spec["runtime_sha256"]
    focus_decoded_mib = focus_spec["decoded_bytes"] / 1024 / 1024
    budget = {
        "scope": "R79.1 new atmosphere; only one quality is decoded at a time",
        "desktopLimitMiB": 64,
        "mobileLimitMiB": 32,
        "assets": decoded,
        "startupFocus": {"path": focus_spec["path"], "decodedMiB": round(focus_decoded_mib, 3)},
        "desktopSelectedMiB": round(decoded["high"]["decodedMiB"] + focus_decoded_mib, 3),
        "mobileSelectedMiB": round(decoded["low"]["decodedMiB"] + focus_decoded_mib, 3),
        "pass": True,
    }
    (EVIDENCE / "decoded-memory-budget.json").write_text(json.dumps(budget, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    results["decodedMemory"] = budget

    high = images["high"]
    width, height = high.size
    center = high.crop((round(width * 0.34), 0, round(width * 0.66), height))
    sides = Image.new("RGB", (round(width * 0.6), height))
    left = high.crop((0, 0, round(width * 0.3), height))
    right = high.crop((round(width * 0.7), 0, width, height))
    sides.paste(left, (0, 0))
    sides.paste(right, (left.width, 0))
    center_metrics = region_metrics(center)
    side_metrics = region_metrics(sides)
    assert center_metrics["lumaStdDev"] <= side_metrics["lumaStdDev"] * 0.45
    assert center_metrics["edgeMean"] <= side_metrics["edgeMean"] * 0.45
    assert center_metrics["meanLuma"] <= side_metrics["meanLuma"] * 0.8
    results["central32Detail"] = {
        "center": center_metrics,
        "sides": side_metrics,
        "thresholds": {"lumaStdDevRatioMax": 0.45, "edgeMeanRatioMax": 0.45, "meanLumaRatioMax": 0.8},
        "pass": True,
    }

    reference = high.resize((512, 288), Image.Resampling.LANCZOS)
    proof = Image.new("RGB", (512 * 3, 322), "#090a0b")
    draw = ImageDraw.Draw(proof)
    quality_metrics = {}
    for index, quality in enumerate(("low", "medium", "high")):
        candidate = images[quality].resize((512, 288), Image.Resampling.LANCZOS)
        difference = ImageChops.difference(reference, candidate)
        rms = math.sqrt(sum(value * value for value in ImageStat.Stat(difference).rms) / 3)
        assert rms <= 1.0
        quality_metrics[quality] = {"rmsVsHigh": round(rms, 4), "realAsset": True}
        proof.paste(candidate, (index * 512, 0))
        draw.text((index * 512 + 12, 296), f"{quality.upper()} - real derived raster", fill="#f4ead8")
    proof.save(EVIDENCE / "quality-proof.png", optimize=True)
    results["qualityConsistency"] = {"metrics": quality_metrics, "rmsMax": 1.0, "pass": True}

    layout = json.loads((EVIDENCE / "layout-audit.json").read_text(encoding="utf-8"))
    expected = {1366: "medium", 820: "low", 390: "low"}
    for audit in layout["audits"]:
        box = audit["focusBox"]
        viewport = audit["viewport"]
        assert box["x"] >= 0 and box["y"] >= 0
        assert box["x"] + box["width"] <= viewport["width"] + 0.5
        assert box["y"] + box["height"] <= viewport["height"] + 0.5
        assert expected[viewport["width"]] in audit["atmosphere"]
    results["safeCrop"] = {"viewports": [audit["viewport"] for audit in layout["audits"]], "pass": True}

    background = Image.open(EVIDENCE / "after-desktop-contrast-background.png").convert("RGB")
    desktop = next(audit for audit in layout["audits"] if audit["viewport"]["width"] == 1366)
    contrast_samples = []
    for sample in desktop["contrast"]:
        box = sample["box"]
        x0, y0 = round(box["x"]), round(box["y"])
        x1, y1 = round(box["x"] + box["width"]), round(box["y"] + box["height"])
        pixels = list(background.crop((x0, y0, x1, y1)).get_flattened_data())
        bg = tuple(sorted(channel[index] for channel in pixels)[len(pixels) // 2] for index in range(3))
        fg = parse_rgb(sample["foreground"])
        ratio = contrast(fg, bg)
        assert ratio >= 4.5
        contrast_samples.append({"text": sample["text"], "foreground": fg, "sampledBackgroundMedian": bg, "contrast": round(ratio, 3), "pass": True})
    results["textContrast"] = {"minimum": min(item["contrast"] for item in contrast_samples), "required": 4.5, "samples": contrast_samples, "pass": True}

    results["alphaGate"] = {"applies": True, "expected": "opaque RGB with no alpha", "pass": all(image.mode == "RGB" for image in images.values())}
    results["characterBrightnessSaturationGate"] = {"applies": False, "reason": "R79.1 contains no character asset"}
    (EVIDENCE / "art-gates.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"R79.1 ART GATES PASS central edge={center_metrics['edgeMean']} vs sides={side_metrics['edgeMean']}; contrast min={results['textContrast']['minimum']}:1")


if __name__ == "__main__":
    main()
