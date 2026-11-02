// Demo and test scenarios. Each scenario has:
//  - the form a vendor submits,
//  - the documents they upload, with what a correct reading of each document returns
//    (used as ground truth for extraction accuracy, and as the offline stand-in when no AI key is set),
//  - the expected outcome.
// All companies, people, IDs and bank accounts are fictional.

import { makeGstin } from "./engine/ids";
import type { DocSlot, DocType, ExtractedDoc, InternalStatus, Outcome, SubmissionForm, TestRegistry } from "./engine/types";
import { BANK, VENDOR_MASTER_SEED } from "./seed";

export interface ScenarioDoc {
  slot: DocSlot;
  file_name: string;
  /** What a correct reading of this document returns. */
  truth: Omit<ExtractedDoc, "slot" | "file_name">;
}

export interface ScenarioVersion {
  form: SubmissionForm;
  docs: ScenarioDoc[];
  expected: { outcome: Outcome; internal_status: InternalStatus; failing: string[] };
}

export interface Scenario extends ScenarioVersion {
  id: string;
  label: string;
  group: "happy" | "edge" | "negative" | "reserve";
  story: string;
  resubmission?: ScenarioVersion;
}

// ---------- builders ----------

interface InParams {
  ref: string; name: string; entity?: SubmissionForm["entity_type"]; pan: string; stateCode: string; state: string;
  city: string; street: string; pin: string; contact: string; email: string; phone: string;
  holder?: string; acct: string; ifsc: string; gstin?: string; trade?: string;
}

function inForm(p: InParams): SubmissionForm {
  return {
    vendor_ref: p.ref, legal_name: p.name, trade_name: p.trade, entity_type: p.entity ?? "PRIVATE_LIMITED", country: "IN",
    address: { street: p.street, city: p.city, state: p.state, postal_code: p.pin },
    contact: { name: p.contact, email: p.email, phone: p.phone },
    tax: { pan: p.pan, gst_registered: true, gstin: p.gstin ?? makeGstin(p.stateCode, p.pan) },
    bank: { account_holder: p.holder ?? p.name, account_number: p.acct, ifsc: p.ifsc },
  };
}

const doc = (slot: DocSlot, file: string, doc_type: DocType, fields: ExtractedDoc["fields"], conf = 0.95): ScenarioDoc => ({
  slot, file_name: file,
  truth: {
    doc_type, fields, overall_confidence: conf,
    confidence: Object.fromEntries(Object.keys(fields).map((k) => [k, conf])) as ExtractedDoc["confidence"],
  },
});

const ENTITY_TEXT: Record<string, string> = { PRIVATE_LIMITED: "Private Limited Company", LLP: "Limited Liability Partnership", PARTNERSHIP: "Partnership", PROPRIETORSHIP: "Proprietorship", CORPORATION: "Corporation" };
const gstCert = (ref: string, name: string, gstin: string, state: string, f?: SubmissionForm) =>
  doc("GST_CERTIFICATE", `${ref}-gst-certificate.pdf`, "GST_CERTIFICATE", {
    legal_name: name, gstin, registration_state: state,
    ...(f ? {
      ...(f.trade_name ? { trade_name: f.trade_name } : {}),
      constitution: ENTITY_TEXT[f.entity_type], address_street: f.address.street, address_city: f.address.city, address_pincode: f.address.postal_code,
    } : {}),
  });
const panCard = (ref: string, name: string, pan: string, slot: DocSlot = "PAN_CARD") =>
  doc(slot, `${ref}-pan-card.png`, "PAN_CARD", { legal_name: name, pan });
const cheque = (ref: string, holder: string, acct: string, ifsc: string, conf = 0.95) =>
  doc("BANK_PROOF", `${ref}-cancelled-cheque.png`, "BANK_PROOF", { account_holder: holder, account_number: acct, ifsc }, conf);

const fullSet = (f: SubmissionForm, holderOnCheque?: string) => [
  gstCert(f.vendor_ref, f.legal_name, f.tax.gstin!, f.address.state, f),
  panCard(f.vendor_ref, f.legal_name, f.tax.pan!),
  cheque(f.vendor_ref, holderOnCheque ?? f.bank.account_holder, f.bank.account_number, f.bank.ifsc!),
];

// ---------- scenarios ----------

const kaveri = inForm({ ref: "kaveri", name: "Kaveri Precision Components Pvt Ltd", trade: "Kaveri Precision", pan: "AABCK4821L", stateCode: "33", state: "Tamil Nadu", city: "Chennai", street: "14 Industrial Estate Road, Guindy", pin: "600032", contact: "Priya Raman", email: "accounts@kaveriprecision.example", phone: "+91 98400 12345", acct: "50200012345678", ifsc: "DEMO0004321" });

const nilgiri = inForm({ ref: "nilgiri", name: "Nilgiri Precision Components Pvt Ltd", pan: "AAFCN3307H", stateCode: "33", state: "Tamil Nadu", city: "Coimbatore", street: "22 Avinashi Road, Peelamedu", pin: "641018", contact: "Karthik Subramanian", email: "finance@nilgiriprecision.example", phone: "+91 94430 55678", acct: "60311122233344", ifsc: "DEMO0002211" });

const thanjavur = inForm({ ref: "thanjavur", name: "Thanjavur Textiles Pvt Ltd", pan: "AADCT9154M", stateCode: "33", state: "Tamil Nadu", city: "Thanjavur", street: "5 Gandhiji Road", pin: "613001", contact: "Meena Krishnan", email: "accounts@thanjavurtextiles.example", phone: "+91 90030 44112", acct: "71200455566677", ifsc: "DEMO0000874" });

const madurai = inForm({ ref: "madurai", name: "Madurai Agro Foods Pvt Ltd", pan: "AAGCM4410B", stateCode: "33", state: "Tamil Nadu", city: "Madurai", street: "88 Bypass Road, Kalavasal", pin: "625016", contact: "Senthil Kumar", email: "senthil@maduraiagro.example", phone: "+91 97890 22331", acct: "80120066677788", ifsc: "DEMO0001190" });

const deccanAgain = inForm({ ref: "deccan", name: "Deccan Steel Traders Pvt Ltd", pan: "AAPCD7781E", stateCode: "29", state: "Karnataka", city: "Bengaluru", street: "41 Peenya Industrial Area", pin: "560058", contact: "Ravi Hegde", email: "ravi@deccansteel.example", phone: "+91 98450 77665", acct: BANK.deccan, ifsc: "DEMO0000123" });

const ganesh = inForm({ ref: "ganesh", name: "Shree Ganesh Supplies", entity: "PARTNERSHIP", pan: "ABJFS8823R", stateCode: "29", state: "Karnataka", city: "Bengaluru", street: "9 Avenue Road", pin: "560002", contact: "Mahesh Rao", email: "mahesh@shreeganesh.example", phone: "+91 99001 23456", acct: BANK.deccan, ifsc: "DEMO0000123" });

const arjun = inForm({ ref: "arjun", name: "Arjun Polymers Pvt Ltd", pan: "AABCA6612Q", stateCode: "24", state: "Gujarat", city: "Ahmedabad", street: "17 GIDC Estate, Vatva", pin: "382445", contact: "Arjun Mehta", email: "arjun@arjunpolymers.example", phone: "+91 98250 66554", acct: "20910033344455", ifsc: "DEMO0VATVAX" });

const kanchi: SubmissionForm = { ...inForm({ ref: "kanchi", name: "Kanchi Silk Exports Pvt Ltd", pan: "AAHCK7720D", stateCode: "33", state: "Tamil Nadu", city: "Kanchipuram", street: "3 Gandhi Road", pin: "631501", contact: "Lakshmi Narayanan", email: "exports@kanchisilk.example", phone: "+91 94440 98765", acct: "33010088899900", ifsc: "DEMO0001523" }), trade_name: undefined, msme_udyam: undefined };

const hosurGstin = makeGstin("33", "AAJCH5108N");
const hosurTypo = hosurGstin.slice(0, 14) + (hosurGstin[14] === "A" ? "B" : "A");
const hosur = inForm({ ref: "hosur", name: "Hosur Auto Parts Pvt Ltd", pan: "AAJCH5108N", stateCode: "33", state: "Tamil Nadu", city: "Hosur", street: "SIPCOT Phase 2, Plot 61", pin: "635109", contact: "Dinesh Babu", email: "dinesh@hosurautoparts.example", phone: "+91 98946 11223", acct: "44120077788899", ifsc: "DEMO0001288", gstin: hosurTypo });

const erode = inForm({ ref: "erode", name: "Erode Handloom Company Pvt Ltd", pan: "AAKCE3391F", stateCode: "33", state: "Tamil Nadu", city: "Erode", street: "12 Brough Road", pin: "638001", contact: "Gowri Shankar", email: "gowri@erodehandloom.example", phone: "+91 96290 33445", acct: "55780011122233", ifsc: "DEMO0000045" });

const salem = inForm({ ref: "salem", name: "Salem Steel Fab Pvt Ltd", pan: "AALCS6604G", stateCode: "33", state: "Tamil Nadu", city: "Salem", street: "7 Omalur Main Road", pin: "636007", contact: "Prakash Murugan", email: "prakash@salemsteelfab.example", phone: "+91 93600 55667", acct: "66890022233344", ifsc: "DEMO000S011" });

const pune = inForm({ ref: "pune", name: "Pune Packaging Solutions Pvt Ltd", pan: "AABCP5521K", stateCode: "27", state: "Maharashtra", city: "Pune", street: "Plot 18, MIDC Bhosari", pin: "411026", contact: "Neha Kulkarni", email: "accounts@punepackaging.example", phone: "+91 98220 31457", acct: "91230044455566", ifsc: "DEMO0003345" });
const withEnd = (d: ScenarioDoc, end: string, file: string): ScenarioDoc => ({ ...d, file_name: file, truth: { ...d.truth, fields: { ...d.truth.fields, valid_until: end }, confidence: { ...d.truth.confidence, valid_until: 0.95 } } });

const bayview: SubmissionForm = {
  vendor_ref: "bayview", legal_name: "Bayview Analytics Inc", entity_type: "CORPORATION", country: "US",
  address: { street: "500 Market Street, Suite 300", city: "San Francisco", state: "California", postal_code: "94105" },
  contact: { name: "Dana Whitfield", email: "ap@bayviewanalytics.example", phone: "+1 415 555 0134" },
  tax: { ein: makeGstin("33", "AABCB1234F") },
  bank: { account_holder: "Bayview Analytics Inc", account_number: "000123456789", routing_number: "123456780" },
};

export const SCENARIOS: Scenario[] = [
  {
    id: "0-happy", label: "0 · Happy path: Kaveri Precision", group: "happy",
    story: "A clean Chennai manufacturer. Every field and document agrees.",
    form: kaveri, docs: fullSet(kaveri),
    expected: { outcome: "APPROVED", internal_status: "APPROVED", failing: [] },
  },
  {
    id: "1a-name-variant", label: "1A · Bank name written differently", group: "edge",
    story: "The cheque says \"Nilgiri Precision Comp. Pvt. Ltd.\": looks like a mismatch, but it's the same company abbreviated.",
    form: nilgiri, docs: fullSet(nilgiri, "Nilgiri Precision Comp. Pvt. Ltd."),
    expected: { outcome: "APPROVED", internal_status: "APPROVED", failing: [] },
  },
  {
    id: "1b-different-payee", label: "1B · Bank account in another party's name", group: "edge",
    story: "The form says the account belongs to the company, but the cancelled cheque is in the name of \"Ramesh Traders\": a classic payment-fraud setup.",
    form: thanjavur, docs: fullSet(thanjavur, "Ramesh Traders"),
    expected: { outcome: "PENDING", internal_status: "MANUAL_REVIEW", failing: ["K6"] },
  },
  {
    id: "2-wrong-document", label: "2 · Wrong document + missing GST certificate", group: "edge",
    story: "The vendor uploads the PAN card again in the cancelled-cheque slot and forgets the GST certificate. Then they resubmit correctly.",
    form: madurai,
    docs: [panCard("madurai", madurai.legal_name, madurai.tax.pan!), { ...panCard("madurai", madurai.legal_name, madurai.tax.pan!, "BANK_PROOF"), file_name: "madurai-bank-proof.png" }],
    expected: { outcome: "PENDING", internal_status: "PENDING_INFO", failing: ["C2", "C3"] },
    resubmission: {
      form: madurai, docs: fullSet(madurai),
      expected: { outcome: "APPROVED", internal_status: "APPROVED", failing: [] },
    },
  },
  {
    id: "3a-duplicate", label: "3A · Existing vendor applies again", group: "edge",
    story: "Deccan Steel Traders is already an approved vendor (VM-001) and submits a fresh registration with the same GSTIN.",
    form: deccanAgain, docs: fullSet(deccanAgain),
    expected: { outcome: "REJECTED", internal_status: "REJECTED", failing: ["R2"] },
  },
  {
    id: "3b-bank-reuse", label: "3B · New vendor reuses a known bank account", group: "edge",
    story: "\"Shree Ganesh Supplies\" is new, every field is valid, but its bank account already belongs to Deccan Steel Traders.",
    form: ganesh, docs: fullSet(ganesh),
    expected: { outcome: "PENDING", internal_status: "MANUAL_REVIEW", failing: ["R1"] },
  },
  {
    id: "4-hidden-mismatch", label: "4 · Hidden ID mismatch", group: "edge",
    story: "Every ID is well-formed on its own, but the PAN card belongs to an individual and doesn't match the PAN inside the GSTIN.",
    form: arjun,
    docs: [gstCert("arjun", arjun.legal_name, arjun.tax.gstin!, "Gujarat"), panCard("arjun", "Arjun Mehta", "BXRPA6612Q"), cheque("arjun", arjun.legal_name, arjun.bank.account_number, arjun.bank.ifsc!)],
    expected: { outcome: "PENDING", internal_status: "MANUAL_REVIEW", failing: ["K1", "K2"] },
  },
  {
    id: "5-expired-document", label: "5 · Expired GST certificate", group: "edge",
    story: "The GST certificate is for a temporary registration that ended in 2025. The system asks for a current one. The vendor resubmits and is approved.",
    form: pune,
    docs: [withEnd(gstCert("pune", pune.legal_name, pune.tax.gstin!, "Maharashtra", pune), "30/06/2025", "pune-gst-certificate-expired.pdf"), panCard("pune", pune.legal_name, pune.tax.pan!), cheque("pune", pune.legal_name, pune.bank.account_number, pune.bank.ifsc!)],
    expected: { outcome: "PENDING", internal_status: "PENDING_INFO", failing: ["R5"] },
    resubmission: {
      form: pune,
      docs: [withEnd(gstCert("pune", pune.legal_name, pune.tax.gstin!, "Maharashtra", pune), "31/12/2030", "pune-gst-certificate.pdf"), panCard("pune", pune.legal_name, pune.tax.pan!), cheque("pune", pune.legal_name, pune.bank.account_number, pune.bank.ifsc!)],
      expected: { outcome: "APPROVED", internal_status: "APPROVED", failing: [] },
    },
  },
  {
    id: "n1-optional-missing", label: "Negative · Optional fields blank", group: "negative",
    story: "No trade name and no MSME number. Both are optional, so this must still be approved (no false alarm).",
    form: kanchi, docs: fullSet(kanchi),
    expected: { outcome: "APPROVED", internal_status: "APPROVED", failing: [] },
  },
  {
    id: "n2-gstin-typo", label: "Negative · GSTIN with one wrong character", group: "negative",
    story: "The vendor mistyped the last character of the GSTIN. The check character catches it.",
    form: hosur,
    docs: [gstCert("hosur", hosur.legal_name, hosurGstin, "Tamil Nadu"), panCard("hosur", hosur.legal_name, hosur.tax.pan!), cheque("hosur", hosur.legal_name, hosur.bank.account_number, hosur.bank.ifsc!)],
    expected: { outcome: "PENDING", internal_status: "PENDING_INFO", failing: ["V3"] },
  },
  {
    id: "r1-us-tax-id", label: "Reserve · US vendor gives an Indian-format tax ID", group: "reserve",
    story: "A San Francisco company types a GSTIN-shaped number into the EIN field.",
    form: bayview,
    docs: [doc("EIN_NOTICE", "bayview-ein-notice.pdf", "EIN_NOTICE", { legal_name: "Bayview Analytics Inc", ein: "94-3417756" }), doc("BANK_PROOF", "bayview-bank-letter.pdf", "BANK_PROOF", { account_holder: "Bayview Analytics Inc", account_number: "000123456789" })],
    expected: { outcome: "PENDING", internal_status: "PENDING_INFO", failing: ["V5"] },
  },
  {
    id: "r2-blurry-scan", label: "Reserve · Blurry cancelled cheque", group: "reserve",
    story: "The cheque scan is too blurry to read the account holder. The system asks for a clearer copy instead of guessing.",
    form: erode,
    docs: [gstCert("erode", erode.legal_name, erode.tax.gstin!, "Tamil Nadu"), panCard("erode", erode.legal_name, erode.tax.pan!), cheque("erode", "Erode Handl?? C?mp", "557800?1122233", "DEMO0000045", 0.41)],
    expected: { outcome: "PENDING", internal_status: "PENDING_INFO", failing: ["C4"] },
  },
  {
    id: "r3-gst-cancelled", label: "Reserve · GST registration cancelled (TEST REGISTRY)", group: "reserve",
    story: "Everything looks fine, but the TEST REGISTRY marks this GSTIN as cancelled.",
    form: salem, docs: fullSet(salem),
    expected: { outcome: "REJECTED", internal_status: "REJECTED", failing: ["R4"] },
  },
];

/** TEST REGISTRY: a labelled stand-in for the GST portal. */
export const TEST_REGISTRY: TestRegistry = Object.fromEntries([
  ...VENDOR_MASTER_SEED.map((v) => [v.gstin!, { status: "ACTIVE" as const, legal_name: v.legal_name }]),
  ...[kaveri, nilgiri, thanjavur, madurai, ganesh, arjun, kanchi, erode, pune].map((f) => [f.tax.gstin!, { status: "ACTIVE" as const, legal_name: f.legal_name }]),
  [hosurGstin, { status: "ACTIVE" as const, legal_name: hosur.legal_name }],
  [salem.tax.gstin!, { status: "CANCELLED" as const, legal_name: salem.legal_name }],
]);

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);
