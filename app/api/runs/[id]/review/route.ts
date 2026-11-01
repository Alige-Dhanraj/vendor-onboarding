// POST /api/runs/:id/review  { action: APPROVE | REJECT | REQUEST_INFO, reason, reviewer? }
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { ReviewError, reviewRun } from "@/lib/workflow/review";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    if (!["APPROVE", "REJECT", "REQUEST_INFO"].includes(body?.action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const out = await reviewRun(getStore(), { runId: id, action: body.action, reason: String(body.reason ?? ""), reviewer: body.reviewer });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ReviewError ? 400 : 500 });
  }
}
