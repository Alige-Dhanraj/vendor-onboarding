// POST /api/demo/reset: clears all runs and restores the seed vendor master (demo convenience).
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { VENDOR_MASTER_SEED } from "@/lib/seed";

export const runtime = "nodejs";

export async function POST() {
  try {
    await getStore().resetDemo({ vendors: VENDOR_MASTER_SEED });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
