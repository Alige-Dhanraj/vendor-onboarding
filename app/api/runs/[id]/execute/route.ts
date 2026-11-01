// POST /api/runs/:id/execute: runs the workflow. Progress is saved after every stage,
// so the live view (polling GET /api/runs/:id) updates while this request is still running.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { executeRun } from "@/lib/workflow/run";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Hobby maximum with fluid compute

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const bundle = await store.getRun(id);
  if (!bundle) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  // Idempotency: a refresh mid-run must not start the workflow a second time.
  if (bundle.run.status !== "RUNNING" || bundle.events.length > 0) return NextResponse.json({ error: "Run already started" }, { status: 409 });
  try {
    const { decision } = await executeRun(store, id, { pacingMs: Number(process.env.DEMO_PACING_MS ?? 400) });
    return NextResponse.json({ decision });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
