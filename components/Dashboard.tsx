"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ago, effectiveStatus, fmtDateTime, fmtMs, waiting } from "@/lib/ui-labels";
import { latestPerVendor, useRuns } from "./useRuns";
import { Icon, type IconName } from "./icons";
import { Card, SectionTitle, StatusBadge } from "./ui";

function Kpi({ label, value, sub, icon, hero }: { label: string; value: string; sub?: string; icon: IconName; hero?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-xl p-4 shadow-[0_20px_27px_rgba(0,0,0,0.05)] sm:p-5 ${hero ? "bg-gradient-to-br from-[#0050e6] via-[#1890ff] to-[#8c7cf0] text-white" : "border border-slate-100 bg-white"}`}>
      <div className="min-w-0">
        <div className={`text-xs font-semibold sm:text-sm ${hero ? "text-white/85" : "text-slate-500"}`}>{label}</div>
        <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{value}</div>
        {sub && <div className={`mt-1 text-xs ${hero ? "text-white/80" : "text-slate-500"}`}>{sub}</div>}
      </div>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${hero ? "bg-white/20 text-white" : "bg-[#1890ff] text-white"}`}><Icon name={icon} className="h-5 w-5" /></span>
    </div>
  );
}

export default function Dashboard() {
  const data = useRuns(8000);
  const [range, setRange] = useState<"7" | "30" | "all">("all");
  const [manual, setManual] = useState("15"); // starting assumption: 15 minutes per manual check, editable
  useEffect(() => { try { setManual(localStorage.getItem("vg_manual_minutes") ?? "15"); } catch { /* ignore */ } }, []);

  if (!data) {
    return <div className="mx-auto max-w-5xl space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>;
  }

  const cutoff = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
  const done: any[] = data.runs.filter((r: any) => r.status !== "RUNNING" && new Date(r.started_at).getTime() >= cutoff);
  const durs = done.map((r: any) => r.duration_ms ?? 0).filter((x: number) => x > 0);
  const s = { total: done.length, avg_ms: durs.length ? Math.round(durs.reduce((a: number, b: number) => a + b, 0) / durs.length) : 0, auto_cleared: done.filter((r: any) => r.internal_status === "APPROVED").length };
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
  const vendorsN = latest.length;
  const saved = m > 0 && vendorsN ? Math.max(0, ((m * 60000 - s.avg_ms) * vendorsN) / 3600000) : null;
  const clear = n ? Math.round((s.auto_cleared / n) * 100) : null;

  const issues: { check_id: string; title: string; runs: number }[] = (data.issues ?? []).slice(0, 5);
  const maxIssue = Math.max(1, ...issues.map((i) => i.runs));
  const stuck = [...review, ...waits].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()).slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Vendor onboarding at a glance: volume, speed, and what needs attention. Updated live.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Date range" className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-semibold">
            {([["7", "Last 7 days"], ["30", "Last 30 days"], ["all", "All time"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setRange(k)} className={`px-3 py-2.5 ${range === k ? "bg-[#1890ff] text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
        <a href="/api/vendors/export" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-800 hover:bg-slate-50">Export approved vendors (CSV)</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Vendors checked" value={String(latest.length)} sub={`${s.total} checks in all`} icon="vendors" />
        <Kpi hero label="Cleared without a person" value={clear === null ? "–" : `${clear}%`} sub="Straight-through rate" icon="check" />
        <Kpi label="Average decision time" value={fmtMs(s.avg_ms) || "–"} sub="Upload to decision" icon="clock" />
        <Kpi label="Estimated time saved" value={saved === null ? "–" : `${saved.toFixed(1)} h`} sub={`Baseline: ${manual} min per manual check`} icon="bolt" />
      </div>

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
                  <Link href={`/runs/${r.id}`} className="flex flex-col items-start gap-2 py-3 hover:bg-slate-50 sm:flex-row sm:gap-3">
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
          <SectionTitle hint={range === "all" ? undefined : "All time"}>Most common problems found</SectionTitle>
          {issues.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No problems found yet.</p> : (
            <ul className="space-y-3">
              {issues.map((i) => (
                <li key={i.check_id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-slate-800">{i.title}</span><b className="tabular-nums">{i.runs}</b></div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#1890ff]" style={{ width: `${(i.runs / maxIssue) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card className="p-4 sm:p-5">
        <SectionTitle hint="Latest checks">Recent activity</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3 font-semibold">Vendor</th><th className="py-2 pr-3 font-semibold">Status</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Outcome</th><th className="hidden py-2 pr-3 font-semibold sm:table-cell">Checked in</th><th className="py-2 text-right font-semibold">Date and time</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {done.slice(0, 8).map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3"><Link href={`/runs/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.legal_name || "Unnamed vendor"}</Link></td>
                  <td className="py-2.5 pr-3"><StatusBadge status={effectiveStatus(r)} /></td>
                  <td className="hidden max-w-xs truncate py-2.5 pr-3 text-slate-600 md:table-cell">{r.headline}</td>
                  <td className="hidden py-2.5 pr-3 tabular-nums text-slate-600 sm:table-cell">{fmtMs(r.duration_ms) || "–"}</td>
                  <td className="whitespace-nowrap py-2.5 text-right text-slate-600">{fmtDateTime(r.started_at)}<div className="text-xs text-slate-400">{ago(r.started_at)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
