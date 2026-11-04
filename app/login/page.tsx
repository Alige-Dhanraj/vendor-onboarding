"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Field, btnPrimary, inputCls } from "@/components/ui";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Could not sign in."); setBusy(false); return; }
    const next = params.get("next") ?? "/";
    window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/"; // full reload so the header picks up the session
  }

  return (
    <div className="hero-gradient mx-auto mt-6 max-w-md rounded-3xl p-5 sm:mt-12 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-black text-sm font-bold text-white">VG</span>
        <div>
          <div className="text-xl font-semibold tracking-tight">VendorGate</div>
          <div className="text-sm text-slate-700">Check new vendors in minutes</div>
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-white p-6">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <Field label="Email" required><input className={inputCls} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
        <Field label="Password" required><input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <button type="submit" className={`${btnPrimary} w-full py-2.5`} disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
