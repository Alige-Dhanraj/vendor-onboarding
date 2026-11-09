// Demo accounts. All names are fictional. For the demo every account accepts the password 12345.
// (An extra DEMO_PASSWORD from the environment is accepted too.) Replace this before real use.
import { createHash, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "./session";

/** A sign-in account. People can type the email, the short login ID or the mobile number. */
export interface Account extends SessionUser { id: string; phone: string }
export const ACCOUNTS: Account[] = [
  { email: "buyer@vendorgate.example", id: "buyer", phone: "9000000001", name: "Anita Sharma", role: "BUYER" },
  { email: "reviewer@vendorgate.example", id: "reviewer", phone: "9000000002", name: "Rohan Iyer", role: "REVIEWER" },
  { email: "admin@vendorgate.example", id: "admin", phone: "9000000003", name: "Meera Nair", role: "ADMIN" },
  { email: "vendor@vendorgate.example", id: "vendor", phone: "9000000000", name: "Demo User", role: "ADMIN" }, // the one-line demo login: vendor / 12345
  { email: "abcde", id: "abcde", phone: "", name: "Alige", role: "ADMIN" },
];

/** Demo password, accepted for every account. DEMO_PASSWORD (if set) is accepted too. Replace before real use. */
const DEMO_PASSWORD_PLAIN = "12345";

function demoPassword(): string | null {
  const p = process.env.DEMO_PASSWORD;
  return p && p.length >= 8 ? p : null;
}

/** The demo account behind each role, used by the demo role switcher. */
export const accountForRole = (role: SessionUser["role"]) => ACCOUNTS.find((a) => a.role === role && a.id !== "vendor" && a.id !== "abcde")!;

const strip = ({ email, name, role }: Account): SessionUser => ({ email, name, role });
const lastTen = (s: string) => s.replace(/\D/g, "").slice(-10);
export function findAccount(login: string): Account | undefined {
  const x = (login ?? "").trim().toLowerCase();
  if (!x) return undefined;
  const digits = x.replace(/\D/g, "");
  return ACCOUNTS.find((a) => a.email === x || a.id === x || (digits.length >= 10 && a.phone && lastTen(a.phone) === lastTen(digits)));
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; reason: "not_configured" | "invalid" };

export function checkLogin(login: string, password: string): LoginResult {
  const user = findAccount(login);
  const given = digest(password ?? "");
  const match = [DEMO_PASSWORD_PLAIN, demoPassword()].filter((p): p is string => !!p).some((p) => timingSafeEqual(given, digest(p)));
  return user && match ? { ok: true, user: strip(user) } : { ok: false, reason: "invalid" };
}
