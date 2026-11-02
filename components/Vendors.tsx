"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PLAIN, ago, listStatus } from "@/lib/ui-labels";
import { latestPerVendor, useRuns } from "./useRuns";
import { StatusBadge, inputCls } from "./ui";

const CHIPS: [string, string][] = [["all", "All"], ["review", "Needs review"], ["PENDING_INFO", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["INACTIVE", "Inactive"]];

export default function Vendors() {
  const params = useSearchParams();
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const [q, setQ] = useState("");
  const data = useRuns();

  const rows = (data ? latestPerVendor(data.runs) : []).filter((r: any) => {
    if (q && !`${r.legal_name} ${r.gstin ?? ""} ${r.vendor_ref}`.toLowerCase().includes(q.toLowerCase())) return false;
    const st = listStatus(r);
    if (filter === "all") return q ? true : st !== "INACTIVE"; // inactive vendors stay out of the way unless searched for
    if (filter === "review") return r.review_flag && !r.review_resolved && r.status !== "RUNNING";
    return st === filter;
  });
  const done = data ? data.runs.filter((r: any) => r.status !== "RUNNING").length : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
      <input className={inputCls} placeholder="Search by name or GST number" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {CHIPS.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3.5 py-1.5 text-sm ${filter === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{label}</button>
        ))}
      </div>

      <div className="text-right"><a href="/api/vendors/export" className="text-sm text-indigo-600 hover:underline">Download approved vendors (CSV)</a></div>

      <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-slate-700">Why vendors get stuck</summary>
        <div className="space-y-2 px-5 pb-5">
          {!data?.issues?.length ? <p className="text-sm text-slate-500">Nothing yet.</p> : data.issues.slice(0, 5).map((i: any) => {
            const pct = done ? Math.round((i.runs / done) * 100) : 0;
            return (
              <div key={i.check_id} className="grid grid-cols-[1fr_minmax(0,1.2fr)_44px] items-center gap-3 text-sm">
                <span className="truncate text-slate-700">{PLAIN[i.check_id] ?? i.title}</span>
                <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-slate-700" style={{ width: `${Math.max(4, pct)}%` }} /></div>
                <span className="text-right tabular-nums text-slate-600">{pct}%</span>
              </div>
            );
          })}
        </div>
      </details>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {!data ? (
          <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No vendors here yet. <Link href="/new" className="text-indigo-600 hover:underline">Add one</Link>.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r: any) => (
              <li key={r.id}>
                <Link href={`/runs/${r.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">{r.legal_name || "Unnamed vendor"}</div>
                    <div className="truncate text-sm text-slate-500">{r.headline ?? "Checking…"}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><StatusBadge status={listStatus(r)} /><span className="text-xs text-slate-400">{ago(r.started_at)}</span></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
