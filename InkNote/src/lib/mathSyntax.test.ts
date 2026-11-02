import { describe, expect, it } from "vitest";
import {
  findCodeRanges,
  makeCodePredicate,
  normalizeMathDelimiters,
  scanMathText,
} from "./mathSyntax";

/** 与导出链路一致：先排除代码区间再扫描 */
const texs = (md: string) =>
  scanMathText(md, makeCodePredicate(findCodeRanges(md))).map(
    ({ tex, block, open }) => ({ tex, block, open }),
  );

describe("scanMathText", () => {
  it("识别 LaTeX 原生的行内与行间定界符", () => {
    expect(texs("流量 \\(Q = C_d A \\sqrt{2\\Delta p/\\rho}\\) 成正比")).toEqual([
      { tex: "Q = C_d A \\sqrt{2\\Delta p/\\rho}", block: false, open: "\\(" },
    ]);

    expect(texs("公式如下：\n\n\\[\n\\frac{dp}{dt} = A\n\\]\n\n后续")).toEqual([
      { tex: "\\frac{dp}{dt} = A", block: true, open: "\\[" },
    ]);
  });

  it("\\[...\\] 即使写在段落中间也算行间公式", () => {
    // 语法上仍是块级，调用方按位置决定能否用块组件
    expect(texs("前文 \\[a+b\\] 后文")).toEqual([
      { tex: "a+b", block: true, open: "\\[" },
    ]);
  });

  it("美元写法保持原有行为", () => {
    expect(texs("行内 $x+1$ 与\n\n$$\ny=2\n$$\n")).toEqual([
      { tex: "x+1", block: false, open: "$" },
      { tex: "y=2", block: true, open: "$$" },
    ]);
  });

  it("不把转义反斜杠和代码区间当成公式", () => {
    expect(texs("转义 \\\\( 不是公式")).toEqual([]);
    expect(texs("`\\(a\\)` 在行内代码里")).toEqual([]);
    expect(texs("```\n\\[x\\]\n```")).toEqual([]);
  });

  it("未闭合的定界符不会吞掉后文", () => {
    expect(texs("这里只有一个 \\( 开括号")).toEqual([]);
  });

  it("把 \\[1\\] 这类 Markdown 转义方括号放过去", () => {
    expect(texs("参考文献 \\[1\\] 与 \\[2\\]")).toEqual([]);
  });
});

describe("normalizeMathDelimiters", () => {
  it("把 LaTeX 定界符改写成 remark-math 认识的美元定界符", () => {
    const md = "压强 \\(p\\) 与\n\n\\[\n\\frac{dp}{dt}\n\\]\n";
    expect(normalizeMathDelimiters(md)).toBe(
      "压强 $p$ 与\n\n$$\n\\frac{dp}{dt}\n$$\n",
    );
  });

  it("美元写法原样返回，代码块内容不被改写", () => {
    const md = "已经 $x$ 好了\n\n```\n\\(y\\)\n```\n";
    expect(normalizeMathDelimiters(md)).toBe(md);
  });
});
