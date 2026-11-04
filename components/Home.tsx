"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { reminderMessage } from "@/lib/engine/message";
import { effectiveStatus, homeLine, listStatus, mailtoLink, waiting } from "@/lib/ui-labels";
import { latestPerVendor, useRuns } from "./useRuns";
import { Icon, type IconName } from "./icons";
import { StatusBadge } from "./ui";

function Tile({ href, label, short, count, icon, tint }: { href: string; label: string; short: string; count: number | null; icon: IconName; tint: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-[0_20px_27px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 sm:p-5">
      <div>
        <div className="text-xs font-semibold text-slate-500 sm:text-sm"><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></div>
        <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{count ?? "–"}</div>
      </div>
      <span className={`hidden h-12 w-12 shrink-0 place-items-center rounded-lg text-white sm:grid ${tint}`}><Icon name={icon} className="h-6 w-6" /></span>
    </Link>
  );
}

const rowBtn = "hidden rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-800 hover:bg-slate-50 sm:inline-flex";

export default function Home({ firstName }: { firstName: string }) {
  const data = useRuns();
  const [hello, setHello] = useState("Hello");
  useEffect(() => { const h = new Date().getHours(); setHello(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"); }, []);

  const latest = data ? latestPerVendor(data.runs).filter((r: any) => r.status !== "RUNNING") : null;
  const review = latest?.filter((r: any) => r.review_flag && !r.review_resolved) ?? [];
  const waits = latest?.filter((r: any) => effectiveStatus(r) === "PENDING_INFO") ?? [];
  const weekAgo = Date.now() - 7 * 864e5;
  const approved = latest?.filter((r: any) => listStatus(r) === "APPROVED" && new Date(r.started_at).getTime() >= weekAgo) ?? [];
  const todo = [...review.map((r: any) => ({ r, kind: "review" })), ...waits.map((r: any) => ({ r, kind: "wait" }))]
    .sort((a, b) => new Date(b.r.started_at).getTime() - new Date(a.r.started_at).getTime());

  const staleWaits = waits.filter((r: any) => Date.now() - new Date(r.started_at).getTime() >= 3 * 864e5).length;
  const line = latest ? homeLine(review.length, waits.length, staleWaits) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{hello}{firstName ? `, ${firstName}` : ""}</h1>
        {line && <p className={`mt-1 text-sm sm:text-base ${{ alert: "font-semibold text-orange-700", warn: "font-semibold text-amber-700", calm: "text-slate-500" }[line.tone]}`}>{line.text}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Tile href="/vendors?filter=review" label="Needs your review" short="Review" count={latest ? review.length : null} icon="alert" tint="bg-orange-500" />
        <Tile href="/vendors?filter=PENDING_INFO" label="Waiting on vendor" short="Waiting" count={latest ? waits.length : null} icon="clock" tint="bg-amber-500" />
        <Tile href="/vendors?filter=APPROVED" label="Approved this week" short="Approved" count={latest ? approved.length : null} icon="check" tint="bg-emerald-500" />
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-[0_20px_27px_rgba(0,0,0,0.05)]">
        <div className="border-b border-slate-100 px-5 py-4"><div className="font-bold">Needs action</div><div className="text-sm text-slate-500">Vendors that are waiting for you or for the vendor</div></div>
        {!latest ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />)}</div>
        ) : todo.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-slate-600">Nothing needs you right now.</p>
            <Link href="/new" className="mt-4 inline-flex rounded-lg bg-[#1890ff] px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[#40a9ff]">Add a new vendor</Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todo.map(({ r, kind }) => {
              const stale = Date.now() - new Date(r.started_at).getTime() >= 3 * 864e5;
              return (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <Link href={`/runs/${r.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 sm:truncate">{r.legal_name || "Unnamed vendor"}</div>
                      <div className="text-sm text-slate-500 sm:truncate">{r.headline}</div>
                    </div>
                    <div className={`hidden text-xs sm:block ${stale ? "font-medium text-amber-700" : "text-slate-400"}`}>{waiting(r.started_at)}</div>
                    <StatusBadge status={effectiveStatus(r)} />
                  </Link>
                  {kind === "review"
                    ? <Link href={`/runs/${r.id}`} className={rowBtn}>Review</Link>
                    : <a href={mailtoLink(r.contact_email, reminderMessage(r.contact_name))} className={rowBtn}>Send reminder</a>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
