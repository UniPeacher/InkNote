import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { initPlatform } from "./lib/platform";
import { getLocale, setLocale } from "./lib/i18n";
import { applyEditorLayoutPrefs } from "./lib/preferences";
import { applyMarkdownTheme } from "./lib/markdownTheme";
import { apply as applyTheme, applyBootstrapTheme } from "./lib/theme";
import { initializeSettingsStore } from "./lib/settingsStore";
import "./App.css";

performance.mark("inknote:bootstrap-start");
initPlatform();
applyBootstrapTheme();

document.addEventListener(
  "contextmenu",
  (e) => {
    e.preventDefault();
  },
  { capture: true },
);

async function bootstrap() {
  const [{ default: App }] = await Promise.all([
    import("./App"),
    initializeSettingsStore(),
  ]);
  performance.mark("inknote:settings-ready");
  initPlatform();
  setLocale(getLocale());
  applyTheme();
  applyEditorLayoutPrefs();
  applyMarkdownTheme();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  requestAnimationFrame(() => {
    performance.mark("inknote:app-rendered");
    performance.measure(
      "inknote:bootstrap-to-render",
      "inknote:bootstrap-start",
      "inknote:app-rendered",
    );
    // 窗口以隐藏方式创建，等主题与首帧渲染完成后再显示，避免启动白屏。
    // 显示后短暂置顶并调用 bring_to_front（挂接前台线程输入队列）抢焦点，
    // 保证新窗口跳到最顶层；setFocus 在后台进程下会被系统拒绝
    const current = getCurrentWindow();
    void current.show().then(async () => {
      await current.setAlwaysOnTop(true);
      setTimeout(() => {
        void current.setAlwaysOnTop(false);
        void invoke("bring_to_front");
      }, 150);
      setTimeout(() => {
        void invoke("bring_to_front");
      }, 500);
    });
  });
}

void bootstrap();
