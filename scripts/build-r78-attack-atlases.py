"""Bake R78 image-generated attack masters into runtime atlases.

The cleaned masters live in the gitignored
``tools/asset_sources/imagegen_r78`` provenance archive.  Every master contains
four independently painted poses in one row: anticipation A, anticipation B,
impact, and recovery.  Runtime atlases preserve the owning R73 walk frame size.
No frame is produced by translating, rotating, scaling, bobbing, or squashing a
previous frame; resizing here only performs the one-time asset export shared by
all independently authored poses.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "tools" / "asset_sources" / "imagegen_r78"
ENEMIES = ROOT / "assets" / "enemies"
VEHICLES = ROOT / "assets" / "vehicles"


@dataclass(frozen=True)
class AttackSpec:
    source: str
    output: Path
    frame_size: tuple[int, int]
    padding: int = 1


SPECS = {
    "shambler": AttackSpec("shambler_attack_rgba.png", ENEMIES / "oga_shambler_attack.png", (40, 40)),
    "runner": AttackSpec("runner_attack_rgba.png", ENEMIES / "oga_runner_attack.png", (40, 40)),
    "bloater": AttackSpec("bloater_attack_rgba.png", ENEMIES / "bloater_attack.png", (52, 52)),
    "spore_spitter": AttackSpec("spore_spitter_attack_rgba.png", ENEMIES / "oga_spitter_attack.png", (40, 40)),
    "shield_husk": AttackSpec("shield_husk_attack_rgba.png", ENEMIES / "shield_husk_attack.png", (48, 64)),
    "swarm_mite": AttackSpec("swarm_mite_attack_rgba.png", ENEMIES / "swarm_mite_attack.png", (44, 44)),
    "tar_brute": AttackSpec("tar_brute_attack_rgba.png", ENEMIES / "tar_brute_attack.png", (56, 68)),
    "void_wraith": AttackSpec("void_wraith_attack_rgba.png", ENEMIES / "void_wraith_attack.png", (48, 64)),
    "boss_hive_titan": AttackSpec("boss_hive_titan_attack_rgba.png", ENEMIES / "titan_attack.png", (88, 80)),
    "xi_gunner": AttackSpec("xi_gunner_attack_rgba.png", VEHICLES / "xi_gunner_attack.png", (256, 384), 2),
}


def load_pose_cells(path: Path, count: int = 4) -> list[Image.Image]:
    if not path.exists():
        raise FileNotFoundError(f"missing cleaned R78 image-gen master: {path}")
    master = Image.open(path).convert("RGBA")
    if master.getchannel("A").getextrema()[0] != 0:
        raise ValueError(f"{path.name} must contain transparent background pixels")
    cells: list[Image.Image] = []
    for index in range(count):
        left = round(master.width * index / count)
        right = round(master.width * (index + 1) / count)
        cell = master.crop((left, 0, right, master.height))
        bbox = cell.getchannel("A").getbbox()
        if not bbox:
            raise ValueError(f"{path.name} pose {index} has no visible pixels")
        cells.append(cell.crop(bbox))
    return cells


def pack_atlas(poses: list[Image.Image], frame_size: tuple[int, int], padding: int) -> Image.Image:
    """Pack independent poses at one shared scale and baseline."""
    scale = min(
        (frame_size[0] - padding * 2) / max(pose.width for pose in poses),
        (frame_size[1] - padding * 2) / max(pose.height for pose in poses),
    )
    sheet = Image.new("RGBA", (frame_size[0] * len(poses), frame_size[1]))
    for index, pose in enumerate(poses):
        resized = pose.resize(
            (max(1, round(pose.width * scale)), max(1, round(pose.height * scale))),
            Image.Resampling.LANCZOS,
        )
        x = index * frame_size[0] + (frame_size[0] - resized.width) // 2
        y = frame_size[1] - padding - resized.height
        sheet.alpha_composite(resized, (x, y))
    return sheet


def build_attack(spec: AttackSpec) -> None:
    poses = load_pose_cells(SOURCES / spec.source)
    atlas = pack_atlas(poses, spec.frame_size, spec.padding)
    spec.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(spec.output, optimize=True, compress_level=9)


for attack_spec in SPECS.values():
    build_attack(attack_spec)

print("Built R78 four-frame raster attack atlases for every enemy visual group and Xi")
