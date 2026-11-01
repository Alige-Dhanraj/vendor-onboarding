// Deterministic decision policy. No AI here: the outcome is a pure function of the check results.
//
// 1. Any HARD_STOP failure            -> REJECTED
// 2. Else any REVIEW failure          -> PENDING + review flag (internal: MANUAL_REVIEW)
// 3. Else any FIXABLE failure         -> PENDING (internal: PENDING_INFO)
// 4. Else (passes, warnings, skips)   -> APPROVED
//
// UNVERIFIED checks never pass silently: they only occur alongside a FIXABLE C3/C4 failure
// (wrong or unreadable document), which already makes the outcome PENDING.

import type { CheckResult, Decision } from "./types";

export function decide(results: CheckResult[]): Decision {
  const failed = (sev: string) => results.filter((r) => r.status === "FAIL" && r.severity === sev);
  const hard = failed("HARD_STOP");
  const review = failed("REVIEW");
  const fixable = failed("FIXABLE");
  const unverified = results.filter((r) => r.status === "UNVERIFIED");

  if (hard.length) {
    return {
      outcome: "REJECTED", internal_status: "REJECTED", review_flag: false,
      headline: hard[0].reason,
      deciding_checks: hard.map((r) => r.id),
    };
  }
  if (review.length) {
    return {
      outcome: "PENDING", internal_status: "MANUAL_REVIEW", review_flag: true,
      headline: `Needs a reviewer. ${review[0].reason}${review.length > 1 ? ` (+${review.length - 1} more flag${review.length > 2 ? "s" : ""})` : ""}`,
      deciding_checks: [...review.map((r) => r.id), ...fixable.map((r) => r.id)],
    };
  }
  if (fixable.length || unverified.length) {
    return {
      outcome: "PENDING", internal_status: "PENDING_INFO", review_flag: false,
      headline: fixable.length
        ? `Waiting on the vendor: ${fixable.length} item${fixable.length > 1 ? "s" : ""} to fix.`
        : "Some checks could not be verified yet.",
      deciding_checks: [...fixable.map((r) => r.id), ...unverified.map((r) => r.id)],
    };
  }
  const warns = results.filter((r) => r.status === "WARN");
  return {
    outcome: "APPROVED", internal_status: "APPROVED", review_flag: false,
    headline: warns.length ? `All required checks passed (${warns.length} note${warns.length > 1 ? "s" : ""} for the reviewer).` : "All required checks passed.",
    deciding_checks: [],
  };
}
