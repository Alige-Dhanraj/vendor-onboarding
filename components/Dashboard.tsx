"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { effectiveStatus, fmtMs } from "@/lib/ui-labels";
import { Card, Pill, StatusBadge } from "./ui";

const FILTERS = [
  { key: "all", label: "All runs" },
  { key: "review", label: "Needs review" },
  { key: "PENDING_INFO", label: "Waiting on vendor" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

export default function Dashboard({ initialFilter = "all", title }: { initialFilter?: string; title: string }) {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState(initialFilter);
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.role ?? null)).catch(() => {}); }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/runs", { cache: "no-store" });
      const json = await res.json();
      if (alive) setData(json);
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;
  const { runs, stats, mode } = data;
  const rows = runs.filter((r: any) => {
    if (filter === "all") return true;
    if (filter === "review") return r.review_flag && !r.review_resolved && r.status !== "RUNNING";
    return effectiveStatus(r) === filter;
  });
  const done = runs.filter((r: any) => r.status !== "RUNNING").length;

  const tiles = [
    { label: "Runs", value: stats.total },
    { label: "Approved", value: stats.approved },
    { label: "Waiting on vendor", value: stats.pending_info },
    { label: "Open reviews", value: stats.manual_review, accent: stats.manual_review > 0 },
    { label: "Rejected", value: stats.rejected },
    { label: "Avg run time", value: fmtMs(stats.avg_ms) || "–" },
    { label: "Cleared without a human", value: done ? `${Math.round((stats.auto_cleared / done) * 100)}%` : "–" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-2 flex gap-2">
            <Pill tone={mode.ai === "openai" ? "indigo" : "amber"}>{mode.ai === "openai" ? "AI: OpenAI" : "AI: offline fixtures"}</Pill>
            <Pill tone={mode.store === "supabase" ? "slate" : "amber"}>{mode.store === "supabase" ? "Data: Supabase" : "Data: in-memory (local only)"}</Pill>
          </div>
        </div>
        <div className="flex gap-2">
        {role === "ADMIN" && <button onClick={async () => {
          if (!window.confirm("Reset demo data? This deletes every run and restores the 3 sample vendors.")) return;
          const res = await fetch("/api/demo/reset", { method: "POST" });
          if (res.ok) { const r = await fetch("/api/runs", { cache: "no-store" }); setData(await r.json()); } else alert((await res.json()).error);
        }} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset demo data</button>}
        <Link href="/" className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">New submission</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((t) => (
          <Card key={t.label} className={`p-4 ${t.accent ? "border-orange-300" : ""}`}>
            <div className="text-xs text-slate-500">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
          </Card>
        ))}
      </div>

      {data.issues?.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Why vendors get stuck</h2><span className="text-xs text-slate-500">share of finished runs where each check flagged</span></div>
          <div className="space-y-2">
            {data.issues.slice(0, 6).map((i: any) => {
              const pct = done ? Math.round((i.runs / done) * 100) : 0;
              return (
                <div key={i.check_id} className="grid grid-cols-[220px_1fr_48px] items-center gap-3 text-sm">
                  <span className="truncate text-slate-700">{i.title}</span>
                  <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-slate-700" style={{ width: `${Math.max(4, pct)}%` }} /></div>
                  <span className="text-right tabular-nums text-slate-600">{pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-1 border-b border-slate-100 p-2">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-md px-3 py-1.5 text-sm ${filter === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{f.label}</button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No runs here yet. <Link href="/" className="text-indigo-600 hover:underline">Submit a vendor</Link> or load a test scenario.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-2 font-medium">Run</th><th className="px-4 py-2 font-medium">Vendor</th><th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Why</th><th className="px-4 py-2 font-medium">Started</th><th className="px-4 py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><Link href={`/runs/${r.id}`} className="mono text-indigo-700 hover:underline">VEN-{String(r.run_number).padStart(4, "0")}</Link></td>
                    <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.legal_name || "Unnamed"}</div><div className="text-xs text-slate-500">v{r.version}{r.scenario_id ? ` · ${r.scenario_id}` : ""}</div></td>
                    <td className="px-4 py-3"><StatusBadge status={effectiveStatus(r)} />{r.final_status && <div className="mt-1 text-xs text-slate-500">decided by reviewer</div>}</td>
                    <td className="max-w-md px-4 py-3 text-slate-600"><div className="line-clamp-2">{r.headline ?? "…"}</div></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-500">{fmtMs(r.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
