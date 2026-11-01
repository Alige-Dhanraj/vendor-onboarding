// Template vendor message built only from failed checks.
// The AI version (lib/ai/draft-message.ts) rewrites this into friendlier prose, but it receives
// exactly the same list of findings, so it cannot invent new requirements.

import type { CheckResult, Decision, SubmissionForm } from "./types";

export interface DraftMessage {
  subject: string;
  body: string;
  analyst_summary: string;
}

export function templateMessage(form: SubmissionForm, decision: Decision, results: CheckResult[]): DraftMessage | null {
  const name = form.contact.name || "there";
  const company = form.legal_name || "your company";
  const fixes = results.filter((r) => r.status === "FAIL" && r.severity === "FIXABLE" && r.vendor_fix).map((r) => r.vendor_fix!);

  if (decision.internal_status === "APPROVED") return null;

  if (decision.internal_status === "REJECTED") {
    return {
      subject: `Vendor registration for ${company}: unable to proceed`,
      body: `Dear ${name},\n\nThank you for submitting your vendor registration for ${company}. We are unable to proceed with this registration at this time.\n\nReason: ${decision.headline}\n\nIf you believe this is incorrect, please reply to this email and our procurement team will look into it.\n\nRegards,\nProcurement Team`,
      analyst_summary: `Rejected by ${decision.deciding_checks.join(", ")}. ${decision.headline}`,
    };
  }

  if (decision.internal_status === "MANUAL_REVIEW") {
    const extra = fixes.length ? `\n\nIn the meantime, please also fix the following:\n${fixes.map((f, i) => `${i + 1}. ${f}`).join("\n")}` : "";
    return {
      subject: `Vendor registration for ${company}: under review`,
      body: `Dear ${name},\n\nThank you for your vendor registration for ${company}. Your submission is being reviewed by our procurement team, and we may contact you to confirm some details.${extra}\n\nRegards,\nProcurement Team`,
      analyst_summary: `Manual review needed (${decision.deciding_checks.join(", ")}). ${decision.headline}`,
    };
  }

  return {
    subject: `Vendor registration for ${company}: ${fixes.length} item${fixes.length === 1 ? "" : "s"} needed`,
    body: `Dear ${name},\n\nThank you for your vendor registration for ${company}. To complete it, we need the following:\n\n${fixes.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nOnce you resubmit, we will re-check your registration straight away.\n\nRegards,\nProcurement Team`,
    analyst_summary: `Pending vendor action on ${decision.deciding_checks.join(", ")}.`,
  };
}
