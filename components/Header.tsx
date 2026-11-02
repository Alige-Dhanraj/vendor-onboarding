import Link from "next/link";
import { getSession } from "@/lib/auth/server";
import { ROLE_LABEL } from "@/lib/auth/session";
import SignOut from "./SignOut";

const NAV = [
  { href: "/", label: "New submission" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/review", label: "Review queue" },
  { href: "/rules", label: "How it decides" },
];

export default async function Header() {
  const s = await getSession();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-xs font-bold text-white">VG</span>
          <span className="font-semibold tracking-tight">VendorGate</span>
        </Link>
        {s && (
          <>
            <nav className="flex gap-1 text-sm">
              {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">{n.label}</Link>)}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <div className="text-right leading-tight">
                <div className="text-sm font-medium text-slate-900">{s.name}</div>
                <div className="text-xs text-slate-500">{ROLE_LABEL[s.role]}</div>
              </div>
              <SignOut />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
