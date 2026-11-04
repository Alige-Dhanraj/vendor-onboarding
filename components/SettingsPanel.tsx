"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, SectionTitle, btnSecondary } from "./ui";

export default function SettingsPanel({ users, accountingHost }: { users: { name: string; email: string; role: string }[]; accountingHost: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card className="p-5">
        <SectionTitle>Numbers for managers</SectionTitle>
        <p className="text-sm text-slate-600">Time saved, vendors stuck and why now live on one page.</p>
        <Link href="/dashboard" className={`${btnSecondary} mt-3`}>Open the dashboard</Link>
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
