// POST /api/invites { contact_name, contact_email }: creates a private registration link for a vendor.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { guard } from "@/lib/auth/server";
import { INVITE_DAYS } from "@/lib/workflow/invite";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const g = await guard();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => null);
  const name = String(body?.contact_name ?? "").trim().slice(0, 100);
  const email = String(body?.contact_email ?? "").trim().slice(0, 200);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter the vendor's name and a valid email." }, { status: 400 });
  try {
    const invite = await getStore().createInvite({ contact_name: name, contact_email: email, created_by: g.session.name, days: INVITE_DAYS });
    return NextResponse.json({ token: invite.token, expires_at: invite.expires_at });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
