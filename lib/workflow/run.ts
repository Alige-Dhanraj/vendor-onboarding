// The orchestrator. Runs one submission through every stage, writing an event per stage so the
// live run view can show progress, and storing every check result as the audit log.
//
//   INTAKE -> READ_DOCUMENTS (AI) -> COMPLETE -> VALID -> CONSISTENT (AI names) -> CREDIBLE
//   -> DECIDE (rules) -> COMMUNICATE (template message) -> RECORD
//
// AI reads and writes; rules decide.

import { isKnownSample } from "@/lib/ai/known-samples";
import { createHash } from "node:crypto";
import { LAYERS, namePairsToJudge, runChecks } from "../engine/checks";
import { DEFAULT_CONFIDENCE_THRESHOLD } from "../engine/evaluate";
import { hashAccount, last4 } from "../engine/ids";
import { templateMessage } from "../engine/message";
import { pairKey } from "../engine/names";
import { decide } from "../engine/policy";
import type { CheckContext, CheckResult, ExtractedDoc, Layer, NameJudgement } from "../engine/types";
import { aiEnabled, aiModel } from "../ai/openai";
import { compareNames } from "../ai/compare-names";
import { readDocument } from "../ai/read-document";
import { scenarioById } from "../scenarios";
import type { DocumentRow, Stage, Store } from "../store/types";

const LAYER_STAGE: Record<Layer, Stage> = { COMPLETE: "COMPLETE", VALID: "VALID", CONSISTENT: "CONSISTENT", CREDIBLE: "CREDIBLE" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export interface RunOptions {
  /** Small pause between stages so a person can follow the live view. Real durations are recorded separately. */
  pacingMs?: number;
}

export function aiMode() { return aiEnabled() ? "openai" : "offline"; }
export const readCacheKey = (slot: string, hash: string) => `read:${aiMode() === "openai" ? aiModel() : "offline"}:${slot}:${hash}`;

/**
 * Reads one document: cache by file hash first; then the AI; offline (no key) uses the scenario's
 * known reading if this is a sample document, otherwise marks it unreadable rather than guessing.
 */
async function readOne(store: Store, doc: DocumentRow, scenarioId: string | null): Promise<{ reading: ExtractedDoc; via: string }> {
  const key = readCacheKey(doc.slot, doc.file_hash ?? "");
  const cached = doc.file_hash ? await store.cacheGet<ExtractedDoc>(key) : null;
  if (cached) return { reading: { ...cached, slot: doc.slot, file_name: doc.file_name }, via: "cached reading" };

  if (aiEnabled() && doc.storage_path) {
    try {
      const bytes = await store.downloadFile(doc.storage_path);
      const reading = await readDocument({ slot: doc.slot, fileName: doc.file_name, mime: doc.mime_type ?? "application/octet-stream", bytes });
      if (doc.file_hash) await store.cacheSet(key, reading, aiModel());
      return { reading, via: "AI" };
    } catch (e) {
      return { reading: unreadable(doc), via: `AI failed (${(e as Error).message.slice(0, 80)})` };
    }
  }
  const sc = scenarioId ? scenarioById(scenarioId) : undefined;
  const truth = sc && [...sc.docs, ...(sc.resubmission?.docs ?? [])].find((d) => d.file_name === doc.file_name && d.slot === doc.slot);
  if (truth && doc.file_hash && isKnownSample(doc.file_name, doc.file_hash)) {
    const reading: ExtractedDoc = { slot: doc.slot, file_name: doc.file_name, ...truth.truth };
    if (doc.file_hash) await store.cacheSet(key, reading, "offline");
    return { reading, via: "offline fixture" };
  }
  return { reading: unreadable(doc), via: "no AI configured" };
}

const unreadable = (doc: DocumentRow): ExtractedDoc => ({
  slot: doc.slot, file_name: doc.file_name, doc_type: "UNREADABLE", fields: {}, confidence: {}, overall_confidence: 0,
});

export async function executeRun(store: Store, runId: string, opts: RunOptions = {}) {
  const pace = opts.pacingMs ?? 0;
  const run = await store.getRunRow(runId);
  if (!run) throw new Error("run not found");
  const sub = await store.getSubmission(run.submission_id);
  if (!sub) throw new Error("submission not found");
  const t0 = Date.now();
  let seq = 0;

  const stage = async <T>(name: Stage, fn: () => Promise<{ value: T; detail: string; flagged?: boolean }>): Promise<T> => {
    const s = ++seq;
    await store.addEvent({ run_id: runId, seq: s, stage: name, state: "RUNNING", detail: null, duration_ms: null });
    const start = Date.now();
    const out = await fn();
    const ms = Date.now() - start;
    if (pace) await sleep(Math.max(0, pace - ms));
    await store.addEvent({ run_id: runId, seq: ++seq, stage: name, state: out.flagged ? "FLAGGED" : "DONE", detail: out.detail, duration_ms: ms });
    return out.value;
  };

  try {
    const documents = await store.listDocuments(sub.id);

    await stage("INTAKE", async () => ({
      value: null,
      detail: `${sub.form_data.legal_name || "Unnamed vendor"} · version ${sub.version} · ${documents.length} document${documents.length === 1 ? "" : "s"}`,
    }));

    const docs = await stage("READ_DOCUMENTS", async () => {
      const results = await Promise.all(documents.map(async (d) => {
        const r = await readOne(store, d, sub.scenario_id);
        await store.saveReading(d.id, r.reading);
        return r;
      }));
      const lowConf = results.filter((r) => r.reading.doc_type === "UNREADABLE" || r.reading.overall_confidence < DEFAULT_CONFIDENCE_THRESHOLD).length;
      const vias = [...new Set(results.map((r) => r.via))].join(", ");
      return {
        value: results.map((r) => r.reading),
        detail: `${results.length} read (${vias || "none"})${lowConf ? ` · ${lowConf} hard to read` : ""}`,
        flagged: lowConf > 0,
      };
    });

    const [vendorMaster, blocklist, registry] = await Promise.all([store.getVendorMaster(), store.getBlocklist(), store.getRegistry()]);
    const ctx: CheckContext = {
      form: sub.form_data, docs, vendorMaster, blocklist, registry, nameJudgements: {}, confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
    };

    const all: CheckResult[] = [];
    for (const layer of LAYERS) {
      const layerResults = await stage(LAYER_STAGE[layer], async () => {
        let aiNote = "";
        if (layer === "CONSISTENT") {
          // Names the rules can't settle go to the AI (cached by name pair).
          const pairs = namePairsToJudge(ctx);
          for (const [a, b] of pairs) {
            const key = `names:${aiMode()}:${pairKey(a, b)}`;
            let j = await store.cacheGet<NameJudgement>(key);
            if (!j) { j = await compareNames(a, b); await store.cacheSet(key, j, aiModel()); }
            ctx.nameJudgements[pairKey(a, b)] = j;
          }
          if (pairs.length) aiNote = ` · ${pairs.length} name pair${pairs.length > 1 ? "s" : ""} judged by ${aiEnabled() ? "AI" : "fallback rule"}`;
        }
        const res = runChecks(ctx).filter((r) => r.layer === layer);
        const failed = res.filter((r) => r.status === "FAIL");
        const notes = res.filter((r) => r.status === "WARN" || r.status === "UNVERIFIED");
        const passed = res.filter((r) => r.status === "PASS").length;
        const detail = failed.length
          ? `${failed.length} flagged: ${failed.map((r) => r.id).join(", ")}${notes.length ? ` · ${notes.length} note${notes.length > 1 ? "s" : ""}` : ""}${aiNote}`
          : `${passed} passed${notes.length ? ` · ${notes.length} note${notes.length > 1 ? "s" : ""}` : ""}${aiNote}`;
        return { value: res, detail, flagged: failed.length > 0 };
      });
      all.push(...layerResults);
    }
    await store.saveChecks(runId, all);

    const decision = await stage("DECIDE", async () => {
      const d = decide(all);
      return { value: d, detail: `${d.internal_status.replace("_", " ")}${d.deciding_checks.length ? ` (${d.deciding_checks.join(", ")})` : ""}`, flagged: d.outcome !== "APPROVED" };
    });

    await stage("COMMUNICATE", async () => {
      const msg = templateMessage(sub.form_data, decision, all);
      await store.saveMessage({ run_id: runId, subject: msg.subject, body: msg.body, analyst_summary: msg.analyst_summary, generated_by: "template" });
      return { value: null, detail: decision.internal_status === "APPROVED" ? "Approval note ready for a person to send" : "Message ready for a person to send" };
    });

    await stage("RECORD", async () => {
      if (decision.internal_status !== "APPROVED") return { value: null, detail: "Audit log saved; no vendor record created" };
      const id = await addToVendorMaster(store, sub.form_data, runId);
      return { value: null, detail: `Audit log saved; vendor record ${id} created` };
    });

    await store.updateRun(runId, {
      status: "COMPLETED", outcome: decision.outcome, internal_status: decision.internal_status, review_flag: decision.review_flag,
      headline: decision.headline, finished_at: new Date().toISOString(), duration_ms: Date.now() - t0,
    });
    return { decision, results: all };
  } catch (e) {
    await store.addEvent({ run_id: runId, seq: ++seq, stage: "DECIDE", state: "FAILED", detail: `Run failed: ${(e as Error).message.slice(0, 200)}`, duration_ms: null });
    await store.updateRun(runId, {
      status: "FAILED", outcome: "PENDING", internal_status: "MANUAL_REVIEW", review_flag: true,
      headline: "The run could not finish; a person should review this submission.", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0,
    });
    throw e;
  }
}

export async function addToVendorMaster(store: Store, form: import("../engine/types").SubmissionForm, runId: string) {
  const existing = await store.getVendorMaster();
  const top = existing.reduce((m, v) => Math.max(m, Number(/^VM-(\d+)$/.exec(v.id)?.[1] ?? 0)), 0);
  const id = `VM-${String(top + 1).padStart(3, "0")}`;
  await store.addVendor({
    id, legal_name: form.legal_name, pan: form.tax.pan?.toUpperCase(), gstin: form.tax.gstin?.toUpperCase(),
    bank_account_hash: hashAccount(form.bank.account_number), bank_last4: last4(form.bank.account_number),
  }, runId);
  return id;
}
