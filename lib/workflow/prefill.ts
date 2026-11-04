// The AI classifies each uploaded document and the form is pre-filled from what it reads.
// Readings are cached by file hash, so the run that follows reuses them.
import { getStore } from "@/lib/store";
import { aiEnabled, aiModel } from "@/lib/ai/openai";
import { readDocument } from "@/lib/ai/read-document";
import { readCacheKey, sha256 } from "@/lib/workflow/run";
import { ALLOWED_MIME, MAX_FILE_BYTES, SLOTS } from "@/lib/workflow/intake";
import { SCENARIOS } from "@/lib/scenarios";
import { isKnownSample } from "@/lib/ai/known-samples";
import { fixFixedPositions, gstinPan, gstinState } from "@/lib/engine/ids";
import { mapEntityType } from "@/lib/engine/entity";
import type { DocSlot, ExtractedDoc } from "@/lib/engine/types";


function offlineReading(name: string, hash: string): ExtractedDoc | null {
  if (!isKnownSample(name, hash)) return null;
  for (const s of SCENARIOS) for (const d of [...s.docs, ...(s.resubmission?.docs ?? [])]) {
    if (d.file_name === name) return { slot: d.truth.doc_type as DocSlot, file_name: name, ...d.truth };
  }
  return null;
}

export async function prefillFromFormData(fd: FormData) {
  const files = [...fd.entries()].filter(([k, v]) => k.startsWith("file") && typeof v !== "string").map(([, v]) => v as File).slice(0, 5);
  const store = getStore();
  const readings = await Promise.all(files.map(async (f) => {
    if (!ALLOWED_MIME.includes(f.type) || f.size > MAX_FILE_BYTES) return { name: f.name, doc_type: "OTHER", reading: null as ExtractedDoc | null };
    const bytes = new Uint8Array(await f.arrayBuffer());
    let reading: ExtractedDoc | null = null;
    if (aiEnabled()) {
      try { reading = await readDocument({ slot: null, fileName: f.name, mime: f.type, bytes }); } catch { reading = null; }
    } else reading = offlineReading(f.name, sha256(bytes));
    if (reading && SLOTS.includes(reading.doc_type as DocSlot)) {
      await store.cacheSet(readCacheKey(reading.doc_type, sha256(bytes)), { ...reading, slot: reading.doc_type }, aiEnabled() ? aiModel() : "offline");
    }
    return { name: f.name, doc_type: reading?.doc_type ?? "UNREADABLE", reading };
  }));

  const get = (t: string, k: keyof ExtractedDoc["fields"]) => readings.find((r) => r.reading?.doc_type === t)?.reading?.fields[k];
  const gstin = get("GST_CERTIFICATE", "gstin");
  const pan = get("PAN_CARD", "pan") ?? (gstin ? gstinPan(gstin) : undefined);
  const ein = get("EIN_NOTICE", "ein");
  const form = {
    entity_type: mapEntityType(get("GST_CERTIFICATE", "constitution")) ?? undefined,
    trade_name: (() => { const t = get("GST_CERTIFICATE", "trade_name")?.trim(); return t && !/^(-|nil|n\/a|none)$/i.test(t) ? t : undefined; })(),
    street: get("GST_CERTIFICATE", "address_street"),
    city: get("GST_CERTIFICATE", "address_city"),
    pincode: get("GST_CERTIFICATE", "address_pincode")?.replace(/\D/g, "") || undefined,
    legal_name: get("GST_CERTIFICATE", "legal_name") ?? get("EIN_NOTICE", "legal_name") ?? get("PAN_CARD", "legal_name"),
    country: ein ? "US" : "IN",
    state: get("GST_CERTIFICATE", "registration_state") ?? (gstin ? gstinState(gstin) : undefined),
    pan: pan ? fixFixedPositions(pan, "pan") : undefined,
    gstin: gstin ? fixFixedPositions(gstin, "gstin") : undefined,
    gst_registered: readings.some((r) => r.doc_type === "GST_DECLARATION") ? false : true,
    ein,
    account_holder: get("BANK_PROOF", "account_holder"),
    account_number: get("BANK_PROOF", "account_number"),
    ifsc: (() => { const v = get("BANK_PROOF", "ifsc"); return v ? fixFixedPositions(v, "ifsc") : undefined; })(),
  };
  return { docs: readings.map(({ name, doc_type }) => ({ name, doc_type })), form, ai: aiEnabled() ? "openai" : "offline" };
}
