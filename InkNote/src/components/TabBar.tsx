import { Plus, X } from "lucide-react";
import { t, type Locale } from "../lib/i18n";
import type { TabDoc } from "../store/useTabsStore";
import { basename } from "../lib/paths";

interface Props {
  locale: Locale;
  tabs: TabDoc[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

function tabLabel(tab: TabDoc, locale: Locale): string {
  if (tab.path) return basename(tab.path);
  if (tab.sample) return t(locale, "tab.sample");
  if (tab.welcome && !tab.content.trim()) return t(locale, "tab.newTab");
  return t(locale, "title.untitled");
}

/** 浏览器式标签栏：点击切换，中键或 × 关闭，未保存以圆点提示，+ 新建标签页 */
export default function TabBar({ locale, tabs, activeId, onSelect, onClose, onNew }: Props) {
  return (
    <div className="tab-bar" role="tablist" aria-label={t(locale, "tab.bar")}>
      {tabs.map((tab) => {
        const label = tabLabel(tab, locale);
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            className={"tab" + (active ? " active" : "")}
            title={tab.path ?? label}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(tab.id);
              }
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.id);
              }
            }}
          >
            <span className="tab-label">{label}</span>
            <button
              type="button"
              className="tab-close"
              aria-label={t(locale, "tab.close")}
              title={t(locale, "tab.close")}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
            >
              {tab.dirty ? <span className="tab-dirty-dot" aria-hidden="true" /> : null}
              <X size={13} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="tab-new"
        aria-label={t(locale, "tab.new")}
        title={t(locale, "tab.new")}
        onClick={onNew}
      >
        <Plus size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
