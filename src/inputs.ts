/** Validate action inputs. Kept separate from @actions/core so it can be unit tested. */

import { FINDING_TYPES, type FindingType } from "./findings.js";

export interface Inputs {
  testCommand: string;
  failOn: FindingType[];
  timeoutMs: number;
  tailLines: number;
  comment: boolean;
}

export type ReadInput = (name: string) => string;

export class InputError extends Error {}

export function parseFailOn(value: string): FindingType[] {
  const items = value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0 || items.includes("none")) {
    return [];
  }
  if (items.includes("any")) {
    return [...FINDING_TYPES];
  }
  const unknown = items.filter((item) => !(FINDING_TYPES as readonly string[]).includes(item));
  if (unknown.length > 0) {
    throw new InputError(
      `fail-on has unknown finding type(s): ${unknown.join(", ")}. Use any, none, or: ${FINDING_TYPES.join(", ")}`,
    );
  }
  return items as FindingType[];
}

function positiveInteger(value: string, name: string, allowZero = false): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < (allowZero ? 0 : 1)) {
    throw new InputError(`${name} must be a ${allowZero ? "non-negative" : "positive"} integer, got '${value}'`);
  }
  return number;
}

export function readInputs(read: ReadInput): Inputs {
  const comment = read("comment") || "true";
  if (comment !== "true" && comment !== "false") {
    throw new InputError(`comment must be true or false, got '${comment}'`);
  }
  return {
    testCommand: read("test-command").trim(),
    failOn: parseFailOn(read("fail-on") || "tests-failed"),
    timeoutMs: positiveInteger(read("test-timeout-minutes") || "30", "test-timeout-minutes") * 60_000,
    tailLines: positiveInteger(read("test-output-lines") || "40", "test-output-lines", true),
    comment: comment === "true",
  };
}
