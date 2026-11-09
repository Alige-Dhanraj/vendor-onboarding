// The verified vendor record that leaves the app (CSV/JSON download and the accounting webhook).
// The full bank account number is never exported: only the last 4 digits. A real connector would pass the
// full number over a secure channel to the payments system.
import type { RunBundle } from "../store/types";
import { effectiveStatus } from "../ui-labels";

export interface ExportRecord {
  vendor_ref: string; legal_name: string; trade_name: string; entity_type: string; country: string;
  pan: string; gstin: string; ein: string;
  bank_account_holder: string; bank_account_last4: string; ifsc: string; routing_number: string;
  street: string; city: string; state: string; postal_code: string;
  contact_name: string; contact_email: string; contact_phone: string; alt_phone: string;
  submitted_at: string; verified_at: string; verified_by: string; run_id: string; version: number;
  status: "Active" | "Inactive"; inactive_reason: string;
}

export const isApproved = (b: RunBundle) => effectiveStatus(b.run) === "APPROVED";

export function buildRecord(b: RunBundle): ExportRecord {
  const f = b.submission.form_data;
  const approver = b.reviewer_actions.find((a) => a.action === "APPROVE");
  return {
    vendor_ref: b.submission.vendor_ref, legal_name: f.legal_name, trade_name: f.trade_name ?? "", entity_type: f.entity_type, country: f.country,
    pan: f.tax.pan ?? "", gstin: f.tax.gstin ?? "", ein: f.tax.ein ?? "",
    bank_account_holder: f.bank.account_holder, bank_account_last4: (f.bank.account_number ?? "").replace(/\D/g, "").slice(-4),
    ifsc: f.bank.ifsc ?? "", routing_number: f.bank.routing_number ?? "",
    street: f.address.street, city: f.address.city, state: f.address.state, postal_code: f.address.postal_code,
    contact_name: f.contact.name, contact_email: f.contact.email, contact_phone: f.contact.phone, alt_phone: f.contact.alt_phone ?? "",
    submitted_at: b.submission.created_at,
    verified_at: b.run.finished_at ?? b.run.started_at,
    verified_by: approver ? approver.reviewer : "VendorGate automatic checks",
    run_id: b.run.id, version: b.submission.version,
    status: b.vendor?.active === false ? "Inactive" : "Active", inactive_reason: b.vendor?.active === false ? b.vendor.reason ?? "" : "",
  };
}

/** One header row + one data row. Quotes values with commas/quotes, and defuses spreadsheet formulas (=, @, +x, -x). */
const esc = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=@]|^[+-](?![\d\s])/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const COLUMNS: (keyof ExportRecord)[] = [
  "vendor_ref", "legal_name", "trade_name", "entity_type", "country", "pan", "gstin", "ein", "bank_account_holder", "bank_account_last4", "ifsc", "routing_number",
  "street", "city", "state", "postal_code", "contact_name", "contact_email", "contact_phone", "alt_phone", "submitted_at", "verified_at", "verified_by", "run_id", "version", "status", "inactive_reason",
];
export function recordsCsv(rs: ExportRecord[]): string {
  return `${COLUMNS.join(",")}\n${rs.map((r) => COLUMNS.map((k) => esc(r[k])).join(",")).join("\n")}${rs.length ? "\n" : ""}`;
}
export const recordCsv = (r: ExportRecord) => recordsCsv([r]);
