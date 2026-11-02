import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  return s ? NextResponse.json({ email: s.email, name: s.name, role: s.role }) : NextResponse.json({ error: "Please sign in." }, { status: 401 });
}
