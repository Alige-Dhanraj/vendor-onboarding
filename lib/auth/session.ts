// Signed-cookie sessions using Web Crypto, so the same code runs in middleware (Edge) and in API routes (Node).
export type Role = "BUYER" | "REVIEWER" | "ADMIN";
export interface SessionUser { email: string; name: string; role: Role }
export interface Session extends SessionUser { exp: number } // exp = unix seconds

export const COOKIE = "vg_session";
export const SESSION_HOURS = 12;
export const ROLE_LABEL: Record<Role, string> = { BUYER: "Buyer", REVIEWER: "Reviewer", ADMIN: "Admin" };
export const canReview = (role?: string | null) => role === "REVIEWER" || role === "ADMIN";

const enc = new TextEncoder();

/** In production a real secret is required; without it nobody can sign in (fails closed). */
function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  return process.env.NODE_ENV === "production" ? null : "dev-only-secret-not-for-production";
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmacKey = (k: string, usage: KeyUsage) => crypto.subtle.importKey("raw", enc.encode(k), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

export async function createSessionToken(user: SessionUser, hours = SESSION_HOURS): Promise<string | null> {
  const s = secret();
  if (!s) return null;
  const session: Session = { ...user, exp: Math.floor(Date.now() / 1000 + hours * 3600) };
  const payload = toB64(enc.encode(JSON.stringify(session)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(s, "sign"), enc.encode(payload)));
  return `${payload}.${toB64(sig)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<Session | null> {
  const s = secret();
  if (!s || !token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    // crypto.subtle.verify compares in constant time.
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(s, "verify"), fromB64(sig), enc.encode(payload));
    if (!ok) return null;
    const session = JSON.parse(new TextDecoder().decode(fromB64(payload))) as Session;
    if (!session.exp || session.exp * 1000 < Date.now()) return null;
    if (!["BUYER", "REVIEWER", "ADMIN"].includes(session.role)) return null;
    return session;
  } catch {
    return null;
  }
}
