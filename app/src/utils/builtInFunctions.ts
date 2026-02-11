// builtInFunctions.ts — created 2025‑08‑05
// -----------------------------------------------------------------------------
// Central single‑source of truth for ALL core formula functions.
//
//  • FUNCTION_REGISTRY  – map<string, impl> consumed by the runtime evaluator.
//  • BUILT_IN_FUNCTIONS – lean metadata array consumed by the Settings UI.
//
// Both derive from the same internal array so the keys never drift apart.
// -----------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */

export type FunctionImpl = (...args: unknown[]) => unknown;

interface FunctionMeta {
  /** Display name in UPPER_SNAKE_CASE – must be unique. */
  name: string;
  /** Actual implementation executed by the evaluator. */
  impl: FunctionImpl;
  /** Human‑readable signature shown in autocomplete. */
  signature: string;
  /** Optional quick type hint for UI. */
  returnType?: string;
}

const sumNumbers = (xs: unknown[]): number =>
  xs.reduce((sum, v) => sum + (Number(v) || 0), 0);

// -----------------------------------------------------------------------------
// 1️⃣  Define the built‑ins once
// -----------------------------------------------------------------------------
const CORE_FUNCTIONS: FunctionMeta[] = [
  {
    name: 'ADD',
    impl: (...xs) => xs.reduce((sum, v) => sum + (Number(v) || 0), 0),
    signature: 'ADD(a, b, …)',
    returnType: 'number',
  },
  {
    name: 'SUM',
    impl: (...xs) => xs.reduce((sum, v) => sum + (Number(v) || 0), 0),
    signature: 'SUM(a, b, …)',
    returnType: 'number',
  },
  {
    name: 'MIN',
    impl: (...xs) => {
      if (xs.length === 0)
        throw new Error('MIN requires at least one argument');
      return Math.min(...xs.map(Number));
    },
    signature: 'MIN(a, b, …)',
    returnType: 'number',
  },
  {
    name: 'MAX',
    impl: (...xs) => {
      if (xs.length === 0)
        throw new Error('MAX requires at least one argument');
      return Math.max(...xs.map(Number));
    },
    signature: 'MAX(a, b, …)',
    returnType: 'number',
  },
  {
    name: 'AVG',
    impl: (...xs) => {
      const n = xs.length;
      return n ? sumNumbers(xs) / n : undefined;
    },
    signature: 'AVG(a, b, …)',
    returnType: 'number | undefined',
  },
  {
    name: 'CONCAT',
    impl: (...xs) => xs.join(''),
    signature: 'CONCAT(a, b, …)',
    returnType: 'string',
  },
  {
    name: 'AND',
    impl: (...xs) => xs.every(Boolean),
    signature: 'AND(a, b, …)',
    returnType: 'boolean',
  },
  {
    name: 'OR',
    impl: (...xs) => xs.some(Boolean),
    signature: 'OR(a, b, …)',
    returnType: 'boolean',
  },
];

// -----------------------------------------------------------------------------
// 2️⃣  Derived exports – kept in lock‑step with the source array
// -----------------------------------------------------------------------------
/** Map<string, FunctionImpl> consumed by the evaluator. */
export const FUNCTION_REGISTRY: Record<string, FunctionImpl> =
  Object.fromEntries(CORE_FUNCTIONS.map(({ name, impl }) => [name, impl]));

/**
 * Lean metadata array for Settings autocomplete.
 * Contains no actual function implementations, so it’s treeshake‑friendly.
 */
export const BUILT_IN_FUNCTIONS = CORE_FUNCTIONS.map(
  ({ name, signature, returnType }) => ({
    name,
    signature,
    returnType,
  })
);

// -----------------------------------------------------------------------------
// 3️⃣  Extension API – register additional built‑ins at runtime
// -----------------------------------------------------------------------------
export function registerFunction(
  name: string,
  impl: FunctionImpl,
  opts: { signature?: string; returnType?: string } = {}
) {
  const upper = name.toUpperCase();
  FUNCTION_REGISTRY[upper] = impl;

  // Provide basic metadata if caller didn’t.
  BUILT_IN_FUNCTIONS.push({
    name: upper,
    signature: opts.signature ?? `${upper}()`,
    returnType: opts.returnType ?? 'unknown',
  });
}
