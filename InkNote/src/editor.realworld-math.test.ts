import { describe, expect, it, vi } from "vitest";
import { createEditor } from "./editor";

const DOC = [
  "结合阻尼孔节流特性与控制腔容腔效应，阻尼孔部分堵塞导致先导腔建压斜率变缓的物理过程分析如下：",
  "",
  "**1. 阻尼孔节流特性：液阻增大导致充油流量减小**",
  "",
  "在先导控制油路中，阻尼孔的作用类似于电路中的电阻。根据薄壁小孔或细长孔的节流流量公式 \\((Q = C_d A \\sqrt{\\frac{2\\Delta p}{\\rho}})\\) 在压差 \\(\\Delta p\\) 基本一致的情况下，流量 \\(Q\\) 与阻尼孔的有效过流面积 \\(A\\) 成正比。",
  "",
  "当油液微粒导致阻尼孔部分堵塞时，有效过流面积 \\(A\\) 急剧减小。",
  "",
  "**2. 控制腔容腔效应：容腔压缩需要时间积累**",
  "",
  "先导控制腔具有一定的封闭容积 \\(V\\)。由于油液具有可压缩性（体积弹性模量为 \\(\\beta_e\\)），且容腔本身存在弹性变形，进入容腔的油液必须先填补并压缩原有容积，才能使压力上升。根据压力变化率公式：",
  "",
  "\\[",
  "\\frac{dp}{dt} = \\frac{\\beta_e}{V} \\cdot Q_{in}",
  "\\]",
  "",
  "（其中 \\(dp/dt\\) 即为建压斜率）。",
  "",
  "**3. 综合物理过程：大容腔遇小流量导致斜率变缓**",
  "",
  "在故障状态下，由于阻尼孔部分堵塞，充入先导控制腔的流量 \\(Q_{in}\\) 显著减小（进得慢）。",
].join("\n");

function mount(markdown: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const handle = createEditor(parent, markdown, {
    mode: "preview",
    filePath: null,
    typewriter: false,
    lineNumbers: false,
    wordWrap: true,
    tabSize: 2,
    spellCheck: false,
    readOnly: false,
    onChange: vi.fn(),
    onModeChange: vi.fn(),
  });
  return { parent, handle };
}

describe("用户实际文档（LaTeX 定界符）", () => {
  /**
   * 只取「肉眼可见」的文本：剔除 KaTeX 的 MathML 注记（annotate 里保留着原始 TeX）
   * 和块级组件的隐藏源码区（display:none 的 .md-block-source）。
   */
  function visibleText(root: HTMLElement): string {
    const clone = root.cloneNode(true) as HTMLElement;
    for (const el of Array.from(clone.querySelectorAll(".katex, .md-block-source"))) {
      el.remove();
    }
    return clone.textContent ?? "";
  }

  it("全部行内公式与行间公式都渲染成 KaTeX", () => {
    const { parent, handle } = mount(DOC);

    const inlines = parent.querySelectorAll(".md-math-inline");
    // \( Q \) \Delta p\ \( Q \) \( A \) \( A \) \( V \) \( \beta_e \) \( dp/dt \) \( Q_{in} \)
    expect(inlines.length).toBeGreaterThanOrEqual(9);
    for (const el of Array.from(inlines)) {
      expect(el.querySelector(".katex")).not.toBeNull();
    }

    const block = parent.querySelector<HTMLElement>(".md-math-block");
    expect(block).not.toBeNull();
    expect(block?.querySelector(".katex")).not.toBeNull();

    // 可见正文里不能再残留裸定界符或生 LaTeX
    const text = visibleText(parent);
    expect(text).not.toContain("\\(");
    expect(text).not.toContain("\\)");
    expect(text).not.toContain("\\[");
    expect(text).not.toContain("\\]");
    expect(text).not.toContain("\\frac");
    expect(text).not.toContain("\\Delta");
    expect(text).not.toContain("$$");

    // 源码保持不变（预览不应改写文档）
    expect(handle.view.state.doc.toString()).toBe(DOC);
    handle.destroy();
  });
});
