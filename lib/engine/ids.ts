// Format rules for Indian and US identifiers. Pure functions, unit-tested.

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GST state codes (first two digits of a GSTIN) to state / UT names. */
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
  "97": "Other Territory",
};

/** PAN 4th character -> holder type. */
export const PAN_HOLDER_TYPES: Record<string, string> = {
  P: "Individual", C: "Company", H: "Hindu Undivided Family", F: "Firm / LLP",
  A: "Association of Persons", T: "Trust", B: "Body of Individuals", L: "Local Authority",
  J: "Artificial Juridical Person", G: "Government",
};

/** Which PAN holder type each entity type should carry. */
export const EXPECTED_PAN_TYPE: Record<string, string> = {
  PRIVATE_LIMITED: "C", LLP: "F", PARTNERSHIP: "F", PROPRIETORSHIP: "P",
};

export const clean = (s: string | undefined | null) => (s ?? "").toUpperCase().replace(/[\s-]/g, "");

export const isPan = (pan: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean(pan));

/** GSTIN structure: 2-digit state code + PAN + entity code + 'Z' + check character. */
export function gstinStructure(gstin: string): { ok: boolean; problem?: string } {
  const g = clean(gstin);
  if (g.length !== 15) return { ok: false, problem: `has ${g.length} characters instead of 15` };
  if (!GST_STATE_CODES[g.slice(0, 2)]) return { ok: false, problem: `starts with "${g.slice(0, 2)}", which is not a GST state code` };
  if (!isPan(g.slice(2, 12))) return { ok: false, problem: "characters 3-12 are not a valid PAN" };
  if (!/^[1-9A-Z]$/.test(g[12])) return { ok: false, problem: "13th character (entity code) is invalid" };
  if (g[13] !== "Z") return { ok: false, problem: `14th character is "${g[13]}" instead of "Z"` };
  if (!/^[0-9A-Z]$/.test(g[14])) return { ok: false, problem: "15th character (check character) is invalid" };
  return { ok: true };
}

/** GSTIN check character: Luhn mod 36 over the first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function gstinChecksumOk(gstin: string): boolean {
  const g = clean(gstin);
  if (g.length !== 15) return false;
  return gstinCheckChar(g.slice(0, 14)) === g[14];
}

/** Build a valid GSTIN (used only to generate synthetic test data). */
export function makeGstin(stateCode: string, pan: string, entity = "1"): string {
  const first14 = `${stateCode}${pan}${entity}Z`;
  return first14 + gstinCheckChar(first14);
}

export const gstinPan = (gstin: string) => clean(gstin).slice(2, 12);
export const gstinState = (gstin: string) => GST_STATE_CODES[clean(gstin).slice(0, 2)];

export const isIfsc = (ifsc: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean(ifsc));

/** US EIN: 9 digits, written NN-NNNNNNN. */
export const isEin = (ein: string) => /^\d{2}-?\d{7}$/.test((ein ?? "").trim());

/** US ABA routing number: 9 digits with a weighted checksum (3,7,1). */
export function isRoutingNumber(rn: string): boolean {
  const d = (rn ?? "").trim();
  if (!/^\d{9}$/.test(d)) return false;
  const n = d.split("").map(Number);
  const sum = 3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8]);
  return sum % 10 === 0;
}

export const isPincode = (p: string) => /^[1-9][0-9]{5}$/.test((p ?? "").trim());
export const isUsZip = (z: string) => /^\d{5}(-\d{4})?$/.test((z ?? "").trim());
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e ?? "").trim());
export function isPhone(p: string, country: string): boolean {
  const digits = (p ?? "").replace(/[^\d]/g, "");
  if (country === "IN") return /^(91)?[6-9]\d{9}$/.test(digits);
  if (country === "US") return /^1?\d{10}$/.test(digits);
  return digits.length >= 8;
}

/** Simple non-cryptographic hash so bank accounts can be compared without storing them in full. */
export function hashAccount(acct: string): string {
  const s = (acct ?? "").replace(/\D/g, "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "acct_" + (h >>> 0).toString(16).padStart(8, "0") + "_" + s.length;
}

export const last4 = (acct: string) => (acct ?? "").replace(/\D/g, "").slice(-4);
export const mask = (acct: string) => (acct ? "••••" + last4(acct) : "");
