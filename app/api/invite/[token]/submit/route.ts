// POST /api/invite/:token/submit (public, secret link, multipart): the vendor sends their details and documents.
// First time: creates the vendor. After "needs fixing": creates the next version and keeps every earlier
// document the vendor did not replace. The checks then run in the background; the vendor's page shows progress.
import { NextResponse, after } from "next/server";
import { getStore } from "@/lib/store";
import { IntakeError, SLOTS, slug, submit, type IncomingFile } from "@/lib/workflow/intake";
import { latestBundle, loadInvite, vendorState } from "@/lib/workflow/invite";
import { aiMode, executeRun } from "@/lib/workflow/run";
import type { SubmissionForm } from "@/lib/engine/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const store = getStore();
  const loaded = await loadInvite(store, token);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { invite } = loaded;
  try {
    const previous = await latestBundle(store, invite);
    if (previous && vendorState(previous) !== "NEED_INFO") return NextResponse.json({ error: "Your details can't be changed right now." }, { status: 409 });

    const fd = await req.formData();
    const form = JSON.parse(String(fd.get("form") ?? "null")) as SubmissionForm;
    const files: IncomingFile[] = [];
    for (const slot of SLOTS) {
      const f = fd.get(slot);
      if (f && typeof f !== "string" && f.size > 0) files.push({ slot, name: f.name, mime: f.type || "application/octet-stream", bytes: new Uint8Array(await f.arrayBuffer()) });
    }
    const vendorRef = invite.vendor_ref ?? `${slug(form?.legal_name ?? "")}-${token.replace(/[^a-z0-9]/gi, "").slice(0, 5).toLowerCase()}`;
    const sub = await submit(store, { form, files, vendorRef, keep: previous?.documents });
    if (!invite.vendor_ref) await store.setInviteVendorRef(token, vendorRef);
    const run = await store.createRun(sub.id, aiMode());
    after(async () => { try { await executeRun(store, run.id, { pacingMs: 0 }); } catch { /* the run records its own failure */ } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof IntakeError || e instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
