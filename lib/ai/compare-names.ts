// AI function 2: judge whether two names refer to the same legal entity.
// Only called for pairs the rules could not settle. The result feeds rules K5/K6, which decide.

import { z } from "zod";
import type { NameJudgement } from "../engine/types";
import { fallbackJudge } from "../engine/names";
import { aiEnabled, structuredCall } from "./openai";

const schema = z.object({ verdict: z.enum(["SAME", "DIFFERENT", "UNSURE"]), reason: z.string() });
const JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["verdict", "reason"],
  properties: { verdict: { type: "string", enum: ["SAME", "DIFFERENT", "UNSURE"] }, reason: { type: "string" } },
};

const INSTRUCTIONS = `You compare two business or person names from vendor onboarding documents (India or the United States).
Decide whether they refer to the SAME legal entity, a DIFFERENT one, or you are UNSURE.
- SAME only for formatting or abbreviation differences: punctuation, Pvt/Private, Ltd/Limited, Co/Company, "Comp." for Components, "Engg" for Engineering, initials for spelled-out words, word order of suffixes.
- DIFFERENT when the distinctive words differ (e.g. a different company or a person's name vs a company).
- UNSURE when they share some distinctive words but could be different entities (e.g. a founder's name vs the company named after them).
Be conservative: when in doubt, say UNSURE. Give a one-sentence reason a procurement reviewer can read.`;

export async function compareNames(a: string, b: string): Promise<NameJudgement> {
  if (!aiEnabled()) return fallbackJudge(a, b);
  try {
    const out = await structuredCall({
      name: "name_comparison",
      instructions: INSTRUCTIONS,
      input: [{ type: "input_text", text: `Name A: ${a}\nName B: ${b}` }],
      jsonSchema: JSON_SCHEMA,
      zod: schema,
      timeoutMs: 20_000,
    });
    return { verdict: out.verdict, reason: out.reason, by: "AI" };
  } catch {
    const fb = fallbackJudge(a, b);
    return { ...fb, reason: `${fb.reason} AI unavailable, so a conservative rule was used.` };
  }
}
