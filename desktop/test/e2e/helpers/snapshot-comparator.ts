/**
 * Fuzzy snapshot comparison for desktop recording E2E tests.
 *
 * Desktop recordings capture OS-level events via accessibility APIs,
 * so element matching uses role/title rather than DOM selectors.
 * Position tolerance is wider because screen coordinates vary by display setup.
 */

import type { RecordedStep } from './electron-driver';

export interface GoldenStepMatcher {
  action_type: string;
  element?: {
    role_contains?: string;
    title_contains?: string;
    has_title?: boolean;
  };
  has_window_info?: boolean;
  has_screenshot?: boolean;
  text_contains?: string;
}

export interface GoldenSnapshot {
  workflow: string;
  page: string;
  steps: GoldenStepMatcher[];
  tolerance: {
    extra_steps_allowed: number;
    missing_steps_allowed: number;
    order_strict: boolean;
  };
}

export interface ComparisonResult {
  pass: boolean;
  matched: number;
  missing: GoldenStepMatcher[];
  extra: RecordedStep[];
  errors: string[];
}

/**
 * Compare recorded steps against a golden snapshot with fuzzy matching.
 *
 * Rules:
 * - Each golden step must match at least one recorded step
 * - Extra recorded steps are allowed up to tolerance.extra_steps_allowed
 * - Missing golden steps are allowed up to tolerance.missing_steps_allowed
 * - Order matching is optional (tolerance.order_strict)
 */
export function compareSnapshots(
  recorded: RecordedStep[],
  golden: GoldenSnapshot,
): ComparisonResult {
  const errors: string[] = [];
  const matched: number[] = [];
  const usedRecorded = new Set<number>();

  // Try to match each golden step to a recorded step
  for (let gi = 0; gi < golden.steps.length; gi++) {
    const goldenStep = golden.steps[gi];
    let bestMatch = -1;
    let bestScore = 0;

    for (let ri = 0; ri < recorded.length; ri++) {
      if (usedRecorded.has(ri)) continue;

      const score = scoreMatch(recorded[ri], goldenStep);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = ri;
      }
    }

    if (bestMatch >= 0 && bestScore > 0) {
      matched.push(gi);
      usedRecorded.add(bestMatch);

      // Check order if strict
      if (golden.tolerance.order_strict && matched.length > 1) {
        const prevRecIdx = [...usedRecorded].sort((a, b) => a - b);
        const lastTwo = prevRecIdx.slice(-2);
        if (lastTwo[1] < lastTwo[0]) {
          errors.push(
            `Order violation: golden step ${gi} matched recorded[${bestMatch}] but previous match was at later index`,
          );
        }
      }
    }
  }

  const missingIndices = golden.steps
    .map((_, i) => i)
    .filter((i) => !matched.includes(i));
  const extraSteps = recorded.filter((_, i) => !usedRecorded.has(i));

  if (missingIndices.length > golden.tolerance.missing_steps_allowed) {
    errors.push(
      `Too many missing steps: ${missingIndices.length} missing (allowed: ${golden.tolerance.missing_steps_allowed})`,
    );
  }

  if (extraSteps.length > golden.tolerance.extra_steps_allowed) {
    errors.push(
      `Too many extra steps: ${extraSteps.length} extra (allowed: ${golden.tolerance.extra_steps_allowed})`,
    );
  }

  return {
    pass: errors.length === 0,
    matched: matched.length,
    missing: missingIndices.map((i) => golden.steps[i]),
    extra: extraSteps,
    errors,
  };
}

/**
 * Score how well a recorded step matches a golden step matcher.
 * Returns 0 for no match, higher scores for better matches.
 */
function scoreMatch(recorded: RecordedStep, golden: GoldenStepMatcher): number {
  let score = 0;

  // Action type must match (case-insensitive, partial match)
  const recAction = recorded.actionType.toLowerCase();
  const goldenAction = golden.action_type.toLowerCase();
  if (recAction.includes(goldenAction) || goldenAction.includes(recAction)) {
    score += 10;
  } else {
    return 0; // Action type mismatch is a hard fail
  }

  // Element matching
  if (golden.element) {
    if (golden.element.role_contains) {
      const role = (recorded.elementRole || '').toLowerCase();
      if (role.includes(golden.element.role_contains.toLowerCase())) {
        score += 5;
      }
    }

    if (golden.element.title_contains) {
      const name = (recorded.elementName || recorded.elementDescription || '').toLowerCase();
      if (name.includes(golden.element.title_contains.toLowerCase())) {
        score += 5;
      }
    }

    if (golden.element.has_title) {
      if (recorded.elementName || recorded.elementDescription) {
        score += 3;
      }
    }
  }

  // Window info check
  if (golden.has_window_info) {
    if (recorded.windowTitle && recorded.windowTitle !== 'Unknown Window') {
      score += 2;
    }
  }

  // Screenshot check
  if (golden.has_screenshot) {
    if (recorded.screenshotPath) {
      score += 2;
    }
  }

  // Text content check
  if (golden.text_contains) {
    const typed = (recorded.textTyped || '').toLowerCase();
    if (typed.includes(golden.text_contains.toLowerCase())) {
      score += 5;
    }
  }

  return score;
}

/**
 * Helper: assert that a comparison result passes.
 * Throws a descriptive error if it doesn't.
 */
export function assertSnapshotMatch(
  result: ComparisonResult,
  workflowName: string,
): void {
  if (result.pass) return;

  const lines = [`Snapshot comparison failed for "${workflowName}":`];
  lines.push(`  Matched: ${result.matched}`);

  if (result.missing.length > 0) {
    lines.push(`  Missing steps:`);
    for (const step of result.missing) {
      lines.push(`    - ${step.action_type} ${JSON.stringify(step.element || {})}`);
    }
  }

  if (result.extra.length > 0) {
    lines.push(`  Extra steps:`);
    for (const step of result.extra) {
      lines.push(`    - ${step.actionType}: ${step.description}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push(`  Errors:`);
    for (const err of result.errors) {
      lines.push(`    - ${err}`);
    }
  }

  throw new Error(lines.join('\n'));
}
