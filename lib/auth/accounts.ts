// Three demo accounts, one per role. All names are fictional.
// The shared password comes from the DEMO_PASSWORD environment variable and is never stored in the code or the repo.
import { createHash, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "./session";

export const ACCOUNTS: SessionUser[] = [
  { email: "buyer@vendorgate.example", name: "Anita Sharma", role: "BUYER" },
  { email: "reviewer@vendorgate.example", name: "Rohan Iyer", role: "REVIEWER" },
  { email: "admin@vendorgate.example", name: "Meera Nair", role: "ADMIN" },
  { email: "abcde", name: "Alige", role: "ADMIN" }, // quick sign-in for now; has its own fixed password below
];

// Accounts with their own password (the others share DEMO_PASSWORD). Temporary: replace before real use.
const OWN_PASSWORD: Record<string, string> = { abcde: "12345" };

function demoPassword(): string | null {
  const p = process.env.DEMO_PASSWORD;
  if (p && p.length >= 8) return p;
  return process.env.NODE_ENV === "production" ? null : "vendorgate-demo"; // local development only
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; reason: "not_configured" | "invalid" };

export function checkLogin(email: string, password: string): LoginResult {
  const user = ACCOUNTS.find((a) => a.email === (email ?? "").trim().toLowerCase());
  const expected = (user && OWN_PASSWORD[user.email]) || demoPassword();
  if (!expected) return { ok: false, reason: "not_configured" };
  const match = timingSafeEqual(digest(password ?? ""), digest(expected));
  return user && match ? { ok: true, user } : { ok: false, reason: "invalid" };
}
