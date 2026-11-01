// Shared types for the vendor onboarding engine.
// The engine is pure TypeScript with no dependencies, so it runs the same
// in unit tests, in the API route on Vercel, and in the scenario script.

export type EntityType = "PRIVATE_LIMITED" | "LLP" | "PARTNERSHIP" | "PROPRIETORSHIP" | "CORPORATION";
export type Country = "IN" | "US";

export type DocSlot =
  | "GST_CERTIFICATE"
  | "GST_DECLARATION"
  | "PAN_CARD"
  | "BANK_PROOF"
  | "EIN_NOTICE";

export type DocType = DocSlot | "OTHER" | "UNREADABLE";

/** What the vendor typed into the form. */
export interface SubmissionForm {
  vendor_ref: string;
  legal_name: string;
  trade_name?: string;
  entity_type: EntityType | "";
  country: Country | "";
  address: { street: string; city: string; state: string; postal_code: string };
  contact: { name: string; email: string; phone: string; alt_phone?: string };
  tax: { pan?: string; gst_registered?: boolean; gstin?: string; ein?: string };
  bank: { account_holder: string; account_number: string; ifsc?: string; routing_number?: string };
  msme_udyam?: string;
}

/** Fields the AI reads off one document. Every field is optional. */
export interface ExtractedFields {
  legal_name?: string;
  pan?: string;
  gstin?: string;
  account_holder?: string;
  account_number?: string;
  ifsc?: string;
  ein?: string;
  registration_state?: string;
}

/** One uploaded document after the AI has read it. */
export interface ExtractedDoc {
  slot: DocSlot;            // the upload slot the vendor used
  file_name: string;
  doc_type: DocType;        // what the AI says the document actually is
  fields: ExtractedFields;
  confidence: Partial<Record<keyof ExtractedFields, number>>; // 0..1 per field (an estimate)
  overall_confidence: number; // 0..1, how legible the document was
}

export interface VendorRecord {
  id: string;
  legal_name: string;
  pan?: string;
  gstin?: string;
  bank_account_hash: string;
  bank_last4: string;
}

export interface BlocklistEntry {
  name?: string;
  pan?: string;
  bank_account_hash?: string;
  reason: string;
}

/** Labelled TEST REGISTRY: a stand-in for the GST portal, never presented as the real thing. */
export type TestRegistry = Record<string, { status: "ACTIVE" | "CANCELLED"; legal_name: string }>;

export type NameVerdict = "SAME" | "DIFFERENT" | "UNSURE";
export interface NameJudgement {
  verdict: NameVerdict;
  reason: string;
  by: "RULES" | "AI" | "FALLBACK";
}

export interface CheckContext {
  form: SubmissionForm;
  docs: ExtractedDoc[];
  vendorMaster: VendorRecord[];
  blocklist: BlocklistEntry[];
  registry: TestRegistry;
  /** Judgements for name pairs the rules could not settle (filled by the workflow before checks run). */
  nameJudgements: Record<string, NameJudgement>;
  /** Confidence below this is treated as "could not read reliably". */
  confidenceThreshold: number;
}

export type Layer = "COMPLETE" | "VALID" | "CONSISTENT" | "CREDIBLE";
export type CheckStatus = "PASS" | "FAIL" | "WARN" | "UNVERIFIED" | "SKIPPED";
export type Severity = "HARD_STOP" | "REVIEW" | "FIXABLE" | "WARNING";

export interface Source {
  label: string; // e.g. "Vendor form", "Cancelled cheque (AI-read, 0.94)"
  value: string;
}

/** Every check result answers: what was checked, from where, which rule, why, what next. */
export interface CheckResult {
  id: string;          // C1, V3, K6 ...
  layer: Layer;
  title: string;
  status: CheckStatus;
  severity: Severity | null; // set when status is FAIL (or WARN -> WARNING)
  checked: string;
  sources: Source[];
  rule: string;
  reason: string;
  next_action: string;
  vendor_fix?: string; // plain-language fix for the vendor message (FIXABLE only)
}

export type Outcome = "APPROVED" | "PENDING" | "REJECTED";
export type InternalStatus = "APPROVED" | "PENDING_INFO" | "MANUAL_REVIEW" | "REJECTED";

export interface Decision {
  outcome: Outcome;
  internal_status: InternalStatus;
  review_flag: boolean;
  headline: string;
  deciding_checks: string[]; // check ids that decided the outcome
}
