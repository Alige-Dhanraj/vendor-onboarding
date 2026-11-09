// Vendor invite links: what the vendor may see, and which state their registration is in.
// The vendor only ever sees plain statuses and the vendor-safe email text, never internal checks or flags.
import type { DocSlot, SubmissionForm } from "../engine/types";
import type { InviteRow, RunBundle, Store } from "../store/types";
import { effectiveStatus } from "../ui-labels";

export const INVITE_DAYS = 30;

export type VendorState = "NEW" | "CHECKING" | "NEED_INFO" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export interface VendorView {
  state: VendorState;
  contact_name: string;
  contact_email: string;
  fixes: string[];
  message: { subject: string; body: string } | null;
  form: SubmissionForm | null;
  kept: { slot: DocSlot; file_name: string }[];
}

/** Manual review is shown to the vendor as "being reviewed"; a stuck or failed run does the same. */
export function vendorState(b: RunBundle | null, nowMs = Date.now()): VendorState {
  if (!b) return "NEW";
  const r = b.run;
  if (r.status === "RUNNING") return nowMs - new Date(r.started_at).getTime() > 5 * 60_000 ? "IN_REVIEW" : "CHECKING";
  if (r.status === "FAILED") return "IN_REVIEW";
  switch (effectiveStatus(r)) {
    case "APPROVED": return "APPROVED";
    case "REJECTED": return "REJECTED";
    case "PENDING_INFO": return "NEED_INFO";
    default: return "IN_REVIEW";
  }
}

/** The numbered lines of an email body, without the numbers. */
export const fixList = (body: string) => [...body.matchAll(/^\d+\.\s+(.+)$/gm)].map((m) => m[1]);

export async function loadInvite(store: Store, token: string): Promise<{ invite: InviteRow } | { error: string; status: number }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { error: "This link is not valid.", status: 404 };
  const invite = await store.getInvite(token);
  if (!invite) return { error: "This link is not valid.", status: 404 };
  if (new Date(invite.expires_at).getTime() < Date.now()) return { error: "This link has expired. Please ask for a new one.", status: 410 };
  return { invite };
}

export async function latestBundle(store: Store, invite: InviteRow): Promise<RunBundle | null> {
  const id = invite.vendor_ref ? await store.latestRunId(invite.vendor_ref) : null;
  return id ? store.getRun(id) : null;
}

export function buildView(invite: InviteRow, b: RunBundle | null): VendorView {
  const state = vendorState(b);
  const need = state === "NEED_INFO" && b;
  const fixes = need && b.message ? fixList(b.message.body) : [];
  return {
    state, contact_name: invite.contact_name, contact_email: invite.contact_email,
    fixes: need && !fixes.length ? ["Please check your details and documents."] : fixes,
    message: (state === "APPROVED" || state === "REJECTED") && b?.message ? { subject: b.message.subject, body: b.message.body } : null,
    form: need ? { ...b.submission.form_data, submitted_by: undefined } : null, // never show a staff email to the vendor
    kept: need ? b.documents.map((d) => ({ slot: d.slot, file_name: d.file_name })) : [],
  };
}
