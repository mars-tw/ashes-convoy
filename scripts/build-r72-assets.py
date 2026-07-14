"""Bake the R72 image-generation masters into the shipped runtime interfaces.

The keyed masters live in tools/asset_sources/imagegen_r72 (gitignored), just
like the R71 production masters.  This script performs the single Lanczos
downsample required by the art contract and never manufactures animation by
moving or scaling one flat pose: the four walk frames come from four separate
generated body poses.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "tools" / "asset_sources" / "imagegen_r72"
ENV_SOURCES = SOURCES / "original" / "assets" / "env"
ZOMBIES = ROOT / "assets" / "zombies"
ENEMIES = ROOT / "assets" / "enemies"
VEHICLES = ROOT / "assets" / "vehicles"
UI = ROOT / "assets" / "ui"
ENV = ROOT / "assets" / "env"


def rgba(name: str) -> Image.Image:
    path = SOURCES / name
    if not path.exists():
        raise FileNotFoundError(f"missing R72 keyed master: {path}")
    return Image.open(path).convert("RGBA")


def alpha_crop(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("pose cell has no opaque pixels")
    return image.crop(bbox)


def pose_cells(master: Image.Image, count: int) -> list[Image.Image]:
    cells: list[Image.Image] = []
    for index in range(count):
        left = round(master.width * index / count)
        right = round(master.width * (index + 1) / count)
        cells.append(alpha_crop(master.crop((left, 0, right, master.height))))
    return cells


def fit_pose(image: Image.Image, size: tuple[int, int], padding: int) -> Image.Image:
    max_width = size[0] - padding * 2
    max_height = size[1] - padding * 2
    ratio = min(max_width / image.width, max_height / image.height)
    resized = image.resize(
        (max(1, round(image.width * ratio)), max(1, round(image.height * ratio))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size)
    canvas.alpha_composite(
        resized,
        ((size[0] - resized.width) // 2, size[1] - padding - resized.height),
    )
    return canvas


def build_enemy(
    source: str,
    static_name: str,
    static_size: tuple[int, int],
    walk_name: str,
    frame_size: tuple[int, int],
) -> None:
    cells = pose_cells(rgba(source), 5)
    fit_pose(cells[0], static_size, padding=max(4, min(static_size) // 24)).save(
        ZOMBIES / static_name,
        optimize=True,
        compress_level=9,
    )

    # One scale for all four independently drawn poses.  This retains actual
    # stride/compression differences instead of normalising them into bobbing.
    walk = cells[1:]
    padding = 1
    scale = min(
        (frame_size[0] - padding * 2) / max(cell.width for cell in walk),
        (frame_size[1] - padding * 2) / max(cell.height for cell in walk),
    )
    sheet = Image.new("RGBA", (frame_size[0] * 4, frame_size[1]))
    for index, cell in enumerate(walk):
        frame = cell.resize(
            (max(1, round(cell.width * scale)), max(1, round(cell.height * scale))),
            Image.Resampling.LANCZOS,
        )
        x = index * frame_size[0] + (frame_size[0] - frame.width) // 2
        y = frame_size[1] - padding - frame.height
        sheet.alpha_composite(frame, (x, y))
    sheet.save(ENEMIES / walk_name, optimize=True, compress_level=9)


def build_gunner() -> None:
    cells = pose_cells(rgba("xi_gunner_master-clean.png"), 2)
    frame_size = (256, 384)
    padding = 8
    scale = min(
        (frame_size[0] - padding * 2) / max(cell.width for cell in cells),
        (frame_size[1] - padding * 2) / max(cell.height for cell in cells),
    )
    sheet = Image.new("RGBA", (512, 384))
    for index, cell in enumerate(cells):
        frame = cell.resize(
            (max(1, round(cell.width * scale)), max(1, round(cell.height * scale))),
            Image.Resampling.LANCZOS,
        )
        x = index * frame_size[0] + (frame_size[0] - frame.width) // 2
        y = frame_size[1] - padding - frame.height
        sheet.alpha_composite(frame, (x, y))
    sheet.save(VEHICLES / "xi_gunner.png", optimize=True, compress_level=9)


def save_palette(image: Image.Image, path: Path, colors: int) -> None:
    image.convert("RGB").quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).save(path, optimize=True, compress_level=9)


def pixel_finish(image: Image.Image, size: tuple[int, int], colors: int) -> Image.Image:
    """Downsample once, then nearest-neighbour scale to the fixed runtime API."""
    half = image.resize((size[0] // 2, size[1] // 2), Image.Resampling.LANCZOS)
    return half.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).resize(size, Image.Resampling.NEAREST)


def build_key_art() -> None:
    start = Image.open(SOURCES / "start_master.png").convert("RGB")
    start = ImageOps.fit(start, (820, 1728), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    pixel_finish(start, (820, 1728), colors=96).save(UI / "start.png", optimize=True, compress_level=9)

    cover = Image.open(SOURCES / "cover_master.png").convert("RGB")
    cover = ImageOps.fit(cover, (1280, 640), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    save_palette(cover, ROOT / "assets" / "cover.png", colors=192)


def compress_environment_tiles() -> None:
    # Mechanical palette optimisation only; the additional R72 depth and
    # landmarks are rendered by the deterministic Canvas parallax layer.
    for name in ("land.png", "air.png", "sea.png", "space.png"):
        path = ENV / name
        image = Image.open(ENV_SOURCES / name).convert("RGB")
        pixel_finish(image, (780, 1560), colors=96).save(path, optimize=True, compress_level=9)


build_enemy(
    "tar_brute_pose_master-clean.png",
    "tar_brute.png",
    (190, 190),
    "tar_brute_walk.png",
    (56, 68),
)
build_enemy(
    "shield_husk_pose_master-clean.png",
    "shield_husk.png",
    (160, 240),
    "shield_husk_walk.png",
    (48, 64),
)
build_enemy(
    "swarm_mite_pose_master-clean.png",
    "swarm_mite.png",
    (140, 170),
    "swarm_mite_walk.png",
    (44, 44),
)
build_gunner()
build_key_art()
compress_environment_tiles()

print("Built R72 canonical Xi, key art, true-pose enemies, and compact environment tiles")
