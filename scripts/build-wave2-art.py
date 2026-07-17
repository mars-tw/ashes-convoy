"""Deterministically derive Wave 2 runtime/promo images from C2PA masters."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RESAMPLE = Image.Resampling.LANCZOS


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def crop_to_ratio(image: Image.Image, width: int, height: int) -> tuple[Image.Image, tuple[int, int, int, int]]:
    target = width / height
    source = image.width / image.height
    if source > target:
        crop_width = round(image.height * target)
        left = (image.width - crop_width) // 2
        box = (left, 0, left + crop_width, image.height)
    else:
        crop_height = round(image.width / target)
        top = (image.height - crop_height) // 2
        box = (0, top, image.width, top + crop_height)
    return image.crop(box), box


def derive(master: Path, output: Path, size: tuple[int, int]) -> dict[str, object]:
    with Image.open(master) as source:
        source.load()
        rgb = source.convert("RGB")
        cropped, box = crop_to_ratio(rgb, *size)
        runtime = cropped.resize(size, RESAMPLE)
        output.parent.mkdir(parents=True, exist_ok=True)
        runtime.save(output, format="PNG", optimize=True, compress_level=9)
    return {
        "path": output.relative_to(ROOT).as_posix(),
        "dimensions": f"{size[0]}x{size[1]}",
        "sha256": sha256(output),
        "bytes": output.stat().st_size,
        "decodedBytes": size[0] * size[1] * 4,
        "cropBox": list(box),
        "resample": "Pillow LANCZOS",
        "mode": "RGB",
    }


def derive_start_focus() -> dict[str, object]:
    source = ROOT / "assets/ui/start.png"
    output = ROOT / "assets/ui/start-focus-low.png"
    with Image.open(source) as image:
        rgb = image.convert("RGB")
        resized = rgb.resize((192, 405), RESAMPLE)
        indexed = resized.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        indexed.save(output, format="PNG", optimize=True, compress_level=9)
    return {
        "path": output.relative_to(ROOT).as_posix(),
        "dimensions": "192x405",
        "sha256": sha256(output),
        "bytes": output.stat().st_size,
        "decodedBytes": 192 * 405 * 4,
        "source": source.relative_to(ROOT).as_posix(),
        "sourceSha256": sha256(source),
        "steps": "RGB -> Pillow LANCZOS 192x405 -> MEDIANCUT 64 colors, dither NONE -> optimized PNG",
    }


def build_start() -> dict[str, object]:
    master = ROOT / "docs/evidence/R79_start/masters/start-atmosphere-r79-master.png"
    outputs = [
        derive(master, ROOT / "assets/ui/start-atmosphere-r79.png", (2048, 1152)),
        derive(master, ROOT / "assets/ui/start-atmosphere-r79-medium.png", (1536, 864)),
        derive(master, ROOT / "assets/ui/start-atmosphere-r79-low.png", (1024, 576)),
    ]
    return {
        "master": master.relative_to(ROOT).as_posix(),
        "masterSha256": sha256(master),
        "outputs": outputs,
        "startupFocus": derive_start_focus(),
    }


def build_r80() -> dict[str, object]:
    evidence = ROOT / "docs/evidence/R80"
    master_dir = evidence / "masters"
    room_master = master_dir / "trailer-room-r80-master.png"
    room_outputs = [
        derive(room_master, ROOT / "assets/shelter/trailer/base_escape_pod.png", (780, 900)),
        derive(room_master, ROOT / "assets/shelter/trailer/base_escape_pod-medium.png", (650, 750)),
        derive(room_master, ROOT / "assets/shelter/trailer/base_escape_pod-low.png", (520, 600)),
    ]
    promos = {}
    for environment in ("land", "air", "sea", "space"):
        master = master_dir / f"promo-{environment}-r80-master.png"
        output = ROOT / f"docs/promo/ashes-convoy-{environment}-r80.png"
        promos[environment] = {
            "master": master.relative_to(ROOT).as_posix(),
            "masterSha256": sha256(master),
            "output": derive(master, output, (2048, 1152)),
        }
    return {
        "room": {
            "master": room_master.relative_to(ROOT).as_posix(),
            "masterSha256": sha256(room_master),
            "outputs": room_outputs,
        },
        "promos": promos,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("target", choices=["start", "r80"])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = build_start() if args.target == "start" else build_r80()
    report = {"pipeline": "scripts/build-wave2-art.py", "target": args.target, "result": result}
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        output = args.output if args.output.is_absolute() else ROOT / args.output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
