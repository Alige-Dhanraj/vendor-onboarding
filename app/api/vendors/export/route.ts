// GET /api/vendors/export: CSV of every approved vendor (active and inactive), newest version per vendor.
import { getStore } from "@/lib/store";
import { guard } from "@/lib/auth/server";
import { effectiveStatus } from "@/lib/ui-labels";
import { buildRecord, recordsCsv } from "@/lib/workflow/record";
import type { RunBundle } from "@/lib/store/types";

export const runtime = "nodejs";

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  const store = getStore();
  const seen = new Set<string>();
  const latest = (await store.listRuns(500)).filter((r) => (seen.has(r.vendor_ref) ? false : (seen.add(r.vendor_ref), true)));
  const approved = latest.filter((r) => r.status === "COMPLETED" && effectiveStatus(r) === "APPROVED");
  const bundles = (await Promise.all(approved.map((r) => store.getRun(r.id)))).filter((b): b is RunBundle => !!b);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(recordsCsv(bundles.map(buildRecord)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="approved-vendors-${day}.csv"` } });
}
