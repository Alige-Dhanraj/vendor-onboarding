"use client";
// The vendor's own page, opened from a private link: send documents, see the status, fix what is asked.
import { useCallback, useEffect, useState } from "react";
import type { DocSlot, SubmissionForm } from "@/lib/engine/types";
import { SLOT_LABEL } from "@/lib/ui-labels";
import SubmitForm from "./SubmitForm";
import { Card } from "./ui";

interface View {
  state: "NEW" | "CHECKING" | "NEED_INFO" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  contact_name: string; contact_email: string; fixes: string[];
  message: { subject: string; body: string } | null;
  form: SubmissionForm | null; kept: { slot: DocSlot; file_name: string }[];
}

function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>;
}

function Notice({ tone, title, children }: { tone: "green" | "red" | "slate"; title: string; children?: React.ReactNode }) {
  const mark = { green: "bg-emerald-100 text-emerald-700", red: "bg-rose-100 text-rose-700", slate: "bg-slate-100 text-slate-600" }[tone];
  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <div className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-xl ${mark}`}>{tone === "green" ? "✓" : tone === "red" ? "!" : "…"}</div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
      {children && <div className="mt-3 space-y-2 text-sm text-slate-600">{children}</div>}
    </Card>
  );
}

export default function VendorPortal({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/invite/${token}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "This link is not valid.");
      setView(json);
    } catch { /* keep the last view; the next poll retries */ }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (view?.state !== "CHECKING") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [view?.state, load]);

  if (error) return <Notice tone="red" title={error} />;
  if (!view) return <div className="mx-auto max-w-xl space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />)}</div>;

  const hello = view.contact_name.split(" ")[0];
  const form = (initial?: { form: SubmissionForm; kept: View["kept"] }) => (
    <SubmitForm key={view.state} invite={{ token, contactName: view.contact_name, contactEmail: view.contact_email, initial, onSubmitted: () => { setView({ ...view, state: "CHECKING" }); load(); } }} />
  );

  switch (view.state) {
    case "NEW":
      return (
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-semibold tracking-tight">Register as a vendor</h1>
          <p className="mb-6 mt-1 text-sm text-slate-600">Hi {hello}, drop your documents and we will fill in most of the form for you.</p>
          {form()}
        </div>
      );
    case "CHECKING":
      return <Notice tone="slate" title="We're checking your details"><p>This takes about a minute. You can close this page and open the same link later.</p></Notice>;
    case "IN_REVIEW":
      return <Notice tone="slate" title="Thank you, we have everything"><p>Our team is taking a quick look. We will email you at {view.contact_email} if we need anything else.</p></Notice>;
    case "APPROVED":
      return <Notice tone="green" title="You're registered"><p>No further action is needed from you.</p>{view.message && <p className="whitespace-pre-line text-left"><Rich text={view.message.body} /></p>}</Notice>;
    case "REJECTED":
      return <Notice tone="red" title="We couldn't register you">{view.message && <p className="whitespace-pre-line text-left"><Rich text={view.message.body} /></p>}</Notice>;
    case "NEED_INFO":
      return (
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-semibold tracking-tight">A few things need fixing</h1>
          <p className="mb-4 mt-1 text-sm text-slate-600">Hi {hello}, fix these and send again. Your other documents are kept.</p>
          <Card className="mb-6 border-amber-200 bg-amber-50 p-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-amber-900">{view.fixes.map((f, i) => <li key={i}><Rich text={f} /></li>)}</ol>
          </Card>
          {form(view.form ? { form: view.form, kept: view.kept } : undefined)}
        </div>
      );
  }
}
