// Everything except the login page, static files and the auth endpoints needs a valid session.
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySessionToken } from "@/lib/auth/session";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // The vendor's own page and its APIs are reached with a secret link, not a login.
  if (pathname.startsWith("/invite/") || pathname.startsWith("/api/invite/")) return NextResponse.next();
  const session = await verifySessionToken(req.cookies.get(COOKIE)?.value);

  if (pathname === "/login") {
    if (!session) return NextResponse.next();
    const url = req.nextUrl.clone(); url.pathname = "/"; url.search = "";
    return NextResponse.redirect(url);
  }
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/|favicon.ico|samples/|api/auth/).*)"] };
