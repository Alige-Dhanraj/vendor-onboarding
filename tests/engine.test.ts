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
  assert.match(evaluate(ctxFor(SCENARIOS[0])).message.body, /approved/);
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
