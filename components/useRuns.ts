"use client";
import { useEffect, useState } from "react";

/** Polls the run list. `null` until the first answer, so pages can show their layout instantly. */
export function useRuns(intervalMs = 5000) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/runs", { cache: "no-store" });
        const j = await r.json();
        if (alive && r.ok) setData(j);
      } catch { /* try again on the next tick */ }
    };
    load();
    const t = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  return data;
}

/** One row per vendor: its newest run (runs arrive newest first). */
export function latestPerVendor(runs: any[]) {
  const seen = new Set<string>();
  return runs.filter((r) => (seen.has(r.vendor_ref) ? false : (seen.add(r.vendor_ref), true)));
}
