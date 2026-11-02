// POST /api/demo/reset: clears all runs and restores the seed vendor master. Admin only.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { guard } from "@/lib/auth/server";
import { BLOCKLIST_SEED, VENDOR_MASTER_SEED } from "@/lib/seed";

export const runtime = "nodejs";

export async function POST() {
  const g = await guard(["ADMIN"]);
  if ("error" in g) return g.error;
  try {
    await getStore().resetDemo({ vendors: VENDOR_MASTER_SEED, blocklist: BLOCKLIST_SEED });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
