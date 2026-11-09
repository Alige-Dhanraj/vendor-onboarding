// Name comparison. Rules settle the easy cases (punctuation, Pvt/Private, Ltd/Limited).
// Whatever the rules cannot settle is sent to the AI (lib/ai/compare-names.ts).
// When no AI key is configured, a conservative fallback is used instead.

import type { NameJudgement } from "./types";

const SUFFIXES: [RegExp, string][] = [
  [/\bPRIVATE\b/g, "PVT"],
  [/\bLIMITED\b/g, "LTD"],
  [/\bCOMPANY\b/g, "CO"],
  [/\bCORPORATION\b/g, "CORP"],
  [/\bINCORPORATED\b/g, "INC"],
  [/\bLIMITED LIABILITY PARTNERSHIP\b/g, "LLP"],
  [/&/g, " AND "],
];

/** Normalise a legal name so formatting differences disappear. */
export function normaliseName(name: string | undefined | null): string {
  let n = (name ?? "").toUpperCase();
  n = n.replace(/^M\/S\.?\s+/, "");          // "M/s. ABC" -> "ABC"
  for (const [re, rep] of SUFFIXES) n = n.replace(re, rep);
  n = n.replace(/[^A-Z0-9 ]/g, " ");          // drop punctuation
  n = n.replace(/\bTHE\b/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  // "A B C" -> "ABC": join runs of single letters (initialisms written with dots)
  n = n.replace(/\b(?:[A-Z] )+[A-Z]\b/g, (m) => m.replace(/ /g, ""));
  return n;
}

export const pairKey = (a: string, b: string) =>
  [normaliseName(a), normaliseName(b)].sort().join(" || ");

/** Rules-only comparison. Returns null when the rules cannot decide. */
export function compareByRules(a: string, b: string): NameJudgement | null {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return null;
  if (na === nb) {
    return {
      verdict: "SAME",
      reason: a.trim() === b.trim() ? "Names are identical." : `Same name once formatting is normalised ("${na}").`,
      by: "RULES",
    };
  }
  return null;
}

/**
 * Conservative fallback used only when no AI is configured (offline tests, or the AI call failed).
 * SAME only if every word of the shorter name is a prefix of the matching word in the longer name
 * (e.g. "COMP" vs "COMPONENTS"); DIFFERENT if the names share no meaningful word; otherwise UNSURE.
 */
export function fallbackJudge(a: string, b: string): NameJudgement {
  const ta = normaliseName(a).split(" ");
  const tb = normaliseName(b).split(" ");
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // An abbreviation is at least 3 letters and clearly shorter (3+ letters dropped), so "ABC" vs "ABCD" is not a match.
  const abbrev = (x: string, y: string) => x === y || (x.length >= 3 && y.length - x.length >= 3 && y.startsWith(x));
  if (short.length === long.length && short.every((w, i) => abbrev(w, long[i]) || abbrev(long[i], w))) {
    return { verdict: "SAME", reason: "Each word matches as an abbreviation of the other name (rule-based fallback).", by: "FALLBACK" };
  }
  const generic = new Set(["PVT", "LTD", "CO", "LLP", "AND", "INC", "CORP", "TRADERS", "ENTERPRISES", "INDUSTRIES", "SERVICES", "SUPPLIES"]);
  const meaningfulA = ta.filter((w) => !generic.has(w));
  const shared = meaningfulA.filter((w) => tb.includes(w));
  if (shared.length === 0) {
    return { verdict: "DIFFERENT", reason: "The names share no distinctive word (rule-based fallback).", by: "FALLBACK" };
  }
  return { verdict: "UNSURE", reason: "The names overlap partly; a person should confirm (rule-based fallback).", by: "FALLBACK" };
}

/** Rough similarity between two names (0..1) for the "similar to an existing vendor" warning. */
export function nameSimilarity(a: string, b: string): number {
  const generic = new Set(["PVT", "LTD", "CO", "LLP", "AND", "INC"]);
  const ta = new Set(normaliseName(a).split(" ").filter((w) => !generic.has(w)));
  const tb = new Set(normaliseName(b).split(" ").filter((w) => !generic.has(w)));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.max(ta.size, tb.size);
}
