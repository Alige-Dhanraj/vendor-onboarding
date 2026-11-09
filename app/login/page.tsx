"use client";
import { COMPANY } from "@/lib/brand";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/Frame";
import { Icon } from "@/components/icons";
import { Field, btnPrimary, inputCls } from "@/components/ui";

const DEMO = [["Buyer", "buyer"], ["Reviewer", "reviewer"], ["Admin", "admin"]];
const DEMO_PASSWORD = "12345";
const STEPS: [string, string][] = [["Drop the documents", "GST, PAN and bank proof. The form fills itself."], ["22 checks run", "Missing, mistyped, mismatched or suspicious, each with proof."], ["Clear decision", "Approved, Pending or Rejected, with a message ready to send."]];

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Could not sign in."); setBusy(false); return; }
    const next = params.get("next") ?? "/";
    window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/"; // full reload so the menu picks up the session
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3"><Logo /><div><div className="text-lg font-bold tracking-tight">VendorGate</div><div className="text-sm text-slate-500">Vendor onboarding for {COMPANY}</div></div></div>
          <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-1 text-slate-500">Enter your login ID, email or mobile number to continue.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Login ID, email or mobile number" required><input className={inputCls} type="text" placeholder="vendor" autoCapitalize="none" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
            <div>
              <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium text-slate-600">Password<span className="ml-0.5 text-rose-600">*</span></span><button type="button" onClick={() => setNote("Password reset is not connected in this demo. The demo password is 12345.")} className="-my-2 py-2 text-xs font-semibold text-[#1890ff] hover:underline">Forgot password?</button></div>
              <input className={inputCls} type="password" autoComplete="current-password" placeholder="12345" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {note && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{note}</p>}
            <button type="submit" className={`${btnPrimary} w-full py-3`} disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <div className="mt-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or continue with<span className="h-px flex-1 bg-slate-200" /></div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["Google", "Apple", "Microsoft"].map((n) => <button key={n} type="button" onClick={() => setNote(`Sign-in with ${n} is not connected in this demo. Use the demo login below.`)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{n}</button>)}
          </div>
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="label text-slate-500">Demo login</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setEmail("vendor"); setPassword(DEMO_PASSWORD); }} className="rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-slate-700">Use demo login</button>
              {DEMO.map(([role, mail]) => <button key={role} type="button" onClick={() => { setEmail(mail); setPassword(DEMO_PASSWORD); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50">{role}</button>)}
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li><b className="text-slate-800">Buyer</b>: adds vendors and sends links. Cannot approve a flagged vendor.</li>
              <li><b className="text-slate-800">Reviewer</b>: decides flagged vendors, with a written reason.</li>
              <li><b className="text-slate-800">Admin</b>: everything a Reviewer can do, plus Settings.</li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">Login ID <b>vendor</b>, password <b>12345</b>. After signing in you can switch role from the account menu or Settings, no need to sign out.</p>
          </div>
        </div>
      </div>
      <div className="hidden bg-gradient-to-br from-[#0038b8] via-[#1890ff] to-[#8c7cf0] p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="mx-auto max-w-md">
          <div className="label text-white/80">Vendor onboarding</div>
          <h2 className="mt-2 text-4xl font-bold leading-tight tracking-tight">From documents to a decision, with the proof.</h2>
          <p className="mt-3 text-white/85">AI reads the documents. Fixed rules decide. Every status shows exactly why.</p>
          <ol className="mt-8 space-y-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex items-start gap-3 rounded-xl bg-white/15 p-4 backdrop-blur">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-sm font-bold text-[#1677ff]">{i + 1}</span>
                <div><div className="font-semibold">{t}</div><div className="text-sm text-white/85">{d}</div></div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex items-center gap-2 text-sm text-white/85"><Icon name="shield" className="h-4 w-4" />A person always decides the unclear cases.</div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
