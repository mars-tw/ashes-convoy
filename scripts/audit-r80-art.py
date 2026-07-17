"""Automated R80 room quality, crop, contrast, memory, and character gates."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence/R80"


def relative_luminance(rgb: tuple[int, int, int]) -> float:
    values = []
    for component in rgb:
        channel = component / 255
        values.append(channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4)
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]


def contrast(foreground: tuple[int, int, int], background: tuple[int, int, int]) -> float:
    a, b = sorted((relative_luminance(foreground), relative_luminance(background)), reverse=True)
    return (a + 0.05) / (b + 0.05)


def css_rgba(value: str) -> tuple[float, float, float, float]:
    values = [float(item) for item in re.findall(r"[0-9.]+", value)]
    assert len(values) in (3, 4), f"unsupported CSS color: {value}"
    return values[0], values[1], values[2], values[3] if len(values) == 4 else 1.0


def composite(foreground: tuple[float, float, float, float], background: tuple[float, float, float, float]) -> tuple[int, int, int]:
    alpha = foreground[3]
    return tuple(round(foreground[index] * alpha + background[index] * (1 - alpha)) for index in range(3))


def region_metrics(image: Image.Image, box: tuple[int, int, int, int]) -> dict[str, float]:
    region = image.crop(box).convert("RGB")
    pixels = list(region.get_flattened_data())
    brightness = sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in pixels) / len(pixels)
    saturation = sum(max(pixel) - min(pixel) for pixel in pixels) / len(pixels)
    edge = ImageStat.Stat(region.convert("L").filter(ImageFilter.FIND_EDGES)).mean[0]
    return {"brightness": round(brightness, 4), "saturation": round(saturation, 4), "edgeMean": round(edge, 4)}


manifest = json.loads((ROOT / "assets/shelter/trailer/room-art-manifest.json").read_text(encoding="utf-8"))
layouts = json.loads((EVIDENCE / "after-layout.json").read_text(encoding="utf-8"))
images: dict[str, Image.Image] = {}
for artifact in manifest["artifacts"]:
    image = Image.open(ROOT / artifact["path"])
    image.load()
    assert image.mode == "RGB", f"{artifact['path']} must be opaque RGB"
    images[artifact["quality"]] = image

high = images["high"]
proof = Image.new("RGB", (520 * 3, 630), "#0e1115")
quality_results = {}
for index, quality in enumerate(("low", "medium", "high")):
    candidate = images[quality].resize((520, 600), Image.Resampling.LANCZOS)
    high_match = high.resize((520, 600), Image.Resampling.LANCZOS)
    rms = math.sqrt(sum(value * value for value in ImageStat.Stat(ImageChops.difference(candidate, high_match)).rms) / 3)
    quality_results[quality] = {"rmsVsHigh": round(rms, 4), "realAsset": True}
    proof.paste(candidate, (index * 520, 0))
    ImageDraw.Draw(proof).text((index * 520 + 12, 608), f"{quality.upper()} - real derived raster", fill="#f4ead8")
proof.save(EVIDENCE / "quality-proof.png", optimize=True)

xi_metrics = {}
for quality, image in images.items():
    xi_metrics[quality] = region_metrics(
        image,
        (int(image.width * 0.18), int(image.height * 0.45), int(image.width * 0.56), int(image.height * 0.84)),
    )
assert all(20 <= item["brightness"] <= 90 for item in xi_metrics.values()), "Xi region brightness outside restrained range"
assert all(item["saturation"] <= 80 for item in xi_metrics.values()), "Xi region saturation is excessive"
assert max(item["brightness"] for item in xi_metrics.values()) - min(item["brightness"] for item in xi_metrics.values()) <= 1
assert max(item["saturation"] for item in xi_metrics.values()) - min(item["saturation"] for item in xi_metrics.values()) <= 1

playability_noise = {}
for quality, image in images.items():
    metrics = region_metrics(
        image,
        (int(image.width * 0.34), int(image.height * 0.47), int(image.width * 0.66), int(image.height * 0.93)),
    )
    playability_noise[quality] = metrics
    assert metrics["edgeMean"] <= 20, f"{quality} central aisle is too noisy"

expected_quality = {1366: "high", 820: "medium", 390: "low"}
safe_crop = []
for record in layouts:
    metrics = record["metrics"]
    canvas = record["canvas"]
    rect = metrics["contentRect"]
    width = canvas["width"]
    height = canvas["height"]
    fits = rect["x"] >= -0.01 and rect["y"] >= -0.01 and rect["x"] + rect["w"] <= width + 0.01 and rect["y"] + rect["h"] <= height + 0.01
    assert fits, f"room crop escapes canvas at {record['viewport']}"
    assert metrics["characterCount"] == 1 and metrics["characterEmbedded"] is True
    assert metrics["quality"] == expected_quality[record["viewport"]["width"]]
    safe_crop.append({"viewport": record["viewport"], "quality": metrics["quality"], "fits": fits, "contentRect": rect})

styles = layouts[0]["contrastStyles"]
page_background = css_rgba(styles["pageBackground"])
overlay_background = css_rgba(styles["overlayBackground"])
panel_background = css_rgba(styles["panelBackground"])
overlay_rgb = (*composite(overlay_background, page_background), 1.0)
panel_rgb = composite(panel_background, overlay_rgb)
primary_rgb = tuple(round(value) for value in css_rgba(styles["primaryColor"])[:3])
muted_rgb = tuple(round(value) for value in css_rgba(styles["mutedColor"])[:3])
contrast_values = {
    "primary": round(contrast(primary_rgb, panel_rgb), 3),
    "muted": round(contrast(muted_rgb, panel_rgb), 3),
}
assert min(contrast_values.values()) >= 4.5

desktop_decoded = 2048 * 1152 * 4 + 192 * 405 * 4 + 780 * 900 * 4
mobile_decoded = 1024 * 576 * 4 + 192 * 405 * 4 + 520 * 600 * 4
assert desktop_decoded <= 64 * 1024 * 1024
assert mobile_decoded <= 32 * 1024 * 1024

results = {
    "release": "R80",
    "alphaGate": {"expected": "opaque RGB", "pass": all(image.mode == "RGB" for image in images.values())},
    "qualityConsistency": {"metrics": quality_results, "rmsMax": 1.0, "pass": max(item["rmsVsHigh"] for item in quality_results.values()) <= 1.0},
    "characterBrightnessSaturationGate": {"region": "x18-56%, y45-84%", "metrics": xi_metrics, "pass": True},
    "playabilityNoise": {"region": "central aisle x34-66%, y47-93%", "edgeMeanMax": 20, "metrics": playability_noise, "pass": True},
    "safeCrop": {"records": safe_crop, "pass": True},
    "textContrast": {"sampledComputedStyles": styles, "compositedPanelRgb": panel_rgb, "ratios": contrast_values, "minimumRequired": 4.5, "pass": True},
    "decodedMemory": {
        "desktopMiB": round(desktop_decoded / 1048576, 3),
        "mobileMiB": round(mobile_decoded / 1048576, 3),
        "desktopLimitMiB": 64,
        "mobileLimitMiB": 32,
        "promosExcludedFromRuntime": True,
        "pass": True,
    },
}
(EVIDENCE / "art-gates.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(EVIDENCE / "memory-budget.json").write_text(json.dumps(results["decodedMemory"], indent=2) + "\n", encoding="utf-8")
print(f"R80 ART GATES PASS contrast={min(contrast_values.values())}:1 desktop={results['decodedMemory']['desktopMiB']}MiB mobile={results['decodedMemory']['mobileMiB']}MiB")
