"use client";

import { useEffect, useMemo, useState } from "react";
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

const GROUPS: { key: string; label: string }[] = [
  { key: "happy", label: "Happy path" }, { key: "edge", label: "Edge cases" },
  { key: "negative", label: "Negative tests" }, { key: "reserve", label: "Reserve cases" },
];

function requiredSlots(f: SubmissionForm): DocSlot[] {
  if (f.country === "US") return ["EIN_NOTICE", "BANK_PROOF"];
  return [f.tax.gst_registered === false ? "GST_DECLARATION" : "GST_CERTIFICATE", "PAN_CARD", "BANK_PROOF"];
}

async function sampleFile(name: string): Promise<File> {
  const res = await fetch(`/samples/${name}`);
  const blob = await res.blob();
  return new File([blob], name, { type: name.endsWith(".pdf") ? "application/pdf" : "image/png" });
}

export default function SubmitForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState<SubmissionForm>(EMPTY);
  const [files, setFiles] = useState<Partial<Record<DocSlot, File>>>({});
  const [scenarioId, setScenarioId] = useState<string>("");
  const [vendorRef, setVendorRef] = useState<string>("");
  const [version, setVersion] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenario = useMemo(() => SCENARIOS.find((s) => s.id === scenarioId), [scenarioId]);

  async function loadScenario(id: string, v: 1 | 2 = 1, ref = "") {
    setScenarioId(id);
    setVersion(v);
    setVendorRef(ref);
    setError(null);
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) { setForm(EMPTY); setFiles({}); return; }
    const src = v === 2 && s.resubmission ? s.resubmission : s;
    setForm(structuredClone(src.form));
    const loaded: Partial<Record<DocSlot, File>> = {};
    await Promise.all(src.docs.map(async (d) => { loaded[d.slot] = await sampleFile(d.file_name); }));
    setFiles(loaded);
  }

  // Resubmission links arrive as /?scenario=...&v=2&vendor_ref=...
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
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("form", JSON.stringify(form));
      if (scenarioId) fd.set("scenario_id", scenarioId);
      if (vendorRef) fd.set("vendor_ref", vendorRef);
      for (const [slot, file] of Object.entries(files)) if (file) fd.set(slot, file);
      const res = await fetch("/api/submissions", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      router.push(`/runs/${json.run_id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const slots = requiredSlots(form);
  const isUS = form.country === "US";

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card className="p-5">
          <SectionTitle hint="Fills the form and attaches the SAMPLE documents, exactly as a vendor would upload them">Load a test scenario</SectionTitle>
          <div className="flex flex-wrap items-center gap-3">
            <select className={`${inputCls} max-w-md`} value={scenarioId} onChange={(e) => loadScenario(e.target.value)}>
              <option value="">Blank form (enter a vendor by hand)</option>
              {GROUPS.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {SCENARIOS.filter((s) => s.group === g.key).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </optgroup>
              ))}
            </select>
            {scenario?.resubmission && (
              <button type="button" className={btnSecondary} onClick={() => loadScenario(scenario.id, version === 1 ? 2 : 1, version === 1 ? scenario.form.vendor_ref : "")}>
                {version === 1 ? "Load corrected resubmission" : "Back to first submission"}
              </button>
            )}
          </div>
          {scenario && (
            <p className="mt-3 text-sm text-slate-600">
              {version === 2 ? <Pill tone="indigo">Resubmission · version 2</Pill> : null} {scenario.story}
            </p>
          )}
          {vendorRef && <p className="mt-2 text-xs text-slate-500">Submitting as a new version for vendor reference <span className="mono">{vendorRef}</span>.</p>}
        </Card>

        <Card className="p-5">
          <SectionTitle>Company</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal name"><input className={inputCls} value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} /></Field>
            <Field label="Trade name (optional)"><input className={inputCls} value={form.trade_name ?? ""} onChange={(e) => set("trade_name", e.target.value)} /></Field>
            <Field label="Country">
              <select className={inputCls} value={form.country} onChange={(e) => set("country", e.target.value)}>
                <option value="IN">India</option><option value="US">United States</option>
              </select>
            </Field>
            <Field label="Entity type">
              <select className={inputCls} value={form.entity_type} onChange={(e) => set("entity_type", e.target.value)}>
                <option value="">Select…</option>
                <option value="PRIVATE_LIMITED">Private Limited</option><option value="LLP">LLP</option>
                <option value="PARTNERSHIP">Partnership</option><option value="PROPRIETORSHIP">Proprietorship</option>
                <option value="CORPORATION">Corporation (US)</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Address and contact</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Street"><input className={inputCls} value={form.address.street} onChange={(e) => set("address.street", e.target.value)} /></Field></div>
            <Field label="City"><input className={inputCls} value={form.address.city} onChange={(e) => set("address.city", e.target.value)} /></Field>
            <Field label="State"><input className={inputCls} value={form.address.state} onChange={(e) => set("address.state", e.target.value)} /></Field>
            <Field label={isUS ? "ZIP code" : "Pincode"}><input className={inputCls} value={form.address.postal_code} onChange={(e) => set("address.postal_code", e.target.value)} /></Field>
            <Field label="Contact name"><input className={inputCls} value={form.contact.name} onChange={(e) => set("contact.name", e.target.value)} /></Field>
            <Field label="Email"><input className={inputCls} value={form.contact.email} onChange={(e) => set("contact.email", e.target.value)} /></Field>
            <Field label="Phone"><input className={inputCls} value={form.contact.phone} onChange={(e) => set("contact.phone", e.target.value)} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Tax and bank</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {isUS ? (
              <Field label="EIN" hint="9 digits, NN-NNNNNNN"><input className={`${inputCls} mono`} value={form.tax.ein ?? ""} onChange={(e) => set("tax.ein", e.target.value)} /></Field>
            ) : (
              <>
                <Field label="PAN"><input className={`${inputCls} mono`} value={form.tax.pan ?? ""} onChange={(e) => set("tax.pan", e.target.value.toUpperCase())} /></Field>
                <Field label="GST registered?">
                  <select className={inputCls} value={form.tax.gst_registered === false ? "no" : "yes"} onChange={(e) => set("tax.gst_registered", e.target.value === "yes")}>
                    <option value="yes">Yes</option><option value="no">No (will upload a declaration)</option>
                  </select>
                </Field>
                {form.tax.gst_registered !== false && (
                  <Field label="GSTIN"><input className={`${inputCls} mono`} value={form.tax.gstin ?? ""} onChange={(e) => set("tax.gstin", e.target.value.toUpperCase())} /></Field>
                )}
              </>
            )}
            <Field label="Account holder name"><input className={inputCls} value={form.bank.account_holder} onChange={(e) => set("bank.account_holder", e.target.value)} /></Field>
            <Field label="Account number"><input className={`${inputCls} mono`} value={form.bank.account_number} onChange={(e) => set("bank.account_number", e.target.value)} /></Field>
            {isUS ? (
              <Field label="Routing number"><input className={`${inputCls} mono`} value={form.bank.routing_number ?? ""} onChange={(e) => set("bank.routing_number", e.target.value)} /></Field>
            ) : (
              <Field label="IFSC"><input className={`${inputCls} mono`} value={form.bank.ifsc ?? ""} onChange={(e) => set("bank.ifsc", e.target.value.toUpperCase())} /></Field>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5 lg:sticky lg:top-20">
          <SectionTitle>Documents</SectionTitle>
          <div className="space-y-4">
            {slots.map((slot) => (
              <div key={slot}>
                <div className="mb-1 text-xs font-medium text-slate-600">{SLOT_LABEL[slot]}</div>
                {files[slot] ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <span className="truncate">{files[slot]!.name}</span>
                    <button type="button" className="text-xs text-slate-500 hover:text-rose-600" onClick={() => setFiles((p) => ({ ...p, [slot]: undefined }))}>Remove</button>
                  </div>
                ) : (
                  <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles((p) => ({ ...p, [slot]: f })); }} />
                )}
              </div>
            ))}
            <p className="text-xs text-slate-400">PDF, PNG or JPG, up to 10 MB each. Files are stored privately.</p>
          </div>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>{busy ? "Submitting…" : "Submit and run checks"}</button>
            {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <p className="mt-3 text-xs text-slate-500">The form is not validated in the browser on purpose: every check runs in the process, so you can watch it catch problems.</p>
          </div>
        </Card>
      </div>
    </form>
  );
}
