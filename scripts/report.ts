// Prints each scenario's decision and flagged checks (offline: uses each document's known truth instead of the AI).
import { evaluate, DEFAULT_CONFIDENCE_THRESHOLD } from "../lib/engine/evaluate";
import { SCENARIOS, TEST_REGISTRY } from "../lib/scenarios";
import { BLOCKLIST_SEED, VENDOR_MASTER_SEED } from "../lib/seed";
const only = process.argv[2];
for (const s of SCENARIOS.filter((x) => !only || x.id.startsWith(only))) {
  const { results, decision, message } = evaluate({
    form: s.form, docs: s.docs.map((d) => ({ slot: d.slot, file_name: d.file_name, ...d.truth })),
    vendorMaster: VENDOR_MASTER_SEED, blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY, nameJudgements: {}, confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  });
  const ok = decision.internal_status === s.expected.internal_status ? "OK " : "XX ";
  console.log(`\n${ok}${s.label}  ->  ${decision.internal_status}  | ${decision.headline}`);
  for (const r of results.filter((x) => ["FAIL", "WARN", "UNVERIFIED"].includes(x.status))) {
    console.log(`   ${r.id} ${r.status}${r.severity ? "/" + r.severity : ""}: ${r.reason}`);
    if (only) { console.log(`      sources: ${r.sources.map((x) => x.label + " = " + x.value).join(" | ")}\n      rule: ${r.rule}\n      next: ${r.next_action}`); }
  }
  if (only && message) console.log(`\n   MESSAGE: ${message.subject}\n${message.body.replace(/^/gm, "   | ")}`);
}
