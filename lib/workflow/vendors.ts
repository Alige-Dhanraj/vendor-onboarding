// Vendor lifecycle after approval: deactivate when the work is over, reactivate if it starts again.
// Records are never deleted. Inactive vendors still count for the duplicate and bank-reuse checks.
import { hashAccount } from "../engine/ids";
import type { Store } from "../store/types";
import { effectiveStatus } from "../ui-labels";

export const DEACTIVATE_REASONS = ["Trade completed", "Duplicate vendor", "Fraud concern", "Other"] as const;
export class VendorError extends Error {}

export async function changeVendorStatus(store: Store, args: { runId: string; action: "DEACTIVATE" | "REACTIVATE"; reason?: string; note?: string; by: string }) {
  const b = await store.getRun(args.runId);
  if (!b) throw new VendorError("Vendor not found.");
  if (b.run.status !== "COMPLETED" || effectiveStatus(b.run) !== "APPROVED" || !b.vendor) throw new VendorError("Only approved vendors can be deactivated or reactivated.");
  const form = b.submission.form_data;

  if (args.action === "REACTIVATE") {
    if (b.vendor.active) throw new VendorError("This vendor is already active.");
    if (/^Fraud concern/.test(b.vendor.reason ?? "")) throw new VendorError("A vendor deactivated for a fraud concern can't be reactivated here.");
    await store.setVendorActive(args.runId, true, { reason: "", by: args.by });
    await store.addReviewerAction({ run_id: args.runId, action: "REACTIVATE", reason: `Reactivated${args.note?.trim() ? `: ${args.note.trim()}` : ""}`, reviewer: args.by });
    return;
  }

  if (!b.vendor.active) throw new VendorError("This vendor is already inactive.");
  const label = (DEACTIVATE_REASONS as readonly string[]).includes(args.reason ?? "") ? args.reason! : "";
  if (!label) throw new VendorError("Choose a reason.");
  const text = args.note?.trim() ? `${label}: ${args.note.trim()}` : label;
  if (text.length < 10) throw new VendorError("Please add a short note (at least 10 characters).");
  await store.setVendorActive(args.runId, false, { reason: text, by: args.by });
  await store.addReviewerAction({ run_id: args.runId, action: "DEACTIVATE", reason: text, reviewer: args.by });
  if (label === "Fraud concern") {
    await store.addBlocklist({
      name: form.legal_name, pan: form.tax.pan?.toUpperCase(),
      bank_account_hash: form.bank.account_number ? hashAccount(form.bank.account_number) : undefined,
      reason: `Added when the vendor was deactivated: ${text}`,
    });
  }
}
