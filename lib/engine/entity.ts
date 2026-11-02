import type { EntityType } from "./types";

/** Maps the "Constitution of Business" printed on a GST certificate to our entity types. Unknown text returns null. */
export function mapEntityType(text: string | undefined | null): EntityType | null {
  const t = (text ?? "").toUpperCase();
  if (!t.trim()) return null;
  if (/LIMITED LIABILITY PARTNERSHIP|\bLLP\b/.test(t)) return "LLP";
  if (/PRIVATE|PVT/.test(t) && /LIMITED|LTD|COMPANY/.test(t)) return "PRIVATE_LIMITED";
  if (/PARTNERSHIP|\bFIRM\b/.test(t)) return "PARTNERSHIP";
  if (/PROPRIETOR/.test(t)) return "PROPRIETORSHIP";
  return null;
}
