// POST /api/runs/:id/retry: starts a fresh check for a run that could not finish (for example the AI service was down).
// It reuses the same form and every uploaded document, so nothing has to be typed or uploaded again.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { guard } from "@/lib/auth/server";
import { submit } from "@/lib/workflow/intake";
import { aiMode } from "@/lib/workflow/run";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(["BUYER", "REVIEWER", "ADMIN"]);
  if ("error" in g) return g.error;
  const { id } = await params;
  const store = getStore();
  const b = await store.getRun(id);
  if (!b) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (b.run.status !== "FAILED") return NextResponse.json({ error: "Only a check that failed can be run again." }, { status: 409 });
  try {
    const sub = await submit(store, { form: b.submission.form_data, files: [], vendorRef: b.submission.vendor_ref, scenarioId: b.submission.scenario_id, keep: b.documents });
    const run = await store.createRun(sub.id, aiMode());
    return NextResponse.json({ run_id: run.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
