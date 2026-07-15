"""Bake R73 image-generated enemy hurt/death masters into runtime atlases.

The chroma-keyed and cleaned masters live in the gitignored
``tools/asset_sources/imagegen_r73`` provenance archive.  Each master contains
six independently drawn poses in one row: two hurt poses followed by four
death poses.  Runtime uses the two hurt poses plus three strongly separated
death beats (buckle, fall, final collapse), all at the owning walk atlas frame
size.  No frame is made by translating, rotating, scaling, or squashing a
previous frame.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "tools" / "asset_sources" / "imagegen_r73"
ENEMIES = ROOT / "assets" / "enemies"


@dataclass(frozen=True)
class ActionSpec:
    source: str
    output_prefix: str
    frame_size: tuple[int, int]


SPECS = {
    "shambler": ActionSpec("shambler_actions_rgba.png", "oga_shambler", (40, 40)),
    "runner": ActionSpec("runner_actions_rgba.png", "oga_runner", (40, 40)),
    "bloater": ActionSpec("bloater_actions_rgba.png", "bloater", (52, 52)),
    "spore_spitter": ActionSpec("spore_spitter_actions_rgba.png", "oga_spitter", (40, 40)),
    "shield_husk": ActionSpec("shield_husk_actions_rgba.png", "shield_husk", (48, 64)),
    "swarm_mite": ActionSpec("swarm_mite_actions_rgba.png", "swarm_mite", (44, 44)),
    "tar_brute": ActionSpec("tar_brute_actions_rgba.png", "tar_brute", (56, 68)),
    "void_wraith": ActionSpec("void_wraith_actions_rgba.png", "void_wraith", (48, 64)),
    "boss_hive_titan": ActionSpec("titan_actions_rgba.png", "titan", (88, 80)),
}


def load_pose_cells(path: Path, count: int = 6) -> list[Image.Image]:
    if not path.exists():
        raise FileNotFoundError(f"missing cleaned R73 image-gen master: {path}")
    master = Image.open(path).convert("RGBA")
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


def pack_atlas(poses: list[Image.Image], frame_size: tuple[int, int]) -> Image.Image:
    """Pack independent poses at one shared scale and ground baseline."""
    padding = 1
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


def build_actions(spec: ActionSpec) -> None:
    cells = load_pose_cells(SOURCES / spec.source)
    actions = {
        "hurt": cells[:2],
        # Preserve anticipation/active/recovery readability at the tiny runtime
        # interface: buckle -> airborne/side fall -> final collapsed silhouette.
        "death": [cells[2], cells[3], cells[5]],
    }
    for action, poses in actions.items():
        output = ENEMIES / f"{spec.output_prefix}_{action}.png"
        pack_atlas(poses, spec.frame_size).save(output, optimize=True, compress_level=9)


for enemy_spec in SPECS.values():
    build_actions(enemy_spec)

print("Built R73 raster hurt/death atlases for every configured enemy walk atlas")
