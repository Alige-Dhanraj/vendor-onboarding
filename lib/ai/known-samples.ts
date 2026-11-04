// Offline mode (no OpenAI key) may only trust a document if its bytes are exactly one of our sample files.
// Matching the file name alone would let any file named like a sample borrow that sample's values.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const cache = new Map<string, string | null>();
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function sampleHash(name: string): string | null {
  const safe = basename(name);
  if (!cache.has(safe)) {
    let h: string | null = null;
    for (const dir of [join(process.cwd(), "public", "samples"), join(process.cwd(), "test-data", "documents")]) {
      try { h = sha(readFileSync(join(dir, safe))); break; } catch { /* try the next folder */ }
    }
    cache.set(safe, h);
  }
  return cache.get(safe) ?? null;
}

/** True only when the file's content hash equals the hash of the sample file of the same name. */
export const isKnownSample = (name: string, hash: string) => { const h = sampleHash(name); return !!h && h === hash; };
