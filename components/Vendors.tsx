"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ago, listStatus } from "@/lib/ui-labels";
import { Icon } from "./icons";
import { latestPerVendor, useRuns } from "./useRuns";
import { StatusBadge, inputCls } from "./ui";

const TABS: [string, string][] = [["all", "All"], ["review", "Needs review"], ["PENDING_INFO", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["INACTIVE", "Inactive"]];
const COLS = "sm:grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_180px_90px]";

export default function Vendors() {
  const params = useSearchParams();
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const [q, setQ] = useState(params.get("q") ?? "");
  const data = useRuns();

  const all: any[] = data ? latestPerVendor(data.runs) : [];
  const match = (r: any, f: string) => {
    const st = listStatus(r);
    if (f === "all") return q ? true : st !== "INACTIVE"; // inactive vendors stay out of the way unless searched for
    if (f === "review") return r.review_flag && !r.review_resolved && r.status !== "RUNNING";
    return st === f;
  };
  const text = (r: any) => `${r.legal_name} ${r.gstin ?? ""} ${r.vendor_ref} ${r.contact_email ?? ""}`.toLowerCase();
  const searched = all.filter((r) => !q || text(r).includes(q.toLowerCase()));
  const rows = searched.filter((r) => match(r, filter));
  const count = (f: string) => searched.filter((r) => match(r, f)).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Vendors</h1>
          <p className="mt-1 text-sm text-slate-500">Every vendor, newest first. Open one to see why it got its status.</p>
        </div>
        <a href="/api/vendors/export" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-800 hover:bg-slate-50">Export approved (CSV)</a>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-[0_20px_27px_rgba(0,0,0,0.05)]">
        <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-9`} placeholder="Search by name, GST number or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              {TABS.map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)} className={`whitespace-nowrap border-r border-slate-200 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide last:border-r-0 sm:py-2 ${filter === k ? "bg-indigo-50 text-[#1677ff]" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {label}{data ? <span className="ml-1.5 text-slate-400">{count(k)}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`label hidden border-b border-slate-100 px-5 py-3 text-slate-500 sm:grid ${COLS} gap-4`}><span>Vendor</span><span>What is happening</span><span>Status</span><span className="text-right">Updated</span></div>
        {!data ? (
          <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No vendors here. <Link href="/new" className="font-semibold text-[#1677ff] hover:underline">Add one</Link>.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r: any) => (
              <li key={r.id}>
                <Link href={`/runs/${r.id}`} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-slate-50 sm:px-5 ${COLS}`}>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 sm:truncate">{r.legal_name || "Unnamed vendor"}</div>
                    <div className="truncate text-sm text-slate-500">{r.contact_email || r.gstin || ""}</div>
                  </div>
                  <div className="order-3 col-span-2 text-sm text-slate-600 sm:order-none sm:col-span-1">{r.headline ?? "Checking…"}</div>
                  <div className="justify-self-end sm:justify-self-start"><StatusBadge status={listStatus(r)} /></div>
                  <div className="hidden text-right text-xs text-slate-400 sm:block">{ago(r.started_at)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
