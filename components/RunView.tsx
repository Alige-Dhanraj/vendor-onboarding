"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CheckResult } from "@/lib/engine/types";
import { LAYER_LABEL, SEVERITY_LABEL, SLOT_LABEL, STAGES, effectiveStatus, fmtMs } from "@/lib/ui-labels";
import { SCENARIOS } from "@/lib/scenarios";
import { Card, CheckBadge, Pill, SectionTitle, StatusBadge, btnPrimary, btnSecondary, inputCls } from "./ui";

type Bundle = any; // shape of GET /api/runs/:id (RunBundle with signed document URLs)

export default function RunView({ id }: { id: string }) {
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function load() {
    const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Could not load run"); return null; }
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

  if (error) return <Card className="p-6 text-sm text-rose-700">{error}</Card>;
  if (!data) return <div className="text-sm text-slate-500">Loading run…</div>;

  const { run, submission, events, checks, documents, message, reviewer_actions } = data;
  const form = submission.form_data;
  const status = effectiveStatus(run);
  const running = run.status === "RUNNING";
  const scenario = submission.scenario_id ? SCENARIOS.find((s) => s.id === submission.scenario_id) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Run VEN-{String(run.run_number).padStart(4, "0")} · version {submission.version}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{form.legal_name || "Unnamed vendor"}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill tone={run.ai_mode === "openai" ? "indigo" : "amber"}>{run.ai_mode === "openai" ? "Documents read by OpenAI" : "Offline mode: readings from test fixtures"}</Pill>
            {scenario && <Pill>Scenario: {scenario.label}</Pill>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className={btnSecondary}>Dashboard</Link>
          <Link href="/" className={btnPrimary}>New submission</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-5">
          <SectionTitle hint={run.duration_ms ? `total ${fmtMs(run.duration_ms)}` : running ? "running…" : ""}>Live run</SectionTitle>
          <Stepper events={events} running={running} />
        </Card>

        <div className="space-y-6">
          <OutcomeBanner run={run} status={status} running={running} checks={checks} />
          {!running && run.review_flag && <ReviewPanel run={run} actions={reviewer_actions} onDone={load} />}
          {!running && (status === "PENDING_INFO") && (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm text-slate-600">When the vendor sends corrected details, submit them as a new version. Every check re-runs; unchanged documents reuse their earlier reading.</div>
              <Link className={btnSecondary} href={`/?vendor_ref=${encodeURIComponent(submission.vendor_ref)}${scenario?.resubmission ? `&scenario=${scenario.id}&v=2` : ""}`}>Resubmit as version {submission.version + 1}</Link>
            </Card>
          )}
          {checks.length > 0 && <Checks checks={checks} />}
        </div>
      </div>

      {documents.length > 0 && <Documents documents={documents} running={running} />}
      {message && <Message message={message} />}
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
        const dot = {
          RUNNING: "bg-indigo-500 pulse", DONE: "bg-emerald-500", FLAGGED: "bg-amber-500", FAILED: "bg-rose-500", WAITING: "bg-slate-200", SKIPPED: "bg-slate-200",
        }[state as string] ?? "bg-slate-200";
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

function OutcomeBanner({ run, status, running, checks }: { run: any; status: string; running: boolean; checks: CheckResult[] }) {
  if (running) {
    return <Card className="p-5"><div className="flex items-center gap-3 text-sm text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500 pulse" />Processing… each stage appears on the left as it finishes.</div></Card>;
  }
  const tone = { APPROVED: "border-emerald-200 bg-emerald-50/60", PENDING_INFO: "border-amber-200 bg-amber-50/60", MANUAL_REVIEW: "border-orange-200 bg-orange-50/60", REJECTED: "border-rose-200 bg-rose-50/60", FAILED: "border-rose-200 bg-rose-50/60" }[status] ?? "";
  const flagged = checks.filter((c) => c.status === "FAIL" && !(run.headline ?? "").includes(c.reason));
  const counts = ["PASS", "FAIL", "WARN", "UNVERIFIED"].map((s) => [s, checks.filter((c) => c.status === s).length] as const);
  return (
    <div className={`rounded-xl border p-5 ${tone}`}>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={status} size="lg" />
        <span className="text-xs text-slate-500">Output: <b className="text-slate-700">{run.final_status ? (run.final_status === "PENDING_INFO" ? "PENDING" : run.final_status) : run.outcome}</b>{run.review_flag ? " · review flag" : ""}</span>
        <span className="ml-auto text-xs text-slate-500">{counts.map(([s, n]) => `${n} ${s.toLowerCase()}`).join(" · ")}</span>
      </div>
      <p className="mt-3 text-[15px] font-medium text-slate-900">{run.headline}</p>
      {flagged.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {flagged.map((c) => <li key={c.id}><span className="mono text-xs text-slate-500">{c.id}</span> <b>{SEVERITY_LABEL[c.severity ?? ""]}</b>: {c.reason}</li>)}
        </ul>
      )}
    </div>
  );
}

function Checks({ checks }: { checks: CheckResult[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(checks.filter((c) => c.status !== "PASS" && c.status !== "SKIPPED").map((c) => [c.id, true])));
  const layers = ["COMPLETE", "VALID", "CONSISTENT", "CREDIBLE"];
  return (
    <Card className="p-5">
      <SectionTitle hint="Click any check to see what was compared, from where, under which rule">Checks and evidence</SectionTitle>
      <div className="space-y-5">
        {layers.map((l) => (
          <div key={l}>
            <div className="mb-2 text-xs font-semibold text-slate-700">{LAYER_LABEL[l]}</div>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {checks.filter((c) => c.layer === l).map((c) => (
                <div key={c.id}>
                  <button type="button" onClick={() => setOpen((p) => ({ ...p, [c.id]: !p[c.id] }))} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
                    <CheckBadge status={c.status} />
                    <span className="mono w-7 text-xs text-slate-400">{c.id}</span>
                    <span className="flex-1 text-sm text-slate-800">{c.title}</span>
                    {c.severity && c.status !== "PASS" && <span className="text-xs text-slate-500">{SEVERITY_LABEL[c.severity]}</span>}
                    <span className="text-xs text-slate-400">{open[c.id] ? "−" : "+"}</span>
                  </button>
                  {open[c.id] && <Evidence c={c} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Evidence({ c }: { c: CheckResult }) {
  return (
    <div className="grid gap-x-6 gap-y-2 bg-slate-50/70 px-4 py-3 text-sm sm:grid-cols-[110px_1fr]">
      <div className="text-xs font-medium text-slate-500">Checked</div><div className="text-slate-800">{c.checked}</div>
      {c.sources.length > 0 && (<>
        <div className="text-xs font-medium text-slate-500">Sources</div>
        <div className="space-y-1">
          {c.sources.map((s, i) => (
            <div key={i} className="flex flex-wrap gap-x-2"><span className="text-slate-500">{s.label}:</span><span className="mono break-all text-slate-900">{s.value}</span></div>
          ))}
        </div>
      </>)}
      <div className="text-xs font-medium text-slate-500">Rule</div><div className="text-slate-700">{c.rule}</div>
      <div className="text-xs font-medium text-slate-500">Reason</div><div className="text-slate-900">{c.reason}</div>
      {c.next_action && c.status !== "PASS" && (<><div className="text-xs font-medium text-slate-500">Next action</div><div className="text-slate-900">{c.next_action}</div></>)}
    </div>
  );
}

function Documents({ documents, running }: { documents: any[]; running: boolean }) {
  const fieldLabel: Record<string, string> = { legal_name: "Name", pan: "PAN", gstin: "GSTIN", account_holder: "Account holder", account_number: "Account no.", ifsc: "IFSC", ein: "EIN", registration_state: "State" };
  return (
    <Card className="p-5">
      <SectionTitle hint="Original document beside what the AI read from it">Documents</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-2">
        {documents.map((d) => {
          const r = d.extracted;
          const wrong = r && r.doc_type !== d.slot;
          return (
            <div key={d.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[180px_1fr]">
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
                  {r && <Pill tone={wrong ? "amber" : "slate"}>AI: {r.doc_type === "UNREADABLE" ? "unreadable" : SLOT_LABEL[r.doc_type] ?? "other document"}</Pill>}
                  {r && <span className="text-xs text-slate-500">legibility {Number(r.overall_confidence).toFixed(2)}</span>}
                </div>
                <div className="truncate text-xs text-slate-400">{d.file_name}</div>
                {r && Object.keys(r.fields ?? {}).length > 0 && (
                  <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
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
      </div>
    </Card>
  );
}

function Message({ message }: { message: any }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="p-5">
      <SectionTitle hint={<>Draft only, not sent · {message.generated_by === "openai" ? "written by AI from the verified findings" : "template from the verified findings"}</>}>Message to the vendor</SectionTitle>
      {message.analyst_summary && <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600"><b>Internal note:</b> {message.analyst_summary}</p>}
      <div className="rounded-lg border border-slate-200">
        <div className="border-b border-slate-100 px-4 py-2 text-sm"><span className="text-slate-500">Subject:</span> <span className="font-medium">{message.subject}</span></div>
        <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-slate-800">{message.body}</pre>
      </div>
      <button type="button" className={`${btnSecondary} mt-3`} onClick={() => { navigator.clipboard.writeText(`Subject: ${message.subject}\n\n${message.body}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? "Copied" : "Copy message"}
      </button>
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
  return (
    <Card className="border-orange-200 p-5">
      <SectionTitle hint="Your decision and reason are saved to the audit log">Reviewer decision</SectionTitle>
      {actions.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {actions.map((a: any) => (
            <li key={a.id} className="rounded-md bg-slate-50 px-3 py-2">
              <b>{a.action.replace("_", " ").toLowerCase()}</b> by {a.reviewer} · {new Date(a.created_at).toLocaleString()}<br />
              <span className="text-slate-600">“{a.reason}”</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">The system flagged this vendor but did not reject it: a fraud signal is not proof. Check the evidence below, then decide.</p>
          <textarea className={`${inputCls} min-h-[80px]`} placeholder="Reason (required, at least 10 characters), e.g. 'Called the vendor; account belongs to their sister concern, bank letter received.'" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={busy || reason.trim().length < 10} onClick={() => act("APPROVE")}>Approve</button>
            <button className={btnSecondary} disabled={busy || reason.trim().length < 10} onClick={() => act("REQUEST_INFO")}>Ask vendor for more</button>
            <button className={`${btnSecondary} text-rose-700`} disabled={busy || reason.trim().length < 10} onClick={() => act("REJECT")}>Reject</button>
          </div>
          {err && <p className="mt-2 text-sm text-rose-700">{err}</p>}
        </>
      )}
    </Card>
  );
}
