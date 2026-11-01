// Writes test-data/scenarios.json (used by scripts/make_documents.py to draw the SAMPLE documents).
import { writeFileSync } from "node:fs";
import { SCENARIOS } from "../lib/scenarios";
writeFileSync(new URL("../test-data/scenarios.json", import.meta.url), JSON.stringify(SCENARIOS, null, 2));
console.log(`wrote ${SCENARIOS.length} scenarios`);
