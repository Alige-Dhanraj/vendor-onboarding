// POST /api/runs/:id/export: sends the verified record of an approved vendor to the accounting system.
// The address comes from the ACCOUNTING_WEBHOOK_URL environment variable (never from the browser).
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { guard } from "@/lib/auth/server";
import { buildRecord, isApproved } from "@/lib/workflow/record";

export const runtime = "nodejs";

/** GET: tells the page whether an accounting system is connected, so the button only shows when it works. */
export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  let ok = false;
  try { const u = new URL(process.env.ACCOUNTING_WEBHOOK_URL ?? ""); ok = /^https?:$/.test(u.protocol); } catch { ok = false; }
  return NextResponse.json({ connected: ok });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("error" in g) return g.error;
  let url: URL;
  try { url = new URL(process.env.ACCOUNTING_WEBHOOK_URL ?? ""); if (!/^https?:$/.test(url.protocol)) throw new Error(); }
  catch { return NextResponse.json({ error: "No accounting system is connected yet." }, { status: 503 }); }
  const b = await getStore().getRun((await params).id);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isApproved(b)) return NextResponse.json({ error: "Only approved vendors can be sent." }, { status: 409 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ event: "vendor.approved", sent_at: new Date().toISOString(), record: buildRecord(b) }),
    });
    if (!res.ok) return NextResponse.json({ error: `The accounting system answered ${res.status}.` }, { status: 502 });
    return NextResponse.json({ ok: true, host: url.host });
  } catch {
    return NextResponse.json({ error: "Could not reach the accounting system." }, { status: 502 });
  } finally { clearTimeout(timer); }
}
