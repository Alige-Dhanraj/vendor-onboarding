// AI function 3: rewrite the vendor message in clear, friendly language.
// The AI receives ONLY the verified findings (the template message and the fix list), so it cannot
// add requirements. If it fails or adds/removes items, the template is used instead.

import { z } from "zod";
import type { CheckResult, Decision, SubmissionForm } from "../engine/types";
import type { DraftMessage } from "../engine/message";
import { aiEnabled, structuredCall } from "./openai";

const schema = z.object({ subject: z.string(), body: z.string(), analyst_summary: z.string() });
const JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["subject", "body", "analyst_summary"],
  properties: { subject: { type: "string" }, body: { type: "string" }, analyst_summary: { type: "string" } },
};

const INSTRUCTIONS = `You write emails from a procurement team to a vendor about their registration.
You are given the verified findings. Rewrite them as a short, polite, plain-English email.
Rules: include every numbered fix exactly once; do not add any new requirement, document, deadline or policy; do not mention internal check IDs, fraud, AI or risk scores; for an "under review" case, say only that the team is reviewing and may contact them.
analyst_summary: two short sentences for the internal reviewer, citing the check IDs.`;

export async function draftMessage(
  form: SubmissionForm, decision: Decision, results: CheckResult[], template: DraftMessage,
): Promise<DraftMessage & { generated_by: "openai" | "template" }> {
  if (!aiEnabled()) return { ...template, generated_by: "template" };
  const fixes = results.filter((r) => r.status === "FAIL" && r.severity === "FIXABLE" && r.vendor_fix).map((r) => r.vendor_fix!);
  try {
    const out = await structuredCall({
      name: "vendor_message",
      instructions: INSTRUCTIONS,
      input: [{
        type: "input_text",
        text: JSON.stringify({
          vendor: form.legal_name, contact_name: form.contact.name, status: decision.internal_status,
          headline: decision.headline, fixes, deciding_checks: decision.deciding_checks, template_body: template.body,
        }),
      }],
      jsonSchema: JSON_SCHEMA,
      zod: schema,
      timeoutMs: 30_000,
    });
    // Guard: the AI version must still contain one line per fix (same count of numbered items).
    const numbered = (out.body.match(/^\s*\d+[.)]\s/gm) ?? []).length;
    if (fixes.length && numbered !== fixes.length) return { ...template, generated_by: "template" };
    return { ...out, generated_by: "openai" };
  } catch {
    return { ...template, generated_by: "template" };
  }
}
