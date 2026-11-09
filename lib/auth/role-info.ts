// What each role can do. Shown in Settings and on the login page, so a reviewer of the demo can see the rules at a glance.
import type { Role } from "./session";

export const ROLE_INFO: { role: Role; label: string; summary: string; can: string[]; cannot: string[] }[] = [
  {
    role: "BUYER", label: "Buyer", summary: "Procurement team member who brings vendors in.",
    can: ["Add a vendor and upload documents", "Send a vendor link by email or WhatsApp", "See every vendor and result", "Download vendor records and the CSV", "Re-run a failed check"],
    cannot: ["Approve, reject or ask for more on a flagged vendor", "Deactivate or reactivate a vendor", "Open Settings"],
  },
  {
    role: "REVIEWER", label: "Reviewer", summary: "Finance or compliance person who decides the doubtful cases.",
    can: ["Everything a Buyer can do", "Approve, reject or ask the vendor for more, with a written reason (kept in the audit log)", "Deactivate or reactivate an approved vendor"],
    cannot: ["Decide a vendor they entered themselves (someone else must)", "Open Settings"],
  },
  {
    role: "ADMIN", label: "Admin", summary: "Runs the system.",
    can: ["Everything a Reviewer can do", "Open Settings: people, accounting connection, demo tools, reset test data"],
    cannot: ["Decide a vendor they entered themselves (someone else must)"],
  },
];
