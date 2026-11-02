// Display labels shared by the UI (no server code here). Plain words only.
export { PLAIN } from "./engine/plain";

export const STAGES = [
  { key: "INTAKE", label: "Received", sub: "Form and documents" },
  { key: "READ_DOCUMENTS", label: "Reading documents", sub: "Names and numbers" },
  { key: "COMPLETE", label: "Anything missing?", sub: "Papers and details" },
  { key: "VALID", label: "Numbers written correctly?", sub: "PAN, GST, bank code" },
  { key: "CONSISTENT", label: "Everything matches?", sub: "Same name and numbers everywhere" },
  { key: "CREDIBLE", label: "Anything suspicious?", sub: "Duplicates, reused bank accounts" },
  { key: "DECIDE", label: "Deciding", sub: "Fixed rules" },
  { key: "COMMUNICATE", label: "Preparing the message", sub: "For the vendor" },
  { key: "RECORD", label: "Saving", sub: "History and records" },
] as const;

export const LAYER_LABEL: Record<string, string> = {
  COMPLETE: "Anything missing?",
  VALID: "Numbers written correctly?",
  CONSISTENT: "Everything matches?",
  CREDIBLE: "Anything suspicious?",
};

export const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  PENDING_INFO: { label: "Waiting on vendor", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  MANUAL_REVIEW: { label: "Needs review", cls: "bg-orange-50 text-orange-800 ring-orange-200" },
  REJECTED: { label: "Rejected", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
  RUNNING: { label: "Checking…", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  FAILED: { label: "Check failed", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
};

export const CHECK_STYLE: Record<string, { label: string; cls: string }> = {
  PASS: { label: "Pass", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  FAIL: { label: "Problem", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  WARN: { label: "Note", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  UNVERIFIED: { label: "Not checked", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  SKIPPED: { label: "N/A", cls: "bg-slate-50 text-slate-500 ring-slate-200" },
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

export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export function waiting(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "Today" : d === 1 ? "1 day" : `${d} days`;
}

/** Messages mark bold with **double asterisks**; emails and copy use plain text. */
export const plainText = (t: string) => t.replace(/\*\*/g, "");
export const mailtoLink = (email: string | undefined, m: { subject: string; body: string }) =>
  `mailto:${encodeURIComponent(email ?? "")}?subject=${encodeURIComponent(plainText(m.subject))}&body=${encodeURIComponent(plainText(m.body))}`;
