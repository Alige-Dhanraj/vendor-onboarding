// Vendor messages are fixed templates built only from the verified findings.
// Why not AI here: a vendor email must never invent a requirement, and it must be short.
// **double asterisks** mark bold; the screen renders them, email links and copy strip them.

import type { CheckResult, Decision, SubmissionForm } from "./types";

export interface DraftMessage {
  subject: string;
  body: string;
  analyst_summary: string;
}

const lines = (rs: CheckResult[]) => rs.flatMap((r) => (r.vendor_fix ?? "").split("\n").map((l) => l.trim()).filter(Boolean));
const numbered = (ls: string[]) => ls.map((l, i) => `${i + 1}. ${l}`).join("\n");
const firstName = (n: string) => (n || "").trim().split(/\s+/)[0] || "there";
const FOOT = "Questions? Just reply to this email.";

export function templateMessage(form: SubmissionForm, decision: Decision, results: CheckResult[]): DraftMessage {
  const hi = `Hi ${firstName(form.contact.name)},`;
  const company = form.legal_name || "your company";
  const fixes = lines(results.filter((r) => r.status === "FAIL" && r.severity === "FIXABLE"));
  const checks = decision.deciding_checks.join(", ");

  if (decision.internal_status === "APPROVED") {
    return {
      subject: `Registration approved: ${company}`,
      body: `${hi}\n\nYour vendor registration is **approved**.\n\n1. Quote the **purchase order number** on every invoice.\n\n${FOOT}`,
      analyst_summary: "Approved: all checks passed.",
    };
  }
  if (decision.internal_status === "REJECTED") {
    const why = lines(results.filter((r) => r.status === "FAIL" && r.severity === "HARD_STOP"));
    return {
      subject: `Registration not approved: ${company}`,
      body: `${hi}\n\nWe can't approve your registration.\n\n${numbered(why.length ? why : ["We can't proceed with this registration."])}\n\n${FOOT}`,
      analyst_summary: `Rejected (${checks || "reviewer"}). ${decision.headline}`,
    };
  }
  if (decision.internal_status === "MANUAL_REVIEW") {
    const extra = fixes.length ? `\n\nPlease also fix:\n${numbered(fixes)}` : "";
    return {
      subject: `Registration under review: ${company}`,
      body: `${hi}\n\nWe're reviewing your registration and may contact you.${extra}\n\n${FOOT}`,
      analyst_summary: `Manual review (${checks}). ${decision.headline}`,
    };
  }
  const list = fixes.length ? fixes : ["**Documents**: please resend clear copies"];
  return {
    subject: `${company}: ${list.length} item${list.length === 1 ? "" : "s"} needed`,
    body: `${hi}\n\nTo finish your registration, please fix:\n\n${numbered(list)}\n\nJust reply to this email with the fixes. Thank you!`,
    analyst_summary: `Pending vendor action on ${checks}.`,
  };
}

/** Short email asking a vendor for the documents we need. */
export function requestDocumentsMessage(contactName: string, docLabels: string[]) {
  return {
    subject: "Documents needed for your registration",
    body: `Hi ${firstName(contactName)},\n\nTo register you as a vendor, please reply with:\n\n${numbered(docLabels.map((l) => `**${l}**`))}\n\nThank you!`,
  };
}

/** Short nudge for a vendor we are still waiting on. */
export function reminderMessage(contactName: string) {
  return {
    subject: "Reminder: your registration",
    body: `Hi ${firstName(contactName)},\n\nA quick reminder: we're still waiting on the items in our earlier email.\n\nJust reply to this email. Thank you!`,
  };
}
