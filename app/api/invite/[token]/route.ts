// GET /api/invite/:token (public, secret link): what the vendor sees about their own registration.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { buildView, latestBundle, loadInvite } from "@/lib/workflow/invite";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const store = getStore();
  const loaded = await loadInvite(store, (await params).token);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  try {
    return NextResponse.json(buildView(loaded.invite, await latestBundle(store, loaded.invite)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
