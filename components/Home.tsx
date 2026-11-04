"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { reminderMessage } from "@/lib/engine/message";
import { effectiveStatus, homeLine, listStatus, mailtoLink, waiting } from "@/lib/ui-labels";
import { latestPerVendor, useRuns } from "./useRuns";
import { StatusBadge } from "./ui";

function Tile({ href, label, short, count, cls }: { href: string; label: string; short: string; count: number | null; cls: string }) {
  return (
    <Link href={href} className={`rounded-2xl border bg-white/80 p-3 backdrop-blur transition hover:bg-white sm:p-5 ${cls}`}>
      <div className="text-xs font-medium sm:text-sm"><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></div>
      <div className="mt-1 text-3xl font-semibold tabular-nums sm:mt-2 sm:text-4xl">{count ?? "–"}</div>
    </Link>
  );
}

const rowBtn = "hidden rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:inline-flex";

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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="hero-gradient rounded-3xl p-4 sm:p-8">
      <div className="flex flex-col gap-1">
        <div className="label text-slate-600">Vendor onboarding</div>
        <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">{hello}{firstName ? `, ${firstName}` : ""}</h1>
        {line && <p className={`text-sm sm:text-base ${{ alert: "font-medium text-orange-800", warn: "font-medium text-amber-800", calm: "text-slate-700" }[line.tone]}`}>{line.text}</p>}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:mt-8 sm:gap-3">
        <Tile href="/vendors?filter=review" label="Needs your review" short="Review" count={latest ? review.length : null} cls="border-orange-200 bg-orange-50 text-orange-900" />
        <Tile href="/vendors?filter=PENDING_INFO" label="Waiting on vendor" short="Waiting" count={latest ? waits.length : null} cls="border-amber-200 bg-amber-50 text-amber-900" />
        <Tile href="/vendors?filter=APPROVED" label="Approved this week" short="Approved" count={latest ? approved.length : null} cls="border-emerald-200 bg-emerald-50 text-emerald-900" />
      </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="label border-b border-slate-100 px-5 py-3 font-medium text-slate-500">Needs action</div>
        {!latest ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />)}</div>
        ) : todo.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-slate-600">Nothing needs you right now.</p>
            <Link href="/new" className="mt-4 inline-flex rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-slate-800">Add a new vendor</Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todo.map(({ r, kind }) => {
              const stale = Date.now() - new Date(r.started_at).getTime() >= 3 * 864e5;
              return (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <Link href={`/runs/${r.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">{r.legal_name || "Unnamed vendor"}</div>
                      <div className="truncate text-sm text-slate-500">{r.headline}</div>
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
