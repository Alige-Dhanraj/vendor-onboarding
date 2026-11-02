"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import HelpPanel from "./HelpPanel";

interface U { name: string; email: string; role: string }
const ROLE: Record<string, string> = { BUYER: "Buyer", REVIEWER: "Reviewer", ADMIN: "Admin" };

export default function AppHeader({ user }: { user: U | null }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const link = (href: string, label: string) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return <Link href={href} className={`rounded-md px-2.5 py-2.5 text-sm sm:px-3 sm:py-1.5 ${active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>;
  };
  const initials = (user?.name ?? "").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        <Link href="/" className="-m-1 flex items-center gap-2 p-1">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-900 text-xs font-bold text-white">VG</span>
          <span className="hidden font-semibold tracking-tight sm:inline">VendorGate</span>
        </Link>
        {user && (
          <>
            <nav className="flex gap-1">{link("/", "Home")}{link("/vendors", "Vendors")}</nav>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
              <Link href="/new" className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">+ <span className="sm:hidden">New</span><span className="hidden sm:inline">New vendor</span></Link>
              <button onClick={() => setHelp(true)} aria-label="Help" className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50">?</button>
              <div className="relative" ref={ref}>
                <button onClick={() => setMenu((v) => !v)} aria-label="Account" className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-300">{initials}</button>
                {menu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                    <div className="px-3 py-2"><div className="text-sm font-medium text-slate-900">{user.name}</div><div className="text-xs text-slate-500">{ROLE[user.role]}</div></div>
                    {user.role === "ADMIN" && <Link href="/settings" onClick={() => setMenu(false)} className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">Settings</Link>}
                    <button className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                      onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>Sign out</button>
                  </div>
                )}
              </div>
            </div>
            <HelpPanel open={help} onClose={() => setHelp(false)} />
          </>
        )}
      </div>
    </header>
  );
}
