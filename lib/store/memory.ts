// In-memory Store for tests and the offline scenario script. Same behaviour as Supabase, no persistence.
import { randomBytes, randomUUID } from "node:crypto";
import type { BlocklistEntry, TestRegistry, VendorRecord } from "../engine/types";
import type { InviteRow, DocumentRow, MessageRow, ReviewerActionRow, RunEventRow, RunRow, Store, SubmissionRow, CheckRow } from "./types";

export function createMemoryStore(seed: { vendors: VendorRecord[]; blocklist: BlocklistEntry[]; registry: TestRegistry }): Store {
  const now = () => new Date().toISOString();
  const subs: SubmissionRow[] = [];
  const docs: DocumentRow[] = [];
  const runs: RunRow[] = [];
  const events: RunEventRow[] = [];
  const checks: CheckRow[] = [];
  const messages: MessageRow[] = [];
  const actions: ReviewerActionRow[] = [];
  const invites: InviteRow[] = [];
  const vendors = seed.vendors.map((v) => ({ ...v }));
  const files = new Map<string, Uint8Array>();
  const cache = new Map<string, unknown>();
  let runNo = 0;

  return {
    async createSubmission({ vendor_ref, scenario_id, form }) {
      const version = subs.filter((s) => s.vendor_ref === vendor_ref).length + 1;
      const row: SubmissionRow = { id: randomUUID(), vendor_ref, version, scenario_id: scenario_id ?? null, form_data: form, created_at: now() };
      subs.push(row);
      return row;
    },
    async getSubmission(id) { return subs.find((s) => s.id === id) ?? null; },
    async createInvite({ contact_name, contact_email, created_by, days }) {
      const row: InviteRow = { token: randomBytes(24).toString("base64url"), vendor_ref: null, contact_name, contact_email, created_by, created_at: now(), expires_at: new Date(Date.now() + days * 864e5).toISOString() };
      invites.push(row);
      return row;
    },
    async getInvite(token) { return invites.find((i) => i.token === token) ?? null; },
    async setInviteVendorRef(token, vendorRef) { const i = invites.find((x) => x.token === token); if (i) i.vendor_ref = vendorRef; },
    async latestRunId(vendorRef) {
      const sub = subs.filter((s) => s.vendor_ref === vendorRef).sort((a, b) => b.version - a.version)[0];
      return sub ? runs.filter((r) => r.submission_id === sub.id).at(-1)?.id ?? null : null;
    },
    async addDocument(d) {
      const row: DocumentRow = { ...d, id: randomUUID(), created_at: now(), doc_type: null, overall_confidence: null, extracted: null };
      docs.push(row);
      return row;
    },
    async listDocuments(sid) { return docs.filter((d) => d.submission_id === sid); },
    async saveReading(id, r) {
      const d = docs.find((x) => x.id === id)!;
      d.extracted = r; d.doc_type = r.doc_type; d.overall_confidence = r.overall_confidence;
    },
    async uploadFile(path, bytes) { files.set(path, bytes); },
    async downloadFile(path) {
      const f = files.get(path);
      if (!f) throw new Error(`file not found: ${path}`);
      return f;
    },
    async signedUrl(path) { return `/api/files?path=${encodeURIComponent(path)}`; },

    async createRun(submission_id, ai_mode) {
      const row: RunRow = {
        id: randomUUID(), run_number: ++runNo, submission_id, status: "RUNNING", outcome: null, internal_status: null,
        review_flag: false, review_resolved: false, final_status: null, headline: null, ai_mode, started_at: now(), finished_at: null, duration_ms: null,
      };
      runs.push(row);
      return row;
    },
    async getRunRow(id) { return runs.find((r) => r.id === id) ?? null; },
    async addEvent(e) { events.push({ ...e, at: now() }); },
    async saveChecks(run_id, results) { checks.push(...results.map((r) => ({ ...r, run_id }))); },
    async updateRun(id, patch) { Object.assign(runs.find((r) => r.id === id)!, patch); },
    async saveMessage(m) { messages.push({ ...m, created_at: now() }); },
    async getRun(id) {
      const run = runs.find((r) => r.id === id);
      if (!run) return null;
      const submission = subs.find((s) => s.id === run.submission_id)!;
      return {
        run, submission,
        documents: docs.filter((d) => d.submission_id === submission.id),
        events: events.filter((e) => e.run_id === id).sort((a, b) => a.seq - b.seq),
        checks: checks.filter((c) => c.run_id === id).map(({ run_id: _r, ...c }) => c),
        message: messages.filter((m) => m.run_id === id).at(-1) ?? null,
        reviewer_actions: actions.filter((a) => a.run_id === id),
      };
    },
    async listRuns(limit = 100) {
      return [...runs].reverse().slice(0, limit).map((r) => {
        const s = subs.find((x) => x.id === r.submission_id)!;
        return { ...r, vendor_ref: s.vendor_ref, legal_name: s.form_data.legal_name, version: s.version, scenario_id: s.scenario_id, gstin: s.form_data.tax.gstin ?? null, contact_name: s.form_data.contact.name, contact_email: s.form_data.contact.email };
      });
    },
    async addReviewerAction(a) {
      const row: ReviewerActionRow = { ...a, id: randomUUID(), created_at: now() };
      actions.push(row);
      return row;
    },

    async getVendorMaster() { return vendors.map((v) => ({ ...v })); },
    async addVendor(v) { vendors.push(v); },
    async getBlocklist() { return seed.blocklist; },
    async getRegistry() { return seed.registry; },

    async issueCounts() {
      const m = new Map<string, { check_id: string; title: string; runs: Set<string> }>();
      for (const c of checks.filter((x) => x.status === "FAIL")) {
        const e = m.get(c.id) ?? { check_id: c.id, title: c.title, runs: new Set<string>() };
        e.runs.add(c.run_id); m.set(c.id, e);
      }
      return [...m.values()].map((e) => ({ check_id: e.check_id, title: e.title, runs: e.runs.size })).sort((a, b) => b.runs - a.runs);
    },
    async resetDemo({ vendors: seedVendors }) {
      invites.length = 0;
      subs.length = 0; docs.length = 0; runs.length = 0; events.length = 0; checks.length = 0; messages.length = 0; actions.length = 0;
      vendors.length = 0; vendors.push(...seedVendors.map((v) => ({ ...v }))); runNo = 0;
    },
    async cacheGet<T>(key: string) { return (cache.get(key) as T) ?? null; },
    async cacheSet(key, value) { cache.set(key, value); },
  };
}
