// Display labels shared by the UI (no server code here).
export const STAGES = [
  { key: "INTAKE", label: "Intake", sub: "Form and documents received" },
  { key: "READ_DOCUMENTS", label: "Read documents", sub: "AI reads and classifies each file" },
  { key: "COMPLETE", label: "Complete?", sub: "Nothing missing, right documents, legible" },
  { key: "VALID", label: "Valid?", sub: "Each ID is well-formed" },
  { key: "CONSISTENT", label: "Consistent?", sub: "Form, documents and IDs agree" },
  { key: "CREDIBLE", label: "Credible?", sub: "No duplicate, reuse or blocklist hit" },
  { key: "DECIDE", label: "Decide", sub: "Fixed policy rules, no AI" },
  { key: "COMMUNICATE", label: "Communicate", sub: "Draft message for the vendor" },
  { key: "RECORD", label: "Record", sub: "Audit log and vendor master" },
] as const;

export const LAYER_LABEL: Record<string, string> = {
  COMPLETE: "Complete: nothing missing",
  VALID: "Valid: each ID well-formed",
  CONSISTENT: "Consistent: everything agrees",
  CREDIBLE: "Credible: no fraud signals",
};

export const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  PENDING_INFO: { label: "Pending: info needed", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  MANUAL_REVIEW: { label: "Pending: manual review", cls: "bg-orange-50 text-orange-800 ring-orange-200" },
  REJECTED: { label: "Rejected", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
  RUNNING: { label: "Running", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  FAILED: { label: "Run failed", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
};

export const CHECK_STYLE: Record<string, { label: string; cls: string }> = {
  PASS: { label: "Pass", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  FAIL: { label: "Flag", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  WARN: { label: "Note", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  UNVERIFIED: { label: "Unverified", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  SKIPPED: { label: "N/A", cls: "bg-slate-50 text-slate-500 ring-slate-200" },
};

export const SEVERITY_LABEL: Record<string, string> = {
  HARD_STOP: "Hard stop", REVIEW: "Needs review", FIXABLE: "Fixable", WARNING: "Note only",
};

export const SLOT_LABEL: Record<string, string> = {
  GST_CERTIFICATE: "GST certificate",
  GST_DECLARATION: "GST non-registration declaration",
  PAN_CARD: "PAN card",
  BANK_PROOF: "Cancelled cheque / bank letter",
  EIN_NOTICE: "IRS EIN notice",
};

export const fmtMs = (ms?: number | null) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
export const effectiveStatus = (r: { status: string; final_status?: string | null; internal_status?: string | null }) =>
  r.status === "RUNNING" ? "RUNNING" : r.status === "FAILED" ? "FAILED" : (r.final_status ?? r.internal_status ?? "RUNNING");
