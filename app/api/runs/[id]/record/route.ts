// GET /api/runs/:id/record?format=csv|json: download the verified record of an approved vendor.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { guard } from "@/lib/auth/server";
import { buildRecord, isApproved, recordCsv } from "@/lib/workflow/record";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("error" in g) return g.error;
  const b = await getStore().getRun((await params).id);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isApproved(b)) return NextResponse.json({ error: "Only approved vendors have a record." }, { status: 409 });
  const record = buildRecord(b);
  const name = `vendor-${b.submission.vendor_ref}`.replace(/[^a-z0-9-]/gi, "-");
  if (new URL(req.url).searchParams.get("format") === "json") {
    return new Response(JSON.stringify(record, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}.json"` } });
  }
  return new Response(recordCsv(record), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
}
