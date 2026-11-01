// One call that runs the whole deterministic part: checks -> decision -> template message.
import { runChecks } from "./checks";
import { templateMessage } from "./message";
import { decide } from "./policy";
import type { CheckContext } from "./types";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

export function evaluate(ctx: CheckContext) {
  const results = runChecks(ctx);
  const decision = decide(results);
  const message = templateMessage(ctx.form, decision, results);
  return { results, decision, message };
}
