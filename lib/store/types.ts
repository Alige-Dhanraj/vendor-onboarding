// Storage interface. The workflow only talks to this, so it runs the same against Supabase
// (production) and an in-memory store (tests and the offline scenario script).

import type {
  BlocklistEntry, CheckResult, DocSlot, ExtractedDoc, InternalStatus, Outcome, SubmissionForm, TestRegistry, VendorRecord,
} from "../engine/types";

export interface SubmissionRow {
  id: string; vendor_ref: string; version: number; scenario_id: string | null; form_data: SubmissionForm; created_at: string;
}
export interface DocumentRow {
  id: string; submission_id: string; slot: DocSlot; file_name: string; storage_path: string | null;
  mime_type: string | null; size_bytes: number | null; file_hash: string | null;
  doc_type: string | null; overall_confidence: number | null; extracted: ExtractedDoc | null; created_at: string;
}
export interface RunRow {
  id: string; run_number: number; submission_id: string; status: "RUNNING" | "COMPLETED" | "FAILED";
  outcome: Outcome | null; internal_status: InternalStatus | null; review_flag: boolean; review_resolved: boolean;
  final_status: InternalStatus | null; headline: string | null; ai_mode: string | null;
  started_at: string; finished_at: string | null; duration_ms: number | null;
}
export type Stage = "INTAKE" | "READ_DOCUMENTS" | "COMPLETE" | "VALID" | "CONSISTENT" | "CREDIBLE" | "DECIDE" | "COMMUNICATE" | "RECORD";
export interface RunEventRow {
  run_id: string; seq: number; stage: Stage; state: "RUNNING" | "DONE" | "FLAGGED" | "FAILED" | "SKIPPED";
  detail: string | null; duration_ms: number | null; at: string;
}
export interface MessageRow { run_id: string; subject: string; body: string; analyst_summary: string | null; generated_by: string; created_at: string }
export interface ReviewerActionRow { id: string; run_id: string; action: "APPROVE" | "REJECT" | "REQUEST_INFO" | "DEACTIVATE" | "REACTIVATE"; reason: string; reviewer: string; created_at: string }
export type CheckRow = CheckResult & { run_id: string };
export interface VendorInfo { id: string; active: boolean; reason: string | null; by: string | null; at: string | null }

export interface RunBundle {
  run: RunRow;
  submission: SubmissionRow;
  documents: DocumentRow[];
  events: RunEventRow[];
  checks: CheckResult[];
  message: MessageRow | null;
  reviewer_actions: ReviewerActionRow[];
  /** The approved-vendor record created from this run, if any. */
  vendor: VendorInfo | null;
  /** Secret link token if the vendor came in through an invite link. */
  invite_token: string | null;
}

export interface RunListItem extends RunRow {
  vendor_ref: string; legal_name: string; version: number; scenario_id: string | null; gstin: string | null; contact_name: string; contact_email: string; inactive: boolean;
}

export interface InviteRow {
  token: string; vendor_ref: string | null; contact_name: string; contact_email: string; created_by: string; created_at: string; expires_at: string;
}

export interface Store {
  // submissions and documents
  createSubmission(s: { vendor_ref: string; scenario_id?: string | null; form: SubmissionForm }): Promise<SubmissionRow>;
  getSubmission(id: string): Promise<SubmissionRow | null>;
  addDocument(d: Omit<DocumentRow, "id" | "created_at" | "doc_type" | "overall_confidence" | "extracted">): Promise<DocumentRow>;
  listDocuments(submissionId: string): Promise<DocumentRow[]>;
  saveReading(documentId: string, reading: ExtractedDoc): Promise<void>;
  uploadFile(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  downloadFile(path: string): Promise<Uint8Array>;
  signedUrl(path: string): Promise<string | null>;

  // vendor invite links
  createInvite(i: { contact_name: string; contact_email: string; created_by: string; days: number }): Promise<InviteRow>;
  getInvite(token: string): Promise<InviteRow | null>;
  setInviteVendorRef(token: string, vendorRef: string): Promise<void>;
  latestRunId(vendorRef: string): Promise<string | null>;

  // runs
  createRun(submissionId: string, aiMode: string): Promise<RunRow>;
  getRunRow(id: string): Promise<RunRow | null>;
  addEvent(e: Omit<RunEventRow, "at">): Promise<void>;
  saveChecks(runId: string, results: CheckResult[]): Promise<void>;
  updateRun(id: string, patch: Partial<RunRow>): Promise<void>;
  saveMessage(m: Omit<MessageRow, "created_at">): Promise<void>;
  getRun(id: string): Promise<RunBundle | null>;
  listRuns(limit?: number): Promise<RunListItem[]>;
  addReviewerAction(a: Omit<ReviewerActionRow, "id" | "created_at">): Promise<ReviewerActionRow>;

  // reference data
  getVendorMaster(): Promise<VendorRecord[]>;
  addVendor(v: VendorRecord, runId: string): Promise<void>;
  /** Marks the vendor created from this run active or inactive. Returns the vendor id, or null if the run created none. */
  setVendorActive(runId: string, active: boolean, info: { reason: string; by: string }): Promise<string | null>;
  addBlocklist(e: BlocklistEntry): Promise<void>;
  getBlocklist(): Promise<BlocklistEntry[]>;
  getRegistry(): Promise<TestRegistry>;

  issueCounts(): Promise<{ check_id: string; title: string; runs: number }[]>;

  // demo
  resetDemo(seed: { vendors: VendorRecord[]; blocklist?: BlocklistEntry[] }): Promise<void>;

  // AI cache
  cacheGet<T>(key: string): Promise<T | null>;
  cacheSet(key: string, value: unknown, model: string): Promise<void>;
}
