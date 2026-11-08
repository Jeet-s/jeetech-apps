/** Exercise the actual restore adapter without importing native modules into Node. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { restoredAccess, restoreFailure } from "../src/core/restore";

type Scenario = { connected?: boolean; owned?: any[]; error?: string; transient?: boolean; ios?: boolean; saved?: any };
function load(scenario: Scenario) {
  const calls: string[] = [];
  let access = scenario.saved ?? { pro: false, adsRemoved: false };
  let queries = 0;
  const native = {
    initConnection: async () => { calls.push("connect"); return scenario.connected !== false; },
    restorePurchases: async () => { calls.push("sync"); },
    getAvailablePurchases: async () => {
      calls.push("query"); queries++;
      if (scenario.error) throw { code: scenario.error };
      if (scenario.transient && queries === 1) throw { code: "E_SERVICE_UNAVAILABLE" };
      return scenario.owned ?? [];
    },
  };
  const module = { exports: {} as any };
  const code = ts.transpileModule(readFileSync("src/modules/restore-purchases.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, {
    module, exports: module.exports, setTimeout, clearTimeout,
    require: (id: string) => {
      if (id === "expo-iap") return native;
      if (id === "react-native") return { Platform: { OS: scenario.ios ? "ios" : "android" } };
      if (id.endsWith("monetization.json")) return { subscriptions: [{ sku: "pro_monthly" }] };
      if (id === "./iap") return { iap: { init: async () => {}, restore: async () => { calls.push("factory-restore"); return 0; } } };
      if (id === "./store") return { store: { get: () => access, set: (next: any) => { access = next; } } };
      if (id === "./cloud") return { cloud: { verifyPurchase: async () => {} } };
      if (id === "../core/restore") return { restoredAccess, restoreFailure };
      throw Error(`Unexpected import ${id}`);
    },
  });
  return { restore: module.exports.restorePurchases as () => Promise<string>, calls, access: () => access };
}
async function main() {
  const empty = load({});
  const a = empty.restore(), b = empty.restore();
  assert.equal(a, b, "Repeated taps must share one request");
  assert.match(await a, /No previous purchases found/);
  assert.equal(empty.calls.filter(c => c === "query").length, 1);
  const purchase = load({ owned: [{ productId: "pro_unlock", purchaseState: "purchased" }] });
  assert.match(await purchase.restore(), /Purchases restored/);
  assert.equal(purchase.access().proSource, "lifetime");
  const transient = load({ transient: true });
  assert.match(await transient.restore(), /No previous purchases found/);
  assert.equal(transient.calls.filter(c => c === "connect").length, 2, "Retry must reconnect");
  const saved = { pro: true, adsRemoved: true, proSource: "lifetime" };
  for (const scenario of [{ connected: false }, { error: "unknown" }]) {
    const failure = load({ ...scenario, saved });
    assert.doesNotMatch(await failure.restore(), /No previous purchases found|Purchases restored/);
    assert.equal(failure.access(), saved, "Failure must preserve saved access");
  }
  const ios = load({ ios: true });
  await ios.restore();
  assert(ios.calls.indexOf("sync") < ios.calls.indexOf("query"), "StoreKit must sync before ownership query");
  const pending = load({ owned: [{ productId: "pro_monthly", purchaseState: "pending" }] });
  assert.match(await pending.restore(), /No previous purchases found/);
  assert.equal(pending.access().pro, false);
  console.log("Restore adapter: 8 scenarios passed (empty catalog, single-flight, purchase, reconnect, unavailable, error, StoreKit sync, pending).");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
