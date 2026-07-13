# Third-party assets

## Kenney Particle Pack

- Creator: Kenney Vleugels / [Kenney](https://kenney.nl/)
- Source: [Particle Pack](https://kenney.nl/assets/particle-pack), package version 1.1
- License: [Creative Commons Zero (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/)
- Used sources: `PNG (Transparent)/smoke_04.png`, `fire_01.png`, `dirt_02.png`, and `star_07.png`
- Game files: `assets/fx/kenney_smoke.png`, `kenney_fire.png`, `kenney_debris.png`, and `kenney_flash.png`
- Modifications: transparent-edge crop, downscale, and wasteland palette tint. Runtime color variants are pre-rendered to offscreen canvases.

Kenney's CC0 license does not require attribution; this credit is included for provenance and thanks.

## Characters, Zombies, and Weapons. Oh My!

- Creator: Curt / [OpenGameArt](https://opengameart.org/)
- Source: [Characters, Zombies, and Weapons. Oh My!](https://opengameart.org/content/characters-zombies-and-weapons-oh-my)
- License: [Creative Commons Zero (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/). The current source page identifies the work as CC0/public domain and says no attribution is needed.
- Downloaded sources: `Bases&Assets.xcf` and `PartsSpriteSheetVersion1.zip` (kept in the gitignored `tools/asset_sources/` provenance archive).
- Used source parts: front-facing body, head, zombie arms/eyes/nose, hair, and three numbered leg/foot walk poses from `PartsForSheet/`.
- Game files: `assets/enemies/oga_shambler_walk.png`, `oga_runner_walk.png`, and `oga_spitter_walk.png`.
- Modifications: transparent layer composition, per-part wasteland palette, compact 1-2-3-2 four-frame atlases, and runtime offscreen rust-orange tinting. The archive's older bundled readme predates the creator's later CC0 relicensing shown on the source page.

## Kenney Top-Down Tanks packs

- Creator: Kenney Vleugels / [Kenney](https://kenney.nl/)
- Sources: [Top-Down Tanks](https://kenney.nl/assets/top-down-tanks) and [Top-down Tanks Remastered](https://kenney.nl/assets/top-down-tanks-remastered)
- License: [Creative Commons Zero (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/), as stated on both source pages and in both downloaded `license.txt` files.
- Downloaded sources: both complete ZIP packages (kept in the gitignored `tools/asset_sources/` provenance archive).
- Used Remastered sources: `tracksLarge.png`, `tankBody_darkLarge.png`, `tankDark_barrel3.png`, `barricadeMetal.png`, `barricadeWood.png`, `barrelRust_top.png`, and `sandbagBrown.png` from `PNG/Default size/`.
- Game files: `assets/enemies/kenney_armored_brute_walk.png` and `assets/env/kenney_road_debris.png`.
- Modifications: layered tread/hull/turret composition with four lightweight tread/recoil poses; debris crop, scale, transparent atlas packing, and muted rust-brown palette. The original Top-Down Tanks pack is retained as provenance/reference; shipped derivatives use the Remastered files listed above.

All third-party sources listed here are CC0/public-domain material and are compatible with this project's MIT-licensed code. Attribution is included voluntarily for provenance and thanks.
