// Intake: validate the uploaded files, store them privately, record the submission.
import type { DocSlot, SubmissionForm } from "../engine/types";
import type { DocumentRow, Store, SubmissionRow } from "../store/types";
import { sha256 } from "./run";

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const SLOTS: DocSlot[] = ["GST_CERTIFICATE", "GST_DECLARATION", "PAN_CARD", "BANK_PROOF", "EIN_NOTICE"];

export interface IncomingFile { slot: DocSlot; name: string; mime: string; bytes: Uint8Array }

export class IntakeError extends Error {}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "vendor";

/** Reads the first bytes, so a renamed file cannot pass as a PDF or image. */
export function sniffMime(b: Uint8Array): string | null {
  const at = (...xs: number[]) => xs.every((x, i) => b[i] === x);
  if (at(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (at(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export function validateIncoming(form: SubmissionForm, files: IncomingFile[]) {
  if (!form || typeof form !== "object" || Array.isArray(form)) throw new IntakeError("Missing form data.");
  if (typeof form.legal_name !== "string" || !form.legal_name.trim()) throw new IntakeError("Legal name is required.");
  if (form.country !== "IN" && form.country !== "US") throw new IntakeError("Country must be India (IN) or United States (US).");
  for (const k of ["address", "contact", "tax", "bank"] as const) {
    const v = (form as unknown as Record<string, unknown>)[k];
    if (v != null && (typeof v !== "object" || Array.isArray(v))) throw new IntakeError(`The "${k}" section is not valid.`);
  }
  if (files.length > MAX_FILES) throw new IntakeError(`At most ${MAX_FILES} files.`);
  for (const f of files) {
    if (!SLOTS.includes(f.slot)) throw new IntakeError(`Unknown document slot: ${f.slot}`);
    if (!ALLOWED_MIME.includes(f.mime)) throw new IntakeError(`${f.name}: only PDF, PNG, JPG or WEBP files are accepted.`);
    if (f.bytes.byteLength > MAX_FILE_BYTES) throw new IntakeError(`${f.name} is larger than 10 MB.`);
    if (f.bytes.byteLength === 0) throw new IntakeError(`${f.name} is empty.`);
    const real = sniffMime(f.bytes);
    if (!real) throw new IntakeError(`${f.name}: this is not a real PDF, PNG, JPG or WEBP file.`);
    f.mime = real; // store the type we found, not the one the browser claimed
  }
  const slots = files.map((f) => f.slot);
  if (new Set(slots).size !== slots.length) throw new IntakeError("Upload one file per document slot.");
}

export async function submit(store: Store, args: { form: SubmissionForm; files: IncomingFile[]; scenarioId?: string | null; vendorRef?: string; keep?: DocumentRow[] }): Promise<SubmissionRow> {
  validateIncoming(args.form, args.files);
  const vendor_ref = args.vendorRef || args.form.vendor_ref || slug(args.form.legal_name);
  const g = args.form as Partial<SubmissionForm>;
  const form: SubmissionForm = { ...args.form, vendor_ref, address: { ...(g.address ?? {}) } as SubmissionForm["address"], contact: { ...(g.contact ?? {}) } as SubmissionForm["contact"], tax: { ...(g.tax ?? {}) }, bank: { ...(g.bank ?? {}) } as SubmissionForm["bank"] };
  const sub = await store.createSubmission({ vendor_ref, scenario_id: args.scenarioId ?? null, form });
  for (const f of args.files) {
    const path = `${vendor_ref}/v${sub.version}/${f.slot.toLowerCase()}-${slug(f.name.replace(/\.[^.]+$/, ""))}.${f.name.split(".").pop()?.toLowerCase() ?? "bin"}`;
    await store.uploadFile(path, f.bytes, f.mime);
    await store.addDocument({
      submission_id: sub.id, slot: f.slot, file_name: f.name, storage_path: path, mime_type: f.mime,
      size_bytes: f.bytes.byteLength, file_hash: sha256(f.bytes),
    });
  }
  // A resubmission keeps the earlier documents the vendor did not replace (same stored file, same reading).
  const replaced = new Set(args.files.map((f) => f.slot));
  for (const d of args.keep ?? []) {
    if (replaced.has(d.slot)) continue;
    const row = await store.addDocument({
      submission_id: sub.id, slot: d.slot, file_name: d.file_name, storage_path: d.storage_path, mime_type: d.mime_type,
      size_bytes: d.size_bytes, file_hash: d.file_hash,
    });
    if (d.extracted) await store.saveReading(row.id, d.extracted);
  }
  return sub;
}
