import { describe, expect, it } from "vitest";
import { markdownToBodyHtml, markdownToHtml } from "./export";

describe("markdownToBodyHtml", () => {
  it("保留允许的排版标签并移除可执行 HTML", async () => {
    const html = await markdownToBodyHtml(
      '<u onclick="alert(1)">下划线</u> ==高亮== <script>alert(2)</script> [危险](javascript:alert(3))',
    );

    expect(html).toContain("<u>下划线</u>");
    expect(html).toContain("<mark>高亮</mark>");
    expect(html).not.toMatch(/onclick|<script|javascript:/i);
  });

  it("exports the selected Markdown theme in both color modes", async () => {
    const light = await markdownToHtml("# Vue", "light", "zh", null, false, "vue");
    const dark = await markdownToHtml("# Minimal", "dark", "zh", null, false, "minimal");

    expect(light).toContain("--doc-panel:#f3f5f7");
    expect(light).toContain("--doc-accent:#42b883");
    expect(dark).toContain("--doc-panel:#242727");
    expect(dark).toContain("--doc-accent:#9aacaa");
  });

  it("uses the document name and includes portable code/task styles", async () => {
    const html = await markdownToHtml("- [x] done\n\n```ts\nconst n = 1\n```", "light", "en", "D:\\notes\\guide.md");

    expect(html).toContain("<title>guide.md</title>");
    expect(html).toContain(".hljs-keyword");
    expect(html).toContain(".task-list-item");
  });

  it("embeds a pending image even before the document has a disk path", async () => {
    const dataUrl = "data:image/png;base64,cGVuZGluZw==";
    const html = await markdownToHtml(
      "![pending](.inknote-assets/pending.png)",
      "light",
      "zh",
      null,
      true,
      "github",
      new Map([[".inknote-assets/pending.png", dataUrl]]),
    );

    expect(html).toContain(`src="${dataUrl}"`);
  });

  it("renders LaTeX-native \\(...\\) and \\[...\\] delimiters as KaTeX", async () => {
    const html = await markdownToBodyHtml(
      "压差 \\(\\Delta p\\) 决定了\n\n\\[\n\\frac{dp}{dt} = k\n\\]\n",
    );

    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
    // 定界符不能被当成转义吃掉：正文里不该出现裸的 `\(` 或生 LaTeX 段落
    expect(html).not.toContain("<p>压差 (");
    expect(html).not.toContain("<p>\\[");
  });
});
