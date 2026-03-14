import React from 'react';

export type TokType = 'kw' | 'builtin' | 'str' | 'num' | 'comment' | 'op' | 'fn' | 'punct' | 'text' | 'ws';

export interface Token { t: TokType; v: string; }

export const TOK_COLOR: Record<TokType, string> = {
  kw:      '#c792ea',
  builtin: '#82aaff',
  str:     '#c3e88d',
  num:     '#f78c6c',
  comment: '#546e7a',
  op:      '#89ddff',
  fn:      '#82aaff',
  punct:   '#7a8fad',
  text:    '#eeffff',
  ws:      'inherit',
};

const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',
]);

const BUILTINS = new Set([
  'print', 'input', 'len', 'range', 'int', 'str', 'float', 'list',
  'dict', 'set', 'tuple', 'bool', 'type', 'abs', 'round', 'sum',
  'min', 'max', 'enumerate', 'zip', 'map', 'filter', 'sorted',
  'reversed', 'all', 'any', 'open', 'format', 'repr', 'chr', 'ord',
  'hash',
]);

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    // Whitespace
    if (src[i] === ' ' || src[i] === '\t') {
      let j = i;
      while (j < len && (src[j] === ' ' || src[j] === '\t')) j++;
      tokens.push({ t: 'ws', v: src.slice(i, j) });
      i = j;
      continue;
    }

    // Comment
    if (src[i] === '#') {
      tokens.push({ t: 'comment', v: src.slice(i) });
      i = len;
      continue;
    }

    // Triple-quoted strings (must check before single-char strings)
    if (
      (src[i] === '"' || src[i] === "'") &&
      src[i + 1] === src[i] &&
      src[i + 2] === src[i]
    ) {
      const quote = src[i].repeat(3);
      let j = i + 3;
      while (j < len) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src.slice(j, j + 3) === quote) { j += 3; break; }
        j++;
      }
      tokens.push({ t: 'str', v: src.slice(i, j) });
      i = j;
      continue;
    }

    // f-string prefix
    if (
      (src[i] === 'f' || src[i] === 'F') &&
      (src[i + 1] === '"' || src[i + 1] === "'")
    ) {
      const q = src[i + 1];
      let j = i + 2;
      while (j < len) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      tokens.push({ t: 'str', v: src.slice(i, j) });
      i = j;
      continue;
    }

    // Single/double quoted strings
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      let j = i + 1;
      while (j < len) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      tokens.push({ t: 'str', v: src.slice(i, j) });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      // hex
      if (src[i] === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        j += 2;
        while (j < len && /[0-9a-fA-F_]/.test(src[j])) j++;
      } else {
        while (j < len && /[0-9_]/.test(src[j])) j++;
        if (j < len && src[j] === '.') {
          j++;
          while (j < len && /[0-9_]/.test(src[j])) j++;
        }
        if (j < len && (src[j] === 'e' || src[j] === 'E')) {
          j++;
          if (j < len && (src[j] === '+' || src[j] === '-')) j++;
          while (j < len && /[0-9_]/.test(src[j])) j++;
        }
        if (j < len && (src[j] === 'j' || src[j] === 'J')) j++;
      }
      tokens.push({ t: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }

    // Identifiers (keywords, builtins, function names, plain text)
    if (/[a-zA-Z_]/.test(src[i])) {
      let j = i;
      while (j < len && /[\w]/.test(src[j])) j++;
      const word = src.slice(i, j);

      // Skip whitespace to see if followed by '('
      let k = j;
      while (k < len && (src[k] === ' ' || src[k] === '\t')) k++;
      const isFunctionCall = src[k] === '(';

      if (KEYWORDS.has(word)) {
        tokens.push({ t: 'kw', v: word });
      } else if (BUILTINS.has(word) && isFunctionCall) {
        tokens.push({ t: 'builtin', v: word });
      } else if (isFunctionCall) {
        tokens.push({ t: 'fn', v: word });
      } else {
        tokens.push({ t: 'text', v: word });
      }
      i = j;
      continue;
    }

    // Operators (multi-char first)
    const twoChar = src.slice(i, i + 2);
    if (['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '//=', '%=', '**=', '->', '<<', '>>'].includes(twoChar)) {
      // Check three-char ops
      const threeChar = src.slice(i, i + 3);
      if (['//=', '**=', '>>=', '<<='].includes(threeChar)) {
        tokens.push({ t: 'op', v: threeChar });
        i += 3;
      } else {
        tokens.push({ t: 'op', v: twoChar });
        i += 2;
      }
      continue;
    }

    if ('+-*/%=<>&|^~@'.includes(src[i])) {
      tokens.push({ t: 'op', v: src[i] });
      i++;
      continue;
    }

    // Punctuation
    if ('()[]{}:.,;'.includes(src[i])) {
      tokens.push({ t: 'punct', v: src[i] });
      i++;
      continue;
    }

    // Anything else
    tokens.push({ t: 'text', v: src[i] });
    i++;
  }

  return tokens;
}

export function SyntaxLine({ code }: { code: string }): React.ReactElement {
  const tokens = tokenize(code);
  return React.createElement(
    'span',
    null,
    ...tokens.map((tok, idx) =>
      React.createElement(
        'span',
        {
          key: idx,
          style: { color: TOK_COLOR[tok.t] },
        },
        tok.v,
      )
    )
  );
}
