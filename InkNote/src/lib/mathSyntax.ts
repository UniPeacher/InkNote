/**
 * 数学公式定界符扫描（纯文本版）。
 *
 * 同时支持两套写法：
 * - `$...$` / `$$...$$`：Markdown 生态的通用写法，也是 InkNote 插入公式时默认写的；
 * - `\(...\)` / `\[...\]`：LaTeX 原生写法，AI 生成或从论文 / 公式编辑器粘贴过来的
 *   文档里极常见。
 *
 * 第二套在 CommonMark 里会被当成「反斜杠转义」处理（`\(` 只显示 `(`），
 * 所以必须在解析之前就识别出来，否则用户只会看到一串生 LaTeX 源码。
 */

export interface MathRange {
  from: number;
  to: number;
  tex: string;
  block: boolean;
  /** 原文的开定界符，用于回写时保持用户原本的写法 */
  open: string;
  /** 原文的闭定界符 */
  close: string;
}

export const DOLLAR_INLINE = "inline-dollar";
export const DOLLAR_BLOCK = "block-dollar";
export const PAREN_INLINE = "inline-paren";
export const BRACKET_BLOCK = "block-bracket";

function isSpace(ch: string | undefined): boolean {
  return ch === undefined || ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

/**
 * `\[...\]` 是否真的是行间公式。
 *
 * `\[1\]`、`\[12\]` 这类写法在 Markdown 里常被当作「转义方括号」使用，本意是
 * 显示 `[1]`，不能当成公式渲染。只有纯数字 / 纯标点才排除；其余一律按 LaTeX
 * 行间公式处理（`\[a+b\]`、`\[x\]` 都是合法且常见的写法）。
 */
function isBracketMath(content: string): boolean {
  const body = content.trim();
  if (!body) return false;
  // 纯数字 / 纯标点 —— 引用编号的典型形态
  return !/^[\d\s.,;:!?()\-]+$/.test(body);
}

/** 区间是否恰好占满整行（决定能否用块级装饰 / 块级公式） */
export function occupiesWholeLines(text: string, from: number, to: number): boolean {
  const startsLine = from === 0 || text[from - 1] === "\n";
  const endsLine = to >= text.length || text[to] === "\n";
  return startsLine && endsLine;
}

/**
 * 从 `start` 开始找闭定界符。
 *
 * 反斜杠开头的定界符（`\)`、`\]`）本身就是转义形式，命中即可；
 * `$` 类定界符则要跳过 `\$`，避免把转义掉的钱符号当结尾。
 */
function findClose(text: string, start: number, closeSeq: string): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === "\\") {
      if (closeSeq[0] === "\\") {
        if (text.startsWith(closeSeq, i)) return i;
      }
      i += 2;
      continue;
    }
    if (closeSeq[0] !== "\\" && text.startsWith(closeSeq, i)) return i;
    i++;
  }
  return -1;
}

/**
 * 扫描文档中的数学公式区间。
 *
 * 行内 `$...$` 采用与 Typora 一致的保守规则，避免把金额当成公式：
 * 开定界符后必须紧跟非空白、闭定界符前必须是非空白、闭定界符后不能紧跟数字。
 * 例如 `价格 $5 到 $10 元` 不会被识别为公式。
 *
 * `inCode(from, to)` 用于排除代码区间，位置是相对整段文本的绝对偏移。
 */
export function scanMathText(
  text: string,
  inCode: (from: number, to: number) => boolean = () => false,
): MathRange[] {
  const results: MathRange[] = [];
  /**
   * `block` 为 undefined 时按「是否独占整行」推断（`$$` 的既有行为）；
   * LaTeX 原生定界符则直接由写法决定：`\[...\]` 是行间公式，`\(...\)` 是行内。
   */
  const push = (
    from: number,
    to: number,
    inner: string,
    open: string,
    close: string,
    block?: boolean,
  ) => {
    if (inCode(from, to)) return;
    results.push({
      from,
      to,
      tex: inner.trim(),
      block: block ?? occupiesWholeLines(text, from, to),
      open,
      close,
    });
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\") {
      const next = text[i + 1];

      // LaTeX 行内写法 \( ... \)
      if (next === "(") {
        const close = findClose(text, i + 2, "\\)");
        if (close >= 0) {
          push(i, close + 2, text.slice(i + 2, close), "\\(", "\\)", false);
          i = close + 2;
          continue;
        }
        i += 2;
        continue;
      }

      // LaTeX 块级写法 \[ ... \]
      if (next === "[") {
        const close = findClose(text, i + 2, "\\]");
        if (close >= 0) {
          const inner = text.slice(i + 2, close);
          // `\[1\]` 这类 Markdown 转义方括号要放过去，只隐藏反斜杠
          if (isBracketMath(inner)) {
            push(i, close + 2, inner, "\\[", "\\]", true);
            i = close + 2;
            continue;
          }
        }
        i += 2;
        continue;
      }

      i += 2; // 跳过转义（含 \$、\\）
      continue;
    }

    if (ch !== "$") {
      i++;
      continue;
    }

    // 块级 $$...$$
    if (text[i + 1] === "$") {
      const close = findClose(text, i + 2, "$$");
      if (close < 0) {
        i += 2;
        continue;
      }
      push(i, close + 2, text.slice(i + 2, close), "$$", "$$");
      i = close + 2;
      continue;
    }

    // 行内 $...$
    if (isSpace(text[i + 1]) || text[i + 1] === undefined) {
      i++;
      continue;
    }

    let j = i + 1;
    let close = -1;
    while (j < text.length) {
      const c = text[j];
      if (c === "\n") break;
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "$") {
        if (!isSpace(text[j - 1]) && !isDigit(text[j + 1])) close = j;
        break;
      }
      j++;
    }

    if (close < 0) {
      i++;
      continue;
    }

    push(i, close + 1, text.slice(i + 1, close), "$", "$");
    i = close + 1;
  }

  return results;
}

/** 代码区间（围栏代码块 + 行内代码），用于纯文本扫描时排除公式 */
export function findCodeRanges(text: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];

  // 围栏代码块
  let fence: { char: string; len: number; from: number } | null = null;
  let cursor = 0;
  while (cursor <= text.length) {
    const lineEnd = text.indexOf("\n", cursor);
    const end = lineEnd < 0 ? text.length : lineEnd;
    const line = text.slice(cursor, end);
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence.char && m[1].length >= fence.len) {
        ranges.push({ from: fence.from, to: end });
        fence = null;
      }
    } else if (m) {
      fence = { char: m[1][0], len: m[1].length, from: cursor };
    }
    if (lineEnd < 0) break;
    cursor = lineEnd + 1;
  }
  if (fence) ranges.push({ from: fence.from, to: text.length });

  const inFence = (pos: number) =>
    ranges.find((range) => pos >= range.from && pos < range.to);

  // 行内代码（跳过围栏区间）
  let i = 0;
  while (i < text.length) {
    const fenceRange = inFence(i);
    if (fenceRange) {
      i = fenceRange.to;
      continue;
    }
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let run = 1;
    while (text[i + run] === "`") run++;
    let j = i + run;
    let close = -1;
    while (j < text.length) {
      const f = inFence(j);
      if (f) {
        j = f.to;
        continue;
      }
      if (text[j] === "`") {
        let r2 = 1;
        while (text[j + r2] === "`") r2++;
        if (r2 === run) {
          close = j;
          break;
        }
        j += r2;
        continue;
      }
      j++;
    }
    if (close < 0) {
      i = i + run;
      continue;
    }
    ranges.push({ from: i, to: close + run });
    i = close + run;
  }

  return ranges.sort((a, b) => a.from - b.from);
}

/** 由区间表生成 `inCode(from, to)` 判定 */
export function makeCodePredicate(
  ranges: Array<{ from: number; to: number }>,
): (from: number, to: number) => boolean {
  return (from, to) => ranges.some((range) => from < range.to && to > range.from);
}

/**
 * 把 LaTeX 原生定界符改写为 remark-math / rehype-katex 认识的 `$` / `$$`。
 *
 * 导出与「复制为 HTML」走的是 unified 管线，只认美元符号；不改写的话，
 * 正文里的 `\(...\)` 会被 CommonMark 当成转义符吃掉反斜杠，变成裸的 `( ... )`。
 */
export function normalizeMathDelimiters(md: string): string {
  const math = scanMathText(md, makeCodePredicate(findCodeRanges(md)));
  const latexOnly = math.filter((range) => range.open.startsWith("\\"));
  if (!latexOnly.length) return md;

  let out = md;
  for (let index = latexOnly.length - 1; index >= 0; index--) {
    const range = latexOnly[index];
    const replacement = range.block ? `$$\n${range.tex}\n$$` : `$${range.tex}$`;
    out = out.slice(0, range.from) + replacement + out.slice(range.to);
  }
  return out;
}
