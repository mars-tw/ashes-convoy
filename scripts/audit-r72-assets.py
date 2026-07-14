"""R72 asset QA using the same Pillow measurement family as the R71 audit."""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[1]

ENEMIES = {
    "tar_brute": {
        "static": "assets/zombies/tar_brute.png",
        "atlas": "assets/enemies/tar_brute_walk.png",
        "frame": (56, 68),
        "edge_min": 0.24,
    },
    "shield_husk": {
        "static": "assets/zombies/shield_husk.png",
        "atlas": "assets/enemies/shield_husk_walk.png",
        "frame": (48, 64),
        "edge_min": 0.24,
    },
    "swarm_mite": {
        "static": "assets/zombies/swarm_mite.png",
        "atlas": "assets/enemies/swarm_mite_walk.png",
        "frame": (44, 44),
        "edge_min": 0.24,
    },
}

CUTOUTS = [
    "assets/vehicles/xi_gunner.png",
    *(spec[key] for spec in ENEMIES.values() for key in ("static", "atlas")),
]

errors: list[str] = []


def load(relative: str) -> Image.Image:
    return Image.open(ROOT / relative).convert("RGBA")


def corner_alpha(image: Image.Image) -> tuple[int, int, int, int]:
    return (
        image.getpixel((0, 0))[3],
        image.getpixel((image.width - 1, 0))[3],
        image.getpixel((0, image.height - 1))[3],
        image.getpixel((image.width - 1, image.height - 1))[3],
    )


def chroma_bleed(image: Image.Image) -> float:
    opaque = [pixel for pixel in image.get_flattened_data() if pixel[3] >= 16]
    if not opaque:
        return 0.0
    keyed = 0
    for red, green, blue, _alpha in opaque:
        magenta = red > 180 and blue > 180 and green < 140
        green_key = green > 180 and green > red * 1.35 and green > blue * 1.35
        keyed += int(magenta or green_key)
    return keyed / len(opaque)


def mean_rgb(image: Image.Image) -> tuple[float, float, float]:
    opaque = [pixel for pixel in image.get_flattened_data() if pixel[3] >= 32]
    return tuple(sum(pixel[channel] for pixel in opaque) / len(opaque) for channel in range(3))


def rgb_delta(first: Image.Image, second: Image.Image) -> float:
    a = mean_rgb(first)
    b = mean_rgb(second)
    return math.sqrt(sum((left - right) ** 2 for left, right in zip(a, b)))


def silhouette_edge_density(image: Image.Image) -> float:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return 0.0
    cropped = alpha.crop(bbox)
    width = max(1, round(cropped.width * 32 / cropped.height))
    reduced = cropped.resize((width, 32), Image.Resampling.LANCZOS)
    edges = reduced.filter(ImageFilter.FIND_EDGES)
    return sum(value >= 64 for value in edges.get_flattened_data()) / (width * 32)


def pose_difference(atlas: Image.Image, frame_width: int, frame_height: int) -> float:
    frames = [
        atlas.crop((index * frame_width, 0, (index + 1) * frame_width, frame_height)).getchannel("A")
        for index in range(4)
    ]
    differences: list[float] = []
    for left in range(4):
        for right in range(left + 1, 4):
            diff = ImageChops.difference(frames[left], frames[right])
            differences.append(sum(diff.get_flattened_data()) / (255 * frame_width * frame_height))
    return sum(differences) / len(differences)


print("R72 Pillow asset audit")
print("cutout | corner alpha | chroma bleed")
for relative in CUTOUTS:
    image = load(relative)
    corners = corner_alpha(image)
    bleed = chroma_bleed(image)
    print(f"{relative} | {corners} | {bleed:.3f}")
    if corners != (0, 0, 0, 0):
        errors.append(f"{relative}: corners must be transparent")
    if bleed != 0:
        errors.append(f"{relative}: chroma bleed must be zero, got {bleed:.6f}")

print("enemy | mean RGB delta | 32px edge density | pose alpha difference")
for enemy, spec in ENEMIES.items():
    static = load(spec["static"])
    atlas = load(spec["atlas"])
    delta = rgb_delta(static, atlas)
    edge = silhouette_edge_density(static)
    difference = pose_difference(atlas, *spec["frame"])
    print(f"{enemy} | {delta:.3f} | {edge:.3f} | {difference:.3f}")
    if delta >= 8:
        errors.append(f"{enemy}: static/atlas RGB delta {delta:.3f} >= 8")
    if edge < spec["edge_min"]:
        errors.append(f"{enemy}: edge density {edge:.3f} < {spec['edge_min']:.2f}")
    if difference < 0.08:
        errors.append(f"{enemy}: four walk silhouettes are insufficiently distinct ({difference:.3f})")

budgets = {
    "assets/vehicles/xi_gunner.png": ((512, 384), 250),
    "assets/ui/start.png": ((820, 1728), 500),
    "assets/cover.png": ((1280, 640), 700),
    "assets/env/land.png": ((780, 1560), 350),
    "assets/env/air.png": ((780, 1560), 350),
    "assets/env/sea.png": ((780, 1560), 350),
    "assets/env/space.png": ((780, 1560), 350),
}
print("asset | dimensions | KiB | budget KiB")
for relative, (expected_size, budget) in budgets.items():
    actual_size = Image.open(ROOT / relative).size
    size = (ROOT / relative).stat().st_size / 1024
    print(f"{relative} | {actual_size[0]}x{actual_size[1]} | {size:.1f} | {budget}")
    if actual_size != expected_size:
        errors.append(f"{relative}: expected {expected_size}, got {actual_size}")
    if size > budget:
        errors.append(f"{relative}: {size:.1f} KiB exceeds {budget} KiB")

if errors:
    print("R72 asset audit FAIL", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("R72 asset audit PASS")
