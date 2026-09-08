import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, PanelLeft, Plus, Square, X } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { STATUS_COLORS, useProjectStatus } from "@/hooks/useProjectStatus";
import { isMac } from "@/lib/platform";

export type ProjectTab = {
  id: string;
  name: string;
  active: boolean;
  /** Project accent color (name-derived, matches the eagle view's tile borders). */
  color?: string;
};

interface ProjectTabsProps {
  vertical?: boolean;
  tabs: ProjectTab[];
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onReorderTab: (activeId: string, overId: string) => void;
  onMoveTab: (tabId: string, direction: "left" | "right") => void;
}

/**
 * Individual tab component that uses the useProjectStatus hook.
 */
function TabItem({
  vertical = false,
  tab,
  onSelect,
  onClose,
  onKeyDown,
  tabRefCallback,
}: {
  vertical?: boolean;
  tab: ProjectTab;
  onSelect: () => void;
  onClose: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  tabRefCallback: (node: HTMLElement | null) => void;
}) {
  const { status, sessionCount } = useProjectStatus(tab.id);
  const shouldPulse = status === "working" || status === "needs-input";

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  const combinedRef = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      tabRefCallback(node);
    },
    [setNodeRef, tabRefCallback],
  );

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    // Project accent as a 2px underline (inset shadow avoids affecting layout).
    // Dimmed on inactive tabs so the active tab stays the focal point.
    // color-mix (not a hex alpha suffix) because the accents are hsl() strings.
    ...(tab.color && !vertical
      ? {
          boxShadow: `inset 0 -2px 0 0 ${
            tab.active ? tab.color : `color-mix(in srgb, ${tab.color} 50%, transparent)`
          }`,
        }
      : {}),
  };

  return (
    <div
      ref={combinedRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={tab.active}
      tabIndex={tab.active ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`flex ${vertical ? "min-h-11 w-full justify-between" : "max-w-64"} shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium cursor-pointer ${
        tab.active
          ? "bg-maestro-bg text-maestro-text"
          : "text-maestro-muted hover:text-maestro-text"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[status]} ${
            shouldPulse ? "animate-pulse" : ""
          }`}
        />
        <span className="truncate">{tab.name}</span>
        {sessionCount > 0 && (
          <span
            className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              status === "needs-input"
                ? "bg-maestro-accent/20 text-maestro-accent"
                : status === "working"
                  ? "bg-maestro-blue/20 text-maestro-blue"
                  : "bg-maestro-muted/20 text-maestro-muted"
            }`}
          >
            {sessionCount}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="ml-1 shrink-0 rounded p-0.5 hover:bg-maestro-border"
        aria-label={`Close ${tab.name}`}
      >
        <X size={10} />
      </button>
    </div>
  );
}

export function ProjectTabs({
  vertical = false,
  tabs,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onToggleSidebar,
  sidebarOpen,
  onReorderTab,
  onMoveTab,
}: ProjectTabsProps) {
  const appWindow = useMemo(() => getCurrentWindow(), []);

  // Ref map for focus management (WAI-ARIA tablist keyboard navigation)
  const tabRefs = useRef(new Map<string, HTMLElement>());
  const setTabRef = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) {
        tabRefs.current.set(id, node);
      } else {
        tabRefs.current.delete(id);
      }
    },
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        onReorderTab(active.id as string, over.id as string);
      }
    },
    [onReorderTab],
  );

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, tab: ProjectTab) => {
      const isMeta = e.metaKey || e.ctrlKey;
      const backwards = e.key === "ArrowLeft" || (vertical && e.key === "ArrowUp");
      const forwards = e.key === "ArrowRight" || (vertical && e.key === "ArrowDown");

      // Cmd/Ctrl+Shift+Arrow: move tab position
      if (isMeta && e.shiftKey && (backwards || forwards)) {
        e.preventDefault();
        onMoveTab(tab.id, backwards ? "left" : "right");
        return;
      }

      // Arrow keys: switch tab focus
      if (forwards) {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.id === tab.id);
        const next = tabs[(idx + 1) % tabs.length];
        if (next) {
          onSelectTab(next.id);
          tabRefs.current.get(next.id)?.focus();
        }
      } else if (backwards) {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.id === tab.id);
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
        if (prev) {
          onSelectTab(prev.id);
          tabRefs.current.get(prev.id)?.focus();
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelectTab(tab.id);
      }
    },
    [tabs, onSelectTab, onMoveTab, vertical],
  );

  if (vertical)
    return (
      <section className="flex max-h-[40%] min-h-24 shrink-0 flex-col border-b border-maestro-border p-3">
        <div className="mb-2 flex shrink-0 items-center justify-between px-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-maestro-muted">
            Projects <span className="ml-1 opacity-60">{tabs.length}</span>
          </h2>
          <button
            type="button"
            onClick={onNewTab}
            aria-label="Open new project"
            className="rounded p-2 text-maestro-muted hover:bg-maestro-card hover:text-maestro-text"
          >
            <Plus size={15} />
          </button>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tabs.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div
              role="tablist"
              aria-label="Open projects"
              aria-orientation="vertical"
              className="flex min-h-0 flex-col gap-1 overflow-y-auto"
            >
              {tabs.length === 0 ? (
                <span className="px-2 py-3 text-xs text-maestro-muted">
                  Open a project to begin.
                </span>
              ) : (
                tabs.map((tab) => (
                  <TabItem
                    key={tab.id}
                    vertical
                    tab={tab}
                    onSelect={() => onSelectTab(tab.id)}
                    onClose={() => onCloseTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, tab)}
                    tabRefCallback={setTabRef(tab.id)}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>
      </section>
    );

  return (
    <div
      data-tauri-drag-region
      className="project-strip theme-transition no-select flex h-12 shrink-0 items-center border-b border-maestro-border bg-maestro-surface"
    >
      {/* Left: sidebar toggle + tabs (inset from CSS var for macOS traffic lights) */}
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center gap-1.5 pr-3"
        style={{ paddingLeft: "max(var(--mac-title-bar-inset, 0px), 6px)" }}
      >
        <div className="flex shrink-0 items-center gap-2 px-2" data-tauri-drag-region>
          <img src="/favicon.png" alt="" className="h-6 w-6" />
          <span className="hidden text-[13px] font-semibold tracking-tight text-maestro-text lg:inline">
            Vanguard
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`shrink-0 rounded p-2 transition-colors ${
            sidebarOpen
              ? "text-maestro-accent hover:bg-maestro-accent/10"
              : "text-maestro-muted hover:bg-maestro-border hover:text-maestro-text"
          }`}
          aria-label="Toggle sidebar"
          aria-pressed={sidebarOpen}
        >
          <PanelLeft size={14} />
        </button>

        <div className="mx-1 h-4 w-px bg-maestro-border" />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
            <div
              role="tablist"
              aria-label="Open projects"
              className="scrollbar-none flex min-w-0 items-center gap-1 overflow-x-auto"
            >
              {tabs.length === 0 ? (
                <span className="px-2 text-xs text-maestro-muted">No projects</span>
              ) : (
                tabs.map((tab) => (
                  <TabItem
                    key={tab.id}
                    tab={tab}
                    onSelect={() => onSelectTab(tab.id)}
                    onClose={() => onCloseTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, tab)}
                    tabRefCallback={setTabRef(tab.id)}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>

        <button
          type="button"
          onClick={onNewTab}
          className="shrink-0 rounded p-2 text-maestro-muted hover:bg-maestro-border hover:text-maestro-text"
          aria-label="Open new project"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Center: drag region fills remaining space */}
      <div data-tauri-drag-region className="h-full w-8 shrink-0" />

      {/* Right: window controls (hidden on macOS — custom traffic lights in row instead) */}
      {!isMac() && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => appWindow.minimize()}
            className="flex h-9 w-11 items-center justify-center text-maestro-muted transition-colors hover:bg-maestro-muted/10 hover:text-maestro-text"
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => appWindow.toggleMaximize()}
            className="flex h-9 w-11 items-center justify-center text-maestro-muted transition-colors hover:bg-maestro-muted/10 hover:text-maestro-text"
            aria-label="Maximize"
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            onClick={() => appWindow.close()}
            className="flex h-9 w-11 items-center justify-center text-maestro-muted transition-colors hover:bg-maestro-red/80 hover:text-white"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
