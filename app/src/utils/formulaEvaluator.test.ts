import { evaluateFormula } from './formulaEvaluator';


describe('evaluateFormula – core behaviour', () => {
  /* ------------------------------------------------------------------
   * Baseline / smoke tests
   * ---------------------------------------------------------------- */
  it('returns undefined on empty string', () => {
    expect(evaluateFormula('', {}, [])).toBeUndefined();
  });

  it('rejects non‑string input with a FormulaError‑style message', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = evaluateFormula(123 as any, {}, []);

    expect(res).toMatchObject({
      error: { generic: 'Formula wrong' },
    });
    expect(res.error.reason).toMatch(/Expected formula as string/);
  });
});

/* ==========================================================================
 * Arithmetic operator precedence & associativity
 * ======================================================================= */
describe('arithmetic operations', () => {
  it('handles +  –  *  / with correct precedence', () => {
    // 2 + 3 * 4 − 10 / 2  →  2 + 12 − 5  = 9
    expect(evaluateFormula('2 + 3 * 4 - 10 / 2', {}, [])).toBe(9);
  });

  it('honours parentheses over default precedence', () => {
    // (2 + 3) * (4 - 1) = 5 * 3 = 15
    expect(evaluateFormula('(2 + 3) * (4 - 1)', {}, [])).toBe(15);
  });

  it('computes nested parentheses arbitrarily deep', () => {
    // ((1 + 2) * (3 + (4 - 1))) = 3 * 6 = 18
    expect(evaluateFormula('((1 + 2) * (3 + (4 - 1)))', {}, [])).toBe(18);
  });
});

/* ==========================================================================
 * Comparison & logical operators
 * ======================================================================= */
describe('comparison and logical operations', () => {
  it('evaluates comparison operators', () => {
    expect(evaluateFormula('3 > 2', {}, [])).toBe(true);
    expect(evaluateFormula('3 >= 3', {}, [])).toBe(true);
    expect(evaluateFormula('2 < 1', {}, [])).toBe(false);
    expect(evaluateFormula('2 != 3', {}, [])).toBe(true);
  });

  it('combines comparison with logical AND / OR', () => {
    // (3 > 2) AND (1 < 2)  → true
    expect(evaluateFormula('(3 > 2) AND (1 < 2)', {}, [])).toBe(true);
    // (3 > 5) OR (4 == 4) → true
    expect(evaluateFormula('(3 > 5) OR (4 = 4)', {}, [])).toBe(true);
  });
});

/* ==========================================================================
 * Built‑in functions
 * ======================================================================= */

describe('built‑in numeric aggregators', () => {
  it('ADD: sums all arguments (numeric coercion, ignores non‑numeric)', () => {
    expect(evaluateFormula('ADD(1, 2, "3", "foo")', {}, [])).toBe(6);
  });

  it('SUM: identical behaviour to ADD', () => {
    expect(evaluateFormula('SUM(1, 2, 3)', {}, [])).toBe(6);
  });

  it('MIN / MAX return extremum of arguments', () => {
    expect(evaluateFormula('MIN(7, -2, 5)', {}, [])).toBe(-2);
    expect(evaluateFormula('MAX(7, -2, 5)', {}, [])).toBe(7);
  });

  it('AVG: average of numeric args, undefined when no args', () => {
    expect(evaluateFormula('AVG(2, 4, 6)', {}, [])).toBe(4);
    expect(evaluateFormula('AVG()', {}, [])).toBeUndefined();
  });
});

describe('string and boolean functions', () => {
  it('CONCAT joins args in order', () => {
    expect(evaluateFormula('CONCAT("Hello", " ", "World")', {}, [])).toBe(
      'Hello World'
    );
  });

  it('AND returns true only when all args truthy', () => {
    expect(evaluateFormula('AND(true, 1, "non‑empty")', {}, [])).toBe(true);
    expect(evaluateFormula('AND(true, 0, 5)', {}, [])).toBe(false);
  });

  it('OR returns true when any arg truthy', () => {
    expect(evaluateFormula('OR(false, 0, "yes")', {}, [])).toBe(true);
    expect(evaluateFormula('OR(false, 0, "")', {}, [])).toBe(false);
  });
});

/* ==========================================================================
 * Row data integration (column references)
 * ======================================================================= */

describe('row data & column references', () => {
  const row = { a: 10, b: 5, c: 2, flag: true, text: 'snap' };

  it('uses column values inside expressions', () => {
    // a * b + c  = 10 * 5 + 2 = 52
    expect(evaluateFormula('{a} * {b} + {c}', row, [])).toBe(52);
  });

  it('passes column refs into functions', () => {
    // SUM(a, b, 1) = 10 + 5 + 1 = 16
    expect(evaluateFormula('SUM({a}, {b}, 1)', row, [])).toBe(16);
  });

  it('combines functions, operators and comparisons', () => {
    // (AVG(a,b,c) > 6) AND flag -> ( (10+5+2)/3 ≈ 5.667 > 6) false AND true = false
    expect(
      evaluateFormula('(AVG({a}, {b}, {c}) > 6) AND {flag}', row, [])
    ).toBe(false);
  });

  it('handles string columns with CONCAT', () => {
    expect(evaluateFormula('CONCAT("pre-", {text}, "-post")', row, [])).toBe(
      'pre-snap-post'
    );
  });
});

/* ==========================================================================
 * Error handling (malformed expressions / unknown columns)
 * ======================================================================= */

describe('robust error handling', () => {
  it('throws FormulaError on unknown column reference', () => {
    const res = evaluateFormula('{doesNotExist}', {}, []);
    expect(res).toMatchObject({ error: { generic: 'Formula wrong' } });
    expect(res.error.reason).toMatch(/Unknown column/);
  });

  it('throws FormulaError on malformed syntax', () => {
    const res = evaluateFormula('1 + * 2', {}, []);
    expect(res).toMatchObject({ error: { generic: 'Formula wrong' } });
    expect(res.error.reason).toMatch(/Unexpected token/);
  });

  it('throws FormulaError on wrong arity inside function', () => {
    // e.g. expecting at least one arg for MIN
    const res = evaluateFormula('MIN()', {}, []);
    expect(res).toMatchObject({ error: { generic: 'Formula wrong' } });
    expect(res.error.reason).toMatch(/MIN requires at least one argument/);
  });
});
