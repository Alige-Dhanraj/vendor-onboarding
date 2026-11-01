// Reviewer actions on a flagged run. A reason is mandatory and every action is logged.
// Hard-stop rejections cannot be overridden in the MVP; only runs flagged for review can be.
import type { Store } from "../store/types";
import { templateMessage } from "../engine/message";
import { addToVendorMaster } from "./run";

export class ReviewError extends Error {}

export async function reviewRun(store: Store, args: { runId: string; action: "APPROVE" | "REJECT" | "REQUEST_INFO"; reason: string; reviewer?: string }) {
  const reason = (args.reason ?? "").trim();
  if (reason.length < 10) throw new ReviewError("Please give a reason of at least 10 characters. Every reviewer decision is recorded in the audit log.");
  const bundle = await store.getRun(args.runId);
  if (!bundle) throw new ReviewError("Run not found.");
  const { run, submission } = bundle;
  if (run.status !== "COMPLETED") throw new ReviewError("This run has not finished.");
  if (!run.review_flag) throw new ReviewError("Only runs flagged for manual review can be decided by a reviewer.");
  if (run.review_resolved) throw new ReviewError("This review has already been decided.");

  const action = await store.addReviewerAction({ run_id: run.id, action: args.action, reason, reviewer: args.reviewer || "Procurement reviewer" });

  if (args.action === "APPROVE") {
    const id = await addToVendorMaster(store, submission.form_data, run.id);
    await store.updateRun(run.id, { review_resolved: true, final_status: "APPROVED", headline: `Approved by reviewer: ${reason}` });
    return { action, vendorId: id };
  }
  if (args.action === "REJECT") {
    await store.updateRun(run.id, { review_resolved: true, final_status: "REJECTED", headline: `Rejected by reviewer: ${reason}` });
    const msg = templateMessage(submission.form_data, { outcome: "REJECTED", internal_status: "REJECTED", review_flag: false, headline: "After review, we are unable to verify the details provided.", deciding_checks: [] }, []);
    if (msg) await store.saveMessage({ run_id: run.id, subject: msg.subject, body: msg.body, analyst_summary: `Rejected by reviewer: ${reason}`, generated_by: "template" });
    return { action };
  }
  await store.updateRun(run.id, { review_resolved: true, final_status: "PENDING_INFO", headline: `Reviewer asked the vendor for more information: ${reason}` });
  await store.saveMessage({
    run_id: run.id,
    subject: `Vendor registration for ${submission.form_data.legal_name}: more information needed`,
    body: `Dear ${submission.form_data.contact.name || "there"},\n\nThank you for your vendor registration. Our procurement team needs a little more information to complete it:\n\n${reason}\n\nPlease reply to this email or resubmit your registration with the details above.\n\nRegards,\nProcurement Team`,
    analyst_summary: `Reviewer requested information: ${reason}`,
    generated_by: "template",
  });
  return { action };
}
