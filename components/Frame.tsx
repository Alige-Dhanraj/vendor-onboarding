"use client";
// The app frame. Staff see a left menu and a top bar (menu at the bottom on phones). Vendors and the login page get a plain frame.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import HelpPanel from "./HelpPanel";
import { Icon, type IconName } from "./icons";
import { latestPerVendor, useRuns } from "./useRuns";
import { effectiveStatus, fmtDateTime } from "@/lib/ui-labels";
import { COMPANY } from "@/lib/brand";
import RoleSwitch from "./RoleSwitch";

interface U { name: string; email: string; role: string }
const ROLE: Record<string, string> = { BUYER: "Buyer", REVIEWER: "Reviewer", ADMIN: "Admin" };
const TITLES: [string, string][] = [["/vendors", "Vendors"], ["/dashboard", "Dashboard"], ["/new", "New vendor"], ["/runs", "Vendor result"], ["/settings", "Settings"]];
const titleFor = (p: string) => (p === "/" ? "Home" : TITLES.find(([k]) => p.startsWith(k))?.[1] ?? "");
const SHADOW = "shadow-[0_20px_27px_rgba(0,0,0,0.05)]";

export function Logo({ size = "h-10 w-10" }: { size?: string }) {
  return <span className={`grid ${size} shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0050e6] to-[#1890ff] text-sm font-bold text-white`}>VG</span>;
}

function PublicFrame({ path, children }: { path: string; children: React.ReactNode }) {
  if (path === "/login") return <>{children}</>;
  return (
    <>
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3"><div><div className="font-bold tracking-tight">{COMPANY}</div><div className="text-xs text-slate-500">Vendor onboarding</div></div><span className="flex items-center gap-2 text-xs text-slate-400">Powered by <Logo size="h-6 w-6" /><b className="text-slate-600">VendorGate</b></span></div></header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}

export default function Frame({ user, children }: { user: U | null; children: React.ReactNode }) {
  const path = usePathname();
  if (!user || path.startsWith("/invite")) return <PublicFrame path={path}>{children}</PublicFrame>;
  return <Shell user={user} path={path}>{children}</Shell>;
}

function Shell({ user, path, children }: { user: U; path: string; children: React.ReactNode }) {
  const router = useRouter();
  const data = useRuns(10000);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const [bell, setBell] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => { try { setSeen(JSON.parse(localStorage.getItem("vg_seen_runs") || "[]")); } catch { /* ignore */ } }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBell(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const latest: any[] = data ? latestPerVendor(data.runs).filter((r: any) => r.status !== "RUNNING") : [];
  const needsReview = latest.filter((r) => r.review_flag && !r.review_resolved);
  const waitingVendor = latest.filter((r) => !(r.review_flag && !r.review_resolved) && effectiveStatus(r) === "PENDING_INFO");
  // "Documents received": a vendor (or your team on their behalf) sent corrected documents in the last 7 days and nothing else is asking for you.
  const weekAgo = Date.now() - 7 * 864e5;
  const received = latest.filter((r) => r.version > 1 && !needsReview.includes(r) && !waitingVendor.includes(r) && effectiveStatus(r) !== "REJECTED" && new Date(r.started_at).getTime() >= weekAgo);
  const items = [...needsReview.map((r) => ({ r, kind: "review" as const })), ...received.map((r) => ({ r, kind: "received" as const })), ...waitingVendor.map((r) => ({ r, kind: "wait" as const }))];
  // The red number counts only items you have not opened the bell for yet; opening the bell clears it.
  const unseen = items.filter((x) => !seen.includes(x.r.id)).length;
  // What the panel shows: only items not seen before. Once the bell has been opened they are marked seen and gone next time.
  const [panel, setPanel] = useState<typeof items>([]);
  const toggleBell = () => {
    const open = !bell; setBell(open); setMenu(false);
    if (open) { setPanel(items.filter((x) => !seen.includes(x.r.id))); const next = [...new Set([...seen, ...items.map((x) => x.r.id)])].slice(-300); setSeen(next); try { localStorage.setItem("vg_seen_runs", JSON.stringify(next)); } catch { /* ignore */ } }
  };
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const nav: [string, string, IconName][] = [["/", "Home", "home"], ["/vendors", "Vendors", "vendors"], ["/dashboard", "Dashboard", "chart"]];

  const item = (href: string, label: string, icon: IconName) => (
    <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${isActive(href) ? `bg-white font-semibold text-slate-900 ${SHADOW}` : "text-slate-600 hover:bg-white/70"}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${isActive(href) ? "bg-[#1890ff] text-white" : "bg-white text-slate-500 shadow-sm"}`}><Icon name={icon} /></span>{label}
    </Link>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col gap-1 overflow-y-auto p-4 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2 pb-3 pt-1"><Logo /><span><span className="block text-base font-bold leading-tight tracking-tight">VendorGate</span><span className="block text-xs leading-tight text-slate-500">{COMPANY}</span></span></Link>
        <Link href="/new" className="mb-3 inline-flex items-center justify-center gap-2 rounded-lg bg-[#1890ff] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm hover:bg-[#40a9ff]"><Icon name="plus" className="h-4 w-4" />New vendor</Link>
        <div className="border-t border-slate-200 pt-3" />
        {nav.map(([h, l, i]) => item(h, l, i))}
        {user.role === "ADMIN" && (<><div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</div>{item("/settings", "Settings", "gear")}</>)}
        <div className="mt-auto rounded-xl bg-gradient-to-br from-[#0050e6] to-[#1890ff] p-4 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#1890ff]"><Icon name="shield" /></span>
          <div className="mt-3 font-semibold">Need help?</div>
          <p className="mt-1 text-sm text-white/85">See how every vendor is checked.</p>
          <button onClick={() => setHelp(true)} className="mt-3 w-full rounded-lg bg-white py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-800 hover:bg-slate-100">How it works</button>
        </div>
      </aside>

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 bg-[#f8f9fa]/85 backdrop-blur">
          <div className="flex items-center gap-2 px-4 py-3 lg:px-8">
            <Link href="/" className="lg:hidden"><Logo size="h-9 w-9" /></Link>
            <div className="min-w-0 flex-1 text-sm text-slate-500"><span className="font-semibold text-slate-800">{titleFor(path)}</span></div>
            <form className="relative hidden sm:block" onSubmit={(e) => { e.preventDefault(); router.push(q.trim() ? `/vendors?q=${encodeURIComponent(q.trim())}` : "/vendors"); }}>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a vendor or GST number" aria-label="Find a vendor" className="h-10 w-72 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1890ff] focus:ring-2 focus:ring-indigo-100" />
            </form>
            <Link href="/vendors" aria-label="Find a vendor" className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-white sm:hidden"><Icon name="search" /></Link>
            <div className="sm:relative" ref={bellRef}>
              <button onClick={toggleBell} aria-label={unseen ? `${unseen} new notifications` : "Notifications"} className="relative grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-white">
                <Icon name="bell" />
                {unseen > 0 && <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-xs font-semibold leading-none text-white">{unseen}</span>}
              </button>
              {bell && (
                <div className={`fixed inset-x-4 top-16 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 ${SHADOW}`}>
                  <div className="px-3 py-2 text-sm font-semibold text-slate-900">Notifications</div>
                  {panel.length === 0 && <div className="px-3 pb-4 pt-1 text-sm text-slate-500">You are all caught up. Open <Link href="/" onClick={() => setBell(false)} className="font-semibold text-[#1890ff] hover:underline">Home</Link> to see everything that needs action.</div>}
                  {panel.slice(0, 8).map(({ r, kind }) => (
                    <Link key={r.id} href={`/runs/${r.id}`} onClick={() => setBell(false)} className="block rounded-lg px-3 py-2.5 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{r.legal_name || "Unnamed vendor"}</span>
                        <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white ${kind === "review" ? "bg-orange-500" : kind === "received" ? "bg-[#1890ff]" : "bg-amber-500"}`}>{kind === "review" ? "Needs your review" : kind === "received" ? "Documents received" : "Waiting on vendor"}</span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{r.headline}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{r.version > 1 ? "Documents received" : "Submitted"} {fmtDateTime(r.started_at)}</div>
                    </Link>
                  ))}
                  {panel.length > 8 && <Link href="/vendors" onClick={() => setBell(false)} className="block px-3 py-2 text-sm font-semibold text-[#1890ff]">See all {panel.length} in Vendors</Link>}
                </div>
              )}
            </div>
            <div className="relative" ref={ref}>
              <button onClick={() => setMenu((v) => !v)} aria-label="Account" className="flex h-10 items-center gap-2 rounded-lg pl-1 pr-1 hover:bg-white sm:pr-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1890ff] text-xs font-semibold text-white">{initials}</span>
                <span className="hidden text-left leading-tight sm:block"><span className="block text-sm font-semibold text-slate-800">{user.name}</span><span className="block text-xs text-slate-500">{ROLE[user.role]}</span></span>
              </button>
              {menu && (
                <div className={`absolute right-0 mt-2 w-56 rounded-xl border border-slate-100 bg-white p-2 ${SHADOW}`}>
                  <div className="px-3 py-2 sm:hidden"><div className="text-sm font-semibold">{user.name}</div><div className="text-xs text-slate-500">{ROLE[user.role]}</div></div>
                  <button onClick={() => { setMenu(false); setHelp(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100"><Icon name="help" className="h-4 w-4" />How it works</button>
                  <div className="mt-1 border-t border-slate-100 px-3 pb-2 pt-3"><div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Demo: view as</div><RoleSwitch compact /></div>
                  {user.role === "ADMIN" && <Link href="/settings" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100"><Icon name="gear" className="h-4 w-4" />Settings</Link>}
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}><Icon name="logout" className="h-4 w-4" />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-2 lg:px-8 lg:pb-12">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        {nav.slice(0, 2).map(([h, l, i]) => <Link key={h} href={h} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive(h) ? "font-semibold text-[#1890ff]" : "text-slate-500"}`}><Icon name={i} />{l}</Link>)}
        <Link href="/new" className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive("/new") ? "font-semibold text-[#1890ff]" : "text-slate-500"}`}><span className="grid h-7 w-7 place-items-center rounded-full bg-[#1890ff] text-white"><Icon name="plus" className="h-4 w-4" /></span>New</Link>
        <Link href="/dashboard" className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive("/dashboard") ? "font-semibold text-[#1890ff]" : "text-slate-500"}`}><Icon name="chart" />Dashboard</Link>
      </nav>
      <HelpPanel open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
