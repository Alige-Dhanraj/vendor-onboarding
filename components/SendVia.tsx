"use client";
import { useState } from "react";
import { mailtoLink, whatsappLink } from "@/lib/ui-labels";
import { btnSecondary } from "./ui";

/** A button that opens a small pop-up: send this message by email or WhatsApp. */
export default function SendVia({ label, vendor, email, phone, message, className }: {
  label: string; vendor: string; email?: string; phone?: string; message: { subject: string; body: string }; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pick = "flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50";
  return (
    <>
      <button type="button" className={className ?? btnSecondary} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={label}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-900">Send to {vendor || "the vendor"}</div>
            <p className="mt-1 text-sm text-slate-500">Choose how to send it. The message is ready; you press send.</p>
            <div className="mt-4 space-y-2">
              <a className={pick} href={mailtoLink(email, message)} onClick={() => setOpen(false)}>
                <span>Email<span className="block text-xs font-normal text-slate-500">{email || "You choose the address"}</span></span><span aria-hidden>→</span>
              </a>
              <a className={pick} href={whatsappLink(phone, message)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                <span>WhatsApp<span className="block text-xs font-normal text-slate-500">{phone ? `Opens a chat with ${phone}` : "You choose the contact"}</span></span><span aria-hidden>→</span>
              </a>
            </div>
            <button type="button" className="mt-3 w-full py-3 text-sm text-slate-500 hover:text-slate-800" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
