import type { ColumnRead } from '@/types/openapi';
import { FUNCTION_REGISTRY, registerFunction } from '@/utils/builtInFunctions';

// ────────────────────────────────────────────────────────────────────────────────
//  Error helpers
// ────────────────────────────────────────────────────────────────────────────────
export class FormulaError extends Error {
  constructor(message: string, public formula?: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

// Token types
const enum TKind {
  NUM,
  IDENT,
  STR, 
  LBRACE,
  RBRACE,
  LPAREN,
  RPAREN,
  COMMA,
  OP,
  EOF,
}
interface Token {
  kind: TKind;
  value?: string;
}

// Helpers for user-friendly token descriptions
function describeKind(kind: TKind): string {
  switch (kind) {
    case TKind.NUM:
      return 'number';
    case TKind.IDENT:
      return 'identifier';
    case TKind.STR:
      return 'string literal';
    case TKind.LBRACE:
      return "'{'";
    case TKind.RBRACE:
      return "'}'";
    case TKind.LPAREN:
      return "'('";
    case TKind.RPAREN:
      return "')'";
    case TKind.COMMA:
      return "','";
    case TKind.OP:
      return 'operator';
    case TKind.EOF:
      return 'end of formula';
    default:
      return 'token';
  }
}
function describeToken(tok: Token): string {
  const desc = describeKind(tok.kind);
  return tok.value != null ? `${desc} '${tok.value}'` : desc;
}

const OPS = new Set(['+', '-', '*', '/', '^']);

/** Very small ad‑hoc lexer – fast & zero deps. */
class Lexer {
  private pos = 0;
  private readonly src: string;
  constructor(src: string) {
    this.src = src;
  }

  next(): Token {
    const s = this.src;
    while (this.pos < s.length && /\s/.test(s[this.pos])) this.pos++;
    if (this.pos >= s.length) return { kind: TKind.EOF };

    const ch = s[this.pos];
    // quoted string literal
    if (ch === '"' || ch === "'") {
      const quote = ch;
      this.pos++;
      let str = '';
      while (this.pos < s.length) {
        const c = s[this.pos++];
        if (c === '\\') {
          const nxt = s[this.pos++] || '';
          switch (nxt) {
            case 'n':
              str += '\n';
              break;
            case 'r':
              str += '\r';
              break;
            case 't':
              str += '\t';
              break;
            case '\\':
              str += '\\';
              break;
            case '"':
              str += '"';
              break;
            case "'":
              str += "'";
              break;
            default:
              str += nxt;
              break;
          }
        } else if (c === quote) {
          break;
        } else {
          str += c;
        }
      }
      return { kind: TKind.STR, value: str };
    }
    // Numbers (int / float)
    if (/\d/.test(ch)) {
      let start = this.pos;
      let hasLetter = false;
      while (this.pos < s.length && /[A-Za-z0-9_]/.test(s[this.pos])) {
        if (/[A-Za-z_]/.test(s[this.pos])) hasLetter = true;
        this.pos++;
      }

      const lexeme = s.slice(start, this.pos);

      // Pure digits → number literal; mixed alphanum → identifier
      return hasLetter
        ? { kind: TKind.IDENT, value: lexeme }
        : { kind: TKind.NUM, value: lexeme };
    }
    // Identifiers (function names or infix AND/OR)
    if (/[A-Za-z_]/.test(ch)) {
      let start = this.pos;
      while (this.pos < s.length && /[A-Za-z0-9_]/.test(s[this.pos]))
        this.pos++;
      const lexeme = s.slice(start, this.pos);
      // treat 'AND'/'OR' as infix operator when not followed by '('
      if ((lexeme === 'AND' || lexeme === 'OR') && s[this.pos] !== '(') {
        return { kind: TKind.OP, value: lexeme };
      }
      return { kind: TKind.IDENT, value: lexeme };
    }
    // Multi-char comparison/equality operators
    if (ch === '>' || ch === '<' || ch === '!' || ch === '=') {
      const nxt = s[this.pos + 1] || '';
      if ((ch === '>' || ch === '<') && nxt === '=') {
        this.pos += 2;
        return { kind: TKind.OP, value: ch + '=' };
      }
      if (ch === '!' && nxt === '=') {
        this.pos += 2;
        return { kind: TKind.OP, value: '!=' };
      }
      // single-char >, < or =
      if (ch === '>' || ch === '<' || ch === '=') {
        this.pos++;
        return { kind: TKind.OP, value: ch };
      }
      throw new FormulaError(`Illegal character '${ch}' at ${this.pos}`);
    }
    // Single‑char tokens
    this.pos++;
    switch (ch) {
      case '{':
        return { kind: TKind.LBRACE };
      case '}':
        return { kind: TKind.RBRACE };
      case '(':
        return { kind: TKind.LPAREN };
      case ')':
        return { kind: TKind.RPAREN };
      case ',':
        return { kind: TKind.COMMA };
      default:
        if (OPS.has(ch)) return { kind: TKind.OP, value: ch };
        break;
    }
    throw new FormulaError(`Illegal character '${ch}' at ${this.pos - 1}`);
  }
}

// AST node base
abstract class Node {
  abstract evaluate(): unknown;
}
class NumberNode extends Node {
  constructor(private readonly n: number) {
    super();
  }
  evaluate() {
    return this.n;
  }
}
class ColumnNode extends Node {
  constructor(
    private readonly id: string,
    private readonly row: Record<string, unknown>
  ) {
    super();
  }
  evaluate() {
    // throw on unknown column
    if (!Object.prototype.hasOwnProperty.call(this.row, this.id)) {
      throw new FormulaError(`Unknown column '${this.id}'`);
    }
    console.log('Accessing column:', this.row);
    console.log('Column ID:', this.id);
    return this.row[this.id];
  }
}
class BinaryNode extends Node {
  constructor(
    private readonly op: string,
    private readonly left: Node,
    private readonly right: Node
  ) {
    super();
  }
  evaluate() {
    const l = Number(this.left.evaluate()) || 0;
    const r = Number(this.right.evaluate()) || 0;
    switch (this.op) {
      case '+':
        console.log('Adding:', l, r);
        return (l ?? 0) + (r ?? 0);
      case '-':
        return (l ?? 0) - (r ?? 0);
      case '*':
        return (l ?? 0) * (r ?? 0);
      case '/':
        return (l ?? 0) / (r ?? 0);
      case '^':
        return Math.pow(l ?? 0, r ?? 0);
      case '>':
        return l > r;
      case '>=':
        return l >= r;
      case '<':
        return l < r;
      case '<=':
        return l <= r;
      case '!=':
        return l !== r;
      case '=':
        return l === r;
      case 'AND':
        return Boolean(l) && Boolean(r);
      case 'OR':
        return Boolean(l) || Boolean(r);
      default:
        throw new FormulaError(`Unknown operator '${this.op}'`);
    }
  }
}
class FuncCallNode extends Node {
  constructor(
    private readonly fnName: string,
    private readonly args: Node[],
    private readonly registry: FunctionRegistry
  ) {
    super();
  }
  evaluate() {
    const impl = this.registry[this.fnName];
    if (!impl) throw new FormulaError(`Function ${this.fnName} not registered`);
    return impl(...this.args.map((a) => a.evaluate()));
  }
}
// AST node for string literals
class StringNode extends Node {
  constructor(private readonly s: string) {
    super();
  }
  evaluate() {
    return this.s;
  }
}

// AST node for boolean literals
class BooleanNode extends Node {
  constructor(private readonly b: boolean) {
    super();
  }
  evaluate() {
    return this.b;
  }
}

// AST node for unary + / –
class UnaryNode extends Node {
  constructor(private readonly op: string, private readonly operand: Node) {
    super();
  }
  evaluate() {
    const v = Number(this.operand.evaluate()) || 0;
    return this.op === '-' ? -v : v;
  }
}

type FunctionImpl = (...args: unknown[]) => unknown;
interface FunctionRegistry {
  [name: string]: FunctionImpl;
}

// Pratt‑style parser – small & fast
class Parser {
  private lexer: Lexer;
  private lookahead: Token;

  constructor(
    src: string,
    private readonly row: Record<string, unknown>,
    _columns: ColumnRead[],
    private readonly registry: Record<string, FunctionImpl>
  ) {
    this.lexer = new Lexer(src);
    console.log('Parsing formula:', src);
    this.lookahead = this.lexer.next();
  }

  parse(): Node {
    const expr = this.parseExpression(0);
    if (this.lookahead.kind !== TKind.EOF) {
      throw new FormulaError(`Unexpected ${describeToken(this.lookahead)}`);
    }
    return expr;
  }

  // Operator precedence table
  private precedence(op: string) {
    switch (op) {
      case '^':
        return 4;
      case '*':
      case '/':
        return 3;
      case '+':
      case '-':
        return 2;
      default:
        return 0;
    }
  }

  private parseExpression(minBP: number): Node {
    let left: Node;
    // handle prefix + / -
    if (
      this.lookahead.kind === TKind.OP &&
      (this.lookahead.value === '+' || this.lookahead.value === '-')
    ) {
      const op = this.consume(TKind.OP).value!;
      // bind tighter than ^ (which is 4)
      left = new UnaryNode(op, this.parseExpression(5));
    } else {
      left = this.parsePrimary();
    }

    while (this.lookahead.kind === TKind.OP) {
      const op = this.lookahead.value!;
      const prec = this.precedence(op);
      if (prec < minBP) break;
      this.consume(TKind.OP);
      const right = this.parseExpression(prec + (op === '^' ? 0 : 1));
      left = new BinaryNode(op, left, right);
    }
    return left;
  }

  private parsePrimary(): Node {
    switch (this.lookahead.kind) {
      case TKind.NUM: {
        const val = Number(this.consume(TKind.NUM).value);
        return new NumberNode(val);
      }
      case TKind.LBRACE: {
        this.consume(TKind.LBRACE);
        const idTok = this.consume(TKind.IDENT);
        const colId = idTok.value!;
        this.consume(TKind.RBRACE);
        return new ColumnNode(colId, this.row);
      }
      case TKind.IDENT: {
        const idTok = this.consume(TKind.IDENT);
        const name = idTok.value!;
        // boolean literal
        if (name === 'true' || name === 'false') {
          return new BooleanNode(name === 'true');
        }
        // function call
        this.consume(TKind.LPAREN);
        const args: Node[] = [];
        if (this.lookahead.kind !== TKind.RPAREN) {
          args.push(this.parseExpression(0));
          while (this.lookahead.kind === TKind.COMMA) {
            this.consume(TKind.COMMA);
            args.push(this.parseExpression(0));
          }
        }
        this.consume(TKind.RPAREN);
        return new FuncCallNode(name, args, this.registry);
      }
      case TKind.STR: {
        const val = this.consume(TKind.STR).value!;
        return new StringNode(val);
      }
      case TKind.LPAREN: {
        this.consume(TKind.LPAREN);
        const node = this.parseExpression(0);
        this.consume(TKind.RPAREN);
        return node;
      }
      default:
        throw new FormulaError('Unexpected token while parsing primary');
    }
  }

  private consume(expected: TKind): Token {
    const tok = this.lookahead;
    if (tok.kind !== expected) {
      throw new FormulaError(
        `Expected ${describeKind(expected)}, but got ${describeToken(tok)}`
      );
    }
    this.lookahead = this.lexer.next();
    return tok;
  }
}

export function validateFormula(
  raw: string,
  columns: ColumnRead[] = []
): string | undefined {
  try {
    // 1 Syntax
    const ast = new Parser(raw, {}, columns, FUNCTION_REGISTRY).parse();

    // 2 Lookup sets (safe)
    const lc = (v: unknown) =>
      typeof v === 'string' ? v.toLowerCase() : undefined;

    const knownFields = new Set<string>();
    for (const col of columns) {
      const name = col && lc((col as any).name);
      if (name) knownFields.add(name);
    }

    const knownFns = new Set(
      Object.keys(FUNCTION_REGISTRY).map((n) => n.toLowerCase())
    );

    // 3 Semantic walk
    let problem: string | undefined;
    const walk = (node: Node): void => {
      if (problem) return;

      if (node instanceof ColumnNode) {
        if (knownFields.size && !knownFields.has(lc(node.name)!)) {
          problem = `Unknown field: ${node.name}`;
        }
      } else if (node instanceof FuncCallNode) {
        if (!knownFns.has(lc(node.fnName)!)) {
          problem = `Unknown function: ${node.fnName}`;
          return;
        }
        (node as any).args.forEach(walk);
      } else if (node instanceof BinaryNode) {
        walk((node as any).left);
        walk((node as any).right);
      } else if (node instanceof UnaryNode) {
        walk((node as any).operand);
      }
    };
    walk(ast);
    return problem; // undefined ⇒ fully valid
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Parse **then** evaluate – identical external behaviour to your
 * previous `evaluateFormula`, but now re-uses the same Parser.
 */
export function evaluateFormula(
  raw: unknown,
  row: Record<string, unknown>,
  columns: ColumnRead[] = []
) {
  if (typeof raw !== 'string') {
    return {
      error: {
        generic: 'Formula wrong',
        reason: `Expected formula as string`,
      },
    };
  }

  if (raw.trim() === '') return undefined;

  try {
    const ast = new Parser(raw, row, columns, FUNCTION_REGISTRY).parse();
    return ast.evaluate();
  } catch (err) {
    return {
      error: {
        generic: 'Formula wrong',
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
