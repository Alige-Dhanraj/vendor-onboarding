"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { effectiveStatus, fmtMs, waiting } from "@/lib/ui-labels";
import { latestPerVendor, useRuns } from "./useRuns";
import { Card, SectionTitle, StatusBadge, inputCls } from "./ui";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="label text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-medium tabular-nums tracking-tight sm:text-4xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const data = useRuns(8000);
  const [manual, setManual] = useState("");
  useEffect(() => { try { setManual(localStorage.getItem("vg_manual_minutes") ?? ""); } catch { /* ignore */ } }, []);
  const save = (v: string) => { setManual(v); try { localStorage.setItem("vg_manual_minutes", v); } catch { /* ignore */ } };

  if (!data) {
    return <div className="mx-auto max-w-5xl space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>;
  }

  const s = data.stats;
  const done: any[] = data.runs.filter((r: any) => r.status !== "RUNNING");
  const latest: any[] = latestPerVendor(done);
  const review = latest.filter((r) => r.review_flag && !r.review_resolved);
  const waits = latest.filter((r) => !(r.review_flag && !r.review_resolved) && effectiveStatus(r) === "PENDING_INFO");
  const approved = latest.filter((r) => effectiveStatus(r) === "APPROVED");
  const rejected = latest.filter((r) => effectiveStatus(r) === "REJECTED");
  const total = Math.max(1, review.length + waits.length + approved.length + rejected.length);
  const seg: [string, any[], string][] = [
    ["Approved", approved, "bg-emerald-500"], ["Waiting on vendor", waits, "bg-amber-400"], ["Needs review", review, "bg-orange-500"], ["Rejected", rejected, "bg-rose-500"],
  ];

  const m = Number(manual);
  const n = done.length;
  const saved = m > 0 && n ? Math.max(0, ((m * 60000 - s.avg_ms) * n) / 3600000) : null;
  const clear = n ? Math.round((s.auto_cleared / n) * 100) : null;

  const issues: { check_id: string; title: string; runs: number }[] = (data.issues ?? []).slice(0, 5);
  const maxIssue = Math.max(1, ...issues.map((i) => i.runs));
  const stuck = [...review, ...waits].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()).slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <div className="label text-slate-500">For managers</div>
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">How much time this saves, and where vendors are stuck.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Vendors checked" value={String(latest.length)} sub={`${s.total} checks in all`} />
        <Kpi label="Cleared without a person" value={clear === null ? "–" : `${clear}%`} sub="No human needed" />
        <Kpi label="Average check time" value={fmtMs(s.avg_ms) || "–"} sub="From upload to decision" />
        <Kpi label="Time saved" value={saved === null ? "–" : `${saved.toFixed(1)} h`} sub={saved === null ? "Enter minutes below" : `${n} checks`} />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="manual-min" className="text-slate-700">One manual check takes about</label>
          <input id="manual-min" className={`${inputCls} !w-20`} inputMode="numeric" value={manual} onChange={(e) => save(e.target.value.replace(/[^\d.]/g, ""))} placeholder="min" />
          <span className="text-slate-700">minutes (you time it once)</span>
          {saved !== null && <span className="text-slate-500">Time saved = (manual time − {fmtMs(s.avg_ms)}) × {n} checks.</span>}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle hint={`${latest.length} vendors`}>Where vendors are now</SectionTitle>
        <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
          {seg.map(([label, rows, cls]) => rows.length > 0 && <div key={label} className={cls} style={{ width: `${(rows.length / total) * 100}%` }} title={`${label}: ${rows.length}`} />)}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {seg.map(([label, rows, cls]) => (
            <li key={label} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${cls}`} /><span className="text-slate-600">{label}</span><b className="ml-auto tabular-nums sm:ml-1">{rows.length}</b></li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <SectionTitle>Stuck now, and why</SectionTitle>
          {stuck.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nothing is stuck.</p> : (
            <ul className="divide-y divide-slate-100">
              {stuck.map((r) => (
                <li key={r.id}>
                  <Link href={`/runs/${r.id}`} className="flex items-start gap-3 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.legal_name || "Unnamed vendor"}</div>
                      <div className="text-sm text-slate-600">{r.headline}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{waiting(r.started_at)}</div>
                    </div>
                    <StatusBadge status={effectiveStatus(r)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle>Most common problems found</SectionTitle>
          {issues.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No problems found yet.</p> : (
            <ul className="space-y-3">
              {issues.map((i) => (
                <li key={i.check_id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-slate-800">{i.title}</span><b className="tabular-nums">{i.runs}</b></div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-black" style={{ width: `${(i.runs / maxIssue) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
