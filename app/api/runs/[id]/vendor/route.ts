// POST /api/runs/:id/vendor  { action: DEACTIVATE | REACTIVATE, reason, note }. Reviewer or Admin only.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { guard } from "@/lib/auth/server";
import { VendorError, changeVendorStatus } from "@/lib/workflow/vendors";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(["REVIEWER", "ADMIN"]);
  if ("error" in g) return g.error;
  try {
    const body = await req.json();
    if (!["DEACTIVATE", "REACTIVATE"].includes(body?.action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await changeVendorStatus(getStore(), { runId: (await params).id, action: body.action, reason: String(body.reason ?? ""), note: String(body.note ?? ""), by: `${g.session.name} (${g.session.email})` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof VendorError ? 400 : 500 });
  }
}
