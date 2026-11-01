// GET /api/runs: run history + dashboard tiles.
import { NextResponse } from "next/server";
import { getStore, storeMode } from "@/lib/store";
import { aiMode } from "@/lib/workflow/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const [runs, issues] = await Promise.all([store.listRuns(200), store.issueCounts()]);
  const done = runs.filter((r) => r.status !== "RUNNING");
  const effective = (r: (typeof runs)[number]) => r.final_status ?? r.internal_status;
  const count = (s: string) => done.filter((r) => effective(r) === s).length;
  const durations = done.map((r) => r.duration_ms ?? 0).filter((x) => x > 0);
  const stats = {
    total: runs.length,
    approved: count("APPROVED"),
    pending_info: count("PENDING_INFO"),
    manual_review: done.filter((r) => r.review_flag && !r.review_resolved).length,
    rejected: count("REJECTED"),
    avg_ms: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    auto_cleared: done.filter((r) => r.internal_status === "APPROVED").length,
  };
  return NextResponse.json({ runs, stats, issues, mode: { ai: aiMode(), store: storeMode() } });
}
