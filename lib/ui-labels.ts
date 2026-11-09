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
  APPROVED: { label: "Approved", cls: "bg-emerald-600 text-white ring-emerald-600" },
  PENDING_INFO: { label: "Waiting on vendor", cls: "bg-amber-400 text-amber-950 ring-amber-400" },
  MANUAL_REVIEW: { label: "Needs review", cls: "bg-orange-600 text-white ring-orange-600" },
  REJECTED: { label: "Rejected", cls: "bg-rose-600 text-white ring-rose-600" },
  INACTIVE: { label: "Inactive", cls: "bg-slate-500 text-white ring-slate-500" },
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

/** Status shown in lists: an approved vendor that was deactivated shows as Inactive. */
export const listStatus = (r: { status: string; final_status?: string | null; internal_status?: string | null; inactive?: boolean }) =>
  r.inactive ? "INACTIVE" : effectiveStatus(r);

/** One helpful line beside the greeting: the single most useful thing to know right now. */
export function homeLine(review: number, waiting: number, stale: number): { text: string; tone: "alert" | "warn" | "calm" } {
  const s = (n: number, one: string, many: string) => `${n} vendor${n === 1 ? "" : "s"} ${n === 1 ? one : many}`;
  if (review > 0) return { text: `${s(review, "needs", "need")} your review.`, tone: "alert" };
  if (stale > 0) return { text: `${s(stale, "has", "have")} been waiting over 3 days. Send a reminder.`, tone: "warn" };
  if (waiting > 0) return { text: `${waiting} waiting on vendors. Nothing else is stuck.`, tone: "calm" };
  return { text: "Nothing is stuck. You're all caught up.", tone: "calm" };
}

export const fmtMs = (ms?: number | null) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export const effectiveStatus = (r: { status: string; final_status?: string | null; internal_status?: string | null }) =>
  r.status === "RUNNING" ? "RUNNING" : r.status === "FAILED" ? "FAILED" : (r.final_status ?? r.internal_status ?? "RUNNING");

/** Exact date and time, e.g. "9 Nov 2026, 7:25 pm" (in the viewer's own time zone). */
export function fmtDateTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase())}`;
}

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
/** Digits for a wa.me link: a bare 10-digit number is taken as Indian; anything else is used as typed (country code included). */
export function waNumber(raw?: string | null) {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d.length >= 11 && d.length <= 15 ? d : "";
}
export const whatsappLink = (phone: string | undefined | null, m: { body: string }) =>
  `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(plainText(m.body))}`;
export const mailtoLink = (email: string | undefined, m: { subject: string; body: string }) =>
  `mailto:${encodeURIComponent(email ?? "")}?subject=${encodeURIComponent(plainText(m.subject))}&body=${encodeURIComponent(plainText(m.body))}`;
