// POST /api/auth/forgot { login }: DEMO ONLY. Looks the account up by mobile number (or ID or email) and returns the
// message that WOULD be sent. No SMS or WhatsApp provider is connected, so the page shows the message on screen.
// In production this would send a one-time code through an SMS/WhatsApp/email provider, never the password itself.
import { NextResponse } from "next/server";
import { DEMO_PASSWORD_PLAIN, findAccount } from "@/lib/auth/accounts";
import { TOO_MANY, allow } from "@/lib/workflow/limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!allow(`forgot:${ip}`, 8, 3600_000)) return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const a = findAccount(String(body?.login ?? ""));
  if (!a) return NextResponse.json({ error: "We could not find an account with that number." }, { status: 404 });
  const masked = a.phone ? `+91 ••••• ••${a.phone.slice(-3)}` : a.email;
  return NextResponse.json({
    ok: true,
    to: masked,
    text: `VendorGate: your login ID is "${a.id}" and your password is ${DEMO_PASSWORD_PLAIN}. Sign in at the login page. If you did not ask for this, ignore this message.`,
  });
}
