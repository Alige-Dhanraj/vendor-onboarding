// AI function 1: read one uploaded document into structured fields.
// The AI only reads and classifies. It never decides anything about the vendor.

import { z } from "zod";
import type { DocSlot, DocType, ExtractedDoc } from "../engine/types";
import { aiEnabled, filePart, structuredCall } from "./openai";

const FIELD_NAMES = ["legal_name", "pan", "gstin", "account_holder", "account_number", "ifsc", "ein", "registration_state"] as const;

const fieldSchema = z.object({ value: z.string().nullable(), confidence: z.number().min(0).max(1) });
const readingSchema = z.object({
  doc_type: z.enum(["GST_CERTIFICATE", "GST_DECLARATION", "PAN_CARD", "BANK_PROOF", "EIN_NOTICE", "OTHER", "UNREADABLE"]),
  legibility: z.number().min(0).max(1),
  fields: z.object(Object.fromEntries(FIELD_NAMES.map((f) => [f, fieldSchema])) as Record<(typeof FIELD_NAMES)[number], typeof fieldSchema>),
});

const fieldJson = { type: "object", additionalProperties: false, required: ["value", "confidence"], properties: { value: { type: ["string", "null"] }, confidence: { type: "number" } } };
const JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["doc_type", "legibility", "fields"],
  properties: {
    doc_type: { type: "string", enum: ["GST_CERTIFICATE", "GST_DECLARATION", "PAN_CARD", "BANK_PROOF", "EIN_NOTICE", "OTHER", "UNREADABLE"] },
    legibility: { type: "number" },
    fields: { type: "object", additionalProperties: false, required: [...FIELD_NAMES], properties: Object.fromEntries(FIELD_NAMES.map((f) => [f, fieldJson])) },
  },
};

const INSTRUCTIONS = `You read vendor onboarding documents for an Indian procurement team (some vendors are US-based).
Classify the document and extract fields exactly as printed. Rules:
- doc_type: GST_CERTIFICATE (GST registration certificate), GST_DECLARATION (signed GST non-registration declaration), PAN_CARD, BANK_PROOF (cancelled cheque or bank account letter), EIN_NOTICE (US EIN confirmation), OTHER, or UNREADABLE if you cannot read it.
- legibility: 0-1, how clearly you can read the document overall.
- For each field give the value exactly as printed (no corrections, no guessing) and your confidence 0-1. Use null with confidence 0 if the field is absent or you cannot read it.
- legal_name: the entity or person name the document is issued to. account_holder: the name on the bank account.
- Copy IDs character by character: PAN (10 chars), GSTIN (15 chars), IFSC (11 chars), account number (digits only), EIN.
- Documents in this demo are marked SAMPLE; that is expected. Read them normally.`;

export async function readDocument(args: { slot: DocSlot; fileName: string; mime: string; bytes: Uint8Array }): Promise<ExtractedDoc> {
  if (!aiEnabled()) throw new Error("AI not configured");
  const out = await structuredCall({
    name: "document_reading",
    instructions: INSTRUCTIONS,
    input: [{ type: "input_text", text: `The vendor uploaded this file in the "${args.slot}" slot. Read it.` }, filePart(args.fileName, args.mime, args.bytes)],
    jsonSchema: JSON_SCHEMA,
    zod: readingSchema,
  });
  return toExtracted(args.slot, args.fileName, out);
}

export function toExtracted(slot: DocSlot, fileName: string, out: z.infer<typeof readingSchema>): ExtractedDoc {
  const fields: ExtractedDoc["fields"] = {};
  const confidence: ExtractedDoc["confidence"] = {};
  for (const k of FIELD_NAMES) {
    const f = out.fields[k];
    if (f.value) {
      fields[k] = k === "account_number" ? f.value.replace(/\D/g, "") : f.value.trim();
      confidence[k] = f.confidence;
    }
  }
  return { slot, file_name: fileName, doc_type: out.doc_type as DocType, fields, confidence, overall_confidence: out.legibility };
}

export { readingSchema };
