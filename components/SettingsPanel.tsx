"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtMs } from "@/lib/ui-labels";
import { useRuns } from "./useRuns";
import { Card, SectionTitle, btnSecondary, inputCls } from "./ui";

export default function SettingsPanel({ users, accountingHost }: { users: { name: string; email: string; role: string }[]; accountingHost: string | null }) {
  const data = useRuns(10000);
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { try { setManual(localStorage.getItem("vg_manual_minutes") ?? ""); } catch { /* ignore */ } }, []);
  const save = (v: string) => { setManual(v); try { localStorage.setItem("vg_manual_minutes", v); } catch { /* ignore */ } };

  const s = data?.stats;
  const done = data ? data.runs.filter((r: any) => r.status !== "RUNNING").length : 0;
  const m = Number(manual);
  const saved = s && m > 0 && done ? Math.max(0, ((m * 60000 - s.avg_ms) * done) / 3600000) : null;
  const tiles: [string, string | number][] = s ? [
    ["Vendors checked", s.total], ["Approved", s.approved], ["Waiting on vendor", s.pending_info], ["Open reviews", s.manual_review], ["Rejected", s.rejected],
    ["Average check time", fmtMs(s.avg_ms) || "–"], ["Cleared without a person", done ? `${Math.round((s.auto_cleared / done) * 100)}%` : "–"],
  ] : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card className="p-5">
        <SectionTitle>Numbers for managers</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className="mt-1 text-xl font-semibold tabular-nums">{v}</div></div>)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="text-slate-600">Minutes one manual check takes (you measure it)</label>
          <input className={`${inputCls} w-24`} inputMode="numeric" value={manual} onChange={(e) => save(e.target.value.replace(/[^\d.]/g, ""))} />
          {saved !== null && <span className="font-medium text-emerald-700">About {saved.toFixed(1)} hours saved across {done} checks</span>}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>People</SectionTitle>
        <ul className="divide-y divide-slate-100 text-sm">
          {users.map((u) => <li key={u.email} className="flex items-center justify-between py-2"><span><b>{u.name}</b> <span className="text-slate-500">{u.email}</span></span><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">{u.role[0] + u.role.slice(1).toLowerCase()}</span></li>)}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Adding and removing people comes next.</p>
      </Card>

      <Card className="p-5">
        <SectionTitle>Accounting system</SectionTitle>
        <p className="text-sm text-slate-700">
          {accountingHost ? <>Approved vendors can be sent to <b>{accountingHost}</b> from their result page.</> : "Not connected. Add ACCOUNTING_WEBHOOK_URL in Vercel to send approved vendors to your accounting software."}
        </p>
      </Card>

      <Card className="p-5">
        <SectionTitle>Test data</SectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/new?demo=1" className={btnSecondary}>Open test vendors</Link>
          <button className={`${btnSecondary} text-rose-700`} onClick={async () => {
            if (!window.confirm("Reset test data? This deletes every vendor check and restores the 3 sample vendors.")) return;
            const r = await fetch("/api/demo/reset", { method: "POST" });
            setMsg(r.ok ? "Test data reset." : (await r.json()).error);
          }}>Reset test data</button>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      </Card>
    </div>
  );
}
