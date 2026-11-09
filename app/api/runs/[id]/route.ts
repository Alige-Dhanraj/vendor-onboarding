// GET /api/runs/:id: everything the run view needs, with short-lived signed URLs for documents.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { guard } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(); // any signed-in role; the middleware already requires a session
  if ("error" in g) return g.error;
  const { id } = await params;
  const store = getStore();
  const bundle = await store.getRun(id);
  if (!bundle) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const finished = bundle.run.status !== "RUNNING";
  const documents = await Promise.all(bundle.documents.map(async (d) => ({
    ...d,
    // Signed URLs only once the run is finished (no need to sign on every poll).
    url: finished && d.storage_path ? await store.signedUrl(d.storage_path) : null,
  })));
  // Never send full bank account numbers to the browser.
  const form = bundle.submission.form_data;
  const masked = { ...form, bank: { ...form.bank, account_number: form.bank.account_number ? "••••" + form.bank.account_number.replace(/\D/g, "").slice(-4) : "" } };
  // For a re-submission: what was wrong last time, and which documents are new, so the page can say what changed.
  let previous: unknown = null;
  if (bundle.submission.version > 1) {
    const prevItem = (await store.listRuns(500)).find((r) => r.vendor_ref === bundle.submission.vendor_ref && r.version === bundle.submission.version - 1);
    const prev = prevItem ? await store.getRun(prevItem.id) : null;
    if (prev) {
      const bad = (c: { status: string }) => ["FAIL", "UNVERIFIED", "WARN"].includes(c.status);
      previous = {
        run_id: prev.run.id, at: prev.run.started_at,
        problems: prev.checks.filter(bad).map((c) => ({ id: c.id, title: c.title })),
        new_slots: bundle.documents.filter((d) => !prev.documents.some((p) => p.slot === d.slot && p.file_hash && p.file_hash === d.file_hash)).map((d) => d.slot),
      };
    }
  }
  return NextResponse.json({ ...bundle, previous, submission: { ...bundle.submission, form_data: masked }, documents: documents.map(({ extracted, ...d }) => ({ ...d, extracted: maskReading(extracted) })) });
}

function maskReading(r: any) {
  if (!r?.fields?.account_number) return r;
  return { ...r, fields: { ...r.fields, account_number: "••••" + String(r.fields.account_number).slice(-4) } };
}
