"use client";
import { useEffect } from "react";

const STATUSES = [
  ["bg-emerald-500", "Approved", "Everything checks out."],
  ["bg-amber-500", "Waiting on vendor", "Something is missing or wrong. A short message is ready to send."],
  ["bg-orange-500", "Needs review", "Something looks odd. A reviewer decides."],
  ["bg-rose-500", "Rejected", "A clear rule was broken."],
];

export default function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-40 overflow-hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open} inert={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-slate-900/30 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">How we check a vendor</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close help">✕</button>
        </div>
        <p className="mt-2 text-sm text-slate-600">We ask four simple questions about every new vendor.</p>
        <ol className="mt-4 space-y-3 text-sm">
          <li><b>1. Is anything missing?</b><div className="text-slate-600">All papers and details are there.</div></li>
          <li><b>2. Are the numbers written correctly?</b><div className="text-slate-600">PAN, GST number and bank code follow the right pattern.</div></li>
          <li><b>3. Does everything match?</b><div className="text-slate-600">Same name and numbers on every paper.</div></li>
          <li><b>4. Is anything suspicious?</b><div className="text-slate-600">Not already registered, and the bank account isn't someone else's.</div></li>
        </ol>
        <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">What you'll see</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {STATUSES.map(([dot, name, text]) => (
            <li key={name} className="flex gap-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} /><span><b>{name}.</b> {text}</span></li>
          ))}
        </ul>
        <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">What we don't do</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          <li>We don't confirm with a bank that the account belongs to the vendor. We only check that the papers agree.</li>
          <li>GST status comes from a test list here, not the live GST website.</li>
        </ul>
      </aside>
    </div>
  );
}
