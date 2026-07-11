# Codex Response - ashes R4

| Item | Decision | Response |
| --- | --- | --- |
| P0 Boss slow-mo mutates simulation `dt` | Fixed | Removed all simulation `dt` scaling from `update(dt)`. Boss defeat now starts `fxTimeScaleLeft/fxTimeScale`, which only advances `fxVisualTime` for render animation timing. `state.time`, `waveElapsed`, cooldowns, AI, spawns, and wave completion always receive the original step `dt`. |
| Determinism regression for full vs reduced settings | Fixed | Added e2e coverage that kills a boss, runs the same seeded wave plan under `fxLevel=full/reducedFlash=false` and `fxLevel=reduced/reducedFlash=true`, then asserts identical logic `time`, `waveElapsed`, remaining spawns, and spawned enemy roster. |
| WebAudio unlock failure path | Fixed | `unlock()` now creates the singleton audio context, creates the master gain, and attempts `resume()` during the user gesture. `play()` also resumes before and after synthesis once a gesture has been seen. Added `touchstart` alongside `pointerdown` and `keydown`. |
| WebAudio singleton/node behavior | Fixed/tested | Added unit coverage proving first unlock creates one context, resumes it, and later playback reuses that context. Existing node-count tests still cover one-shot synthesis and sound-off no-node behavior. |
| Reduced flash coverage gap: enemy hit alpha | Fixed | Enemy draw alpha now requires `flourishFxEnabled()`, so reduced/off modes do not apply the new hit-flash alpha treatment. Existing hit timers may remain for state bookkeeping, but reduced rendering no longer consumes them as flourish. |
| Reduced coverage: boss defeat presentation | Fixed | Boss defeat rings remain disabled only when FX is off; white flash stays gated by `reducedFlash`. Render-only time scaling is gated by `flourishFxEnabled()`, so reduced settings suppress it without changing simulation. |
| FX cap / 150+ entity concern | Deferred | Current caps remain: enemy cap, effect cap, and particle pool/quality caps are already enforced and covered by `test-fx`. No additional pool refactor was needed for this P0 pass. |
| Version sync | Fixed | Runtime, service worker, and test guards are synchronized to R64 / `ashes-convoy-r64-v1`. The original Grok report is left as an input artifact, so historical docs still contain old-version text. |

Verification:

- `npm test` PASS
- `npm run test:e2e` PASS x3
- Runtime/scripts grep for the old simulation-scaling state is clean; only historical review artifacts retain old-version wording.
