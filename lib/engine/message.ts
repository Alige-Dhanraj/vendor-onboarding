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
const US = (f: SubmissionForm) => f.country === "US";
/** The record we hold for the vendor, so they can see exactly how they were registered. Bank account is shown masked. */
function registered(f: SubmissionForm): string {
  const acct = (f.bank?.account_number ?? "").replace(/\D/g, "");
  const addr = [f.address?.street, f.address?.city, f.address?.state, f.address?.postal_code].filter(Boolean).join(", ");
  const rows: [string, string | undefined][] = [
    ["Registered name", f.legal_name],
    ...(US(f) ? ([["EIN", f.tax?.ein]] as [string, string | undefined][]) : ([["PAN", f.tax?.pan], ["GSTIN", f.tax?.gstin || "Not GST-registered"]] as [string, string | undefined][])),
    ["Address", addr],
    ["Contact", [f.contact?.name, f.contact?.email, f.contact?.phone, f.contact?.alt_phone].filter(Boolean).join(" · ")],
    ["Bank account", [f.bank?.account_holder, acct ? "ending " + acct.slice(-4) : ""].filter(Boolean).join(", ")],
  ];
  return rows.filter(([, v]) => v).map(([k, v]) => `• ${k}: ${v}`).join("\n");
}
const FOOT = "Questions? Just reply to this email.";

export function templateMessage(form: SubmissionForm, decision: Decision, results: CheckResult[]): DraftMessage {
  const hi = `Hi ${firstName(form.contact.name)},`;
  const company = form.legal_name || "your company";
  const fixes = lines(results.filter((r) => r.status === "FAIL" && r.severity === "FIXABLE"));
  const checks = decision.deciding_checks.join(", ");

  if (decision.internal_status === "APPROVED") {
    return {
      subject: `You're onboarded as a vendor: ${company}`,
      body: `${hi}\n\nYou have been **onboarded as a vendor**. This is what we have registered:\n\n${registered(form)}\n\nIf anything above is wrong, reply to this email and we will correct it.\n\nNext: quote the **purchase order number** on every invoice.\n\n${FOOT}`,
      analyst_summary: "Approved: all checks passed.",
    };
  }
  if (decision.internal_status === "REJECTED") {
    const why = lines(results.filter((r) => r.status === "FAIL" && r.severity === "HARD_STOP"));
    return {
      subject: `Vendor application not approved: ${company}`,
      body: `${hi}\n\nThank you for applying. We are unable to onboard you as a vendor at this time.\n\n${numbered(why.length ? why : ["We can't proceed with this application."])}\n\n${FOOT}`,
      analyst_summary: `Rejected (${checks || "reviewer"}). ${decision.headline}`,
    };
  }
  if (decision.internal_status === "MANUAL_REVIEW") {
    const extra = fixes.length ? `\n\nPlease also fix:\n${numbered(fixes)}` : "";
    return {
      subject: `Vendor application under review: ${company}`,
      body: `${hi}\n\nWe're reviewing your vendor application and may contact you.${extra}\n\n${FOOT}`,
      analyst_summary: `Manual review (${checks}). ${decision.headline}`,
    };
  }
  const list = fixes.length ? fixes : ["**Documents**: please resend clear copies"];
  return {
    subject: `${company}: ${list.length} item${list.length === 1 ? "" : "s"} needed to complete your vendor onboarding`,
    body: `${hi}\n\nThank you for applying to become a vendor with us. To complete your onboarding, please fix the following:\n\n${numbered(list)}\n\nJust reply to this email with the corrected details or documents attached. Thank you!`,
    analyst_summary: `Pending vendor action on ${checks}.`,
  };
}

/** Short email asking a vendor for the documents we need. */
export function requestDocumentsMessage(contactName: string, docLabels: string[]) {
  return {
    subject: "Documents needed to onboard you as a vendor",
    body: `Hi ${firstName(contactName)},\n\nTo onboard you as a vendor, please reply with:\n\n${numbered(docLabels.map((l) => `**${l}**`))}\n\nThank you!`,
  };
}

/** Short nudge for a vendor we are still waiting on. */
export function reminderMessage(contactName: string) {
  return {
    subject: "Reminder: your vendor onboarding",
    body: `Hi ${firstName(contactName)},\n\nA quick reminder: we're still waiting on the items in our earlier email to complete your vendor onboarding.\n\nJust reply to this email with them attached. Thank you!`,
  };
}

/** Short email that carries the vendor's private registration link. */
export function inviteMessage(contactName: string, link: string) {
  return {
    subject: "Please register as our vendor",
    body: `Hi ${firstName(contactName)},\n\nPlease register as our vendor using this private link:\n\n${link}\n\nUpload your documents there and you can check your status at any time. It takes about 3 minutes.\n\nThank you!`,
  };
}
