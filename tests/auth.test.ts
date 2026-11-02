import { test } from "node:test";
import assert from "node:assert/strict";
import { canReview, createSessionToken, verifySessionToken } from "../lib/auth/session";
import { ACCOUNTS, checkLogin } from "../lib/auth/accounts";

process.env.SESSION_SECRET = "unit-test-secret-0123456789";
process.env.DEMO_PASSWORD = "correct-horse-battery";
const user = ACCOUNTS[1];

test("session token round-trips", async () => {
  const t = await createSessionToken(user);
  const s = await verifySessionToken(t);
  assert.equal(s?.email, user.email);
  assert.equal(s?.role, "REVIEWER");
});

test("tampered, expired, foreign and garbage tokens are rejected", async () => {
  const t = (await createSessionToken(user))!;
  const [payload, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ ...user, role: "ADMIN", exp: 9999999999 })).toString("base64url");
  assert.equal(await verifySessionToken(`${forged}.${sig}`), null, "changed payload");
  assert.equal(await verifySessionToken(`${payload}.${sig.slice(0, -2)}AA`), null, "changed signature");
  assert.equal(await verifySessionToken((await createSessionToken(user, -1))!), null, "expired");
  process.env.SESSION_SECRET = "a-different-secret-0123456789";
  assert.equal(await verifySessionToken(t), null, "signed with another secret");
  process.env.SESSION_SECRET = "unit-test-secret-0123456789";
  for (const bad of ["", "abc", "a.b", undefined, null]) assert.equal(await verifySessionToken(bad as string), null);
});

test("login: right password works for every role, wrong password and unknown email do not", () => {
  for (const a of ACCOUNTS) assert.equal(checkLogin(a.email, "correct-horse-battery").ok, true);
  assert.equal(checkLogin(" BUYER@vendorgate.example ", "correct-horse-battery").ok, true);
  assert.equal(checkLogin(user.email, "wrong").ok, false);
  assert.equal(checkLogin("someone@else.com", "correct-horse-battery").ok, false);
  assert.equal(checkLogin(user.email, "").ok, false);
});

test("only reviewers and admins can review", () => {
  assert.equal(canReview("REVIEWER"), true);
  assert.equal(canReview("ADMIN"), true);
  assert.equal(canReview("BUYER"), false);
  assert.equal(canReview(null), false);
});
