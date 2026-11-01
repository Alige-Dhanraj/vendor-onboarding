// The check catalogue (C1-C4, V1-V6, K1-K7, R1-R4).
// Each check is a pure function of the CheckContext and returns one CheckResult
// with the five evidence parts: checked, sources, rule, reason, next action.

import type {
  CheckContext, CheckResult, CheckStatus, DocSlot, ExtractedDoc, ExtractedFields, Layer, NameJudgement, Severity, Source,
} from "./types";
import {
  EXPECTED_PAN_TYPE, GST_STATE_CODES, PAN_HOLDER_TYPES, clean, gstinChecksumOk, gstinPan, gstinState, gstinStructure,
  fixFixedPositions, hashAccount, isEin, isEmail, isIfsc, isPan, isPhone, isPincode, isRoutingNumber, isUsZip, last4, mask,
} from "./ids";
import { compareByRules, fallbackJudge, nameSimilarity, normaliseName, pairKey } from "./names";

export const DOC_LABEL: Record<DocSlot, string> = {
  GST_CERTIFICATE: "GST certificate",
  GST_DECLARATION: "GST non-registration declaration",
  PAN_CARD: "PAN card",
  BANK_PROOF: "Cancelled cheque / bank letter",
  EIN_NOTICE: "IRS EIN notice (CP 575)",
};

const DOC_TYPE_LABEL: Record<string, string> = {
  GST_CERTIFICATE: "a GST certificate", GST_DECLARATION: "a GST declaration", PAN_CARD: "a PAN card",
  BANK_PROOF: "a cheque or bank letter", EIN_NOTICE: "an IRS EIN notice", OTHER: "an unrelated document", UNREADABLE: "unreadable",
};
const noDot = (s: string) => s.replace(/\.+$/, "");

// ---------- helpers ----------

interface Base { id: string; layer: Layer; title: string; checked: string; rule: string }

function result(
  b: Base, status: CheckStatus, severity: Severity | null,
  p: { sources?: Source[]; reason: string; next_action?: string; vendor_fix?: string },
): CheckResult {
  return {
    ...b, status, severity,
    sources: p.sources ?? [],
    reason: p.reason,
    next_action: p.next_action ?? (status === "PASS" ? "None." : status === "SKIPPED" ? "Not applicable." : ""),
    vendor_fix: p.vendor_fix,
  };
}

const formSrc = (value: string | undefined): Source => ({ label: "Vendor form", value: value || "(blank)" });

const docFor = (ctx: CheckContext, slot: DocSlot) => ctx.docs.find((d) => d.slot === slot);

/** A document is usable if it is the right type and legible enough. */
function usable(ctx: CheckContext, d: ExtractedDoc | undefined): d is ExtractedDoc {
  return !!d && d.doc_type === d.slot && d.overall_confidence >= ctx.confidenceThreshold;
}

/** A field value from a document, only if read with enough confidence. */
function trusted(ctx: CheckContext, slot: DocSlot, field: keyof ExtractedFields): { value: string; src: Source } | null {
  const d = docFor(ctx, slot);
  if (!usable(ctx, d)) return null;
  const v = d.fields[field];
  const conf = d.confidence[field] ?? d.overall_confidence;
  if (!v || conf < ctx.confidenceThreshold) return null;
  // Fixed-format IDs: correct O/0-style misreads at positions whose type the format dictates, and say so.
  const kind = field === "pan" ? "pan" : field === "ifsc" ? "ifsc" : field === "gstin" ? "gstin" : null;
  const fixed = kind ? fixFixedPositions(v, kind) : v;
  const note = kind && fixed !== clean(v) ? ` (read as ${v}; corrected O/0-style misread using the ${kind.toUpperCase()} format)` : "";
  return { value: fixed, src: { label: `${DOC_LABEL[slot]} (AI-read, ${conf.toFixed(2)})`, value: fixed + note } };
}

/** Name judgement: rules first, then the AI result supplied by the workflow, then the offline fallback. */
export function judgeNames(ctx: CheckContext, a: string, b: string): NameJudgement {
  return compareByRules(a, b) ?? ctx.nameJudgements[pairKey(a, b)] ?? fallbackJudge(a, b);
}

const normState = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export function requiredDocs(ctx: CheckContext): DocSlot[] {
  const f = ctx.form;
  if (f.country === "US") return ["EIN_NOTICE", "BANK_PROOF"];
  return ["PAN_CARD", "BANK_PROOF", f.tax.gst_registered === false ? "GST_DECLARATION" : "GST_CERTIFICATE"];
}

const isIndia = (ctx: CheckContext) => ctx.form.country !== "US";
const gstRegistered = (ctx: CheckContext) => isIndia(ctx) && ctx.form.tax.gst_registered !== false;

// ---------- COMPLETE ----------

function c1(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "C1", layer: "COMPLETE", title: "Required fields filled", checked: "Every field required for this entity type and country", rule: "C1: all mandatory fields must be filled; optional fields (trade name, MSME number) are not required." };
  const req: [string, string | boolean | undefined][] = [
    ["Legal name", f.legal_name], ["Entity type", f.entity_type], ["Country", f.country],
    ["Street address", f.address.street], ["City", f.address.city], ["State", f.address.state],
    [f.country === "US" ? "ZIP code" : "Pincode", f.address.postal_code],
    ["Contact name", f.contact.name], ["Contact email", f.contact.email], ["Contact phone", f.contact.phone],
    ["Bank account holder name", f.bank.account_holder], ["Bank account number", f.bank.account_number],
  ];
  if (f.country === "US") {
    req.push(["EIN", f.tax.ein], ["Routing number", f.bank.routing_number]);
  } else {
    req.push(["PAN", f.tax.pan], ["IFSC", f.bank.ifsc]);
    if (f.tax.gst_registered === undefined) req.push(["GST registered (yes/no)", undefined]);
    if (f.tax.gst_registered) req.push(["GSTIN", f.tax.gstin]);
  }
  const missing = req.filter(([, v]) => v === undefined || v === "").map(([k]) => k);
  if (!missing.length) return result(b, "PASS", null, { reason: "All required fields are filled." });
  return result(b, "FAIL", "FIXABLE", {
    sources: [formSrc(`missing: ${missing.join(", ")}`)],
    reason: `${missing.length} required field${missing.length > 1 ? "s are" : " is"} blank: ${missing.join(", ")}.`,
    next_action: "Ask the vendor to fill the missing fields.",
    vendor_fix: `Please fill in: ${missing.join(", ")}.`,
  });
}

function c2(ctx: CheckContext): CheckResult {
  const b: Base = { id: "C2", layer: "COMPLETE", title: "Required documents attached", checked: "Every document required for this vendor is uploaded", rule: "C2: India needs PAN card + bank proof + GST certificate (or a signed non-registration declaration); US needs the IRS EIN notice + bank letter." };
  const need = requiredDocs(ctx);
  const missing = need.filter((s) => !docFor(ctx, s));
  const sources = need.map((s) => ({ label: DOC_LABEL[s], value: docFor(ctx, s) ? `uploaded (${docFor(ctx, s)!.file_name})` : "missing" }));
  if (!missing.length) return result(b, "PASS", null, { sources, reason: "All required documents are uploaded." });
  const names = missing.map((s) => DOC_LABEL[s]);
  return result(b, "FAIL", "FIXABLE", {
    sources, reason: `Missing: ${names.join(", ")}.`,
    next_action: "Ask the vendor to upload the missing documents.",
    vendor_fix: `Please upload: ${names.join(", ")}.`,
  });
}

function c3(ctx: CheckContext): CheckResult {
  const b: Base = { id: "C3", layer: "COMPLETE", title: "Each upload is the right document", checked: "What each uploaded file actually is, compared with the slot it was uploaded in", rule: "C3: the AI classifies every upload; a file in the wrong slot does not count as that document." };
  const wrong = ctx.docs.filter((d) => d.doc_type !== d.slot && d.doc_type !== "UNREADABLE");
  const sources = ctx.docs.map((d) => ({ label: `${DOC_LABEL[d.slot]} slot`, value: `${d.file_name}: AI says ${DOC_TYPE_LABEL[d.doc_type]}` }));
  if (!ctx.docs.length) return result(b, "SKIPPED", null, { reason: "No documents uploaded (see C2)." });
  if (!wrong.length) return result(b, "PASS", null, { sources, reason: "Every upload is the document its slot asks for." });
  const desc = wrong.map((d) => `the file in the ${DOC_LABEL[d.slot]} slot is ${DOC_TYPE_LABEL[d.doc_type]}`);
  return result(b, "FAIL", "FIXABLE", {
    sources, reason: `Wrong document: ${desc.join("; ")}.`,
    next_action: "Ask the vendor to upload the correct document in each slot.",
    vendor_fix: wrong.map((d) => `The file you uploaded as your ${DOC_LABEL[d.slot]} is ${DOC_TYPE_LABEL[d.doc_type]}. Please upload your ${DOC_LABEL[d.slot]} instead.`).join(" "),
  });
}

function c4(ctx: CheckContext): CheckResult {
  const b: Base = { id: "C4", layer: "COMPLETE", title: "Documents are legible", checked: "Whether each document could be read reliably", rule: `C4: if the AI's reading confidence is below ${ctx.confidenceThreshold}, the system does not guess; it asks for a clearer copy.` };
  const bad = ctx.docs.filter((d) => d.doc_type === "UNREADABLE" || (d.doc_type === d.slot && d.overall_confidence < ctx.confidenceThreshold));
  if (!ctx.docs.length) return result(b, "SKIPPED", null, { reason: "No documents uploaded (see C2)." });
  const sources = ctx.docs.map((d) => ({ label: DOC_LABEL[d.slot], value: `${d.file_name}: legibility ${d.overall_confidence.toFixed(2)}` }));
  if (!bad.length) return result(b, "PASS", null, { sources, reason: "All documents were read clearly." });
  const names = bad.map((d) => DOC_LABEL[d.slot]);
  return result(b, "FAIL", "FIXABLE", {
    sources, reason: `Could not read reliably: ${names.join(", ")}. Values from ${bad.length > 1 ? "these documents" : "this document"} are treated as unverified, not guessed.`,
    next_action: "Ask the vendor for a clearer copy; checks that depend on it stay unverified.",
    vendor_fix: `We could not read your ${names.join(" and ")} clearly. Please upload a sharper scan or the original PDF.`,
  });
}

// ---------- VALID ----------

function v1(ctx: CheckContext): CheckResult {
  const pan = ctx.form.tax.pan;
  const b: Base = { id: "V1", layer: "VALID", title: "PAN format", checked: "PAN typed in the form", rule: "V1: a PAN is 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)." };
  if (!isIndia(ctx) || !pan) return result(b, "SKIPPED", null, { reason: isIndia(ctx) ? "No PAN given (see C1)." : "Not an Indian vendor." });
  if (isPan(pan)) return result(b, "PASS", null, { sources: [formSrc(pan)], reason: "PAN has the correct format." });
  return result(b, "FAIL", "FIXABLE", { sources: [formSrc(pan)], reason: `"${pan}" does not match the PAN format.`, next_action: "Ask the vendor to re-enter the PAN.", vendor_fix: `The PAN "${pan}" is not in the valid format (5 letters, 4 digits, 1 letter). Please re-check it.` });
}

function v2(ctx: CheckContext): CheckResult {
  const g = ctx.form.tax.gstin;
  const b: Base = { id: "V2", layer: "VALID", title: "GSTIN structure", checked: "GSTIN typed in the form", rule: "V2: 2-digit state code + 10-character PAN + entity code + 'Z' + check character (15 characters)." };
  if (!gstRegistered(ctx) || !g) return result(b, "SKIPPED", null, { reason: gstRegistered(ctx) ? "No GSTIN given (see C1)." : "Vendor is not GST-registered." });
  const s = gstinStructure(g);
  if (s.ok) return result(b, "PASS", null, { sources: [formSrc(g)], reason: `Structure is valid (state: ${gstinState(g)}).` });
  return result(b, "FAIL", "FIXABLE", { sources: [formSrc(g)], reason: `GSTIN ${s.problem}.`, next_action: "Ask the vendor to re-enter the GSTIN.", vendor_fix: `The GSTIN "${g}" is not valid: it ${s.problem}. Please copy it exactly from your GST certificate.` });
}

function v3(ctx: CheckContext): CheckResult {
  const g = ctx.form.tax.gstin;
  const b: Base = { id: "V3", layer: "VALID", title: "GSTIN check character", checked: "Last character of the GSTIN", rule: "V3: the 15th character is a mod-36 check character computed from the first 14; a typo almost always breaks it." };
  if (!gstRegistered(ctx) || !g || !gstinStructure(g).ok) return result(b, "SKIPPED", null, { reason: "Needs a structurally valid GSTIN (see V2)." });
  if (gstinChecksumOk(g)) return result(b, "PASS", null, { sources: [formSrc(g)], reason: "Check character verifies." });
  return result(b, "FAIL", "FIXABLE", { sources: [formSrc(g)], reason: "The check character does not match the first 14 characters, which usually means a typo.", next_action: "Ask the vendor to re-check the GSTIN.", vendor_fix: `The GSTIN "${g}" fails its built-in check, which usually means a typing error. Please copy it exactly from your GST certificate.` });
}

function v4(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  if (f.country === "US") {
    const rn = f.bank.routing_number ?? "";
    const b: Base = { id: "V4", layer: "VALID", title: "Bank routing number format", checked: "US routing number", rule: "V4: a US ABA routing number is 9 digits with a 3-7-1 weighted checksum." };
    if (!rn) return result(b, "SKIPPED", null, { reason: "No routing number (see C1)." });
    if (isRoutingNumber(rn)) return result(b, "PASS", null, { sources: [formSrc(rn)], reason: "Routing number is valid." });
    return result(b, "FAIL", "FIXABLE", { sources: [formSrc(rn)], reason: "Routing number fails the format or checksum.", next_action: "Ask the vendor to re-check it.", vendor_fix: `The routing number "${rn}" is not valid. Please re-check it with your bank.` });
  }
  const ifsc = f.bank.ifsc ?? "";
  const b: Base = { id: "V4", layer: "VALID", title: "IFSC format", checked: "IFSC typed in the form", rule: "V4: an IFSC is 4 letters (bank), then 0, then 6 letters or digits (branch)." };
  if (!ifsc) return result(b, "SKIPPED", null, { reason: "No IFSC (see C1)." });
  if (isIfsc(ifsc)) return result(b, "PASS", null, { sources: [formSrc(ifsc)], reason: "IFSC has the correct format." });
  return result(b, "FAIL", "FIXABLE", { sources: [formSrc(ifsc)], reason: `"${ifsc}" does not match the IFSC format.`, next_action: "Ask the vendor to re-check it.", vendor_fix: `The IFSC "${ifsc}" is not valid. It should look like ABCD0123456. Please re-check it.` });
}

function v5(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "V5", layer: "VALID", title: "Tax ID fits the country", checked: "Tax ID against the format used in the vendor's country", rule: "V5: a US vendor's EIN is 9 digits (NN-NNNNNNN); Indian IDs are covered by V1-V3." };
  if (f.country !== "US") return result(b, "SKIPPED", null, { reason: "Indian vendor: PAN and GSTIN are checked in V1-V3." });
  const ein = f.tax.ein ?? "";
  if (!ein) return result(b, "SKIPPED", null, { reason: "No EIN (see C1)." });
  if (isEin(ein)) return result(b, "PASS", null, { sources: [formSrc(ein)], reason: "EIN has the US format." });
  const looksIndian = gstinStructure(ein).ok || isPan(ein);
  return result(b, "FAIL", "FIXABLE", {
    sources: [formSrc(ein), { label: "Country on form", value: "United States" }],
    reason: looksIndian ? `"${ein}" is an Indian tax ID format, but the vendor says it is in the United States.` : `"${ein}" is not a 9-digit EIN.`,
    next_action: "Ask the vendor for their US EIN.",
    vendor_fix: `As a US vendor, please provide your 9-digit EIN (format NN-NNNNNNN). "${ein}" is not in that format.`,
  });
}

function v6(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "V6", layer: "VALID", title: "Contact details format", checked: "Postal code, email and phone", rule: "V6: Indian pincode is 6 digits (or a US ZIP); email and phone must be well-formed." };
  const issues: string[] = [];
  const pc = f.address.postal_code;
  if (pc && !(f.country === "US" ? isUsZip(pc) : isPincode(pc))) issues.push(`${f.country === "US" ? "ZIP code" : "pincode"} "${pc}"`);
  if (f.contact.email && !isEmail(f.contact.email)) issues.push(`email "${f.contact.email}"`);
  if (f.contact.phone && !isPhone(f.contact.phone, f.country)) issues.push(`phone "${f.contact.phone}"`);
  const sources = [formSrc(`${pc} · ${f.contact.email} · ${f.contact.phone}`)];
  if (!issues.length) return result(b, "PASS", null, { sources, reason: "Contact details are well-formed." });
  return result(b, "FAIL", "FIXABLE", { sources, reason: `Not valid: ${issues.join(", ")}.`, next_action: "Ask the vendor to correct them.", vendor_fix: `Please correct your ${issues.join(", ")}.` });
}

// ---------- CONSISTENT ----------

function k1(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "K1", layer: "CONSISTENT", title: "PAN inside GSTIN matches PAN", checked: "PAN embedded in the GSTIN (characters 3-12) vs the PAN given", rule: "K1: the PAN inside the GSTIN must equal the vendor's PAN. If the two official documents disagree, a person must review; if only the typed form differs, it is a fixable typo." };
  if (!gstRegistered(ctx)) return result(b, "SKIPPED", null, { reason: "Vendor is not GST-registered." });
  const gstDoc = trusted(ctx, "GST_CERTIFICATE", "gstin");
  const panDoc = trusted(ctx, "PAN_CARD", "pan");
  if (gstDoc && panDoc && gstinPan(gstDoc.value) !== clean(panDoc.value)) {
    return result(b, "FAIL", "REVIEW", {
      sources: [{ ...gstDoc.src, value: `${gstDoc.value} (PAN inside: ${gstinPan(gstDoc.value)})` }, panDoc.src],
      reason: `The PAN inside the GSTIN on the GST certificate (${gstinPan(gstDoc.value)}) is not the PAN on the PAN card (${clean(panDoc.value)}). Two official documents disagree, which a typo cannot explain.`,
      next_action: "Manual review: a reviewer compares both documents and confirms the vendor's identity before onboarding.",
    });
  }
  const issues: string[] = [];
  const sources: Source[] = [];
  const fg = f.tax.gstin, fp = f.tax.pan;
  if (fg && fp && gstinStructure(fg).ok && gstinPan(fg) !== clean(fp)) issues.push(`the GSTIN on the form contains PAN ${gstinPan(fg)}, but the PAN field says ${clean(fp)}`);
  if (panDoc && fp && clean(panDoc.value) !== clean(fp)) issues.push(`the PAN card shows ${clean(panDoc.value)}, but the form says ${clean(fp)}`);
  if (gstDoc && fg && clean(gstDoc.value) !== clean(fg)) issues.push(`the GST certificate shows ${clean(gstDoc.value)}, but the form says ${clean(fg)}`);
  sources.push(formSrc(`GSTIN ${fg || "-"} · PAN ${fp || "-"}`));
  if (gstDoc) sources.push(gstDoc.src);
  if (panDoc) sources.push(panDoc.src);
  if (!fg && !gstDoc) return result(b, "SKIPPED", null, { reason: "No GSTIN to compare (see C1/C2)." });
  if (!issues.length) {
    const compared = gstDoc || panDoc ? "the form and the documents" : "the form (documents could not be read, so not compared)";
    return result(b, gstDoc || panDoc ? "PASS" : "UNVERIFIED", null, { sources, reason: `PAN and GSTIN agree across ${compared}.`, next_action: gstDoc || panDoc ? "None." : "Re-run once readable documents are uploaded." });
  }
  return result(b, "FAIL", "FIXABLE", {
    sources, reason: `Typed values don't match: ${issues.join("; ")}.`,
    next_action: "Ask the vendor to correct the typed PAN/GSTIN.",
    vendor_fix: `Your tax details don't match each other: ${issues.join("; ")}. Please correct the form so it matches your documents.`,
  });
}

function k2(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "K2", layer: "CONSISTENT", title: "PAN holder type fits entity type", checked: "4th character of the PAN vs the entity type", rule: "K2: the PAN's 4th letter shows the holder type: C company, F firm or LLP, P individual or proprietor." };
  if (!isIndia(ctx) || !f.entity_type) return result(b, "SKIPPED", null, { reason: "Needs an Indian vendor with an entity type." });
  const panDoc = trusted(ctx, "PAN_CARD", "pan");
  const pan = clean(panDoc?.value ?? f.tax.pan);
  if (!isPan(pan)) return result(b, "SKIPPED", null, { reason: "Needs a valid PAN (see V1)." });
  const expected = EXPECTED_PAN_TYPE[f.entity_type];
  const actual = pan[3];
  const sources = [panDoc?.src ?? formSrc(pan), { label: "Entity type on form", value: f.entity_type.replace("_", " ").toLowerCase() }];
  if (actual === expected) return result(b, "PASS", null, { sources, reason: `4th letter "${actual}" (${PAN_HOLDER_TYPES[actual]}) fits a ${f.entity_type.replace("_", " ").toLowerCase()}.` });
  return result(b, "FAIL", "FIXABLE", {
    sources,
    reason: `The PAN's 4th letter is "${actual}" (${PAN_HOLDER_TYPES[actual] ?? "unknown type"}), but a ${f.entity_type.replace("_", " ").toLowerCase()} should have "${expected}" (${PAN_HOLDER_TYPES[expected]}). This may be a personal PAN given instead of the business PAN.`,
    next_action: "Ask the vendor for the PAN registered to the business.",
    vendor_fix: `The PAN provided belongs to a ${PAN_HOLDER_TYPES[actual] ?? "different holder type"}, not a ${f.entity_type.replace("_", " ").toLowerCase()}. Please provide the PAN issued to the business.`,
  });
}

function k3(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "K3", layer: "CONSISTENT", title: "PAN name initial", checked: "5th character of the PAN vs the first letter of the legal name", rule: "K3: for non-individuals, the PAN's 5th letter is the first letter of the entity's name. A mismatch is a warning only (names can change after the PAN is issued)." };
  if (!isIndia(ctx) || f.entity_type === "PROPRIETORSHIP" || !f.legal_name) return result(b, "SKIPPED", null, { reason: "Applies to Indian companies, LLPs and firms." });
  const panDoc = trusted(ctx, "PAN_CARD", "pan");
  const pan = clean(panDoc?.value ?? f.tax.pan);
  if (!isPan(pan)) return result(b, "SKIPPED", null, { reason: "Needs a valid PAN (see V1)." });
  const initial = normaliseName(f.legal_name)[0];
  const sources = [panDoc?.src ?? formSrc(pan), formSrc(f.legal_name)];
  if (pan[4] === initial) return result(b, "PASS", null, { sources, reason: `5th letter "${pan[4]}" matches the name's initial.` });
  return result(b, "WARN", "WARNING", { sources, reason: `The PAN's 5th letter is "${pan[4]}" but the legal name starts with "${initial}".`, next_action: "Reviewer note only; does not block on its own." });
}

function k4(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "K4", layer: "CONSISTENT", title: "GSTIN state matches address", checked: "State code in the GSTIN vs the state in the address", rule: "K4: the GSTIN's first two digits are the state of registration; it should match the billing address (a vendor may hold GSTINs in other states)." };
  if (!gstRegistered(ctx)) return result(b, "SKIPPED", null, { reason: "Vendor is not GST-registered." });
  const gstDoc = trusted(ctx, "GST_CERTIFICATE", "gstin");
  const g = gstDoc?.value ?? f.tax.gstin;
  if (!g || !gstinStructure(g).ok || !f.address.state) return result(b, "SKIPPED", null, { reason: "Needs a valid GSTIN and a state." });
  const st = gstinState(g);
  const sources = [gstDoc?.src ?? formSrc(g), { label: "Address on form", value: `${f.address.city}, ${f.address.state}` }];
  if (normState(st) === normState(f.address.state)) return result(b, "PASS", null, { sources, reason: `GSTIN state (${st}) matches the address.` });
  return result(b, "FAIL", "FIXABLE", {
    sources, reason: `The GSTIN is registered in ${st} (code ${clean(g).slice(0, 2)}), but the address is in ${f.address.state}.`,
    next_action: "Ask the vendor for the GSTIN registered in the billing state, or a billing address that matches.",
    vendor_fix: `Your GSTIN is registered in ${st}, but your address is in ${f.address.state}. Please share the GSTIN for your ${f.address.state} registration, or confirm the correct billing address.`,
  });
}

function k5(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "K5", layer: "CONSISTENT", title: "Legal name agrees across documents", checked: "Legal name on the form vs the GST certificate and PAN card", rule: "K5: names must refer to the same entity. Rules normalise formatting first; the AI judges what remains and gives a reason." };
  if (!f.legal_name) return result(b, "SKIPPED", null, { reason: "No legal name (see C1)." });
  const others = (["GST_CERTIFICATE", "PAN_CARD", "EIN_NOTICE"] as DocSlot[])
    .map((s) => trusted(ctx, s, "legal_name"))
    .filter((x): x is { value: string; src: Source } => !!x);
  if (!others.length) return result(b, "UNVERIFIED", null, { sources: [formSrc(f.legal_name)], reason: "No readable document name to compare against.", next_action: "Re-run once readable documents are uploaded." });
  const sources = [formSrc(f.legal_name), ...others.map((o) => o.src)];
  const judged = others.map((o) => ({ o, j: judgeNames(ctx, f.legal_name, o.value) }));
  const bad = judged.filter((x) => x.j.verdict !== "SAME");
  if (!bad.length) {
    const why = judged.map((x) => x.j.by === "RULES" ? null : `"${x.o.value}": ${x.j.reason}`).filter(Boolean);
    return result(b, "PASS", null, { sources, reason: why.length ? `Names refer to the same entity. ${why.join(" ")}` : "Names match." });
  }
  const desc = bad.map((x) => `${x.o.src.label.split(" (")[0]} says "${x.o.value}" (${x.j.verdict === "DIFFERENT" ? "different entity" : "unclear"}: ${noDot(x.j.reason)})`);
  return result(b, "FAIL", "FIXABLE", {
    sources, reason: `Legal name differs: ${desc.join("; ")}.`,
    next_action: "Ask the vendor to correct the legal name to match their registration documents.",
    vendor_fix: `The legal name on your form ("${f.legal_name}") doesn't match your documents (${bad.map((x) => `"${x.o.value}"`).join(", ")}). Please enter your registered legal name exactly as on your GST/PAN records.`,
  });
}

function k6(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "K6", layer: "CONSISTENT", title: "Bank account holder matches vendor", checked: "Account holder name on the bank proof vs the vendor's legal name", rule: "K6: the bank account holder must be the vendor's legal identity, allowing recognised name variations. A different party is a payment-fraud signal and goes to a person. A name match is not proof of ownership." };
  if (!f.legal_name) return result(b, "SKIPPED", null, { reason: "No legal name (see C1)." });
  const bankDoc = docFor(ctx, "BANK_PROOF");
  const docHolder = trusted(ctx, "BANK_PROOF", "account_holder");
  if (bankDoc && !docHolder) {
    return result(b, "UNVERIFIED", null, {
      sources: [formSrc(f.bank.account_holder), { label: DOC_LABEL.BANK_PROOF, value: "could not be read reliably" }],
      reason: "The account holder name could not be read from the bank proof, so it is not guessed.",
      next_action: "Wait for a clearer bank proof (requested via C4/C3).",
    });
  }
  const holder = docHolder?.value ?? f.bank.account_holder;
  const holderSrc = docHolder?.src ?? formSrc(f.bank.account_holder);
  if (!holder) return result(b, "SKIPPED", null, { reason: "No account holder name (see C1)." });
  const sources = [{ label: "Vendor form (legal name)", value: f.legal_name }, holderSrc];
  // Proprietorships often bank in the proprietor's own name.
  if (f.entity_type === "PROPRIETORSHIP" && f.contact.name && judgeNames(ctx, holder, f.contact.name).verdict === "SAME") {
    return result(b, "PASS", null, { sources: [...sources, { label: "Proprietor (contact name)", value: f.contact.name }], reason: "Account is in the proprietor's own name, which is normal for a proprietorship." });
  }
  const j = judgeNames(ctx, f.legal_name, holder);
  if (j.verdict === "SAME") return result(b, "PASS", null, { sources, reason: j.by === "RULES" ? j.reason : `Same entity: ${j.reason}` });
  return result(b, "FAIL", "REVIEW", {
    sources,
    reason: j.verdict === "DIFFERENT"
      ? `The account holder ("${holder}") is a different party from the vendor ("${f.legal_name}"). The difference cannot be explained by normal name formatting. ${j.reason}`
      : `It is unclear whether "${holder}" and "${f.legal_name}" are the same entity. ${j.reason}`,
    next_action: "Manual review: a reviewer must verify account ownership before onboarding (e.g. a bank letter on letterhead or a penny-drop check).",
  });
}

function k7(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "K7", layer: "CONSISTENT", title: "Bank details match the bank proof", checked: "Account number and IFSC on the form vs the cancelled cheque / bank letter", rule: "K7: the typed bank details must match the bank proof exactly." };
  const acct = trusted(ctx, "BANK_PROOF", "account_number");
  const ifsc = trusted(ctx, "BANK_PROOF", "ifsc");
  if (!acct && !ifsc) return result(b, docFor(ctx, "BANK_PROOF") ? "UNVERIFIED" : "SKIPPED", null, { reason: "No readable bank proof to compare.", next_action: "Re-run once a readable bank proof is uploaded." });
  const issues: string[] = [];
  if (acct && acct.value.replace(/\D/g, "") !== (f.bank.account_number ?? "").replace(/\D/g, "")) issues.push(`account number (form ${mask(f.bank.account_number)}, document ${mask(acct.value)})`);
  if (isIndia(ctx) && ifsc && clean(ifsc.value) !== clean(f.bank.ifsc)) issues.push(`IFSC (form ${clean(f.bank.ifsc)}, document ${clean(ifsc.value)})`);
  const sources = [formSrc(`${mask(f.bank.account_number)} · ${f.bank.ifsc ?? f.bank.routing_number ?? ""}`), ...(acct ? [{ ...acct.src, value: mask(acct.value) }] : []), ...(ifsc ? [ifsc.src] : [])];
  if (!issues.length) return result(b, "PASS", null, { sources, reason: "Bank details match the bank proof." });
  return result(b, "FAIL", "FIXABLE", { sources, reason: `Mismatch in ${issues.join(" and ")}.`, next_action: "Ask the vendor to correct the bank details.", vendor_fix: `The bank details on your form don't match your cancelled cheque: ${issues.join(" and ")}. Please correct them.` });
}

// ---------- CREDIBLE ----------

function r1(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "R1", layer: "CREDIBLE", title: "Bank account not used by another vendor", checked: "This bank account against every approved vendor", rule: "R1: one bank account should belong to one vendor. A reused account under a different identity is a fraud signal for a person to review." };
  if (!f.bank.account_number) return result(b, "SKIPPED", null, { reason: "No bank account (see C1)." });
  const h = hashAccount(f.bank.account_number);
  const other = ctx.vendorMaster.find((v) => v.bank_account_hash === h && v.pan !== clean(f.tax.pan) && v.gstin !== clean(f.tax.gstin));
  const sources = [formSrc(mask(f.bank.account_number))];
  if (!other) return result(b, "PASS", null, { sources, reason: `Account ${mask(f.bank.account_number)} is not on file for any other vendor.` });
  return result(b, "FAIL", "REVIEW", {
    sources: [...sources, { label: "Vendor master", value: `${other.legal_name} (${other.id}), account ••••${other.bank_last4}` }],
    reason: `This bank account already belongs to approved vendor "${other.legal_name}" (${other.id}), a different legal identity.`,
    next_action: `Manual review: confirm why "${f.legal_name || "this vendor"}" is using ${other.legal_name}'s bank account before onboarding.`,
  });
}

function r2(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "R2", layer: "CREDIBLE", title: "Not a duplicate of an existing vendor", checked: "PAN and GSTIN against the vendor master", rule: "R2: the same PAN or GSTIN as an existing vendor is a confirmed duplicate (hard stop). A merely similar name is only a warning." };
  const pan = clean(f.tax.pan), gstin = clean(f.tax.gstin);
  const dup = ctx.vendorMaster.find((v) => (pan && v.pan === pan) || (gstin && v.gstin === gstin));
  if (dup) {
    return result(b, "FAIL", "HARD_STOP", {
      sources: [formSrc(`PAN ${pan || "-"} · GSTIN ${gstin || "-"}`), { label: "Vendor master", value: `${dup.legal_name} (${dup.id}): PAN ${dup.pan ?? "-"} · GSTIN ${dup.gstin ?? "-"}` }],
      reason: `This ${dup.gstin === gstin && gstin ? "GSTIN" : "PAN"} is already registered to existing vendor "${dup.legal_name}" (${dup.id}).`,
      next_action: `Rejected as a duplicate. Point the requester to existing record ${dup.id} instead of creating a second vendor.`,
    });
  }
  const similar = f.legal_name ? ctx.vendorMaster.find((v) => nameSimilarity(v.legal_name, f.legal_name) >= 0.75) : undefined;
  if (similar) {
    return result(b, "WARN", "WARNING", {
      sources: [formSrc(f.legal_name), { label: "Vendor master", value: `${similar.legal_name} (${similar.id})` }],
      reason: `Name is similar to existing vendor "${similar.legal_name}", but the PAN and GSTIN are different.`,
      next_action: "Reviewer note only; does not block on its own.",
    });
  }
  return result(b, "PASS", null, { sources: [formSrc(`PAN ${pan || "-"} · GSTIN ${gstin || "-"}`)], reason: "No existing vendor has this PAN or GSTIN." });
}

function r3(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "R3", layer: "CREDIBLE", title: "Not on the blocklist", checked: "Name, PAN and bank account against the internal blocklist", rule: "R3: any match on the internal blocklist is a hard stop." };
  const h = f.bank.account_number ? hashAccount(f.bank.account_number) : "";
  const hit = ctx.blocklist.find((e) =>
    (e.pan && e.pan === clean(f.tax.pan)) || (e.bank_account_hash && e.bank_account_hash === h) ||
    (e.name && f.legal_name && normaliseName(e.name) === normaliseName(f.legal_name)));
  if (!hit) return result(b, "PASS", null, { reason: "No blocklist match." });
  return result(b, "FAIL", "HARD_STOP", {
    sources: [formSrc(f.legal_name), { label: "Internal blocklist", value: `${hit.name ?? hit.pan ?? "bank account"}: ${hit.reason}` }],
    reason: `Matches a blocklist entry (${hit.reason}).`,
    next_action: "Rejected. Escalate to compliance if the vendor disputes it.",
  });
}

function r4(ctx: CheckContext): CheckResult {
  const f = ctx.form;
  const b: Base = { id: "R4", layer: "CREDIBLE", title: "GST registration is active (TEST REGISTRY)", checked: "GSTIN status in our TEST REGISTRY, a labelled stand-in for the GST portal", rule: "R4: a cancelled GST registration is a hard stop. Source is a test registry, not the live GST portal; production would query the portal." };
  if (!gstRegistered(ctx) || !f.tax.gstin) return result(b, "SKIPPED", null, { reason: "No GSTIN to look up." });
  const g = clean(f.tax.gstin);
  const entry = ctx.registry[g];
  if (!entry) return result(b, "WARN", "WARNING", { sources: [formSrc(g), { label: "TEST REGISTRY", value: "not found" }], reason: "GSTIN is not in the TEST REGISTRY, so its status could not be confirmed.", next_action: "Reviewer note; in production this would be a live GST portal lookup." });
  const src = { label: "TEST REGISTRY (not the live GST portal)", value: `${g}: ${entry.status}, ${entry.legal_name}` };
  if (entry.status === "ACTIVE") return result(b, "PASS", null, { sources: [src], reason: "Registration is active in the TEST REGISTRY." });
  return result(b, "FAIL", "HARD_STOP", { sources: [src], reason: "The GST registration is cancelled in the TEST REGISTRY.", next_action: "Rejected. The vendor cannot be onboarded on a cancelled GST registration." });
}

// ---------- run ----------

export const CHECKS = [c1, c2, c3, c4, v1, v2, v3, v4, v5, v6, k1, k2, k3, k4, k5, k6, k7, r1, r2, r3, r4];
export const LAYERS: Layer[] = ["COMPLETE", "VALID", "CONSISTENT", "CREDIBLE"];

export function runChecks(ctx: CheckContext): CheckResult[] {
  return CHECKS.map((fn) => fn(ctx));
}

export function runLayer(ctx: CheckContext, layer: Layer): CheckResult[] {
  return runChecks(ctx).filter((r) => r.layer === layer);
}

/** Name pairs the rules cannot settle. The workflow asks the AI about these before running checks. */
export function namePairsToJudge(ctx: CheckContext): [string, string][] {
  const f = ctx.form;
  const pairs: [string, string][] = [];
  const add = (a?: string, b?: string) => { if (a && b && !compareByRules(a, b)) pairs.push([a, b]); };
  for (const s of ["GST_CERTIFICATE", "PAN_CARD", "EIN_NOTICE"] as DocSlot[]) add(f.legal_name, trusted(ctx, s, "legal_name")?.value);
  const holder = trusted(ctx, "BANK_PROOF", "account_holder")?.value ?? (docFor(ctx, "BANK_PROOF") ? undefined : f.bank.account_holder);
  add(f.legal_name, holder);
  if (f.entity_type === "PROPRIETORSHIP") add(holder, f.contact.name);
  const seen = new Set<string>();
  return pairs.filter(([a, b]) => { const k = pairKey(a, b); if (seen.has(k)) return false; seen.add(k); return true; });
}

export { GST_STATE_CODES, last4 };
