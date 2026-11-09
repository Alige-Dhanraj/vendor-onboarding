"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SCENARIOS } from "@/lib/scenarios";
import { GST_STATE_CODES, phoneProblem } from "@/lib/engine/ids";
import { parseSignature } from "@/lib/engine/signature";
import type { DocSlot, SubmissionForm } from "@/lib/engine/types";
import { inviteMessage } from "@/lib/engine/message";
import { SLOT_LABEL, mailtoLink } from "@/lib/ui-labels";
import { Card, Field, Pill, SectionTitle, btnPrimary, btnSecondary, inputCls } from "./ui";

const EMPTY: SubmissionForm = {
  vendor_ref: "", legal_name: "", trade_name: "", entity_type: "", country: "IN",
  address: { street: "", city: "", state: "", postal_code: "" },
  contact: { name: "", email: "", phone: "", alt_phone: "" },
  tax: { pan: "", gst_registered: true, gstin: "", ein: "" },
  bank: { account_holder: "", account_number: "", ifsc: "", routing_number: "" },
};

const GROUPS = [
  { key: "happy", label: "Happy path" }, { key: "edge", label: "Edge cases" },
  { key: "negative", label: "Negative tests" }, { key: "reserve", label: "Reserve cases" },
];
const SLOTS: DocSlot[] = ["GST_CERTIFICATE", "PAN_CARD", "BANK_PROOF", "GST_DECLARATION", "EIN_NOTICE"];

interface Doc { file: File; slot: DocSlot | ""; note?: string; reading?: boolean }

const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function requiredSlots(f: SubmissionForm): DocSlot[] {
  if (f.country === "US") return ["EIN_NOTICE", "BANK_PROOF"];
  return [f.tax.gst_registered === false ? "GST_DECLARATION" : "GST_CERTIFICATE", "PAN_CARD", "BANK_PROOF"];
}

/** Shrinks large photos in the browser (no other website needed). PDFs and small files are left as they are. */
async function compress(file: File): Promise<{ file: File; note?: string }> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return { file };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.85));
    if (blob.size >= file.size) return { file };
    const out = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    return { file: out, note: `compressed ${fmtSize(file.size)} → ${fmtSize(out.size)}` };
  } catch { return { file }; }
}

async function sampleFile(name: string): Promise<File> {
  const res = await fetch(`/samples/${name}`);
  if (!res.ok) throw new Error(`${name} (${res.status})`);
  return new File([await res.blob()], name, { type: name.endsWith(".pdf") ? "application/pdf" : "image/png" });
}

interface InviteProps {
  token: string; contactName: string; contactEmail: string;
  initial?: { form: SubmissionForm; kept: { slot: DocSlot; file_name: string }[] };
  onSubmitted: () => void;
}

export default function SubmitForm({ invite }: { invite?: InviteProps }) {
  const router = useRouter();
  const params = useSearchParams();
  const demo = !invite; // test vendors always shown for now (below the form); never on the vendor's own page
  const [form, setForm] = useState<SubmissionForm>(invite?.initial?.form ?? { ...EMPTY, contact: { ...EMPTY.contact, name: invite?.contactName ?? "", email: invite?.contactEmail ?? "" } });
  const [docs, setDocs] = useState<Doc[]>([]);
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [scenarioId, setScenarioId] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);
  const [vendorRef, setVendorRef] = useState("");
  const [version, setVersion] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [signature, setSignature] = useState("");
  const [sigNote, setSigNote] = useState<string | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [link, setLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const keptSlots = invite?.initial?.kept ?? [];
  const fileInput = useRef<HTMLInputElement>(null);

  const scenario = useMemo(() => SCENARIOS.find((s) => s.id === scenarioId), [scenarioId]);

  async function loadScenario(id: string, v: 1 | 2 = 1, ref = "") {
    setScenarioId(id); setVersion(v); setVendorRef(ref); setError(null); setAiFilled(new Set());
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) { setForm(EMPTY); setDocs([]); return; }
    const src = v === 2 && s.resubmission ? s.resubmission : s;
    setForm(structuredClone(src.form));
    setDocs([]);
    setReading(true);
    try {
      const files = await Promise.all(src.docs.map(async (d) => ({ file: await sampleFile(d.file_name), slot: d.slot })));
      setDocs(files);
    } catch (err) { setError(`Could not attach the sample documents: ${(err as Error).message}`); }
    finally { setReading(false); }
  }

  useEffect(() => {
    const sc = params.get("scenario");
    if (sc) loadScenario(sc, params.get("v") === "2" ? 2 : 1, params.get("vendor_ref") ?? "");
    else if (params.get("vendor_ref")) setVendorRef(params.get("vendor_ref")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (path: string, value: unknown) => {
    setForm((prev) => {
      const next: any = structuredClone(prev);
      const keys = path.split(".");
      let o = next;
      for (const k of keys.slice(0, -1)) o = o[k];
      o[keys.at(-1)!] = value;
      return next;
    });
    setAiFilled((p) => { const n = new Set(p); n.delete(path); return n; });
  };

  /** Put values into empty fields only, and highlight them as auto-filled. */
  function fillEmpty(entries: [string, unknown][], always: string[] = [], overwrite = false) {
    const filled = new Set<string>();
    setForm((prev) => {
      const next: any = structuredClone(prev);
      for (const [path, val] of entries) {
        if (val === undefined || val === null || val === "") continue;
        const keys = path.split(".");
        let o = next;
        for (const k of keys.slice(0, -1)) o = o[k];
        const cur = o[keys.at(-1)!];
        if (cur === "" || cur === undefined || overwrite || always.includes(path)) {
          o[keys.at(-1)!] = val;
          if (!["country", "tax.gst_registered"].includes(path) && cur !== val) filled.add(path);
        }
      }
      return next;
    });
    setAiFilled((p) => new Set([...p, ...filled]));
  }

  /** New files: compress, let the AI sort them and fill the form. */
  async function addFiles(list: FileList | File[]) {
    setError(null);
    const incoming = await Promise.all([...list].slice(0, 5).map(compress));
    const added: Doc[] = incoming.map((c) => ({ file: c.file, slot: "", note: c.note, reading: true }));
    setDocs((p) => [...p, ...added].slice(0, 5));
    setReading(true);
    try {
      const fd = new FormData();
      added.forEach((d, i) => fd.set(`file${i}`, d.file));
      const res = await fetch(invite ? `/api/invite/${invite.token}/prefill` : "/api/prefill", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read the documents");
      setDocs((p) => p.map((d) => {
        const r = json.docs.find((x: any) => x.name === d.file.name);
        if (!d.reading || !r) return d;
        const known = SLOTS.includes(r.doc_type);
        return { ...d, reading: false, slot: known ? r.doc_type : "", note: [d.note, known ? null : "not recognised, choose the type"].filter(Boolean).join(" · ") };
      }));
      const f = json.form ?? {};
      fillEmpty([
        ["legal_name", f.legal_name], ["trade_name", f.trade_name], ["entity_type", f.entity_type], ["country", f.country],
        ["address.street", f.street], ["address.city", f.city], ["address.state", f.state], ["address.postal_code", f.pincode],
        ["tax.pan", f.pan], ["tax.gstin", f.gstin], ["tax.gst_registered", f.gst_registered], ["tax.ein", f.ein],
        ["bank.account_holder", f.account_holder], ["bank.account_number", f.account_number], ["bank.ifsc", f.ifsc],
      ], ["country", "tax.gst_registered"], !!invite?.initial);
    } catch (err) {
      setError((err as Error).message);
      setDocs((p) => p.map((d) => (d.reading ? { ...d, reading: false } : d)));
    } finally { setReading(false); }
  }

  async function createLink() {
    setLinkBusy(true); setLinkError(null); setLink("");
    try {
      const res = await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_name: reqName, contact_email: reqEmail }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not create the link");
      setLink(`${window.location.origin}/invite/${json.token}`);
    } catch (err) { setLinkError((err as Error).message); }
    finally { setLinkBusy(false); }
  }

  function fillFromSignature() {
    const p = parseSignature(signature);
    const got = Object.values(p).filter(Boolean).length;
    if (!got) { setSigNote("Could not find a name, email or phone in that text."); return; }
    fillEmpty([["contact.name", p.name], ["contact.email", p.email], ["contact.phone", p.phone], ["contact.alt_phone", p.alt_phone]]);
    setSigNote(`Found ${got} detail${got > 1 ? "s" : ""}. Empty fields were filled; check them.`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const slots = docs.map((d) => d.slot).filter(Boolean);
    if (docs.some((d) => !d.slot)) return setError("Choose a document type for every file (or remove it).");
    if (new Set(slots).size !== slots.length) return setError("Two files have the same document type. Remove one or change its type.");
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("form", JSON.stringify(form));
      if (scenarioId) fd.set("scenario_id", scenarioId);
      if (vendorRef && !invite) fd.set("vendor_ref", vendorRef);
      for (const d of docs) fd.set(d.slot, d.file);
      const res = await fetch(invite ? `/api/invite/${invite.token}/submit` : "/api/submissions", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      if (invite) { setBusy(false); invite.onSubmitted(); } else router.push(`/runs/${json.run_id}`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  const isUS = form.country === "US";
  const stateOptions = useMemo(() => {
    const list = Object.values(GST_STATE_CODES).filter((n) => n !== "Other Territory").sort();
    const cur = form.address.state;
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  }, [form.address.state]);

  const need: [string, string | undefined][] = [
    ["legal name", form.legal_name], ["entity type", form.entity_type], ["street", form.address.street], ["city", form.address.city],
    ["state", form.address.state], [isUS ? "ZIP code" : "pincode", form.address.postal_code], ["contact name", form.contact.name],
    ["contact email", form.contact.email], ["phone", form.contact.phone], ["account holder", form.bank.account_holder], ["account number", form.bank.account_number],
    ...(isUS
      ? ([["EIN", form.tax.ein], ["routing number", form.bank.routing_number]] as [string, string | undefined][])
      : ([["PAN", form.tax.pan], ["IFSC", form.bank.ifsc], ...(form.tax.gst_registered === false ? [] : [["GSTIN", form.tax.gstin]])] as [string, string | undefined][])),
  ];
  const missing = need.filter(([, v]) => !v || !String(v).trim()).map(([k]) => k);
  const required = requiredSlots(form);
  // Loaded test vendors may be incomplete on purpose (that is the edge case being shown).
  const needDocs = scenarioId ? [] : required.filter((s) => !docs.some((d) => d.slot === s) && !keptSlots.some((k) => k.slot === s));
  const blockedBy = [...needDocs.map((s) => SLOT_LABEL[s]), ...missing];
  const hl = (path: string) => (aiFilled.has(path) ? " ring-2 ring-indigo-200 bg-indigo-50/40" : "");
  const input = (path: string, value: string, o: { mono?: boolean; upper?: boolean; disabled?: boolean; placeholder?: string } = {}) => (
    <input className={`${inputCls}${hl(path)} ${o.mono ? "mono" : ""}`} value={value} disabled={o.disabled} placeholder={o.placeholder}
      onChange={(e) => set(path, o.upper ? e.target.value.toUpperCase() : e.target.value)} />
  );
  const gst = form.tax.gst_registered !== false;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card className="p-5">
          <SectionTitle>1 · Documents</SectionTitle>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            onClick={() => fileInput.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed text-center transition ${docs.length ? "px-6 py-4" : "px-6 py-9"} ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"}`}
          >
            <div className="text-sm font-medium text-slate-800">{docs.length ? "Drop more files, or click to add" : "Drop all the vendor's documents here"}</div>
            {!docs.length && <div className="mt-1 text-xs text-slate-500">or click to choose · PDF, PNG or JPG · big photos shrink automatically</div>}
            <input ref={fileInput} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
          </div>

          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {docs.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className={d.slot ? "text-emerald-600" : "text-slate-300"}>{d.reading ? "…" : d.slot ? "✓" : "○"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{d.slot ? SLOT_LABEL[d.slot] : d.file.name}</div>
                  <div className="truncate text-xs text-slate-500">{d.slot ? `${d.file.name} · ` : ""}{fmtSize(d.file.size)}{d.note ? ` · ${d.note}` : ""}</div>
                </div>
                {d.reading ? <span className="text-xs text-indigo-600">Reading…</span> : (
                  <select className={`${inputCls} w-52 py-1.5`} value={d.slot} onChange={(e) => setDocs((p) => p.map((x, j) => (j === i ? { ...x, slot: e.target.value as DocSlot } : x)))}>
                    <option value="">Choose type…</option>
                    {SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}
                  </select>
                )}
                <button type="button" className="text-xs text-slate-400 hover:text-rose-600" onClick={() => setDocs((p) => p.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
            {required.filter((s) => !docs.some((d) => d.slot === s)).map((s) => {
              const kept = keptSlots.find((k) => k.slot === s);
              return kept ? (
                <li key={s} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-emerald-600">✓</span>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium text-slate-800">{SLOT_LABEL[s]}</div><div className="truncate text-xs text-slate-500">{kept.file_name} · kept from your earlier upload</div></div>
                  <span className="text-xs text-slate-400">drop a new file to replace</span>
                </li>
              ) : (
                <li key={s} className="flex items-center gap-3 px-3 py-2.5 text-slate-400"><span>○</span><span className="flex-1">{SLOT_LABEL[s]}</span><span className="text-xs">still needed</span></li>
              );
            })}
          </ul>
          {!invite && (
            <div className="mt-3 text-sm">
              <button type="button" className="-my-2 py-2 text-indigo-700 hover:underline" onClick={() => setReqOpen((v) => !v)}>Don't have the files yet? Send the vendor a link</button>
              {reqOpen && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <Field label="Vendor contact name"><input className={inputCls} value={reqName} onChange={(e) => setReqName(e.target.value)} /></Field>
                    <Field label="Vendor email"><input className={inputCls} type="email" value={reqEmail} onChange={(e) => setReqEmail(e.target.value)} /></Field>
                    <button type="button" className={btnPrimary} onClick={createLink} disabled={linkBusy || !reqName.trim() || !reqEmail.includes("@")}>{linkBusy ? "Creating…" : "Create link"}</button>
                  </div>
                  {link && (
                    <div className="mt-3 space-y-2">
                      <input readOnly className={`${inputCls} mono text-xs`} value={link} onFocus={(e) => e.currentTarget.select()} />
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={btnSecondary} onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
                        <a className={btnPrimary} href={mailtoLink(reqEmail, inviteMessage(reqName, link))}>Open email</a>
                      </div>
                      <p className="text-xs text-slate-500">The vendor uploads the documents there and sees their own status. You will see them under Vendors.</p>
                    </div>
                  )}
                  {linkError && <p className="mt-2 text-sm text-rose-700">{linkError}</p>}
                </div>
              )}
            </div>
          )}
          {aiFilled.size > 0 && <p className="mt-3 text-sm text-indigo-700">Filled {aiFilled.size} field{aiFilled.size > 1 ? "s" : ""} from the documents (highlighted below). Please check them.</p>}
        </Card>

        <Card className="p-5">
          <SectionTitle>2 · Vendor details</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country" required>
              <select className={inputCls} value={form.country} onChange={(e) => set("country", e.target.value)}><option value="IN">India</option><option value="US">United States</option></select>
            </Field>
            <Field label="Legal name" required>{input("legal_name", form.legal_name)}</Field>
            <Field label="Entity type" required>
              <select className={`${inputCls}${hl("entity_type")}`} value={form.entity_type} onChange={(e) => set("entity_type", e.target.value)}>
                <option value="">Select…</option>
                <option value="PRIVATE_LIMITED">Private Limited</option><option value="LLP">LLP</option>
                <option value="PARTNERSHIP">Partnership</option><option value="PROPRIETORSHIP">Proprietorship</option>
                <option value="CORPORATION">Corporation (US)</option>
              </select>
            </Field>
            {isUS ? <Field label="EIN" required>{input("tax.ein", form.tax.ein ?? "", { mono: true })}</Field> : <>
              <Field label="PAN" required>{input("tax.pan", form.tax.pan ?? "", { mono: true, upper: true })}</Field>
              <Field label="GSTIN" required={gst}>{input("tax.gstin", form.tax.gstin ?? "", { mono: true, upper: true, disabled: !gst, placeholder: gst ? "" : "Not GST-registered" })}</Field>
            </>}
            <Field label="Bank account holder" required>{input("bank.account_holder", form.bank.account_holder)}</Field>
            <Field label="Account number" required>{input("bank.account_number", form.bank.account_number, { mono: true })}</Field>
            {isUS
              ? <Field label="Routing number" required>{input("bank.routing_number", form.bank.routing_number ?? "", { mono: true })}</Field>
              : <Field label="IFSC" required>{input("bank.ifsc", form.bank.ifsc ?? "", { mono: true, upper: true })}</Field>}
          </div>

          <h3 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Address</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Street" required>{input("address.street", form.address.street)}</Field></div>
            <Field label="City" required>{input("address.city", form.address.city)}</Field>
            <Field label="State" required>
              {isUS ? input("address.state", form.address.state) : (
                <select className={`${inputCls}${hl("address.state")}`} value={form.address.state} onChange={(e) => set("address.state", e.target.value)}>
                  <option value="">Select state…</option>
                  {stateOptions.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              )}
            </Field>
            <Field label={isUS ? "ZIP code" : "Pincode"} required>{input("address.postal_code", form.address.postal_code)}</Field>
          </div>

          <h3 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Contact</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name" required>{input("contact.name", form.contact.name)}</Field>
            <Field label="Email" required>{input("contact.email", form.contact.email)}</Field>
            <Field label="Phone" required error={phoneProblem(form.contact.phone, form.country)}>{input("contact.phone", form.contact.phone)}</Field>
            <Field label="Alternate mobile (optional)" error={phoneProblem(form.contact.alt_phone ?? "", form.country)}>{input("contact.alt_phone", form.contact.alt_phone ?? "")}</Field>
          </div>
          <details className="mt-3 text-sm">
            <summary className="-my-2 cursor-pointer py-2 font-medium text-indigo-700">Paste an email signature to fill the contact</summary>
            <textarea className={`${inputCls} mt-2 min-h-[90px]`} placeholder={"Priya Raman\n+91 98400 12345\npriya@company.com"} value={signature} onChange={(e) => setSignature(e.target.value)} />
            <div className="mt-2 flex items-center gap-3">
              <button type="button" className={btnSecondary} onClick={fillFromSignature} disabled={!signature.trim()}>Fill contact</button>
              {sigNote && <span className="text-xs text-slate-600">{sigNote}</span>}
            </div>
          </details>

          <details className="mt-5 text-sm">
            <summary className="-my-2 cursor-pointer py-2 font-medium text-slate-700">More (optional)</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Trade name">{input("trade_name", form.trade_name ?? "")}</Field>
              {!isUS && <Field label="GST registered?">
                <select className={inputCls} value={gst ? "yes" : "no"} onChange={(e) => set("tax.gst_registered", e.target.value === "yes")}><option value="yes">Yes</option><option value="no">No (declaration instead)</option></select>
              </Field>}
            </div>
          </details>
        </Card>
      </div>

      <div>
        <Card className="p-5 lg:sticky lg:top-20">
          <button type="submit" className={`${btnPrimary} w-full py-3 text-base`} disabled={busy || reading || (docs.length === 0 && keptSlots.length === 0) || blockedBy.length > 0}>
            {reading ? "Reading documents…" : busy ? "Sending…" : invite ? "Send for checking" : "Check vendor"}
          </button>
          {blockedBy.length > 0 && !reading && <p className="mt-2 text-xs text-slate-500">Still needed: {blockedBy.join(", ")}.</p>}
          {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {demo && (
            <details className="mt-6 border-t border-slate-100 pt-4" open={demoOpen || !!scenarioId} onToggle={(e) => setDemoOpen((e.target as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Demo mode · load sample data</summary>
              <div className="mt-3">
              <select className={inputCls} value={scenarioId} onChange={(e) => loadScenario(e.target.value)}>
                <option value="">Choose…</option>
                {GROUPS.map((g) => (
                  <optgroup key={g.key} label={g.label}>
                    {SCENARIOS.filter((s) => s.group === g.key).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </optgroup>
                ))}
              </select>
              {scenario && <p className="mt-2 text-xs text-slate-600">{version === 2 && <Pill tone="indigo">Version 2</Pill>} {scenario.story}</p>}
              {scenario?.resubmission && (
                <button type="button" className={`${btnSecondary} mt-2 w-full`} onClick={() => loadScenario(scenario.id, version === 1 ? 2 : 1, version === 1 ? scenario.form.vendor_ref : "")}>
                  {version === 1 ? "Load corrected resubmission" : "Back to first submission"}
                </button>
              )}
              </div>
            </details>
          )}
          {vendorRef && <p className="mt-3 text-xs text-slate-500">New version for <span className="mono">{vendorRef}</span>.</p>}
        </Card>
      </div>
    </form>
  );
}
