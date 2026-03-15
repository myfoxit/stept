import type { ColumnRead } from '@/types/openapi';
import { FUNCTION_REGISTRY } from '@/utils/builtInFunctions';

export class FormulaError extends Error {
  formula?: string;
  constructor(message: string, formula?: string) {
    super(message);
    this.name = 'FormulaError';
    this.formula = formula;
  }
}

const TKind = {
  NUM: 0,
  IDENT: 1,
  STR: 2,
  LBRACE: 3,
  RBRACE: 4,
  LPAREN: 5,
  RPAREN: 6,
  COMMA: 7,
  OP: 8,
  EOF: 9,
} as const;
type TKind = (typeof TKind)[keyof typeof TKind];
interface Token {
  kind: TKind;
  value?: string;
}

function describeKind(kind: TKind): string {
  switch (kind) {
    case TKind.NUM: return 'number';
    case TKind.IDENT: return 'identifier';
    case TKind.STR: return 'string literal';
    case TKind.LBRACE: return "'{'";
    case TKind.RBRACE: return "'}'";
    case TKind.LPAREN: return "'('";
    case TKind.RPAREN: return "')'";
    case TKind.COMMA: return "','";
    case TKind.OP: return 'operator';
    case TKind.EOF: return 'end of formula';
    default: return 'token';
  }
}
function describeToken(tok: Token): string {
  const desc = describeKind(tok.kind);
  return tok.value != null ? `${desc} '${tok.value}'` : desc;
}

const OPS = new Set(['+', '-', '*', '/', '^']);

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
    if (ch === '"' || ch === "'") {
      const quote = ch;
      this.pos++;
      let str = '';
      while (this.pos < s.length) {
        const c = s[this.pos++];
        if (c === '\\') {
          const nxt = s[this.pos++] || '';
          switch (nxt) {
            case 'n': str += '\n'; break;
            case 'r': str += '\r'; break;
            case 't': str += '\t'; break;
            case '\\': str += '\\'; break;
            case '"': str += '"'; break;
            case "'": str += "'"; break;
            default: str += nxt; break;
          }
        } else if (c === quote) {
          break;
        } else {
          str += c;
        }
      }
      return { kind: TKind.STR, value: str };
    }
    if (/\d/.test(ch)) {
      const start = this.pos;
      let hasLetter = false;
      while (this.pos < s.length && /[A-Za-z0-9_]/.test(s[this.pos])) {
        if (/[A-Za-z_]/.test(s[this.pos])) hasLetter = true;
        this.pos++;
      }
      const lexeme = s.slice(start, this.pos);
      return hasLetter
        ? { kind: TKind.IDENT, value: lexeme }
        : { kind: TKind.NUM, value: lexeme };
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = this.pos;
      while (this.pos < s.length && /[A-Za-z0-9_]/.test(s[this.pos]))
        this.pos++;
      const lexeme = s.slice(start, this.pos);
      if ((lexeme === 'AND' || lexeme === 'OR') && s[this.pos] !== '(') {
        return { kind: TKind.OP, value: lexeme };
      }
      return { kind: TKind.IDENT, value: lexeme };
    }
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
      if (ch === '>' || ch === '<' || ch === '=') {
        this.pos++;
        return { kind: TKind.OP, value: ch };
      }
      throw new FormulaError(`Illegal character '${ch}' at ${this.pos}`);
    }
    this.pos++;
    switch (ch) {
      case '{': return { kind: TKind.LBRACE };
      case '}': return { kind: TKind.RBRACE };
      case '(': return { kind: TKind.LPAREN };
      case ')': return { kind: TKind.RPAREN };
      case ',': return { kind: TKind.COMMA };
      default:
        if (OPS.has(ch)) return { kind: TKind.OP, value: ch };
        break;
    }
    throw new FormulaError(`Illegal character '${ch}' at ${this.pos - 1}`);
  }
}

abstract class Node {
  abstract evaluate(): unknown;
}
class NumberNode extends Node {
  private readonly n: number;
  constructor(n: number) { super(); this.n = n; }
  evaluate() { return this.n; }
}
class ColumnNode extends Node {
  private readonly id: string;
  private readonly row: Record<string, unknown>;
  constructor(id: string, row: Record<string, unknown>) {
    super();
    this.id = id;
    this.row = row;
  }
  evaluate() {
    if (!Object.prototype.hasOwnProperty.call(this.row, this.id)) {
      throw new FormulaError(`Unknown column '${this.id}'`);
    }
    return this.row[this.id];
  }
}
class BinaryNode extends Node {
  private readonly op: string;
  private readonly left: Node;
  private readonly right: Node;
  constructor(op: string, left: Node, right: Node) {
    super();
    this.op = op;
    this.left = left;
    this.right = right;
  }
  evaluate() {
    const l = Number(this.left.evaluate()) || 0;
    const r = Number(this.right.evaluate()) || 0;
    switch (this.op) {
      case '+': return (l ?? 0) + (r ?? 0);
      case '-': return (l ?? 0) - (r ?? 0);
      case '*': return (l ?? 0) * (r ?? 0);
      case '/': return (l ?? 0) / (r ?? 0);
      case '^': return Math.pow(l ?? 0, r ?? 0);
      case '>': return l > r;
      case '>=': return l >= r;
      case '<': return l < r;
      case '<=': return l <= r;
      case '!=': return l !== r;
      case '=': return l === r;
      case 'AND': return Boolean(l) && Boolean(r);
      case 'OR': return Boolean(l) || Boolean(r);
      default: throw new FormulaError(`Unknown operator '${this.op}'`);
    }
  }
}
class FuncCallNode extends Node {
  private readonly fnName: string;
  private readonly args: Node[];
  private readonly registry: FunctionRegistry;
  constructor(fnName: string, args: Node[], registry: FunctionRegistry) {
    super();
    this.fnName = fnName;
    this.args = args;
    this.registry = registry;
  }
  evaluate() {
    const impl = this.registry[this.fnName];
    if (!impl) throw new FormulaError(`Function ${this.fnName} not registered`);
    return impl(...this.args.map((a) => a.evaluate()));
  }
}
class StringNode extends Node {
  private readonly s: string;
  constructor(s: string) { super(); this.s = s; }
  evaluate() { return this.s; }
}
class BooleanNode extends Node {
  private readonly b: boolean;
  constructor(b: boolean) { super(); this.b = b; }
  evaluate() { return this.b; }
}
class UnaryNode extends Node {
  private readonly op: string;
  private readonly operand: Node;
  constructor(op: string, operand: Node) { super(); this.op = op; this.operand = operand; }
  evaluate() {
    const v = Number(this.operand.evaluate()) || 0;
    return this.op === '-' ? -v : v;
  }
}

type FunctionImpl = (...args: unknown[]) => unknown;
interface FunctionRegistry {
  [name: string]: FunctionImpl;
}

class Parser {
  private lexer: Lexer;
  private lookahead: Token;
  private readonly row: Record<string, unknown>;
  private readonly registry: Record<string, FunctionImpl>;

  constructor(
    src: string,
    row: Record<string, unknown>,
    _columns: ColumnRead[],
    registry: Record<string, FunctionImpl>
  ) {
    this.row = row;
    this.registry = registry;
    this.lexer = new Lexer(src);
    this.lookahead = this.lexer.next();
  }

  parse(): Node {
    const expr = this.parseExpression(0);
    if (this.lookahead.kind !== TKind.EOF) {
      throw new FormulaError(`Unexpected ${describeToken(this.lookahead)}`);
    }
    return expr;
  }

  private precedence(op: string) {
    switch (op) {
      case '^': return 4;
      case '*': case '/': return 3;
      case '+': case '-': return 2;
      default: return 0;
    }
  }

  private parseExpression(minBP: number): Node {
    let left: Node;
    if (
      this.lookahead.kind === TKind.OP &&
      (this.lookahead.value === '+' || this.lookahead.value === '-')
    ) {
      const op = this.consume(TKind.OP).value!;
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
        if (name === 'true' || name === 'false') {
          return new BooleanNode(name === 'true');
        }
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
