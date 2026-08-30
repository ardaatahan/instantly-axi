// Shared --fields handling (AXI principle 2): list views default to a small
// column set and let agents opt into more.

import { UsageError } from "../output/errors.js";

/** Parses and validates a --fields value against the allowed column set. */
export function selectFields(value: unknown, allowed: string[]): string[] {
  const fields = String(value)
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  for (const f of fields) {
    if (!allowed.includes(f)) {
      throw new UsageError(
        `unknown field '${f}' for --fields`,
        `valid fields: ${allowed.join(", ")}`,
      );
    }
  }
  return fields;
}

/** Validates a page-size flag against the Instantly 1-100 range. */
export function parseLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new UsageError(`invalid --limit '${value}'`, "use an integer from 1 to 100");
  }
  return n;
}
