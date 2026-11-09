"use client";
import { useEffect, useState } from "react";

const ROLES: [string, string][] = [["BUYER", "Buyer"], ["REVIEWER", "Reviewer"], ["ADMIN", "Admin"]];

/** Demo only: view the app as another role without signing out. */
export default function RoleSwitch({ compact }: { compact?: boolean }) {
  const [role, setRole] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.role ?? null)).catch(() => {}); }, []);
  async function pick(r: string) {
    if (r === role || busy) return;
    setBusy(r); setErr(null);
    const res = await fetch("/api/auth/role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: r }) });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Could not switch."); setBusy(null); return; }
    window.location.assign(r === "ADMIN" || window.location.pathname !== "/settings" ? window.location.pathname : "/"); // reload so the menu and pages pick up the new role
  }
  return (
    <div>
      <div role="group" aria-label="View as role" className={`inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-semibold ${compact ? "w-full" : ""}`}>
        {ROLES.map(([k, l]) => (
          <button key={k} type="button" onClick={() => pick(k)} disabled={!!busy} aria-pressed={role === k} className={`${compact ? "flex-1" : ""} px-4 py-2.5 ${role === k ? "bg-[#1890ff] text-white" : "text-slate-600 hover:bg-slate-50"}`}>{busy === k ? "…" : l}</button>
        ))}
      </div>
      {err && <p className="mt-1 text-xs text-rose-700">{err}</p>}
    </div>
  );
}
