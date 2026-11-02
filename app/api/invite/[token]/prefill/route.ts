// POST /api/invite/:token/prefill (public, secret link): same document reading as the buyer's form.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { loadInvite } from "@/lib/workflow/invite";
import { TOO_MANY, allow } from "@/lib/workflow/limit";
import { prefillFromFormData } from "@/lib/workflow/prefill";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const loaded = await loadInvite(getStore(), (await params).token);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  if (!allow(`prefill:${loaded.invite.token}`, 20, 3600_000)) return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  try {
    return NextResponse.json(await prefillFromFormData(await req.formData()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
