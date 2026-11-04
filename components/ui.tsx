import type { ReactNode } from "react";
import { CHECK_STYLE, STATUS_STYLE } from "@/lib/ui-labels";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-100 bg-white shadow-[0_20px_27px_rgba(0,0,0,0.05)] ${className}`}>{children}</div>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="label font-medium text-slate-500">{children}</h2>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "lg" }) {
  const s = STATUS_STYLE[status] ?? { label: status, cls: "bg-slate-100 text-slate-700 ring-slate-200" };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full ring-1 ring-inset font-semibold ${s.cls} ${size === "lg" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs uppercase tracking-wide"}`}>
      {s.label}
    </span>
  );
}

export function CheckBadge({ status }: { status: string }) {
  const s = CHECK_STYLE[status] ?? CHECK_STYLE.SKIPPED;
  return <span className={`inline-flex w-[76px] justify-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>{s.label}</span>;
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "indigo" | "amber" }) {
  const cls = { slate: "bg-slate-100 text-slate-700", indigo: "bg-indigo-50 text-indigo-700", amber: "bg-amber-50 text-amber-800" }[tone];
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}{required && <span className="ml-0.5 text-rose-600">*</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-[#1890ff] sm:text-sm focus:ring-2 focus:ring-indigo-100";
export const btnPrimary = "inline-flex items-center justify-center rounded-lg bg-[#1890ff] px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm hover:bg-[#40a9ff] disabled:opacity-50 sm:py-2";
export const btnSecondary = "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:py-2";
