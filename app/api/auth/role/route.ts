// POST /api/auth/role { role }: DEMO ONLY. Lets a signed-in demo user view the app as Buyer, Reviewer or Admin
// without logging out. Turn it off by setting DEMO_ROLE_SWITCH=off in Vercel.
import { NextResponse } from "next/server";
import { accountForRole } from "@/lib/auth/accounts";
import { COOKIE, SESSION_HOURS, createSessionToken, type Role } from "@/lib/auth/session";
import { guard } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (process.env.DEMO_ROLE_SWITCH === "off") return NextResponse.json({ error: "Role switching is turned off." }, { status: 403 });
  const g = await guard();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const role = String(body?.role ?? "") as Role;
  if (!["BUYER", "REVIEWER", "ADMIN"].includes(role)) return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  const a = accountForRole(role);
  const token = await createSessionToken({ email: a.email, name: a.name, role: a.role });
  if (!token) return NextResponse.json({ error: "Sign-in is not set up yet." }, { status: 503 });
  const res = NextResponse.json({ ok: true, name: a.name, role: a.role });
  res.cookies.set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_HOURS * 3600,
    secure: new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
  });
  return res;
}
