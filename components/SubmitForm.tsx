"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SCENARIOS } from "@/lib/scenarios";
import type { DocSlot, SubmissionForm } from "@/lib/engine/types";
import { SLOT_LABEL } from "@/lib/ui-labels";
import { Card, Field, Pill, SectionTitle, btnPrimary, btnSecondary, inputCls } from "./ui";

const EMPTY: SubmissionForm = {
  vendor_ref: "", legal_name: "", trade_name: "", entity_type: "", country: "IN",
  address: { street: "", city: "", state: "", postal_code: "" },
  contact: { name: "", email: "", phone: "" },
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

export default function SubmitForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState<SubmissionForm>(EMPTY);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [scenarioId, setScenarioId] = useState("");
  const [vendorRef, setVendorRef] = useState("");
  const [version, setVersion] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
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
      const res = await fetch("/api/prefill", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read the documents");
      setDocs((p) => p.map((d) => {
        const r = json.docs.find((x: any) => x.name === d.file.name);
        if (!d.reading || !r) return d;
        return { ...d, reading: false, slot: SLOTS.includes(r.doc_type) ? r.doc_type : "", note: [d.note, SLOTS.includes(r.doc_type) ? null : "not recognised, choose the type"].filter(Boolean).join(" · ") };
      }));
      // Fill only fields that are still empty, and remember which ones the AI filled.
      const f = json.form ?? {};
      const map: [string, unknown][] = [
        ["legal_name", f.legal_name], ["country", f.country], ["address.state", f.state], ["tax.pan", f.pan], ["tax.gstin", f.gstin],
        ["tax.gst_registered", f.gst_registered], ["tax.ein", f.ein], ["bank.account_holder", f.account_holder],
        ["bank.account_number", f.account_number], ["bank.ifsc", f.ifsc],
      ];
      const filled = new Set<string>();
      setForm((prev) => {
        const next: any = structuredClone(prev);
        for (const [path, val] of map) {
          if (val === undefined || val === null || val === "") continue;
          const keys = path.split(".");
          let o = next;
          for (const k of keys.slice(0, -1)) o = o[k];
          const cur = o[keys.at(-1)!];
          if (cur === "" || cur === undefined || path === "country" || path === "tax.gst_registered") {
            o[keys.at(-1)!] = val;
            if (path !== "country" && path !== "tax.gst_registered") filled.add(path);
          }
        }
        return next;
      });
      setAiFilled((p) => new Set([...p, ...filled]));
    } catch (err) {
      setError((err as Error).message);
      setDocs((p) => p.map((d) => (d.reading ? { ...d, reading: false } : d)));
    } finally { setReading(false); }
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
      if (vendorRef) fd.set("vendor_ref", vendorRef);
      for (const d of docs) fd.set(d.slot, d.file);
      const res = await fetch("/api/submissions", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      router.push(`/runs/${json.run_id}`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  const isUS = form.country === "US";
  const hl = (path: string) => (aiFilled.has(path) ? " ring-2 ring-indigo-200 bg-indigo-50/40" : "");
  const inp = (path: string, extra = "") => `${inputCls}${hl(path)} ${extra}`;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {/* Step 1: documents */}
        <Card className="p-5">
          <SectionTitle hint="The AI sorts them and fills the form for you">1 · Drop the vendor's documents</SectionTitle>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            onClick={() => fileInput.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"}`}
          >
            <div className="text-sm font-medium text-slate-800">Drag GST certificate, PAN card and cancelled cheque here</div>
            <div className="mt-1 text-xs text-slate-500">or click to choose files · PDF, PNG or JPG · large photos are compressed automatically</div>
            <input ref={fileInput} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {docs.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {docs.map((d, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{d.file.name}</div>
                    <div className="text-xs text-slate-500">{fmtSize(d.file.size)}{d.note ? ` · ${d.note}` : ""}</div>
                  </div>
                  {d.reading ? <span className="text-xs text-indigo-600">AI is reading…</span> : (
                    <select className={`${inputCls} w-56 py-1.5`} value={d.slot} onChange={(e) => setDocs((p) => p.map((x, j) => (j === i ? { ...x, slot: e.target.value as DocSlot } : x)))}>
                      <option value="">Choose document type…</option>
                      {SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}
                    </select>
                  )}
                  <button type="button" className="text-xs text-slate-400 hover:text-rose-600" onClick={() => setDocs((p) => p.filter((_, j) => j !== i))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {aiFilled.size > 0 && <p className="mt-3 text-sm text-indigo-700">The AI filled {aiFilled.size} field{aiFilled.size > 1 ? "s" : ""} from the documents (highlighted). Check them, then add contact details.</p>}
        </Card>

        {/* Step 2: details */}
        <Card className="p-5">
          <SectionTitle hint="Highlighted fields came from the documents">2 · Check the details</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal name"><input className={inp("legal_name")} value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} /></Field>
            <Field label="Entity type">
              <select className={inputCls} value={form.entity_type} onChange={(e) => set("entity_type", e.target.value)}>
                <option value="">Select…</option>
                <option value="PRIVATE_LIMITED">Private Limited</option><option value="LLP">LLP</option>
                <option value="PARTNERSHIP">Partnership</option><option value="PROPRIETORSHIP">Proprietorship</option>
                <option value="CORPORATION">Corporation (US)</option>
              </select>
            </Field>
            {isUS ? (
              <Field label="EIN"><input className={inp("tax.ein", "mono")} value={form.tax.ein ?? ""} onChange={(e) => set("tax.ein", e.target.value)} /></Field>
            ) : (<>
              <Field label="PAN"><input className={inp("tax.pan", "mono")} value={form.tax.pan ?? ""} onChange={(e) => set("tax.pan", e.target.value.toUpperCase())} /></Field>
              <Field label="GSTIN"><input className={inp("tax.gstin", "mono")} value={form.tax.gstin ?? ""} onChange={(e) => set("tax.gstin", e.target.value.toUpperCase())} disabled={form.tax.gst_registered === false} placeholder={form.tax.gst_registered === false ? "Not GST-registered" : ""} /></Field>
            </>)}
            <Field label="Bank account holder"><input className={inp("bank.account_holder")} value={form.bank.account_holder} onChange={(e) => set("bank.account_holder", e.target.value)} /></Field>
            <Field label="Account number"><input className={inp("bank.account_number", "mono")} value={form.bank.account_number} onChange={(e) => set("bank.account_number", e.target.value)} /></Field>
            {isUS
              ? <Field label="Routing number"><input className={inp("bank.routing_number", "mono")} value={form.bank.routing_number ?? ""} onChange={(e) => set("bank.routing_number", e.target.value)} /></Field>
              : <Field label="IFSC"><input className={inp("bank.ifsc", "mono")} value={form.bank.ifsc ?? ""} onChange={(e) => set("bank.ifsc", e.target.value.toUpperCase())} /></Field>}
            <Field label="State"><input className={inp("address.state")} value={form.address.state} onChange={(e) => set("address.state", e.target.value)} /></Field>
          </div>
          <details className="mt-5 group" open={!!form.contact.email || !scenarioId}>
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Address and contact</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Street"><input className={inputCls} value={form.address.street} onChange={(e) => set("address.street", e.target.value)} /></Field></div>
              <Field label="City"><input className={inputCls} value={form.address.city} onChange={(e) => set("address.city", e.target.value)} /></Field>
              <Field label={isUS ? "ZIP code" : "Pincode"}><input className={inputCls} value={form.address.postal_code} onChange={(e) => set("address.postal_code", e.target.value)} /></Field>
              <Field label="Contact name"><input className={inputCls} value={form.contact.name} onChange={(e) => set("contact.name", e.target.value)} /></Field>
              <Field label="Contact email"><input className={inputCls} value={form.contact.email} onChange={(e) => set("contact.email", e.target.value)} /></Field>
              <Field label="Phone"><input className={inputCls} value={form.contact.phone} onChange={(e) => set("contact.phone", e.target.value)} /></Field>
              <Field label="Country">
                <select className={inputCls} value={form.country} onChange={(e) => set("country", e.target.value)}><option value="IN">India</option><option value="US">United States</option></select>
              </Field>
              {!isUS && <Field label="GST registered?">
                <select className={inputCls} value={form.tax.gst_registered === false ? "no" : "yes"} onChange={(e) => set("tax.gst_registered", e.target.value === "yes")}><option value="yes">Yes</option><option value="no">No (declaration instead)</option></select>
              </Field>}
              <Field label="Trade name (optional)"><input className={inputCls} value={form.trade_name ?? ""} onChange={(e) => set("trade_name", e.target.value)} /></Field>
            </div>
          </details>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5 lg:sticky lg:top-20">
          <SectionTitle>3 · Run the checks</SectionTitle>
          <button type="submit" className={`${btnPrimary} w-full py-3 text-base`} disabled={busy || reading || docs.length === 0}>
            {reading ? "Reading documents…" : busy ? "Submitting…" : "Submit and run checks"}
          </button>
          {docs.length === 0 && !reading && <p className="mt-2 text-xs text-slate-500">Add the documents first.</p>}
          {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <p className="mt-3 text-xs text-slate-500">21 checks run on the server: nothing missing, IDs valid, everything consistent, no fraud signals.</p>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="mb-2 text-xs font-medium text-slate-600">Demo: load a test vendor</div>
            <select className={inputCls} value={scenarioId} onChange={(e) => loadScenario(e.target.value)}>
              <option value="">Choose a scenario…</option>
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
            {vendorRef && <p className="mt-2 text-xs text-slate-500">New version for <span className="mono">{vendorRef}</span>.</p>}
          </div>
        </Card>
      </div>
    </form>
  );
}
