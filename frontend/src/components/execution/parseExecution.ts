export type LineCategory =
  | 'assign' | 'augmented' | 'print' | 'input-assign'
  | 'if' | 'elif' | 'else' | 'for' | 'while' | 'def'
  | 'return' | 'import' | 'comment' | 'blank' | 'other';

export interface ParsedLine {
  n: number;
  raw: string;
  stripped: string;
  indent: number;
  category: LineCategory;
  variable?: string;
  valueExpr?: string;
  prompt?: string;
  printArgs?: string;
}

// Extract the content inside the outermost balanced parentheses starting at `src[start]`.
// `start` should be the index of '(' in src.
function extractParenContent(src: string, start: number): string {
  let depth = 0;
  let i = start;
  let begin = -1;
  while (i < src.length) {
    if (src[i] === '(') {
      depth++;
      if (depth === 1) begin = i + 1;
    } else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(begin, i);
    }
    i++;
  }
  // Unbalanced — return everything after the opening paren
  return begin >= 0 ? src.slice(begin) : '';
}

// Extract the prompt string from an input() call argument.
// e.g.  input("Enter x: ")  ->  "Enter x: "
function extractInputPrompt(inputArgs: string): string {
  const t = inputArgs.trim();
  // match single or double quoted string
  const m = t.match(/^(['"])(.*)\1$/s);
  if (m) return m[2];
  return t;
}

export function parseCodeLines(code: string): ParsedLine[] {
  const rawLines = code.split('\n');
  return rawLines.map((raw, idx): ParsedLine => {
    const n = idx + 1;
    const stripped = raw.trim();
    const indent = raw.length - raw.trimStart().length;

    // Blank
    if (stripped === '') {
      return { n, raw, stripped, indent, category: 'blank' };
    }

    // Comment
    if (stripped.startsWith('#')) {
      return { n, raw, stripped, indent, category: 'comment' };
    }

    // import
    if (/^import\s/.test(stripped) || /^from\s+\S+\s+import\s/.test(stripped)) {
      return { n, raw, stripped, indent, category: 'import' };
    }

    // def
    if (/^def\s+\w+\s*\(/.test(stripped)) {
      return { n, raw, stripped, indent, category: 'def' };
    }

    // return
    if (/^return(\s|$)/.test(stripped)) {
      return { n, raw, stripped, indent, category: 'return' };
    }

    // if
    if (/^if\s+.+:$/.test(stripped)) {
      return { n, raw, stripped, indent, category: 'if' };
    }

    // elif
    if (/^elif\s+.+:$/.test(stripped)) {
      return { n, raw, stripped, indent, category: 'elif' };
    }

    // else
    if (/^else\s*:$/.test(stripped)) {
      return { n, raw, stripped, indent, category: 'else' };
    }

    // for
    if (/^for\s+.+:$/.test(stripped)) {
      return { n, raw, stripped, indent, category: 'for' };
    }

    // while
    if (/^while\s+.+:$/.test(stripped)) {
      return { n, raw, stripped, indent, category: 'while' };
    }

    // print(...)
    if (/^print\s*\(/.test(stripped)) {
      const parenIdx = stripped.indexOf('(');
      const printArgs = extractParenContent(stripped, parenIdx);
      return { n, raw, stripped, indent, category: 'print', printArgs };
    }

    // input-assign: varname = input(...)
    // Also handle type-cast: varname = int(input(...))
    const inputAssignMatch = stripped.match(/^(\w+)\s*=\s*(?:\w+\s*\(\s*)?input\s*\(/);
    if (inputAssignMatch) {
      const variable = inputAssignMatch[1];
      // Find the input( position
      const inputPos = stripped.indexOf('input(');
      const parenStart = inputPos + 'input'.length; // index of '('
      const inputArgs = extractParenContent(stripped, parenStart);
      const prompt = extractInputPrompt(inputArgs);
      return { n, raw, stripped, indent, category: 'input-assign', variable, prompt };
    }

    // augmented assign: x += ..., x -= ..., etc.
    const augMatch = stripped.match(/^(\w+)\s*(\+=|-=|\*=|\/=|\/\/=|%=|\*\*=|&=|\|=|\^=|>>=|<<=)\s*(.+)$/);
    if (augMatch) {
      const variable = augMatch[1];
      const valueExpr = augMatch[3];
      return { n, raw, stripped, indent, category: 'augmented', variable, valueExpr };
    }

    // regular assign: x = ...  (not ==)
    const assignMatch = stripped.match(/^(\w+)\s*=\s*(?!=)(.+)$/);
    if (assignMatch) {
      const variable = assignMatch[1];
      const valueExpr = assignMatch[2].trim();
      return { n, raw, stripped, indent, category: 'assign', variable, valueExpr };
    }

    return { n, raw, stripped, indent, category: 'other' };
  });
}

export function getActiveLines(lines: ParsedLine[]): ParsedLine[] {
  return lines.filter((l) => l.category !== 'blank' && l.category !== 'comment');
}
