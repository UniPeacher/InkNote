import { afterEach, describe, expect, it } from "vitest";
import { UTF8_TEXT_ENCODING } from "../lib/textEncoding";
import { useTabsStore } from "./useTabsStore";

function resetStore() {
  const state = useTabsStore.getState();
  state.tabs.forEach((tab) => state.closeTab(tab.id));
}

afterEach(resetStore);

describe("document restoration", () => {
  it("restores the previous editor mode", () => {
    useTabsStore.getState().restoreTab({
      path: null,
      content: "sample",
      diskContent: "sample",
      dirty: false,
      mode: "source",
      encoding: UTF8_TEXT_ENCODING,
      external: false,
      sample: false,
      editable: true,
      welcome: false,
    });

    expect(useTabsStore.getState().getActive()?.mode).toBe("source");
  });

  it("can accept preview-only interactions without becoming dirty", () => {
    const state = useTabsStore.getState();
    const id = state.newTab("- [ ] Task");
    state.markSaved(id, undefined, "- [ ] Task");
    state.updateContent(id, "- [x] Task");
    state.markSaved(id, undefined, "- [x] Task");

    expect(useTabsStore.getState().getActive()?.dirty).toBe(false);
  });
});

describe("document identity", () => {
  it("starts a new editor history when another file is opened", () => {
    const initialId = useTabsStore.getState().activeId;

    const openedId = useTabsStore.getState().openTab("B.md", "content B");

    expect(openedId).not.toBe(initialId);
    expect(useTabsStore.getState().getActive()).toMatchObject({
      id: openedId,
      path: "B.md",
      content: "content B",
      dirty: false,
    });
  });

  it("keeps the same editor history for edits and saves within one document", () => {
    const id = useTabsStore.getState().openTab("A.md", "before");

    useTabsStore.getState().updateContent(id, "after");
    useTabsStore.getState().markSaved(id, "A.md", "after");

    expect(useTabsStore.getState().activeId).toBe(id);
    expect(useTabsStore.getState().getActive()).toMatchObject({
      content: "after",
      diskContent: "after",
      dirty: false,
    });
  });

  it("starts a new editor history when a document is restored", () => {
    const initialId = useTabsStore.getState().activeId;

    useTabsStore.getState().restoreTab({
      path: "restored.md",
      content: "restored",
      diskContent: "saved",
      dirty: true,
      mode: "source",
      encoding: UTF8_TEXT_ENCODING,
      external: false,
      sample: false,
      editable: true,
      welcome: false,
    });

    expect(useTabsStore.getState().activeId).not.toBe(initialId);
    expect(useTabsStore.getState().getActive()).toMatchObject({
      path: "restored.md",
      content: "restored",
      diskContent: "saved",
      dirty: true,
      mode: "source",
    });
  });

  it("starts a new editor history when disk content replaces the document", () => {
    const id = useTabsStore.getState().openTab("A.md", "old", { name: "GBK", bom: false });

    useTabsStore.getState().loadFromDisk(id, "A.md", "new", { name: "UTF-16LE", bom: true });

    expect(useTabsStore.getState().activeId).not.toBe(id);
    expect(useTabsStore.getState().getActive()).toMatchObject({
      path: "A.md",
      content: "new",
      diskContent: "new",
      dirty: false,
      encoding: { name: "UTF-16LE", bom: true },
    });
  });
});

describe("multi-tab behavior", () => {
  it("opens files as separate tabs and activates the newest", () => {
    const state = useTabsStore.getState();
    const firstId = state.openTab("A.md", "content A");
    const secondId = state.openTab("B.md", "content B");

    // store 初始自带一个空白标签
    expect(useTabsStore.getState().tabs.map((t) => t.path)).toEqual([null, "A.md", "B.md"]);
    expect(useTabsStore.getState().activeId).toBe(secondId);

    state.setActive(firstId);
    expect(useTabsStore.getState().getActive()?.path).toBe("A.md");
  });

  it("reuses an existing tab for the same path", () => {
    const state = useTabsStore.getState();
    const firstId = state.openTab("A.md", "old");
    state.newTab();
    const reopenedId = state.openTab("A.md", "fresh from disk");

    expect(reopenedId).toBe(firstId);
    expect(useTabsStore.getState().getActive()).toMatchObject({
      id: firstId,
      path: "A.md",
      content: "fresh from disk",
      dirty: false,
    });
  });

  it("never overwrites unsaved edits when reopening the same path", () => {
    const state = useTabsStore.getState();
    const id = state.openTab("A.md", "saved");
    state.updateContent(id, "local edits not saved yet");
    state.openTab("A.md", "disk content");

    expect(useTabsStore.getState().getActive()).toMatchObject({
      id,
      content: "local edits not saved yet",
      dirty: true,
    });
  });

  it("activates a neighbor tab when the active tab closes", () => {
    const state = useTabsStore.getState();
    const a = state.openTab("A.md", "A");
    const b = state.openTab("B.md", "B");
    const c = state.openTab("C.md", "C");
    state.closeTab(c);
    expect(useTabsStore.getState().getActive()?.path).toBe("B.md");

    state.closeTab(b);
    expect(useTabsStore.getState().getActive()?.path).toBe("A.md");
    expect(useTabsStore.getState().activeId).toBe(a);
  });

  it("keeps one empty tab when the last tab closes", () => {
    const state = useTabsStore.getState();
    const only = state.openTab("A.md", "A");
    state.closeTab(only);

    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(useTabsStore.getState().getActive()).toMatchObject({
      path: null,
      content: "",
      dirty: false,
    });
  });

  it("marks external documents read-only when the preference applies", () => {
    useTabsStore.getState().openTab("ext.md", "content", UTF8_TEXT_ENCODING, { external: true });
    const active = useTabsStore.getState().getActive();
    expect(active?.external).toBe(true);
  });
});
