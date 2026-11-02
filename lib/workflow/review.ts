// Reviewer actions on a flagged run. A reason is mandatory and every action is logged.
// Hard-stop rejections cannot be overridden in the MVP; only runs flagged for review can be.
import type { Store } from "../store/types";
import type { Decision } from "../engine/types";
import { templateMessage } from "../engine/message";
import { addToVendorMaster } from "./run";

export class ReviewError extends Error {}

const decision = (internal_status: Decision["internal_status"], outcome: Decision["outcome"], headline: string): Decision =>
  ({ outcome, internal_status, review_flag: false, headline, deciding_checks: [] });

export async function reviewRun(store: Store, args: { runId: string; action: "APPROVE" | "REJECT" | "REQUEST_INFO"; reason: string; reviewer?: string }) {
  const reason = (args.reason ?? "").trim();
  if (reason.length < 10) throw new ReviewError("Please give a reason of at least 10 characters. Every reviewer decision is recorded in the audit log.");
  const bundle = await store.getRun(args.runId);
  if (!bundle) throw new ReviewError("Run not found.");
  const { run, submission } = bundle;
  const form = submission.form_data;
  if (run.status !== "COMPLETED") throw new ReviewError("This run has not finished.");
  if (!run.review_flag) throw new ReviewError("Only runs flagged for manual review can be decided by a reviewer.");
  if (run.review_resolved) throw new ReviewError("This review has already been decided.");

  const action = await store.addReviewerAction({ run_id: run.id, action: args.action, reason, reviewer: args.reviewer || "Procurement reviewer" });
  const save = (m: { subject: string; body: string; analyst_summary: string }) =>
    store.saveMessage({ run_id: run.id, subject: m.subject, body: m.body, analyst_summary: m.analyst_summary, generated_by: "template" });

  if (args.action === "APPROVE") {
    const id = await addToVendorMaster(store, form, run.id);
    await store.updateRun(run.id, { review_resolved: true, final_status: "APPROVED", headline: `Approved by reviewer: ${reason}` });
    await save(templateMessage(form, decision("APPROVED", "APPROVED", ""), []));
    return { action, vendorId: id };
  }
  if (args.action === "REJECT") {
    await store.updateRun(run.id, { review_resolved: true, final_status: "REJECTED", headline: `Rejected by reviewer: ${reason}` });
    const m = templateMessage(form, decision("REJECTED", "REJECTED", ""), []);
    await save({ ...m, analyst_summary: `Rejected by reviewer: ${reason}` });
    return { action };
  }
  await store.updateRun(run.id, { review_resolved: true, final_status: "PENDING_INFO", headline: `Reviewer asked the vendor for more: ${reason}` });
  const hi = (form.contact.name || "").trim().split(/\s+/)[0] || "there";
  await save({
    subject: `${form.legal_name || "Your registration"}: 1 item needed`,
    body: `Hi ${hi},\n\nTo finish your registration, please send:\n\n1. ${reason}\n\nJust reply to this email. Thank you!`,
    analyst_summary: `Reviewer requested information: ${reason}`,
  });
  return { action };
}
