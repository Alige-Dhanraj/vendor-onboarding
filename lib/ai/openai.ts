// Minimal OpenAI Responses API client (plain fetch, no SDK) with strict JSON-schema output.
// Every call: temperature 0, a fixed schema, a timeout, one retry, then Zod validation.
// If OPENAI_API_KEY is not set, callers fall back to offline behaviour (see each AI function).

import type { ZodType } from "zod";

export const aiEnabled = () => !!process.env.OPENAI_API_KEY;
export const aiModel = () => process.env.OPENAI_MODEL || "gpt-4.1-mini";

export type InputPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" }
  | { type: "input_file"; filename: string; file_data: string };

/** Build the right input part for a file: PDFs as input_file, images as input_image. */
export function filePart(fileName: string, mime: string, bytes: Uint8Array): InputPart {
  const b64 = Buffer.from(bytes).toString("base64");
  if (mime === "application/pdf") return { type: "input_file", filename: fileName, file_data: `data:application/pdf;base64,${b64}` };
  return { type: "input_image", image_url: `data:${mime};base64,${b64}`, detail: "high" };
}

export class AiError extends Error {}

interface CallOpts<T> {
  name: string;               // schema name
  instructions: string;       // system-level instructions
  input: InputPart[];
  jsonSchema: Record<string, unknown>;
  zod: ZodType<T>;
  timeoutMs?: number;
}

export async function structuredCall<T>(o: CallOpts<T>): Promise<T> {
  const body = {
    model: aiModel(),
    instructions: o.instructions,
    input: [{ role: "user", content: o.input }],
    // Reasoning models (o-series, gpt-5 family) reject a temperature setting; others get 0 for repeatability.
    ...(/^(o\d|gpt-5)/.test(aiModel()) ? {} : { temperature: 0 }),
    text: { format: { type: "json_schema", name: o.name, schema: o.jsonSchema, strict: true } },
  };
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 45_000);
    try {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new AiError(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = await res.json();
      const text = extractOutputText(json);
      const parsed = o.zod.safeParse(JSON.parse(text));
      if (!parsed.success) throw new AiError(`Output failed validation: ${parsed.error.message.slice(0, 300)}`);
      return parsed.data;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new AiError(String(lastErr));
}

/** The Responses API returns output items; the JSON lives in the output_text content part. */
export function extractOutputText(json: any): string {
  if (typeof json?.output_text === "string" && json.output_text) return json.output_text;
  for (const item of json?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text;
      if (part?.type === "refusal") throw new AiError(`Model refused: ${part.refusal}`);
    }
  }
  throw new AiError("No output text in response");
}
