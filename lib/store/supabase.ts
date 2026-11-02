// Supabase implementation of the Store. Server-only: uses the service-role key, which bypasses
// Row Level Security and must never reach the browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CheckResult, ExtractedDoc, TestRegistry, VendorRecord } from "../engine/types";
import type { DocumentRow, RunListItem, RunRow, Store, SubmissionRow } from "./types";

const BUCKET = "vendor-documents";

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export function createSupabaseStore(url: string, serviceKey: string): Store {
  const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async createSubmission({ vendor_ref, scenario_id, form }) {
      const prev = must(await db.from("submissions").select("version").eq("vendor_ref", vendor_ref).order("version", { ascending: false }).limit(1), "read versions") as { version: number }[];
      const version = (prev[0]?.version ?? 0) + 1;
      return must(await db.from("submissions").insert({ vendor_ref, version, scenario_id: scenario_id ?? null, form_data: form }).select().single(), "create submission") as SubmissionRow;
    },
    async getSubmission(id) {
      return (must(await db.from("submissions").select().eq("id", id).maybeSingle(), "read submission") as SubmissionRow | null);
    },
    async addDocument(d) {
      return must(await db.from("documents").insert(d).select().single(), "add document") as DocumentRow;
    },
    async listDocuments(sid) {
      return must(await db.from("documents").select().eq("submission_id", sid).order("created_at"), "list documents") as DocumentRow[];
    },
    async saveReading(id, r: ExtractedDoc) {
      must(await db.from("documents").update({ extracted: r, doc_type: r.doc_type, overall_confidence: r.overall_confidence }).eq("id", id), "save reading");
    },
    async uploadFile(path, bytes, mime) {
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
      if (error) throw new Error(`upload ${path}: ${error.message}`);
    },
    async downloadFile(path) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error(`download ${path}: ${error?.message}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    async signedUrl(path) {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
      return data?.signedUrl ?? null;
    },

    async createRun(submission_id, ai_mode) {
      return must(await db.from("runs").insert({ submission_id, ai_mode }).select().single(), "create run") as RunRow;
    },
    async getRunRow(id) {
      return must(await db.from("runs").select().eq("id", id).maybeSingle(), "read run") as RunRow | null;
    },
    async addEvent(e) {
      must(await db.from("run_events").insert(e), "add event");
    },
    async saveChecks(run_id, results: CheckResult[]) {
      const rows = results.map((r) => ({
        run_id, check_id: r.id, layer: r.layer, title: r.title, status: r.status, severity: r.severity,
        checked: r.checked, sources: r.sources, rule: r.rule, reason: r.reason, next_action: r.next_action, vendor_fix: r.vendor_fix ?? null,
      }));
      must(await db.from("check_results").insert(rows), "save checks");
    },
    async updateRun(id, patch) {
      must(await db.from("runs").update(patch).eq("id", id), "update run");
    },
    async saveMessage(m) {
      must(await db.from("messages").insert(m), "save message");
    },
    async getRun(id) {
      const run = must(await db.from("runs").select().eq("id", id).maybeSingle(), "read run") as RunRow | null;
      if (!run) return null;
      const [submission, documents, events, checks, messages, actions] = await Promise.all([
        db.from("submissions").select().eq("id", run.submission_id).single(),
        db.from("documents").select().eq("submission_id", run.submission_id).order("created_at"),
        db.from("run_events").select().eq("run_id", id).order("seq"),
        db.from("check_results").select().eq("run_id", id).order("id"),
        db.from("messages").select().eq("run_id", id).order("created_at", { ascending: false }).limit(1),
        db.from("reviewer_actions").select().eq("run_id", id).order("created_at"),
      ]);
      const checkRows = must(checks, "read checks") as any[];
      return {
        run,
        submission: must(submission, "read submission") as SubmissionRow,
        documents: must(documents, "read documents") as DocumentRow[],
        events: must(events, "read events") as any[],
        checks: checkRows.map((c) => ({
          id: c.check_id, layer: c.layer, title: c.title, status: c.status, severity: c.severity, checked: c.checked,
          sources: c.sources, rule: c.rule, reason: c.reason, next_action: c.next_action, vendor_fix: c.vendor_fix ?? undefined,
        })),
        message: (must(messages, "read message") as any[])[0] ?? null,
        reviewer_actions: must(actions, "read actions") as any[],
      };
    },
    async listRuns(limit = 200) {
      const rows = must(await db.from("runs").select("*, submissions(vendor_ref, version, scenario_id, form_data)").order("started_at", { ascending: false }).limit(limit), "list runs") as any[];
      return rows.map(({ submissions: s, ...r }) => ({
        ...r, vendor_ref: s?.vendor_ref ?? "", version: s?.version ?? 1, scenario_id: s?.scenario_id ?? null, legal_name: s?.form_data?.legal_name ?? "", gstin: s?.form_data?.tax?.gstin ?? null, contact_name: s?.form_data?.contact?.name ?? "", contact_email: s?.form_data?.contact?.email ?? "",
      })) as RunListItem[];
    },
    async addReviewerAction(a) {
      return must(await db.from("reviewer_actions").insert(a).select().single(), "add reviewer action") as any;
    },

    async getVendorMaster() {
      return must(await db.from("vendor_master").select("id, legal_name, pan, gstin, bank_account_hash, bank_last4").order("id"), "read vendor master") as VendorRecord[];
    },
    async addVendor(v, runId) {
      must(await db.from("vendor_master").insert({ ...v, source_run_id: runId }), "add vendor");
    },
    async getBlocklist() {
      return must(await db.from("blocklist").select("name, pan, bank_account_hash, reason"), "read blocklist") as any[];
    },
    async getRegistry() {
      const rows = must(await db.from("test_registry").select(), "read registry") as { gstin: string; status: "ACTIVE" | "CANCELLED"; legal_name: string }[];
      return Object.fromEntries(rows.map((r) => [r.gstin, { status: r.status, legal_name: r.legal_name }])) as TestRegistry;
    },

    async issueCounts() {
      const rows = must(await db.from("check_results").select("check_id, title, run_id").eq("status", "FAIL").limit(5000), "issue counts") as { check_id: string; title: string; run_id: string }[];
      const m = new Map<string, { check_id: string; title: string; runs: Set<string> }>();
      for (const r of rows) { const e = m.get(r.check_id) ?? { check_id: r.check_id, title: r.title, runs: new Set<string>() }; e.runs.add(r.run_id); m.set(r.check_id, e); }
      return [...m.values()].map((e) => ({ check_id: e.check_id, title: e.title, runs: e.runs.size })).sort((a, b) => b.runs - a.runs);
    },
    async resetDemo({ vendors }) {
      // Deletes all submissions (runs, events, checks, messages, reviewer actions cascade) and restores the seed vendors.
      must(await db.from("submissions").delete().not("id", "is", null), "clear submissions");
      must(await db.from("vendor_master").delete().not("id", "is", null), "clear vendor master");
      must(await db.from("vendor_master").insert(vendors), "restore vendors");
    },
    async cacheGet<T>(key: string) {
      const row = must(await db.from("ai_cache").select("value").eq("key", key).maybeSingle(), "read cache") as { value: T } | null;
      return row?.value ?? null;
    },
    async cacheSet(key, value, model) {
      must(await db.from("ai_cache").upsert({ key, value, model }), "write cache");
    },
  };
}
