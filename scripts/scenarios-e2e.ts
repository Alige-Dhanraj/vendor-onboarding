// End-to-end check of the whole workflow with the real SAMPLE files and an in-memory store.
// Without OPENAI_API_KEY, documents are read from the scenario fixtures (offline mode).
// With a key set, the AI reads the actual files, so this doubles as the live accuracy test.
//
// Run: npx tsx scripts/scenarios-e2e.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCENARIOS, TEST_REGISTRY, type ScenarioVersion } from "../lib/scenarios";
import { BLOCKLIST_SEED, VENDOR_MASTER_SEED } from "../lib/seed";
import { createMemoryStore } from "../lib/store/memory";
import { aiMode, executeRun } from "../lib/workflow/run";
import { submit } from "../lib/workflow/intake";
import { reviewRun } from "../lib/workflow/review";
import type { Store } from "../lib/store/types";

const DOCS = join(__dirname, "..", "test-data", "documents");
const mime = (f: string) => (f.endsWith(".pdf") ? "application/pdf" : "image/png");

async function runVersion(store: Store, scenarioId: string, v: ScenarioVersion) {
  const files = v.docs.map((d) => ({ slot: d.slot, name: d.file_name, mime: mime(d.file_name), bytes: new Uint8Array(readFileSync(join(DOCS, d.file_name))) }));
  const sub = await submit(store, { form: v.form, files, scenarioId });
  const run = await store.createRun(sub.id, aiMode());
  const { decision, results } = await executeRun(store, run.id);
  return { run, decision, results, sub };
}

async function main() {
  let failures = 0;
  const line = (ok: boolean, msg: string) => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); };
  console.log(`AI mode: ${aiMode()}\n`);

  // 1) every scenario on a fresh store, as in the demo
  for (const s of SCENARIOS) {
    const store = createMemoryStore({ vendors: VENDOR_MASTER_SEED, blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY });
    const r = await runVersion(store, s.id, s);
    const failing = r.results.filter((x) => x.status === "FAIL").map((x) => x.id);
    line(r.decision.internal_status === s.expected.internal_status, `${s.label.padEnd(58)} -> ${r.decision.internal_status.padEnd(13)} [${failing.join(",") || "none"}]`);
    if (s.resubmission) {
      const r2 = await runVersion(store, s.id, s.resubmission);
      line(r2.sub.version === 2, `   resubmission stored as version ${r2.sub.version}`);
      line(r2.decision.internal_status === s.resubmission.expected.internal_status, `   resubmission -> ${r2.decision.internal_status}`);
      const events = (await store.getRun(r2.run.id))!.events.find((e) => e.stage === "READ_DOCUMENTS" && e.state !== "RUNNING");
      console.log(`         read stage: ${events?.detail}`);
    }
  }

  // 2) memory across runs: the happy path twice -> second time is a duplicate
  const shared = createMemoryStore({ vendors: VENDOR_MASTER_SEED, blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY });
  const first = await runVersion(shared, "0-happy", SCENARIOS[0]);
  const second = await runVersion(shared, "0-happy", SCENARIOS[0]);
  line(first.decision.internal_status === "APPROVED" && second.decision.internal_status === "REJECTED", `Happy path twice: ${first.decision.internal_status} then ${second.decision.internal_status} (duplicate caught)`);

  // 3) reviewer flow on 1B: short reason refused, proper reason accepted, can't decide twice
  const rs = createMemoryStore({ vendors: VENDOR_MASTER_SEED, blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY });
  const s1b = SCENARIOS.find((x) => x.id === "1b-different-payee")!;
  const r1b = await runVersion(rs, s1b.id, s1b);
  let refused = false;
  try { await reviewRun(rs, { runId: r1b.run.id, action: "APPROVE", reason: "ok" }); } catch { refused = true; }
  line(refused, "Reviewer: reason shorter than 10 characters is refused");
  await reviewRun(rs, { runId: r1b.run.id, action: "REQUEST_INFO", reason: "Please send a bank letter on letterhead confirming the account holder." });
  const after = (await rs.getRun(r1b.run.id))!;
  line(after.run.final_status === "PENDING_INFO" && after.reviewer_actions.length === 1 && !!after.message, "Reviewer: request-info logged, message drafted, final status PENDING_INFO");
  let twice = false;
  try { await reviewRun(rs, { runId: r1b.run.id, action: "APPROVE", reason: "Changed my mind entirely here." }); } catch { twice = true; }
  line(twice, "Reviewer: a decided review cannot be decided again");

  // 4) hard stop cannot be overridden
  const hs = createMemoryStore({ vendors: VENDOR_MASTER_SEED, blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY });
  const s3a = SCENARIOS.find((x) => x.id === "3a-duplicate")!;
  const r3a = await runVersion(hs, s3a.id, s3a);
  let blocked = false;
  try { await reviewRun(hs, { runId: r3a.run.id, action: "APPROVE", reason: "Approve anyway please, urgent." }); } catch { blocked = true; }
  line(blocked, "Reviewer: a hard-stop rejection cannot be overridden");

  // 5) events are complete and ordered for the live view
  const ev = (await shared.getRun(first.run.id))!.events;
  const stages = ev.filter((e) => e.state !== "RUNNING").map((e) => e.stage).join(" > ");
  line(stages === "INTAKE > READ_DOCUMENTS > COMPLETE > VALID > CONSISTENT > CREDIBLE > DECIDE > COMMUNICATE > RECORD", `Live view stages: ${stages}`);

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
