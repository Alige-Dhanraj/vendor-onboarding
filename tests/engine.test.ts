import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  gstinCheckChar, gstinChecksumOk, gstinStructure, isEin, isIfsc, isPan, isPhone, isPincode, isRoutingNumber, makeGstin, hashAccount,
} from "../lib/engine/ids";
import { compareByRules, fallbackJudge, normaliseName } from "../lib/engine/names";
import { decide } from "../lib/engine/policy";
import { DEFAULT_CONFIDENCE_THRESHOLD, evaluate } from "../lib/engine/evaluate";
import type { CheckContext, CheckResult, ExtractedDoc } from "../lib/engine/types";
import { SCENARIOS, TEST_REGISTRY, type ScenarioVersion } from "../lib/scenarios";
import { BLOCKLIST_SEED, VENDOR_MASTER_SEED } from "../lib/seed";

function ctxFor(v: ScenarioVersion): CheckContext {
  const docs: ExtractedDoc[] = v.docs.map((d) => ({ slot: d.slot, file_name: d.file_name, ...d.truth }));
  return {
    form: v.form, docs, vendorMaster: VENDOR_MASTER_SEED, blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY,
    nameJudgements: {}, confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  };
}

// ---------- identifiers ----------

test("PAN format", () => {
  assert.ok(isPan("AABCK4821L"));
  assert.ok(isPan("aabck4821l"));
  assert.ok(!isPan("AABCK4821"));
  assert.ok(!isPan("1ABCK4821L"));
});

test("GSTIN check character matches real published GSTINs", () => {
  for (const g of ["27AAPFU0939F1ZV", "29AABCU9603R1ZJ", "27AAACR5055K1Z7", "24AAACC1206D1ZM", "09AAACH7409R1ZZ"]) {
    assert.equal(gstinCheckChar(g.slice(0, 14)), g[14], g);
    assert.ok(gstinChecksumOk(g));
  }
});

test("GSTIN: one changed character fails the check", () => {
  const g = makeGstin("33", "AABCK4821L");
  assert.ok(gstinChecksumOk(g));
  const typo = g.slice(0, 14) + (g[14] === "A" ? "B" : "A");
  assert.ok(!gstinChecksumOk(typo));
});

test("GSTIN structure problems are explained", () => {
  assert.equal(gstinStructure("33AABCK4821L1Z").ok, false);
  assert.match(gstinStructure("99AABCK4821L1ZX").problem!, /state code/);
  assert.match(gstinStructure("33AABCK4821L1AX").problem!, /14th character/);
  assert.ok(gstinStructure(makeGstin("33", "AABCK4821L")).ok);
});

test("IFSC, EIN, routing, pincode, phone", () => {
  assert.ok(isIfsc("HDFC0004321"));
  assert.ok(!isIfsc("HDFC1004321"));
  assert.ok(isEin("94-3417756"));
  assert.ok(!isEin("9434177"));
  assert.ok(isRoutingNumber("123456780"));
  assert.ok(!isRoutingNumber("123456789"));
  assert.ok(isPincode("600032"));
  assert.ok(!isPincode("060032"));
  assert.ok(isPhone("+91 98400 12345", "IN"));
  assert.ok(!isPhone("+91 12345", "IN"));
});

test("account hash is stable and ignores formatting", () => {
  assert.equal(hashAccount("3011 2233 4455 66"), hashAccount("30112233445566"));
  assert.notEqual(hashAccount("30112233445566"), hashAccount("30112233445567"));
});

// ---------- names ----------

test("name normalisation removes formatting differences", () => {
  assert.equal(normaliseName("A.B.C. Technologies Private Limited"), normaliseName("ABC Technologies Pvt Ltd"));
  assert.equal(normaliseName("M/s. Kaveri Precision Components Pvt. Ltd."), "KAVERI PRECISION COMPONENTS PVT LTD");
  assert.equal(compareByRules("Kaveri Precision Components Private Limited", "KAVERI PRECISION COMPONENTS PVT LTD")?.verdict, "SAME");
  assert.equal(compareByRules("Kaveri Precision Comp. Pvt. Ltd.", "Kaveri Precision Components Pvt Ltd"), null);
});

test("fallback judge: abbreviation SAME, unrelated DIFFERENT, partial UNSURE", () => {
  assert.equal(fallbackJudge("Nilgiri Precision Comp. Pvt. Ltd.", "Nilgiri Precision Components Pvt Ltd").verdict, "SAME");
  assert.equal(fallbackJudge("Ramesh Traders", "Thanjavur Textiles Pvt Ltd").verdict, "DIFFERENT");
  assert.equal(fallbackJudge("Arjun Mehta", "Arjun Polymers Pvt Ltd").verdict, "UNSURE");
});

// ---------- policy ----------

const fail = (id: string, severity: CheckResult["severity"]): CheckResult => ({
  id, layer: "CREDIBLE", title: id, status: "FAIL", severity, checked: "x", sources: [{ label: "x", value: "x" }], rule: "x", reason: "x", next_action: "x",
});

test("policy precedence: hard stop > review > fixable > approved", () => {
  assert.equal(decide([fail("R2", "HARD_STOP"), fail("K6", "REVIEW"), fail("C1", "FIXABLE")]).internal_status, "REJECTED");
  assert.equal(decide([fail("K6", "REVIEW"), fail("C1", "FIXABLE")]).internal_status, "MANUAL_REVIEW");
  assert.equal(decide([fail("C1", "FIXABLE")]).internal_status, "PENDING_INFO");
  assert.equal(decide([]).internal_status, "APPROVED");
  const review = decide([fail("K6", "REVIEW")]);
  assert.equal(review.outcome, "PENDING");
  assert.equal(review.review_flag, true);
});

test("a warning alone never blocks approval", () => {
  const warn: CheckResult = { ...fail("K3", "WARNING"), status: "WARN" };
  assert.equal(decide([warn]).outcome, "APPROVED");
});

// ---------- scenarios ----------

for (const s of SCENARIOS) {
  const versions: [string, ScenarioVersion][] = [[s.id, s], ...(s.resubmission ? [[`${s.id} (resubmission)`, s.resubmission] as [string, ScenarioVersion]] : [])];
  for (const [name, v] of versions) {
    test(`scenario ${name} -> ${v.expected.internal_status}`, () => {
      const { results, decision } = evaluate(ctxFor(v));
      const failing = results.filter((r) => r.status === "FAIL").map((r) => r.id);
      assert.equal(decision.internal_status, v.expected.internal_status, `failing checks: ${failing.join(", ")} | ${decision.headline}`);
      assert.equal(decision.outcome, v.expected.outcome);
      for (const id of v.expected.failing) assert.ok(failing.includes(id), `${id} should fail; failing: ${failing.join(", ")}`);
      if (v.expected.failing.length === 0) assert.deepEqual(failing, []);
    });
  }
}

test("every flagged check carries full evidence (traceability)", () => {
  for (const s of SCENARIOS) {
    const { results } = evaluate(ctxFor(s));
    for (const r of results.filter((x) => x.status === "FAIL" || x.status === "WARN" || x.status === "UNVERIFIED")) {
      const where = `${s.id}/${r.id}`;
      assert.ok(r.checked, `${where} checked`);
      assert.ok(r.rule, `${where} rule`);
      assert.ok(r.reason, `${where} reason`);
      assert.ok(r.next_action, `${where} next_action`);
      if (r.status === "FAIL") assert.ok(r.sources.length > 0, `${where} sources`);
      if (r.severity === "FIXABLE") assert.ok(r.vendor_fix, `${where} vendor_fix`);
    }
  }
});

test("vendor message lists exactly the fixable items, nothing else", () => {
  const s = SCENARIOS.find((x) => x.id === "2-wrong-document")!;
  const { results, message } = evaluate(ctxFor(s));
  const fixes = results.filter((r) => r.status === "FAIL" && r.severity === "FIXABLE").flatMap((r) => r.vendor_fix!.split("\n"));
  for (const f of fixes) assert.ok(message.body.includes(f));
  assert.match(message.subject, new RegExp(`${fixes.length} item`));
});

test("approved vendors get a short approval note; rejected get a vendor-safe reason", () => {
  const ok = evaluate(ctxFor(SCENARIOS[0])).message;
  assert.match(ok.body, /onboarded as a vendor/);
  assert.match(ok.body, /Registered name: /);
  assert.match(ok.body, /Contact: /);
  assert.match(ok.body, /Bank account: .*ending \d{4}/);
  const rej = evaluate(ctxFor(SCENARIOS.find((x) => x.id === "3a-duplicate")!));
  assert.match(rej.message.body, /already registered/);
  assert.ok(!rej.message.body.includes("VM-001"), "never names another vendor");
});

test("blurry document: dependent checks are unverified, never passed", () => {
  const s = SCENARIOS.find((x) => x.id === "r2-blurry-scan")!;
  const { results } = evaluate(ctxFor(s));
  assert.equal(results.find((r) => r.id === "K6")!.status, "UNVERIFIED");
  assert.equal(results.find((r) => r.id === "K7")!.status, "UNVERIFIED");
});

test("every check has a plain-language name", async () => {
  const { PLAIN } = await import("../lib/engine/plain");
  const { runChecks } = await import("../lib/engine/checks");
  for (const r of runChecks(ctxFor(SCENARIOS[0]))) assert.ok(PLAIN[r.id], `${r.id} needs a plain name`);
});

test("O/0 misreads are corrected only where the ID format fixes the character type", async () => {
  const { fixFixedPositions } = await import("../lib/engine/ids");
  assert.equal(fixFixedPositions("DEM00002211", "ifsc"), "DEMO0002211");
  assert.equal(fixFixedPositions("AABCK482IL", "pan"), "AABCK4821L");
  assert.equal(fixFixedPositions("33AABCK4821L1ZM", "gstin"), "33AABCK4821L1ZM");
  assert.equal(fixFixedPositions("DEMO0VATVAX", "ifsc"), "DEMO0VATVAX"); // branch part (X) left alone
});

test("email signature parser fills name, email and phones", async () => {
  const { parseSignature } = await import("../lib/engine/signature");
  const p = parseSignature("Thanks,\nPriya Raman\nAccounts Manager\nKaveri Precision Components Pvt Ltd\nM: +91 98400 12345 | Alt: 044 2345 6789\npriya@kaveriprecision.example");
  assert.equal(p.name, "Priya Raman");
  assert.equal(p.email, "priya@kaveriprecision.example");
  assert.equal(p.phone, "+91 98400 12345");
  assert.equal(p.alt_phone, "044 2345 6789");
  assert.deepEqual(parseSignature("hello"), {});
});

test("GST certificate constitution maps to entity types", async () => {
  const { mapEntityType } = await import("../lib/engine/entity");
  assert.equal(mapEntityType("Private Limited Company"), "PRIVATE_LIMITED");
  assert.equal(mapEntityType("Limited Liability Partnership (LLP)"), "LLP");
  assert.equal(mapEntityType("Partnership Firm"), "PARTNERSHIP");
  assert.equal(mapEntityType("Proprietorship"), "PROPRIETORSHIP");
  assert.equal(mapEntityType("Public Limited"), null);
  assert.equal(mapEntityType(""), null);
});

test("vendor messages are short numbered lists with bold document names", () => {
  const s = SCENARIOS.find((x) => x.id === "2-wrong-document")!;
  const { message } = evaluate(ctxFor(s));
  assert.match(message.body, /1\. \*\*GST certificate\*\*: missing/);
  assert.match(message.body, /2\. \*\*Cancelled cheque \/ bank letter\*\*: wrong file/);
  assert.ok(message.body.length < 400, "short");
});

test("vendor record export: last 4 digits only, safe CSV", async () => {
  const { buildRecord, recordCsv } = await import("../lib/workflow/record");
  const base = SCENARIOS[0].form;
  const form = { ...base, legal_name: 'Acme, "Best" Pvt Ltd', contact: { ...base.contact, name: "=SUM(A1)" } };
  const b: any = {
    run: { id: "r1", status: "COMPLETED", internal_status: "APPROVED", final_status: null, started_at: "2026-11-02T00:00:00Z", finished_at: "2026-11-02T00:00:09Z" },
    submission: { vendor_ref: "acme", version: 1, form_data: form }, reviewer_actions: [],
  };
  const rec = buildRecord(b);
  assert.equal(rec.bank_account_last4, base.bank.account_number.slice(-4));
  assert.equal(rec.verified_by, "VendorGate automatic checks");
  const csv = recordCsv(rec);
  assert.ok(!csv.includes(base.bank.account_number), "full account number must not be exported");
  assert.match(csv, /"Acme, ""Best"" Pvt Ltd"/);
  assert.match(csv, /'=SUM\(A1\)/, "formula is defused");
  assert.ok(!csv.includes("'+91"), "phone numbers are left alone");
});

test("request and reminder emails are short", async () => {
  const m = await import("../lib/engine/message");
  const r = m.requestDocumentsMessage("Priya Raman", ["GST certificate", "PAN card"]);
  assert.match(r.body, /Hi Priya,/);
  assert.match(r.body, /1\. \*\*GST certificate\*\*/);
  assert.ok(m.reminderMessage("").body.startsWith("Hi there,"));
  assert.ok(m.reminderMessage("Priya").body.length < 200);
});

test("R5: an expired document asks for a current one; no end date is left alone", async () => {
  const { runChecks } = await import("../lib/engine/checks");
  const sc = SCENARIOS.find((s) => s.id === "5-expired-document")!;
  const mk = (v: ScenarioVersion, today?: string): CheckContext => ({
    form: v.form, docs: v.docs.map((d) => ({ slot: d.slot, file_name: d.file_name, ...d.truth })), vendorMaster: VENDOR_MASTER_SEED,
    blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY, nameJudgements: {}, confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD, today,
  });
  const r5 = (v: ScenarioVersion, today?: string) => runChecks(mk(v, today)).find((r) => r.id === "R5")!;
  const bad = r5(sc, "2026-11-02");
  assert.equal(bad.status, "FAIL");
  assert.equal(bad.severity, "FIXABLE");
  assert.match(bad.vendor_fix!, /\*\*GST certificate\*\*: ended on 30\/06\/2025/);
  assert.equal(r5(sc, "2025-06-30").status, "PASS", "valid through its last day");
  assert.equal(r5(sc, "2025-07-01").status, "FAIL", "expired the day after");
  assert.equal(r5(sc.resubmission!, "2026-11-02").status, "PASS");
  assert.equal(r5(SCENARIOS[0], "2026-11-02").status, "SKIPPED", "most documents have no end date");
});

test("resubmission keeps documents the vendor did not replace", async () => {
  const { createMemoryStore } = await import("../lib/store/memory");
  const { submit } = await import("../lib/workflow/intake");
  const store = createMemoryStore({ vendors: VENDOR_MASTER_SEED, blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY });
  const form = SCENARIOS[0].form;
  const file = (slot: any, n: number) => ({ slot, name: `${slot}.pdf`, mime: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70, 45, n]) });
  const v1 = await submit(store, { form, vendorRef: "t1", files: [file("GST_CERTIFICATE", 1), file("PAN_CARD", 2), file("BANK_PROOF", 3)] });
  const v2 = await submit(store, { form, vendorRef: "t1", files: [file("PAN_CARD", 9)], keep: await store.listDocuments(v1.id) });
  assert.equal(v2.version, 2);
  const docs = await store.listDocuments(v2.id);
  assert.deepEqual(docs.map((d) => d.slot).sort(), ["BANK_PROOF", "GST_CERTIFICATE", "PAN_CARD"]);
  const old = await store.listDocuments(v1.id);
  const same = (slot: string) => docs.find((d) => d.slot === slot)!.storage_path === old.find((d) => d.slot === slot)!.storage_path;
  assert.ok(same("GST_CERTIFICATE") && same("BANK_PROOF"), "kept documents reuse the stored file");
  assert.ok(!same("PAN_CARD"), "the replaced document is the new file");
});

test("vendor page states and fix list", async () => {
  const { vendorState, fixList } = await import("../lib/workflow/invite");
  const run = (p: object) => ({ run: { status: "COMPLETED", started_at: new Date().toISOString(), final_status: null, internal_status: null, ...p } }) as any;
  assert.equal(vendorState(null), "NEW");
  assert.equal(vendorState(run({ status: "RUNNING" })), "CHECKING");
  assert.equal(vendorState(run({ status: "RUNNING", started_at: new Date(Date.now() - 600_000).toISOString() })), "IN_REVIEW", "a stuck run never leaves the vendor waiting forever");
  assert.equal(vendorState(run({ internal_status: "PENDING_INFO" })), "NEED_INFO");
  assert.equal(vendorState(run({ internal_status: "MANUAL_REVIEW" })), "IN_REVIEW", "internal review is not shown as a flag");
  assert.equal(vendorState(run({ internal_status: "MANUAL_REVIEW", final_status: "APPROVED" })), "APPROVED");
  assert.equal(vendorState(run({ internal_status: "REJECTED" })), "REJECTED");
  assert.deepEqual(fixList("Hi A,\n\nPlease fix:\n\n1. **PAN**: bad\n2. **IFSC**: bad\n\nThanks"), ["**PAN**: bad", "**IFSC**: bad"]);
});

test("deactivate and reactivate: records kept, inactive vendors still block duplicates", async () => {
  const { createMemoryStore } = await import("../lib/store/memory");
  const { submit } = await import("../lib/workflow/intake");
  const { executeRun, aiMode } = await import("../lib/workflow/run");
  const { changeVendorStatus } = await import("../lib/workflow/vendors");
  const sc = SCENARIOS[0];
  const fresh = () => createMemoryStore({ vendors: VENDOR_MASTER_SEED, blocklist: [...BLOCKLIST_SEED], registry: TEST_REGISTRY });
  const approve = async (store: ReturnType<typeof fresh>, ref: string) => {
    const files = sc.docs.map((d) => ({ slot: d.slot, name: d.file_name, mime: "image/png", bytes: new Uint8Array(readFileSync(join(process.cwd(), "public", "samples", d.file_name))) }));
    const sub = await submit(store, { form: sc.form, vendorRef: ref, scenarioId: sc.id, files });
    const run = await store.createRun(sub.id, aiMode());
    await executeRun(store, run.id);
    return run.id;
  };

  const a = fresh();
  const id = await approve(a, "kv1");
  assert.equal((await a.getRun(id))!.vendor!.active, true);
  await assert.rejects(changeVendorStatus(a, { runId: id, action: "DEACTIVATE", reason: "Other", note: "", by: "T" }), /at least 10/);
  await assert.rejects(changeVendorStatus(a, { runId: id, action: "REACTIVATE", by: "T" }), /already active/);
  await changeVendorStatus(a, { runId: id, action: "DEACTIVATE", reason: "Trade completed", note: "contract ended", by: "T" });
  const off = (await a.getRun(id))!;
  assert.equal(off.vendor!.active, false);
  assert.equal(off.vendor!.reason, "Trade completed: contract ended");
  assert.ok(off.reviewer_actions.some((x) => x.action === "DEACTIVATE"), "audit log has the action");
  assert.equal((await a.listRuns()).find((r) => r.id === id)!.inactive, true);

  // the same company applying again is still a duplicate, and the reviewer is pointed to reactivate
  const dup = await approve(a, "kv2");
  const r2 = (await a.getRun(dup))!.checks.find((c) => c.id === "R2")!;
  assert.equal(r2.status, "FAIL");
  assert.match(r2.next_action, /inactive: reactivate/);

  await changeVendorStatus(a, { runId: id, action: "REACTIVATE", note: "new contract", by: "T" });
  assert.equal((await a.getRun(id))!.vendor!.active, true);

  // fraud: blocklisted, cannot be reactivated
  const b = fresh();
  const bid = await approve(b, "kv3");
  await changeVendorStatus(b, { runId: bid, action: "DEACTIVATE", reason: "Fraud concern", note: "", by: "T" });
  assert.ok((await b.getBlocklist()).some((e) => e.name === sc.form.legal_name), "added to the blocklist");
  await assert.rejects(changeVendorStatus(b, { runId: bid, action: "REACTIVATE", by: "T" }), /fraud/);
  assert.equal(BLOCKLIST_SEED.some((e) => e.name === sc.form.legal_name), false, "the shared seed list is not changed");
});

test("rate limit: allows up to the limit, then blocks until the window passes", async () => {
  const { allow } = await import("../lib/workflow/limit");
  const t = 1_000_000;
  assert.ok(allow("k1", 2, 1000, t) && allow("k1", 2, 1000, t + 1));
  assert.equal(allow("k1", 2, 1000, t + 2), false);
  assert.ok(allow("k1", 2, 1000, t + 1500), "allowed again after the window");
  assert.ok(allow("k2", 2, 1000, t), "other keys are not affected");
});

test("home line picks the most useful message", async () => {
  const { homeLine } = await import("../lib/ui-labels");
  assert.equal(homeLine(1, 5, 2).text, "1 vendor needs your review.");
  assert.equal(homeLine(3, 0, 0).text, "3 vendors need your review.");
  assert.match(homeLine(0, 4, 1).text, /^1 vendor has been waiting over 3 days/);
  assert.equal(homeLine(0, 2, 0).tone, "calm");
  assert.match(homeLine(0, 0, 0).text, /Nothing is stuck/);
});

test("review fixes: AI doubt about a name goes to a reviewer; PAN is checked for non-GST vendors; a second GSTIN is reviewed, not rejected", async () => {
  const { runChecks } = await import("../lib/engine/checks");
  const { pairKey } = await import("../lib/engine/names");
  const base = SCENARIOS[0];
  const mk = (form: typeof base.form, docs = base.docs, nj: CheckContext["nameJudgements"] = {}): CheckContext => ({
    form, docs: docs.map((d) => ({ slot: d.slot, file_name: d.file_name, ...d.truth })), vendorMaster: VENDOR_MASTER_SEED,
    blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY, nameJudgements: nj, confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD, today: "2026-11-09",
  });
  const get = (ctx: CheckContext, id: string) => runChecks(ctx).find((r) => r.id === id)!;

  // K5: the AI says UNSURE (or AI-only DIFFERENT) -> REVIEW, never FIXABLE
  const other = "Zenith Quartz Works Pvt Ltd";
  const docs = base.docs.map((d) => (d.slot === "GST_CERTIFICATE" ? { ...d, truth: { ...d.truth, fields: { ...d.truth.fields, legal_name: other } } } : d));
  for (const verdict of ["UNSURE", "DIFFERENT"] as const) {
    const k5 = get(mk(base.form, docs, { [pairKey(base.form.legal_name, other)]: { verdict, reason: "test", by: "AI" } }), "K5");
    assert.equal(k5.status, "FAIL"); assert.equal(k5.severity, "REVIEW", `${verdict} from the AI must reach a person`);
  }

  // K1: a non-GST vendor's typed PAN must equal the PAN card
  const nonGst = { ...base.form, tax: { ...base.form.tax, gst_registered: false, gstin: undefined, pan: "AAAAA1111A" } };
  const k1 = get(mk(nonGst), "K1");
  assert.equal(k1.status, "FAIL"); assert.equal(k1.severity, "FIXABLE");

  // R2: same GSTIN is a duplicate (hard stop); same PAN under a different GSTIN goes to a person
  const seed = VENDOR_MASTER_SEED.find((v) => v.pan && v.gstin)!;
  const sameGst = get(mk({ ...base.form, tax: { ...base.form.tax, pan: seed.pan!, gstin: seed.gstin! } }), "R2");
  assert.equal(sameGst.severity, "HARD_STOP");
  const sibling = get(mk({ ...base.form, tax: { ...base.form.tax, pan: seed.pan!, gstin: "27AAAAA0000A1Z5" } }), "R2");
  assert.equal(sibling.severity, "REVIEW");
});

test("uploads are checked by their first bytes, not by the name or type the browser claims", async () => {
  const { sniffMime } = await import("../lib/workflow/intake");
  assert.equal(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), "application/pdf");
  assert.equal(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffMime(new TextEncoder().encode("<html>not a pdf</html>")), null);
});

test("intake rejects a form without legal name, country, or with a non-object section", async () => {
  const { validateIncoming } = await import("../lib/workflow/intake");
  const ok = { legal_name: "A Pvt Ltd", country: "IN", address: {}, contact: {}, tax: {}, bank: {} } as any;
  assert.doesNotThrow(() => validateIncoming(ok, []));
  assert.throws(() => validateIncoming({} as any, []), /Legal name/);
  assert.throws(() => validateIncoming({ ...ok, country: "" }, []), /Country/);
  assert.throws(() => validateIncoming({ ...ok, tax: "x" }, []), /tax/);
});

test("fallback name judge: near-identical names are not 'same'; real abbreviations are", async () => {
  const { fallbackJudge } = await import("../lib/engine/names");
  assert.notEqual(fallbackJudge("ABC Engineering", "ABCD Engineering").verdict, "SAME");
  assert.equal(fallbackJudge("Nilgiri Precision Comp Pvt Ltd", "Nilgiri Precision Components Pvt Ltd").verdict, "SAME");
});

test("submit turns non-text nested fields into text instead of crashing", async () => {
  const { submit } = await import("../lib/workflow/intake");
  const { createMemoryStore } = await import("../lib/store/memory");
  const sub = await submit(createMemoryStore({ vendors: [], blocklist: [], registry: {} }), { form: { legal_name: "X Pvt Ltd", country: "IN", contact: { email: 123, name: null }, tax: { pan: 5 }, bank: null } as any, files: [] });
  assert.equal((sub.form_data as any).contact.email, "123");
  assert.equal((sub.form_data as any).contact.name, "");
  assert.equal((sub.form_data as any).tax.pan, "5");
});

test("R5 never expires a PAN card, even if a date was wrongly read from it", async () => {
  const { runChecks } = await import("../lib/engine/checks");
  const sc = SCENARIOS[0];
  const ctx = ctxFor(sc);
  ctx.docs = ctx.docs.map((d) => (d.slot === "PAN_CARD" ? { ...d, fields: { ...d.fields, valid_until: "01/01/2015" }, confidence: { ...d.confidence, valid_until: 0.99 } } : d));
  ctx.today = "2026-11-09";
  const r5 = runChecks(ctx).find((r) => r.id === "R5")!;
  assert.notEqual(r5.status, "FAIL");
});

test("isPhone accepts real business numbers: mobile, landline with STD, +91, toll-free; rejects junk", async () => {
  const { isPhone } = await import("../lib/engine/ids");
  for (const p of ["98765 43210", "+91 98765 43210", "09876543210", "044-2345 6789", "+91 44 2345 6789", "020 2567 1234", "1800 123 4567", "044-23456789 ext 12"]) assert.equal(isPhone(p, "IN"), true, p);
  for (const p of ["12345", "0000000000", "98765", "abcdefghij", ""]) assert.equal(isPhone(p, "IN"), false, p);
});

test("phone: names and emails are never judged; short phone numbers get a plain-language reason", async () => {
  const { phoneProblem } = await import("../lib/engine/ids");
  const { runChecks } = await import("../lib/engine/checks");
  assert.equal(phoneProblem("", "IN"), null);
  assert.equal(phoneProblem("044 2345 6789", "IN"), null);
  assert.match(phoneProblem("4552626", "IN")!, /Add 3 more digits/);
  const ctx = ctxFor(SCENARIOS[0]);
  ctx.form = { ...ctx.form, contact: { ...ctx.form.contact, name: "x", email: "xyz@gmail", phone: "4552626" } };
  const v6 = runChecks(ctx).find((r) => r.id === "V6")!;
  assert.equal(v6.status, "FAIL");
  assert.ok(!/email/.test(v6.reason), v6.reason);
  ctx.form = { ...ctx.form, contact: { ...ctx.form.contact, phone: "98765 43210" } };
  assert.equal(runChecks(ctx).find((r) => r.id === "V6")!.status, "PASS");
});

test("a wrong phone number stops the submission before any checking starts", async () => {
  const { validateIncoming } = await import("../lib/workflow/intake");
  const f = structuredClone(SCENARIOS[0].form);
  f.contact.phone = "4552626";
  assert.throws(() => validateIncoming(f, []), /Phone number/);
  f.contact.phone = "98765 43210";
  assert.doesNotThrow(() => validateIncoming(f, []));
});
