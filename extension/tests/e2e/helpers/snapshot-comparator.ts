/**
 * Snapshot Comparator — fuzzy matching of actual recorded steps vs golden expectations.
 *
 * Golden format uses loose assertions: action_type must match, element properties
 * are checked only when specified, and tolerance settings control how strict the
 * comparison is.
 */

export interface GoldenElement {
  tagName?: string;
  id?: string;
  type?: string;
  name?: string;
  has_selector?: boolean;
  has_xpath?: boolean;
  role?: string;
  ariaLabel?: string;
  testId?: string;
}

export interface GoldenStep {
  action_type: string;
  element?: GoldenElement;
  has_url?: boolean;
  description_contains?: string[];
  text_typed?: string;
  text_typed_contains?: string;
}

export interface GoldenTolerance {
  position_pct?: number;       // Not used for matching, just documentation
  extra_steps_allowed?: number; // How many extra steps in actual are OK
  missing_steps_allowed?: number; // How many expected steps can be missing
  order_strict?: boolean;       // Must steps appear in order?
}

export interface GoldenSnapshot {
  workflow: string;
  page: string;
  steps: GoldenStep[];
  tolerance: GoldenTolerance;
}

export interface StepMatch {
  goldenIndex: number;
  actualIndex: number;
  golden: GoldenStep;
  actual: any;
  matched: boolean;
  errors: string[];
}

export interface ComparisonResult {
  passed: boolean;
  matchedSteps: StepMatch[];
  extraSteps: Array<{ index: number; step: any }>;
  missingSteps: Array<{ index: number; step: GoldenStep }>;
  summary: string;
}

/**
 * Compare actual recorded steps against a golden snapshot.
 */
export function compareSnapshots(
  actual: any[],
  golden: GoldenSnapshot,
): ComparisonResult {
  const tolerance = golden.tolerance || {};
  const extraAllowed = tolerance.extra_steps_allowed ?? 2;
  const missingAllowed = tolerance.missing_steps_allowed ?? 0;
  const orderStrict = tolerance.order_strict !== false;

  const matchedSteps: StepMatch[] = [];
  const usedActualIndices = new Set<number>();

  // Try to match each golden step to an actual step
  let searchStart = 0;

  for (let gi = 0; gi < golden.steps.length; gi++) {
    const goldenStep = golden.steps[gi];
    let bestMatch: StepMatch | null = null;

    const start = orderStrict ? searchStart : 0;
    for (let ai = start; ai < actual.length; ai++) {
      if (usedActualIndices.has(ai)) continue;

      const errors = matchStep(goldenStep, actual[ai]);
      if (errors.length === 0) {
        bestMatch = {
          goldenIndex: gi,
          actualIndex: ai,
          golden: goldenStep,
          actual: actual[ai],
          matched: true,
          errors: [],
        };
        usedActualIndices.add(ai);
        if (orderStrict) searchStart = ai + 1;
        break;
      }
    }

    if (bestMatch) {
      matchedSteps.push(bestMatch);
    } else {
      // Try partial match for better error reporting
      const partialErrors: string[] = [];
      for (let ai = 0; ai < actual.length; ai++) {
        if (usedActualIndices.has(ai)) continue;
        const errs = matchStep(goldenStep, actual[ai]);
        if (errs.length < (partialErrors.length || Infinity)) {
          partialErrors.length = 0;
          partialErrors.push(...errs);
        }
      }
      matchedSteps.push({
        goldenIndex: gi,
        actualIndex: -1,
        golden: goldenStep,
        actual: null,
        matched: false,
        errors: partialErrors.length > 0
          ? partialErrors
          : [`No matching step found for ${goldenStep.action_type}`],
      });
    }
  }

  // Identify extra steps (actual steps not matched to any golden step)
  const extraSteps = actual
    .map((step, index) => ({ index, step }))
    .filter(({ index }) => !usedActualIndices.has(index));

  // Identify missing steps
  const missingSteps = matchedSteps
    .filter((m) => !m.matched)
    .map((m) => ({ index: m.goldenIndex, step: m.golden }));

  // Determine pass/fail
  const extraCount = extraSteps.length;
  const missingCount = missingSteps.length;
  const passed = missingCount <= missingAllowed && extraCount <= extraAllowed;

  // Build summary
  const lines: string[] = [];
  lines.push(`Workflow: ${golden.workflow}`);
  lines.push(`Expected: ${golden.steps.length} steps | Actual: ${actual.length} steps`);
  lines.push(`Matched: ${matchedSteps.filter((m) => m.matched).length} | Missing: ${missingCount} (allowed: ${missingAllowed}) | Extra: ${extraCount} (allowed: ${extraAllowed})`);

  if (missingSteps.length > 0) {
    lines.push('\n--- Missing Steps ---');
    for (const ms of missingSteps) {
      lines.push(`  [${ms.index}] ${ms.step.action_type}: ${ms.step.description_contains?.join(', ') || 'no description'}`);
    }
  }

  if (extraSteps.length > 0) {
    lines.push('\n--- Extra Steps ---');
    for (const es of extraSteps) {
      lines.push(`  [${es.index}] ${es.step.actionType}: ${es.step.description || 'no description'}`);
    }
  }

  const failedMatches = matchedSteps.filter((m) => !m.matched);
  if (failedMatches.length > 0) {
    lines.push('\n--- Match Failures ---');
    for (const fm of failedMatches) {
      lines.push(`  Golden[${fm.goldenIndex}] ${fm.golden.action_type}:`);
      for (const err of fm.errors) {
        lines.push(`    - ${err}`);
      }
    }
  }

  lines.push(`\nResult: ${passed ? 'PASS' : 'FAIL'}`);

  return {
    passed,
    matchedSteps,
    extraSteps,
    missingSteps,
    summary: lines.join('\n'),
  };
}

/**
 * Match a single actual step against a golden step expectation.
 * Returns an array of error messages (empty = match).
 */
function matchStep(golden: GoldenStep, actual: any): string[] {
  const errors: string[] = [];

  // action_type must match
  if (golden.action_type !== actual.actionType) {
    errors.push(`action_type: expected "${golden.action_type}", got "${actual.actionType}"`);
    return errors; // No point checking further if action type doesn't match
  }

  // URL check
  if (golden.has_url && !actual.url) {
    errors.push('Expected step to have a URL but it was empty');
  }

  // Description contains
  if (golden.description_contains && golden.description_contains.length > 0) {
    const desc = (actual.description || '').toLowerCase();
    for (const fragment of golden.description_contains) {
      if (!desc.includes(fragment.toLowerCase())) {
        errors.push(`description should contain "${fragment}" but got: "${actual.description}"`);
      }
    }
  }

  // Text typed
  if (golden.text_typed !== undefined) {
    if (actual.textTyped !== golden.text_typed) {
      errors.push(`text_typed: expected "${golden.text_typed}", got "${actual.textTyped}"`);
    }
  }
  if (golden.text_typed_contains !== undefined) {
    if (!actual.textTyped || !actual.textTyped.includes(golden.text_typed_contains)) {
      errors.push(`text_typed should contain "${golden.text_typed_contains}", got "${actual.textTyped}"`);
    }
  }

  // Element matching
  if (golden.element) {
    const el = actual.elementInfo;
    if (!el) {
      errors.push('Expected elementInfo but it was null');
      return errors;
    }

    if (golden.element.tagName && el.tagName !== golden.element.tagName) {
      errors.push(`element.tagName: expected "${golden.element.tagName}", got "${el.tagName}"`);
    }

    if (golden.element.id && el.id !== golden.element.id) {
      errors.push(`element.id: expected "${golden.element.id}", got "${el.id}"`);
    }

    if (golden.element.type && el.type !== golden.element.type) {
      errors.push(`element.type: expected "${golden.element.type}", got "${el.type}"`);
    }

    if (golden.element.name && el.name !== golden.element.name) {
      errors.push(`element.name: expected "${golden.element.name}", got "${el.name}"`);
    }

    if (golden.element.role && el.role !== golden.element.role) {
      errors.push(`element.role: expected "${golden.element.role}", got "${el.role}"`);
    }

    if (golden.element.ariaLabel && el.ariaLabel !== golden.element.ariaLabel) {
      errors.push(`element.ariaLabel: expected "${golden.element.ariaLabel}", got "${el.ariaLabel}"`);
    }

    if (golden.element.testId && el.testId !== golden.element.testId) {
      errors.push(`element.testId: expected "${golden.element.testId}", got "${el.testId}"`);
    }

    if (golden.element.has_selector && !el.selector) {
      errors.push('Expected element to have a CSS selector but it was empty');
    }

    if (golden.element.has_xpath && !el.xpath) {
      errors.push('Expected element to have an XPath but it was empty');
    }
  }

  return errors;
}

/**
 * Pretty-print actual steps for debugging.
 */
export function formatActualSteps(steps: any[]): string {
  return steps
    .map((s, i) => {
      const parts = [`[${i}] ${s.actionType}`];
      if (s.description) parts.push(`desc: "${s.description}"`);
      if (s.textTyped) parts.push(`typed: "${s.textTyped}"`);
      if (s.elementInfo?.tagName) parts.push(`tag: ${s.elementInfo.tagName}`);
      if (s.elementInfo?.id) parts.push(`id: ${s.elementInfo.id}`);
      if (s.url) parts.push(`url: ${s.url}`);
      return parts.join(' | ');
    })
    .join('\n');
}
