import { WidgetType } from "@codemirror/view";
import katex from "katex";
import { bindBlockBoundaryCursor, bindBlockClickEdit, stampBlockRange } from "./blockRange";
import {
  attachSourceEditing,
  beginSourceEditing,
  clickedOnBlockPadding,
  makePlainTextEditable,
} from "./editableSource";
import { getLocale, t } from "../../lib/i18n";
import { scanMathText, type MathRange } from "../../lib/mathSyntax";

export type { MathRange };

function renderMath(target: HTMLElement, tex: string, display: boolean) {
  try {
    // render() 会在部分 WebView / 测试文档被判定为 quirks mode 时直接拒绝渲染；
    // renderToString() 不依赖宿主文档模式，生成的结果与标准页面一致。
    target.innerHTML = katex.renderToString(tex, {
      throwOnError: false,
      displayMode: display,
    });
  } catch {
    target.textContent = display ? `$$${tex}$$` : `$${tex}$`;
  }
  if (!tex.trim()) {
    target.textContent = display ? t(getLocale(), "editor.math.empty") : "$$";
    target.classList.add("md-math-empty");
  } else {
    target.classList.remove("md-math-empty");
  }
}

/** 行内公式：与其它行内标记一致，点击露出源码 */
export class InlineMathWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly tex: string,
  ) {
    super();
  }

  eq(other: InlineMathWidget) {
    return other.to - other.from === this.to - this.from && other.tex === this.tex;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "md-math-inline";
    bindBlockClickEdit(span, this.from, this.to);
    renderMath(span, this.tex, false);
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

/** 块级公式：点击即在组件内改 LaTeX，右侧实时预览 */
export class BlockMathWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly tex: string,
    /** 原文定界符，回写时保持用户原本的写法（`$$` 或 `\[`） */
    readonly open: string = "$$",
    readonly close: string = "$$",
    /** 源码里定界符是否各占一行；单行 `\[ x \]` 编辑后仍应是单行 */
    readonly multiline: boolean = true,
  ) {
    super();
  }

  eq(other: BlockMathWidget) {
    return other.to - other.from === this.to - this.from &&
      other.tex === this.tex &&
      other.open === this.open &&
      other.close === this.close &&
      other.multiline === this.multiline;
  }

  private toMarkdown(text: string): string {
    const body = text.trim();
    return this.multiline
      ? `${this.open}\n${body}\n${this.close}`
      : `${this.open}${body}${this.close}`;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "md-math-block";
    stampBlockRange(wrap, this.from, this.to);

    const source = document.createElement("div");
    source.className = "md-block-source";
    makePlainTextEditable(source);
    source.textContent = this.tex;

    const render = document.createElement("div");
    render.className = "md-math-render";
    renderMath(render, this.tex, true);

    wrap.appendChild(source);
    wrap.appendChild(render);
    bindBlockBoundaryCursor(wrap, render);

    attachSourceEditing(wrap, {
      source: () => source,
      toMarkdown: (text) => this.toMarkdown(text),
      onInput: (text) => renderMath(render, text, true),
      indentOnTab: false,
    });

    wrap.addEventListener("mousedown", (event) => {
      const target = event.target as HTMLElement;
      if (target === wrap) return; // 外层留白交给编辑器定位光标
      if (source.contains(target) || target === source) return;
      event.preventDefault();
      beginSourceEditing(wrap, source);
    });

    return wrap;
  }

  updateDOM(dom: HTMLElement) {
    const source = dom.querySelector<HTMLElement>(".md-block-source");
    const render = dom.querySelector<HTMLElement>(".md-math-render");
    if (!source || !render) return false;

    stampBlockRange(dom, this.from, this.to);
    if (document.activeElement !== source) {
      if ((source.textContent ?? "") !== this.tex) source.textContent = this.tex;
      renderMath(render, this.tex, true);
    }
    return true;
  }

  ignoreEvent(event: Event) {
    return !clickedOnBlockPadding(event, "md-math-block");
  }
}

interface MathDoc {
  length: number;
  sliceString: (f: number, t: number) => string;
  lineAt: (p: number) => { from: number; to: number; number: number };
  lines: number;
}

/**
 * 扫描文档中的数学公式区间（排除代码块内）。
 *
 * 支持 `$...$` / `$$...$$` 与 LaTeX 原生的 `\(...\)` / `\[...\]`，具体规则见
 * `lib/mathSyntax.ts`。后者在 CommonMark 里会被当成转义符，必须在这里先认出来。
 */
export function scanMath(
  doc: MathDoc,
  inCode: (from: number, to: number) => boolean,
  sourceText?: string,
): MathRange[] {
  const text = sourceText ?? doc.sliceString(0, doc.length);
  return scanMathText(text, inCode);
}
