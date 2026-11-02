import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, verifySessionToken, type Role, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  return verifySessionToken((await cookies()).get(COOKIE)?.value);
}

/** Use at the top of an API route: `const g = await guard(["ADMIN"]); if ("error" in g) return g.error;` */
export async function guard(roles?: Role[]): Promise<{ session: Session } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  if (roles && !roles.includes(session.role)) return { error: NextResponse.json({ error: "Your role can't do this." }, { status: 403 }) };
  return { session };
}
