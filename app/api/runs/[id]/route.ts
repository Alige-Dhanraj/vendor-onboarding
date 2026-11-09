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
  return NextResponse.json({ ...bundle, submission: { ...bundle.submission, form_data: masked }, documents: documents.map(({ extracted, ...d }) => ({ ...d, extracted: maskReading(extracted) })) });
}

function maskReading(r: any) {
  if (!r?.fields?.account_number) return r;
  return { ...r, fields: { ...r.fields, account_number: "••••" + String(r.fields.account_number).slice(-4) } };
}
