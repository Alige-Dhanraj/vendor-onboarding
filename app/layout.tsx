import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "VendorGate · Vendor onboarding",
  description: "Vendor submission to Approved, Pending or Rejected, with every decision traced to its evidence.",
};

const NAV = [
  { href: "/", label: "New submission" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/review", label: "Review queue" },
  { href: "/rules", label: "How it decides" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-xs font-bold text-white">VG</span>
              <span className="font-semibold tracking-tight">VendorGate</span>
              <span className="hidden text-xs text-slate-400 sm:inline">vendor onboarding &amp; verification</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">{n.label}</Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
