# App Review Notes — draft only

PREPARED. Local R88 / 0.88.0 source. This draft has not been uploaded. The existing native staging area has not been updated to this release; do not attach these notes to the old binary.

Ashes Convoy is a top-down truck-and-trailer escort game. Its connected gameplay loop is steering the convoy, dealing with enemies attached to the truck, drifting to fling them into other enemies, and choosing route-specific supplies. It does not require another app, an account, a server-side game service, advertising, or purchases.

## A route to the vehicle mechanics in under three minutes

1. On a fresh launch, tap the brass button below the title: **首航：甩尾護車・三步上路**. On a completed save it reads **首航已完成・再練一次**. This playable driving lesson is available to every player.
2. Drag on the road or use the lower-left virtual joystick to steer the truck to one side. On desktop, drag on the road. Two enemies will attach to the vehicle after this steering objective.
3. Tap the lower-right **甩** button (desktop: Space). The enemies are flung from their actual attachment slots. Their bites use anticipation, impact, and recovery; damage is applied at the impact phase. The drift action has a cooldown.
4. Choose one of the supply cards. **維修補給** is the repair option. Completing this step displays **首航完成・行車紀錄已保存** and immediately saves the completion marker locally.
5. Continue the regular escort waves, or tap **暫停**, then **結束本局**, then the return-to-base button. Relaunching retains the completed lesson and settled progression. An unfinished battle restarts; it is not advertised as a resumable checkpoint save.
6. After the lesson, open **路線委託**. The route board pauses the battle. Choose rescue, salvage, or frontline to play a task with a distinct goal and supply synergy, or tap **返回** to resume.

The normal **出勤** button remains available. There is no hidden reviewer mode, account flag, invulnerability, or automatic objective completion. Screenshots show the actual local game; automated tests are evidence of function, not a human beta study.

## Changes relevant to the earlier rejection

R88 adds a permanent, playable first-sortie route, immediate completion persistence, explicit truck-mechanic guidance, a convoy log identity, background pause handling, and cached enemy atlas grading. Cross-promotion links to sister games and the visible developer performance panel were removed. No claim is made that latching zombies or drifting is globally original: Zombie Highway 2 already describes attached zombies. The comparison document explains the truck/trailer, fling-chain, and route/supply combination and the remaining overlap.

## Evidence and facts the owner must complete before submission

- The account-wide 4.3/4.2.6 rejection is not resolved by this local change. The attached local differentiation document covers each other account title, including the two discontinued school apps.
- A human TestFlight beta has not been conducted in this round. Do not invent participants, feedback, retention, or device results. Headless Chromium tests cover ten viewports, an offline replay, saved completion, and storage-quota failure.
- Content-provider identity, whether the developer is acting for a client, and the business decision to keep this product separate require an owner statement. Source code alone does not establish these facts.
- Native dependencies are standard Capacitor packages. Existing art includes the sources documented in CREDITS.md. A bounded source/media SHA-256 comparison found no exact peer-file duplicates; this is not a complete binary or semantic similarity audit.
- Dedicated cling artwork remains blocked: generated candidates did not attest the requested gpt-image-2 model provenance and were not shipped. Existing walk/attack/hurt/death poses remain in use; the optional cling-action pipeline is tested with a fixture, not falsely presented as finished art.
- Rebuild and test the final IPA/AAB, inspect aggregated SDK privacy declarations, verify the current store privacy answers, and conduct physical iPhone/iPad/Android lifecycle testing before submitting. No current approval or guaranteed compliance is asserted.
