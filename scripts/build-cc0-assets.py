"""Build the compact R70 runtime atlases from downloaded CC0 source packs.

Sources are intentionally kept under tools/asset_sources/ (gitignored). Run this
after downloading the archives documented in CREDITS.md. Only the derived PNGs
written to assets/ are shipped with the game.
"""

from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "tools" / "asset_sources"
OGA = SOURCES / "oga_characters_parts" / "PartsSpriteSheetVersion1" / "PartsForSheet"
KENNEY = SOURCES / "kenney_top_down_tanks_remastered" / "PNG" / "Default size"
ZOMBIES = ROOT / "assets" / "zombies"
OUT = ROOT / "assets" / "enemies"
ENV_OUT = ROOT / "assets" / "env"
OUT.mkdir(parents=True, exist_ok=True)


def rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def color_layer(name: str, color: tuple[int, int, int]) -> Image.Image:
    source = rgba(OGA / name)
    alpha = source.getchannel("A")
    shade = ImageEnhance.Contrast(source.convert("L")).enhance(1.15)
    colored = Image.new("RGBA", source.size, (*color, 0))
    # Preserve Curt's grayscale pixel shading instead of flattening the parts.
    shadow = Image.new("RGBA", source.size, (35, 25, 20, 0))
    colored.putalpha(alpha)
    shadow.putalpha(ImageChops.multiply(alpha, ImageChops.invert(shade)).point(lambda p: p // 3))
    return Image.alpha_composite(colored, shadow)


def compose_oga_walk(output: str, body: str, hair: str, palette: dict[str, tuple[int, int, int]]) -> None:
    frames: list[Image.Image] = []
    for step in (1, 2, 3, 2):
        frame = Image.new("RGBA", (40, 40))
        layers = [
            color_layer(f"Legs-Front{step}.png", palette["legs"]),
            color_layer(f"Feet-Front-{step}.png", palette["feet"]),
            color_layer(f"{body}Body-Front.png", palette["body"]),
            color_layer("Head-Front.png", palette["skin"]),
            color_layer("ZombieArms-Front.png", palette["skin"]),
            color_layer("ZombieEyes-Front.png", palette["eyes"]),
            color_layer("ZombieNose-Front.png", palette["wound"]),
            color_layer(f"{hair}-Front.png", palette["hair"]),
        ]
        for layer in layers:
            frame = Image.alpha_composite(frame, layer)
        frames.append(frame)
    sheet = Image.new("RGBA", (160, 40))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 40, 0))
    sheet.save(OUT / output, optimize=True)


def fit_source(source: Image.Image, size: tuple[int, int], padding: int = 2) -> Image.Image:
    bbox = source.getchannel("A").getbbox()
    if bbox:
        source = source.crop(bbox)
    max_w, max_h = size[0] - padding * 2, size[1] - padding * 2
    ratio = min(max_w / source.width, max_h / source.height)
    resized = source.resize((max(1, round(source.width * ratio)), max(1, round(source.height * ratio))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size)
    canvas.alpha_composite(resized, ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2))
    return canvas


def animate_existing(source_name: str, output: str, size: tuple[int, int]) -> None:
    base = fit_source(rgba(ZOMBIES / source_name), size)
    poses = ((-1, 1, 0.97, 1.0), (0, 0, 1.0, 0.98), (1, 1, 0.97, 1.0), (0, 0, 1.0, 0.98))
    sheet = Image.new("RGBA", (size[0] * len(poses), size[1]))
    for index, (dx, dy, sx, sy) in enumerate(poses):
        posed = base.resize((max(1, round(size[0] * sx)), max(1, round(size[1] * sy))), Image.Resampling.BICUBIC)
        frame = Image.new("RGBA", size)
        frame.alpha_composite(posed, ((size[0] - posed.width) // 2 + dx, (size[1] - posed.height) // 2 + dy))
        sheet.alpha_composite(frame, (index * size[0], 0))
    sheet.save(OUT / output, optimize=True)


def build_armored_brute() -> None:
    tracks = rgba(KENNEY / "tracksLarge.png")
    hull = rgba(KENNEY / "tankBody_darkLarge.png")
    barrel = rgba(KENNEY / "tankDark_barrel3.png")
    cell = (56, 68)
    sheet = Image.new("RGBA", (cell[0] * 4, cell[1]))
    for index, tread_shift in enumerate((0, 1, 0, -1)):
        frame = Image.new("RGBA", cell)
        frame.alpha_composite(tracks, ((cell[0] - tracks.width) // 2, (cell[1] - tracks.height) // 2 + 7 + tread_shift))
        frame.alpha_composite(hull, ((cell[0] - hull.width) // 2, (cell[1] - hull.height) // 2 + 5))
        recoil = 1 if index in (1, 3) else 0
        frame.alpha_composite(barrel, ((cell[0] - barrel.width) // 2, 7 + recoil))
        sheet.alpha_composite(frame, (index * cell[0], 0))
    sheet.save(OUT / "kenney_armored_brute_walk.png", optimize=True)


def wasteland_tint(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if not a:
                continue
            lum = (r * 3 + g * 5 + b * 2) // 10
            pixels[x, y] = (min(255, int(lum * 1.05 + 34)), min(255, int(lum * 0.73 + 25)), min(255, int(lum * 0.48 + 19)), a)
    return image


def build_road_debris() -> None:
    names = ("barricadeMetal.png", "barricadeWood.png", "barrelRust_top.png", "sandbagBrown.png")
    sheet = Image.new("RGBA", (128, 32))
    for index, name in enumerate(names):
        item = fit_source(wasteland_tint(rgba(KENNEY / name)), (32, 32), padding=1)
        sheet.alpha_composite(item, (index * 32, 0))
    sheet.save(ENV_OUT / "kenney_road_debris.png", optimize=True)


compose_oga_walk(
    "oga_shambler_walk.png",
    "Male",
    "Balding",
    {"legs": (72, 62, 50), "feet": (46, 37, 30), "body": (119, 72, 45), "skin": (117, 126, 83), "eyes": (244, 190, 79), "wound": (98, 37, 31), "hair": (47, 38, 31)},
)
compose_oga_walk(
    "oga_runner_walk.png",
    "Female",
    "Spiked",
    {"legs": (63, 51, 47), "feet": (40, 34, 31), "body": (132, 62, 44), "skin": (135, 137, 84), "eyes": (248, 173, 59), "wound": (104, 31, 27), "hair": (54, 42, 32)},
)
compose_oga_walk(
    "oga_spitter_walk.png",
    "Male",
    "Dreads",
    {"legs": (69, 55, 43), "feet": (43, 35, 29), "body": (92, 77, 47), "skin": (101, 125, 72), "eyes": (224, 199, 84), "wound": (88, 39, 29), "hair": (52, 37, 28)},
)

animate_existing("bloater.png", "bloater_walk.png", (52, 52))
animate_existing("shield_husk.png", "shield_husk_walk.png", (48, 64))
animate_existing("swarm_mite.png", "swarm_mite_walk.png", (44, 44))
animate_existing("void_wraith.png", "void_wraith_walk.png", (48, 64))
animate_existing("titan.png", "titan_walk.png", (88, 80))
build_armored_brute()
build_road_debris()

print("Built R70 CC0 animation and road-detail atlases")
