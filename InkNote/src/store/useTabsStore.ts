import { create } from "zustand";
import type { EditorMode } from "../editor";
import { getDefaultEditorMode, getExternalOpenReadOnly } from "../lib/preferences";
import {
  copyTextEncoding,
  UTF8_TEXT_ENCODING,
  type TextEncoding,
} from "../lib/textEncoding";

export interface TabDoc {
  id: string;
  path: string | null;
  content: string;
  diskContent: string;
  dirty: boolean;
  mode: EditorMode;
  encoding: TextEncoding;
  /** 文件关联等外部途径打开的文档 */
  external: boolean;
  /** 内置示例文档 */
  sample: boolean;
  /** 预览/编辑访问开关 */
  editable: boolean;
  /** 空白新标签页：内容仍为空时显示欢迎页（浏览器的「新标签页」） */
  welcome: boolean;
}

export interface TabSnapshot {
  path: string | null;
  content: string;
  diskContent: string;
  dirty: boolean;
  mode: EditorMode;
  encoding: TextEncoding;
  external: boolean;
  sample: boolean;
  editable: boolean;
  welcome: boolean;
}

interface DocState {
  tabs: TabDoc[];
  activeId: string;
  focusMode: boolean;
  typewriterMode: boolean;
  newTab: (content?: string, opts?: { sample?: boolean; welcome?: boolean }) => string;
  openTab: (
    path: string,
    content: string,
    encoding?: TextEncoding,
    opts?: { external?: boolean },
  ) => string;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  restoreTab: (snap: TabSnapshot) => string;
  updateContent: (id: string, content: string) => void;
  setMode: (id: string, mode: EditorMode) => void;
  setEditable: (id: string, editable: boolean) => void;
  /** 保存完成：只更新磁盘基线，不动正在编辑的内容 */
  markSaved: (id: string, path?: string, savedContent?: string, encoding?: TextEncoding) => void;
  /** 用磁盘内容整体替换（外部修改 / 手动重新加载） */
  loadFromDisk: (id: string, path: string, content: string, encoding?: TextEncoding) => void;
  /** 仅改路径（重命名），不影响未保存状态 */
  setPath: (id: string, path: string) => void;
  getActive: () => TabDoc | undefined;
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;
}

let tabCounter = 0;
function newId() {
  return `doc-${++tabCounter}-${Date.now()}`;
}

function emptyTab(): TabDoc {
  const id = newId();
  return {
    id,
    path: null,
    content: "",
    diskContent: "",
    dirty: false,
    mode: getDefaultEditorMode(),
    encoding: copyTextEncoding(UTF8_TEXT_ENCODING),
    external: false,
    sample: false,
    editable: true,
    welcome: true,
  };
}

/** 多标签编辑：打开过的文档各占一个标签，互不覆盖 */
export const useTabsStore = create<DocState>((set, get) => ({
  tabs: [emptyTab()],
  activeId: "",
  focusMode: false,
  typewriterMode: false,

  newTab: (content = "", opts) => {
    const sample = opts?.sample === true;
    const tab: TabDoc = {
      id: newId(),
      path: null,
      content,
      diskContent: content,
      dirty: Boolean(content),
      mode: sample ? "preview" : getDefaultEditorMode(),
      encoding: copyTextEncoding(UTF8_TEXT_ENCODING),
      external: false,
      sample,
      editable: !sample,
      welcome: opts?.welcome === true,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
    return tab.id;
  },

  openTab: (path, content, encoding = UTF8_TEXT_ENCODING, opts) => {
    const external = opts?.external === true;
    const editable = !(external && getExternalOpenReadOnly());
    const mode: EditorMode = editable ? getDefaultEditorMode() : "preview";
    set((s) => {
      const existing = s.tabs.find((t) => t.path === path);
      if (existing) {
        // 有未保存修改的标签只切换过去，绝不能拿磁盘内容覆盖本地编辑
        if (existing.dirty) return { activeId: existing.id };
        return {
          activeId: existing.id,
          tabs: s.tabs.map((t) =>
            t.id === existing.id
              ? {
                  ...t,
                  content,
                  diskContent: content,
                  dirty: false,
                  mode,
                  encoding: copyTextEncoding(encoding),
                  external,
                  sample: false,
                  editable,
                  welcome: false,
                }
              : t,
          ),
        };
      }
      const tab: TabDoc = {
        id: newId(),
        path,
        content,
        diskContent: content,
        dirty: false,
        mode,
        encoding: copyTextEncoding(encoding),
        external,
        sample: false,
        editable,
        welcome: false,
      };
      return { tabs: [...s.tabs, tab], activeId: tab.id };
    });
    return get().activeId;
  },

  closeTab: (id) => {
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id);
      if (index === -1) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      if (!tabs.length) {
        const tab = emptyTab();
        return { tabs: [tab], activeId: tab.id };
      }
      if (s.activeId !== id) return { tabs };
      const neighbor = tabs[index] ?? tabs[index - 1];
      return { tabs, activeId: neighbor.id };
    });
  },

  setActive: (id) => {
    set((s) => (s.tabs.some((t) => t.id === id) ? { activeId: id } : s));
  },

  restoreTab: (snap) => {
    const tab: TabDoc = {
      id: newId(),
      path: snap.path,
      content: snap.content,
      diskContent: snap.diskContent,
      dirty: snap.dirty,
      mode: snap.mode,
      encoding: copyTextEncoding(snap.encoding),
      external: snap.external,
      sample: snap.sample,
      editable: snap.editable,
      welcome: snap.welcome,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
    return tab.id;
  },

  updateContent: (id, content) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content, dirty: t.diskContent !== content } : t,
      ),
    }));
  },

  setMode: (id, mode) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, mode } : t)),
    }));
  },

  setEditable: (id, editable) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, editable } : t)),
    }));
  },

  /**
   * 保存完成。
   *
   * 只把磁盘基线推进到刚写出去的内容，**不能**用写盘前的快照覆盖 content ——
   * 否则在 IPC 往返期间敲进去的字会被抹掉。dirty 由当前内容与基线比较得出，
   * 保存期间新输入的内容会继续保持 dirty，等待用户再次保存或退出时写回。
   */
  markSaved: (id, path, savedContent, encoding) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id) return t;
        const disk = savedContent ?? t.content;
        return {
          ...t,
          path: path ?? t.path,
          diskContent: disk,
          dirty: t.content !== disk,
          encoding: encoding ? copyTextEncoding(encoding) : t.encoding,
        };
      }),
    }));
  },

  /** 用磁盘内容整体替换当前文档 */
  loadFromDisk: (id, path, content, encoding) => {
    set((s) => {
      let activeId = s.activeId;
      const tabs = s.tabs.map((t) => {
        if (t.id !== id) return t;
        const next = {
          ...t,
          id: newId(),
          path,
          content,
          diskContent: content,
          dirty: false,
          encoding: encoding ? copyTextEncoding(encoding) : t.encoding,
        };
        if (activeId === id) activeId = next.id;
        return next;
      });
      return { tabs, activeId };
    });
  },

  setPath: (id, path) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, path } : t)),
    }));
  },

  getActive: () => {
    const s = get();
    if (!s.activeId && s.tabs.length) return s.tabs[0];
    return s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0];
  },

  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
}));

const init = useTabsStore.getState();
if (!init.activeId && init.tabs[0]) {
  useTabsStore.setState({ activeId: init.tabs[0].id });
}
