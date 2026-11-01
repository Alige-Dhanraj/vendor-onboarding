// Intake: validate the uploaded files, store them privately, record the submission.
import type { DocSlot, SubmissionForm } from "../engine/types";
import type { Store, SubmissionRow } from "../store/types";
import { sha256 } from "./run";

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const SLOTS: DocSlot[] = ["GST_CERTIFICATE", "GST_DECLARATION", "PAN_CARD", "BANK_PROOF", "EIN_NOTICE"];

export interface IncomingFile { slot: DocSlot; name: string; mime: string; bytes: Uint8Array }

export class IntakeError extends Error {}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "vendor";

export function validateIncoming(form: SubmissionForm, files: IncomingFile[]) {
  if (!form || typeof form !== "object") throw new IntakeError("Missing form data.");
  if (files.length > MAX_FILES) throw new IntakeError(`At most ${MAX_FILES} files.`);
  for (const f of files) {
    if (!SLOTS.includes(f.slot)) throw new IntakeError(`Unknown document slot: ${f.slot}`);
    if (!ALLOWED_MIME.includes(f.mime)) throw new IntakeError(`${f.name}: only PDF, PNG, JPG or WEBP files are accepted.`);
    if (f.bytes.byteLength > MAX_FILE_BYTES) throw new IntakeError(`${f.name} is larger than 10 MB.`);
    if (f.bytes.byteLength === 0) throw new IntakeError(`${f.name} is empty.`);
  }
  const slots = files.map((f) => f.slot);
  if (new Set(slots).size !== slots.length) throw new IntakeError("Upload one file per document slot.");
}

export async function submit(store: Store, args: { form: SubmissionForm; files: IncomingFile[]; scenarioId?: string | null; vendorRef?: string }): Promise<SubmissionRow> {
  validateIncoming(args.form, args.files);
  const vendor_ref = args.vendorRef || args.form.vendor_ref || slug(args.form.legal_name);
  const form = { ...args.form, vendor_ref };
  const sub = await store.createSubmission({ vendor_ref, scenario_id: args.scenarioId ?? null, form });
  for (const f of args.files) {
    const path = `${vendor_ref}/v${sub.version}/${f.slot.toLowerCase()}-${slug(f.name.replace(/\.[^.]+$/, ""))}.${f.name.split(".").pop()?.toLowerCase() ?? "bin"}`;
    await store.uploadFile(path, f.bytes, f.mime);
    await store.addDocument({
      submission_id: sub.id, slot: f.slot, file_name: f.name, storage_path: path, mime_type: f.mime,
      size_bytes: f.bytes.byteLength, file_hash: sha256(f.bytes),
    });
  }
  return sub;
}
