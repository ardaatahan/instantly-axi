// The safety gate: the single choke point for every send-triggering or
// destructive operation. This is the central design constraint of the tool.
//
// Contract:
//   - Without --confirm, gate() prints exactly what WOULD happen (method,
//     endpoint, payload summary, effect) and returns 0 WITHOUT ever invoking
//     `execute`. No network call is made and no credentials are read.
//   - With --confirm, gate() invokes `execute` and prints its result.
//
// `execute` is a thunk so the no-op path is provable in tests: assert the spy
// was never called when confirm is false.

import { print, emitBlock } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";

export interface DryRunPlan {
  /** Plain-language description of the irreversible / sending effect. */
  effect: string;
  method: "POST" | "PATCH" | "DELETE";
  /** Endpoint path that would be called, e.g. "/campaigns/<id>/activate". */
  endpoint: string;
  /** Payload / parameter summary shown to the operator. */
  summary: Array<[string, string]>;
  /** The exact command to re-run with --confirm to execute for real. */
  confirmCommand: string;
}

export interface ExecuteResult {
  /** Lines of TOON output describing what happened. */
  lines: string[];
  /** 2-4 next-step suggestions (AXI principle 9). */
  suggestions?: string[];
}

/**
 * Gate a dangerous operation behind an explicit --confirm.
 * Returns the process exit code (always 0 on the dry-run path).
 */
export async function gate(
  plan: DryRunPlan,
  confirm: boolean,
  execute: () => Promise<ExecuteResult>,
): Promise<number> {
  if (!confirm) {
    print("dry-run: no request sent (add --confirm to execute)");
    print(
      emitBlock("plan", [
        `effect: ${plan.effect}`,
        `method: ${plan.method}`,
        `endpoint: ${plan.endpoint}`,
        ...plan.summary.map(([k, v]) => `${k}: ${v}`),
      ]),
    );
    print(helpBlock([plan.confirmCommand]));
    return 0;
  }

  const result = await execute();
  for (const line of result.lines) print(line);
  if (result.suggestions && result.suggestions.length > 0) {
    print(helpBlock(result.suggestions));
  }
  return 0;
}
