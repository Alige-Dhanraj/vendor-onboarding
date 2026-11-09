import { NextResponse } from "next/server";
import { checkLogin } from "@/lib/auth/accounts";
import { COOKIE, SESSION_HOURS, createSessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = checkLogin(String(body.email ?? ""), String(body.password ?? ""));
  const notSet = (r.ok === false && r.reason === "not_configured");
  if (!r.ok) {
    await new Promise((res) => setTimeout(res, 600)); // slows down password guessing
    return NextResponse.json({ error: notSet ? "Sign-in is not set up yet." : "Wrong login ID or password." }, { status: notSet ? 503 : 401 });
  }
  const token = await createSessionToken(r.user);
  if (!token) return NextResponse.json({ error: "Sign-in is not set up yet." }, { status: 503 });
  const res = NextResponse.json({ ok: true, name: r.user.name, role: r.user.role });
  res.cookies.set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_HOURS * 3600,
    secure: new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
  });
  return res;
}
