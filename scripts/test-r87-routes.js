"use strict";
const assert = require("assert");
const rules = require("../src/rules");
const config = require("../src/config");
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
const route = id => ({ id, status: "active", baseline: 10, deadline: 24, bonusUsed: false });
check("三路目標各自計算，接單前進度不算", () => {
  for (const def of Object.values(config.ROUTE_CONTRACTS)) {
    assert.equal(rules.routeContractProgress(route(def.id), { [def.metric]: 10 }, 1, config).progress, 0);
    assert.equal(rules.routeContractProgress(route(def.id), { [def.metric]: 10 + def.target }, 23, config).complete, true);
  }
});
check("截止後不能補領，截止瞬間可完成", () => {
  assert.equal(rules.routeContractProgress(route("rescue"), { supplyCratesCollected: 11 }, 24, config).complete, true);
  assert.deepEqual(rules.routeContractProgress(route("rescue"), { supplyCratesCollected: 11 }, 25, config), { progress: 1, complete: false, expired: true });
});
check("未知路線無獎勵", () => assert.equal(rules.routeContractProgress(route("bad"), {}, 1, config).complete, false));
const options = id => ({ contract: route(id), rewardId: config.ROUTE_CONTRACTS[id].recommended, vehicle: { hp: 50, maxHp: 100 }, stats: { supplyParts: 4 }, supplyBuffs: [], config });
check("救援維修真實加血，不修改原物件", () => {
  const input = options("rescue"); const result = rules.routeSupplyBonus(input);
  assert.equal(result.vehicle.hp, 56); assert(result.applied); assert.equal(input.vehicle.hp, 50);
});
check("維修不超過滿血；滿血不消耗加成", () => {
  const input = options("rescue"); input.vehicle.hp = 100;
  assert.equal(rules.routeSupplyBonus(input).applied, false);
});
check("廢車場額外零件共用補給上限", () => {
  const input = options("salvage"); input.stats.supplyParts = 11;
  assert.equal(rules.routeSupplyBonus(input).stats.supplyParts, 12);
  input.stats.supplyParts = 12; assert.equal(rules.routeSupplyBonus(input).applied, false);
});
check("火線延長的是真正 buff", () => {
  const input = options("frontline"); input.buffId = "new";
  input.supplyBuffs = [{ id: "old", rewardId: "damage_boost", until: 5 }, { id: "new", rewardId: "damage_boost", until: 12 }];
  assert.deepEqual(rules.routeSupplyBonus(input).supplyBuffs.map(b => b.until), [5, 20]);
});
check("選錯補給／已用／已結案不可加成", () => {
  const input = options("rescue"); input.rewardId = "parts_cache";
  assert(!rules.routeSupplyBonus(input).applied);
  input.rewardId = "repair_small"; input.contract.bonusUsed = true;
  assert(!rules.routeSupplyBonus(input).applied);
  input.contract.bonusUsed = false; input.contract.status = "completed";
  assert(!rules.routeSupplyBonus(input).applied);
});
check("存檔舊格式、惡意數值與未知路線清理", () => {
  assert.deepEqual(rules.migrateMeta(null, { config }).routeCompletions, { rescue: 0, salvage: 0, frontline: 0 });
  assert.deepEqual(rules.sanitizeRouteCompletions({ rescue: -1, salvage: 1e12, frontline: "oops", bad: 5 }, config), { rescue: 0, salvage: 999999, frontline: 0 });
});
check("結算永久收藏與 lastRun 可讀回", () => {
  const meta = rules.migrateMeta(null, { config });
  const result = rules.settleRunRewards({ meta, run: { vehicleId: "land_rig", routeCompletions: { rescue: 1, salvage: 2 }, routeFailures: 1 }, config });
  const readback = rules.migrateMeta(result.meta, { config });
  assert.deepEqual(readback.routeCompletions, { rescue: 1, salvage: 2, frontline: 0 });
  assert.equal(readback.lastRun.routeFailures, 1);
});
console.log(`R87 route rules VERIFIED ${checks}/10`);
