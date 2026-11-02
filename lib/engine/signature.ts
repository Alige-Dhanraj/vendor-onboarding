// Reads contact details out of a pasted email signature. Plain rules (no AI): free, instant and predictable.
export interface SignatureContact { name?: string; email?: string; phone?: string; alt_phone?: string }

const SKIP_LINE = /^(thanks|thank you|regards|best|best regards|warm regards|kind regards|sincerely|cheers|sent from|--|__)/i;
const isMobile = (p: string) => /^(91)?[6-9]\d{9}$/.test(p.replace(/\D/g, ""));

export function parseSignature(text: string): SignatureContact {
  const out: SignatureContact = {};
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) out.email = email;

  const phones: string[] = [];
  for (const m of text.matchAll(/\+?\d[\d\s\-().]{7,}\d/g)) {
    const raw = m[0].trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 13 && !phones.some((p) => p.replace(/\D/g, "") === digits)) phones.push(raw);
  }
  phones.sort((a, b) => Number(isMobile(b)) - Number(isMobile(a))); // mobile numbers first
  if (phones[0]) out.phone = phones[0];
  if (phones[1]) out.alt_phone = phones[1];

  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const words = line.split(/\s+/);
    if (SKIP_LINE.test(line) || /[\d@]/.test(line) || words.length < 2 || words.length > 4) continue;
    if (!/^[A-Za-z][A-Za-z .'-]+$/.test(line)) continue;
    out.name = line;
    break;
  }
  return out;
}
