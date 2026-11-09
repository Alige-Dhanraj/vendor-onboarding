"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CheckResult } from "@/lib/engine/types";
import { LAYER_LABEL, PLAIN, SLOT_LABEL, STAGES, effectiveStatus, fmtMs, mailtoLink, plainText } from "@/lib/ui-labels";
import { Card, CheckBadge, Pill, SectionTitle, StatusBadge, btnPrimary, btnSecondary, inputCls } from "./ui";

type Bundle = any; // shape of GET /api/runs/:id

const Rich = ({ text }: { text: string }) => <>{text.split("**").map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>;

const NEXT_STEP: Record<string, string> = {
  APPROVED: "Send the vendor a short approval note.",
  PENDING_INFO: "Send the vendor the list below so they can fix it.",
  REJECTED: "Send the vendor a short notice.",
  FAILED: "The check could not finish. Please review this vendor by hand.",
};

export default function RunView({ id }: { id: string }) {
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const started = useRef(false);
  const sawRunning = useRef(false);

  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.role ?? null)).catch(() => {}); }, []);

  async function load() {
    const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Could not load this vendor"); return null; }
    setData(json);
    return json;
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const tick = async () => {
      const b = await load();
      if (!alive || !b) return;
      if (b.run.status === "RUNNING" && b.events.length === 0 && !started.current) {
        started.current = true;
        fetch(`/api/runs/${id}/execute`, { method: "POST" }).then(() => load());
      }
      if (b.run.status === "RUNNING") timer = setTimeout(tick, 700);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Result popup: only when this page watched the check finish (not when reopening an old one).
  useEffect(() => {
    if (!data) return;
    if (data.run.status === "RUNNING") { sawRunning.current = true; return; }
    if (!sawRunning.current) return;
    sawRunning.current = false;
    setToast(effectiveStatus(data.run));
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [data]);

  if (error) return <Card className="mx-auto max-w-3xl p-6 text-sm text-rose-700">{error}</Card>;
  if (!data) return <div className="mx-auto max-w-3xl space-y-4"><div className="h-9 w-72 animate-pulse rounded bg-slate-200" /><div className="h-40 animate-pulse rounded-xl bg-slate-100" /></div>;

  const { run, submission, events, checks, documents, message, reviewer_actions, vendor } = data;
  const inactive = vendor?.active === false;
  const form = submission.form_data;
  const status = effectiveStatus(run);
  const running = run.status === "RUNNING";
  const rank = (c: CheckResult) => c.status === "FAIL" ? (c.severity === "HARD_STOP" ? 0 : c.severity === "REVIEW" ? 1 : 2) : c.status === "UNVERIFIED" ? 3 : 4;
  const problems: CheckResult[] = checks.filter((c: CheckResult) => ["FAIL", "UNVERIFIED", "WARN"].includes(c.status)).sort((a: CheckResult, b: CheckResult) => rank(a) - rank(b));
  const passed = checks.length - problems.length;
  const canDecide = role === "REVIEWER" || role === "ADMIN";
  const needsDecision = !running && run.review_flag && !run.review_resolved;
  const email = form.contact?.email;

  const nextStep = inactive ? "This vendor is inactive. A reviewer can reactivate it." : status === "MANUAL_REVIEW" ? (canDecide ? "Check the problem below, then decide." : "A reviewer will decide this one.") : NEXT_STEP[status];
  const resubmit = `/new?vendor_ref=${encodeURIComponent(submission.vendor_ref)}${submission.scenario_id ? `&scenario=${submission.scenario_id}&v=2&demo=1` : ""}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {toast && <ResultToast status={toast} />}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{form.legal_name || "Unnamed vendor"}</h1>
        <div className="mt-1 text-sm text-slate-500">{[form.contact?.name, email].filter(Boolean).join(" · ")}</div>
      </div>

      {running ? (
        <Card className="p-5">
          <SectionTitle>Checking…</SectionTitle>
          <Stepper events={events} running />
        </Card>
      ) : (
        <>
          <div className={`rounded-xl border p-5 ${{ APPROVED: "border-emerald-200 bg-emerald-50/60", PENDING_INFO: "border-amber-200 bg-amber-50/60", MANUAL_REVIEW: "border-orange-200 bg-orange-50/60", REJECTED: "border-rose-200 bg-rose-50/60", FAILED: "border-rose-200 bg-rose-50/60", INACTIVE: "border-slate-200 bg-slate-50" }[(inactive ? "INACTIVE" : status) as string] ?? ""}`}>
            <StatusBadge status={inactive ? "INACTIVE" : status} size="lg" />
            <p className="mt-3 text-base font-medium text-slate-900">{run.headline}</p>
            <p className="mt-1 text-sm text-slate-600">{nextStep}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {run.status === "FAILED" && <RetryButton id={run.id} />}
              {status === "APPROVED" && !inactive && message && <a className={btnPrimary} href={mailtoLink(email, message)}>Send approval note</a>}
              {status === "PENDING_INFO" && message && <a className={btnPrimary} href={mailtoLink(email, withLink(message, data.invite_token))}>Send to vendor</a>}
              {status === "REJECTED" && message && <a className={btnPrimary} href={mailtoLink(email, message)}>Send notice</a>}
              {needsDecision && canDecide && <a className={btnPrimary} href="#decide">Review and decide</a>}
              {status === "PENDING_INFO" && (submission.scenario_id ? <Link className={btnSecondary} href={resubmit}>Add corrected documents</Link> : <CorrectDocs token={data.invite_token} vendorRef={submission.vendor_ref} name={form.contact?.name} email={form.contact?.email} />)}
              {status === "APPROVED" && !inactive && <Link className={btnSecondary} href="/new">Next vendor</Link>}
              {inactive && canDecide && <a className={btnPrimary} href="#vendor-status">Reactivate vendor</a>}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Checked in {fmtMs(run.duration_ms)} · <button className="-my-3 px-1 py-3 underline hover:text-slate-700" onClick={() => setShowSteps((v) => !v)}>{showSteps ? "Hide steps" : "Show steps"}</button>
            </div>
          </div>
          {showSteps && <Card className="p-5"><Stepper events={events} running={false} /></Card>}
        </>
      )}

      {needsDecision && (canDecide
        ? <div id="decide" className="scroll-mt-24"><ReviewPanel run={run} actions={reviewer_actions} onDone={load} /></div>
        : role ? <Card className="border-orange-200 p-4 text-sm text-slate-700">A reviewer needs to decide this case. Their decision will show here.</Card> : null)}
      {!running && run.review_flag && run.review_resolved && reviewer_actions.length > 0 && <ReviewPanel run={run} actions={reviewer_actions} onDone={load} />}

      {!running && checks.length > 0 && (
        <section className="space-y-3">
          {problems.length > 0 ? (
            <>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What needs attention</h2>
              {problems.map((c) => <Problem key={c.id} c={c} />)}
            </>
          ) : <p className="rounded-xl border border-emerald-200 bg-white p-4 text-sm text-slate-700">Nothing needs attention.</p>}
          <p className="text-sm text-slate-500">✓ {passed} check{passed === 1 ? "" : "s"} passed or didn't apply · <button className="-my-2 py-2 text-indigo-600 hover:underline" onClick={() => setShowAll((v) => !v)}>{showAll ? "Hide all checks" : "Show all checks"}</button></p>
          {showAll && <AllChecks checks={checks} />}
        </section>
      )}

      {!running && status === "APPROVED" && <RecordCard id={run.id} form={form} actions={reviewer_actions} />}
      {vendor && status === "APPROVED" && <div id="vendor-status" className="scroll-mt-24"><VendorLifecycle id={run.id} vendor={vendor} canDecide={canDecide} onDone={load} /></div>}
      {message && <MessageCard message={status === "PENDING_INFO" ? withLink(message, data.invite_token) : message} email={email} holding={status === "MANUAL_REVIEW"} />}

      {documents.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">Documents ({documents.length})</summary>
          <div className="space-y-3 px-5 pb-5"><Documents documents={documents} running={running} /></div>
        </details>
      )}

      {!running && (
        <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">History</summary>
          <ul className="space-y-2 px-5 pb-5 text-sm text-slate-600">
            <li>Version {submission.version} submitted · {new Date(submission.created_at).toLocaleString()}</li>
            <li>Checked by VendorGate in {fmtMs(run.duration_ms)}</li>
            {reviewer_actions.map((a: any) => <li key={a.id}>{a.action.replace("_", " ").toLowerCase()} by {a.reviewer} · {new Date(a.created_at).toLocaleString()}: “{a.reason}”</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stepper({ events, running }: { events: any[]; running: boolean }) {
  const latest = new Map<string, any>();
  for (const e of events) latest.set(e.stage, e);
  const failed = events.find((e) => e.state === "FAILED");
  return (
    <ol className="space-y-1">
      {STAGES.map((s, i) => {
        const e = latest.get(s.key);
        const state = e?.state ?? (running ? "WAITING" : "SKIPPED");
        const dot = ({ RUNNING: "bg-indigo-500 pulse", DONE: "bg-emerald-500", FLAGGED: "bg-amber-500", FAILED: "bg-rose-500", WAITING: "bg-slate-200", SKIPPED: "bg-slate-200" } as Record<string, string>)[state] ?? "bg-slate-200";
        return (
          <li key={s.key} className="relative flex gap-3 pb-3">
            {i < STAGES.length - 1 && <span className="absolute left-[7px] top-5 h-full w-px bg-slate-200" />}
            <span className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full ring-4 ring-white ${dot}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-medium ${state === "WAITING" ? "text-slate-400" : "text-slate-900"}`}>{s.label}</span>
                {e?.duration_ms != null && <span className="text-xs text-slate-400">{fmtMs(e.duration_ms)}</span>}
              </div>
              <div className="text-xs text-slate-500">{e?.detail ?? (state === "RUNNING" ? "working…" : s.sub)}</div>
            </div>
          </li>
        );
      })}
      {failed && <li className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">{failed.detail}</li>}
    </ol>
  );
}

function Problem({ c }: { c: CheckResult }) {
  const [open, setOpen] = useState(false);
  const tone = c.status === "FAIL"
    ? (c.severity === "HARD_STOP" ? "border-rose-200 bg-rose-50/50" : c.severity === "REVIEW" ? "border-orange-200 bg-orange-50/50" : "border-amber-200 bg-amber-50/50")
    : "border-slate-200 bg-slate-50";
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium text-slate-900">{PLAIN[c.id] ?? c.title}</div>
        <button type="button" aria-label="Why we check this" onClick={() => setOpen((v) => !v)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-300 text-xs text-slate-500 hover:bg-white">i</button>
      </div>
      <p className="mt-1 text-sm text-slate-700">{c.reason}</p>
      {c.sources.length > 1 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {c.sources.map((s, i) => (
            <div key={i} className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
              <div className="text-xs text-slate-500">{s.label}</div>
              <div className="mono break-all text-sm text-slate-900">{s.value}</div>
            </div>
          ))}
        </div>
      )}
      {c.next_action && <p className="mt-3 text-sm text-slate-800"><b>Next:</b> {c.next_action}</p>}
      {open && <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600"><div><b>What we compared:</b> {c.checked}</div><div><b>Rule:</b> {c.rule}</div></div>}
    </div>
  );
}

function AllChecks({ checks }: { checks: CheckResult[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-4">
      {["COMPLETE", "VALID", "CONSISTENT", "CREDIBLE"].map((l) => (
        <div key={l}>
          <div className="mb-1.5 text-xs font-semibold text-slate-700">{LAYER_LABEL[l]}</div>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {checks.filter((c) => c.layer === l).map((c) => (
              <div key={c.id}>
                <button type="button" onClick={() => setOpen((p) => ({ ...p, [c.id]: !p[c.id] }))} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
                  <CheckBadge status={c.status} />
                  <span className="flex-1 text-sm text-slate-800">{PLAIN[c.id] ?? c.title} <span className="mono ml-1 text-xs text-slate-400">{c.id}</span></span>
                  <span className="text-xs text-slate-400">{open[c.id] ? "−" : "+"}</span>
                </button>
                {open[c.id] && (
                  <div className="space-y-1 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
                    <div><b>Compared:</b> {c.checked}</div>
                    {c.sources.map((s, i) => <div key={i}><b>{s.label}:</b> <span className="mono">{s.value}</span></div>)}
                    <div><b>Rule:</b> {c.rule}</div><div><b>Result:</b> {c.reason}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Documents({ documents, running }: { documents: any[]; running: boolean }) {
  const fieldLabel: Record<string, string> = { legal_name: "Name", pan: "PAN", gstin: "GSTIN", account_holder: "Account holder", account_number: "Account no.", ifsc: "IFSC", ein: "EIN", registration_state: "State", trade_name: "Trade name", constitution: "Type", address_street: "Street", address_city: "City", address_pincode: "Pincode" };
  return (
    <>
      {documents.map((d) => {
        const r = d.extracted;
        const wrong = r && r.doc_type !== d.slot;
        return (
          <div key={d.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[170px_1fr]">
            <a href={d.url ?? undefined} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-slate-200 bg-slate-50">
              {d.url && d.mime_type?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.url} alt={d.file_name} className="h-32 w-full object-cover object-top" />
              ) : d.url && d.mime_type === "application/pdf" ? (
                <iframe src={`${d.url}#toolbar=0&navpanes=0&view=FitH`} title={d.file_name} className="pointer-events-none h-32 w-full bg-white" />
              ) : (
                <div className="grid h-32 place-items-center text-xs text-slate-500">{running ? "…" : "Preview unavailable"}</div>
              )}
            </a>
            <div className="min-w-0 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{SLOT_LABEL[d.slot]}</span>
                {r && <Pill tone={wrong ? "amber" : "slate"}>Read as: {r.doc_type === "UNREADABLE" ? "unreadable" : SLOT_LABEL[r.doc_type] ?? "other document"}</Pill>}
              </div>
              <div className="truncate text-xs text-slate-400">{d.file_name}{r ? ` · clarity ${Number(r.overall_confidence).toFixed(2)}` : ""}</div>
              {r && Object.keys(r.fields ?? {}).length > 0 && (
                <dl className="mt-2 grid grid-cols-[100px_1fr] gap-x-3 gap-y-1">
                  {Object.entries(r.fields).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-xs text-slate-500">{fieldLabel[k] ?? k}</dt>
                      <dd className="mono truncate text-xs text-slate-900">{String(v)} <span className="text-slate-400">({Number(r.confidence?.[k] ?? 0).toFixed(2)})</span></dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function MessageCard({ message, email, holding }: { message: any; email?: string; holding?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="p-5">
      <SectionTitle hint="Draft only, nothing is sent for you">{holding ? "Holding note (optional)" : "Message to the vendor"}</SectionTitle>
      {holding && <p className="mb-3 text-sm text-slate-600">Decide first. If you need something from the vendor, use <b>Ask vendor for more</b> above, so they get a clear request. Send this note only if they are expecting a reply.</p>}
      <div className="rounded-lg border border-slate-200">
        <div className="border-b border-slate-100 px-4 py-2 text-sm"><span className="text-slate-500">Subject:</span> <span className="font-medium"><Rich text={message.subject} /></span></div>
        <div className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-slate-800"><Rich text={message.body} /></div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <a className={holding ? btnSecondary : btnPrimary} href={mailtoLink(email, message)}>{holding ? "Send acknowledgement" : "Send to vendor"}</a>
        <button type="button" className={btnSecondary} onClick={() => { navigator.clipboard.writeText(`Subject: ${plainText(message.subject)}\n\n${plainText(message.body)}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </Card>
  );
}

function ReviewPanel({ run, actions, onDone }: { run: any; actions: any[]; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (action: string) => {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/runs/${run.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error); return; }
    setReason("");
    onDone();
  };
  const ok = reason.trim().length >= 10;
  return (
    <Card className="border-orange-200 p-5">
      <SectionTitle>Your decision</SectionTitle>
      {actions.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {actions.map((a: any) => (
            <li key={a.id} className="rounded-md bg-slate-50 px-3 py-2"><b>{a.action.replace("_", " ").toLowerCase()}</b> by {a.reviewer}<br /><span className="text-slate-600">“{a.reason}”</span></li>
          ))}
        </ul>
      ) : (
        <>
          <textarea className={`${inputCls} min-h-[76px]`} placeholder="Why? (at least 10 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button className={btnPrimary} disabled={busy || !ok} onClick={() => act("APPROVE")}>Approve</button>
            <button className={btnSecondary} disabled={busy || !ok} onClick={() => act("REQUEST_INFO")}>Ask vendor for more</button>
            <button className={`${btnSecondary} text-rose-700`} disabled={busy || !ok} onClick={() => act("REJECT")}>Reject</button>
          </div>
          {err && <p className="mt-2 text-sm text-rose-700">{err}</p>}
        </>
      )}
    </Card>
  );
}

const TOAST: Record<string, { label: string; color: string; icon: string }> = {
  APPROVED: { label: "Vendor approved", color: "text-emerald-600", icon: "M6 12.5l4 4 8-9" },
  PENDING_INFO: { label: "Waiting on the vendor", color: "text-amber-500", icon: "M12 7v6m0 3.5v.01" },
  MANUAL_REVIEW: { label: "Needs a reviewer", color: "text-orange-500", icon: "M12 7v6m0 3.5v.01" },
  REJECTED: { label: "Rejected", color: "text-rose-600", icon: "M8 8l8 8m0-8l-8 8" },
  FAILED: { label: "Check failed", color: "text-rose-600", icon: "M8 8l8 8m0-8l-8 8" },
};

function ResultToast({ status }: { status: string }) {
  const t = TOAST[status] ?? TOAST.FAILED;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center">
      <div className="toast-card flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-10 py-8 shadow-xl">
        <svg viewBox="0 0 24 24" className={`h-16 w-16 ${t.color}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d={t.icon} className="tick-draw" />
        </svg>
        <div className="text-lg font-semibold text-slate-900">{t.label}</div>
      </div>
    </div>
  );
}

function RecordCard({ id, form, actions }: { id: string; form: any; actions: any[] }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => { fetch(`/api/runs/${id}/export`).then((r) => r.json()).then((j) => setConnected(!!j.connected)).catch(() => {}); }, [id]);
  const by = actions.find((a: any) => a.action === "APPROVE")?.reviewer ?? "VendorGate automatic checks";
  const us = form.country === "US";
  const rows: [string, string][] = [
    ["Legal name", form.legal_name], ["Type", String(form.entity_type).replace("_", " ").toLowerCase()],
    ...(us ? ([["EIN", form.tax.ein]] as [string, string][]) : ([["PAN", form.tax.pan], ["GSTIN", form.tax.gstin || "Not GST-registered"]] as [string, string][])),
    ["Bank account holder", form.bank.account_holder], ["Account", form.bank.account_number], [us ? "Routing number" : "IFSC", (us ? form.bank.routing_number : form.bank.ifsc) ?? ""],
    ["Address", [form.address.street, form.address.city, form.address.state, form.address.postal_code].filter(Boolean).join(", ")],
    ["Contact", [form.contact.name, form.contact.email, form.contact.phone].filter(Boolean).join(" · ")],
  ];
  async function send() {
    setBusy(true); setNote(null);
    const res = await fetch(`/api/runs/${id}/export`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    setNote(res.ok ? { ok: true, text: `Sent to ${json.host}.` } : { ok: false, text: json.error ?? "Could not send." });
  }
  return (
    <Card className="p-5">
      <SectionTitle hint={`Verified by ${by}`}>Vendor record</SectionTitle>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[150px_1fr]">
        {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></div>))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a className={btnSecondary} href={`/api/runs/${id}/record?format=csv`}>Download CSV</a>
        {connected && <button className={btnSecondary} onClick={send} disabled={busy}>{busy ? "Sending…" : "Send to accounting system"}</button>}
        {note && <span className={`text-sm ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</span>}
      </div>
    </Card>
  );
}

/** If the vendor came in through a link, the "fix this" email points them to their page instead of asking for a reply. */
function withLink(m: any, token?: string | null) {
  if (!m || !token || typeof window === "undefined") return m;
  const link = `${window.location.origin}/invite/${token}`;
  return { ...m, body: String(m.body).replace(/Just reply to this email[^\n]*/, `Fix it here and send again: ${link}\n\nThank you!`) };
}

const REASONS = ["Trade completed", "Duplicate vendor", "Fraud concern", "Other"];

function VendorLifecycle({ id, vendor, canDecide, onDone }: { id: string; vendor: { id: string; active: boolean; reason: string | null; by: string | null; at: string | null }; canDecide: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fraud = /^Fraud concern/.test(vendor.reason ?? "");
  if (vendor.active && !canDecide) return null;

  async function go(action: "DEACTIVATE" | "REACTIVATE") {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/runs/${id}/vendor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason, note }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(json.error ?? "Could not update the vendor.");
    setOpen(false); setNote(""); onDone();
  }

  return (
    <Card className="p-5">
      <SectionTitle hint={vendor.id}>Vendor status</SectionTitle>
      {!vendor.active ? (
        <>
          <p className="text-sm text-slate-700"><b>Inactive</b>{vendor.at ? ` since ${new Date(vendor.at).toLocaleDateString()}` : ""}{vendor.by ? ` · ${vendor.by}` : ""}</p>
          {vendor.reason && <p className="mt-1 text-sm text-slate-600">{vendor.reason}</p>}
          {canDecide && !fraud && <button className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => go("REACTIVATE")}>{busy ? "Saving…" : "Reactivate vendor"}</button>}
          {!canDecide && <p className="mt-2 text-xs text-slate-500">Only a reviewer or admin can reactivate this vendor. You are signed in as a buyer.</p>}
          {fraud && <p className="mt-2 text-xs text-slate-500">Deactivated for a fraud concern, so it can't be reactivated here.</p>}
        </>
      ) : !open ? (
        <>
          <p className="text-sm text-slate-700"><b>Active</b>. Deactivate this vendor when the work with them is over. Their records are kept.</p>
          <button className={`${btnSecondary} mt-3`} onClick={() => setOpen(true)}>Deactivate vendor</button>
        </>
      ) : (
        <div className="space-y-3">
          <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <textarea className={`${inputCls} min-h-[64px]`} placeholder={reason === "Other" ? "Why? (required)" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
          {reason === "Fraud concern" && <p className="text-xs text-rose-700">This also adds the vendor to the blocklist and can't be undone here.</p>}
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={busy || (reason === "Other" && note.trim().length < 5)} onClick={() => go("DEACTIVATE")}>{busy ? "Saving…" : "Deactivate"}</button>
            <button className={btnSecondary} onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-rose-700">{err}</p>}
    </Card>
  );
}

/** Opens the vendor's own page (it keeps every earlier document), creating the private link first if there is none. */
function CorrectDocs({ token, vendorRef, name, email }: { token?: string | null; vendorRef: string; name?: string; email?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (token) return <Link className={btnSecondary} href={`/invite/${token}`}>Add corrected documents</Link>;
  async function go() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_name: name || "Vendor", contact_email: email, vendor_ref: vendorRef }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error ?? "Could not open the correction page."); setBusy(false); return; }
    window.location.href = `/invite/${j.token}`;
  }
  return (<><button className={btnSecondary} onClick={go} disabled={busy}>{busy ? "Opening…" : "Add corrected documents"}</button>{err && <span className="text-sm text-rose-700">{err}</span>}</>);
}

function RetryButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/runs/${id}/retry`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error ?? "Could not start the check again."); setBusy(false); return; }
    window.location.href = `/runs/${j.run_id}`;
  }
  return (<><button className={btnPrimary} onClick={go} disabled={busy}>{busy ? "Starting…" : "Run the checks again"}</button>{err && <span className="text-sm text-rose-700">{err}</span>}</>);
}
