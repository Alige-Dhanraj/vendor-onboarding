// POST /api/submissions  (multipart/form-data)
//   form: JSON string of the SubmissionForm
//   scenario_id: optional, when loaded from the sample picker
//   vendor_ref: optional, set for a resubmission (creates the next version)
//   file fields named by slot: GST_CERTIFICATE, PAN_CARD, BANK_PROOF, GST_DECLARATION, EIN_NOTICE
// Returns { submission_id, run_id, version }. The client then calls /api/runs/:id/execute and polls.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { IntakeError, SLOTS, submit, type IncomingFile } from "@/lib/workflow/intake";
import { aiMode } from "@/lib/workflow/run";
import type { SubmissionForm } from "@/lib/engine/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const form = JSON.parse(String(fd.get("form") ?? "null")) as SubmissionForm;
    const files: IncomingFile[] = [];
    for (const slot of SLOTS) {
      const f = fd.get(slot);
      if (f && typeof f !== "string" && f.size > 0) {
        files.push({ slot, name: f.name, mime: f.type || "application/octet-stream", bytes: new Uint8Array(await f.arrayBuffer()) });
      }
    }
    const store = getStore();
    const sub = await submit(store, {
      form, files,
      scenarioId: (fd.get("scenario_id") as string) || null,
      vendorRef: (fd.get("vendor_ref") as string) || undefined,
    });
    const run = await store.createRun(sub.id, aiMode());
    return NextResponse.json({ submission_id: sub.id, run_id: run.id, version: sub.version });
  } catch (e) {
    const status = e instanceof IntakeError || e instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
