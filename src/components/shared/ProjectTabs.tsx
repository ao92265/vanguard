import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X } from "lucide-react";
import { useCallback, useRef } from "react";
import { STATUS_COLORS, useProjectStatus } from "@/hooks/useProjectStatus";

export type ProjectTab = {
  id: string;
  name: string;
  active: boolean;
};

interface ProjectTabsProps {
  tabs: ProjectTab[];
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onReorderTab: (activeId: string, overId: string) => void;
  onMoveTab: (tabId: string, direction: "left" | "right") => void;
}

/**
 * Individual tab component that uses the useProjectStatus hook.
 */
function TabItem({
  tab,
  onSelect,
  onClose,
  onKeyDown,
  tabRefCallback,
}: {
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
      aria-label={
        sessionCount > 0
          ? `${tab.name}, ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`
          : tab.name
      }
      className={`workbench-project-row flex w-full shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md text-xs font-medium ${
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
        <span className="workbench-rail-label truncate">{tab.name}</span>
        {sessionCount > 0 && (
          <span
            className={`workbench-rail-label workbench-project-count shrink-0 text-[10px] font-medium ${
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
        className="workbench-project-close ml-1 shrink-0 rounded p-0.5 hover:bg-maestro-border"
        aria-label={`Close ${tab.name}`}
      >
        <X size={10} />
      </button>
    </div>
  );
}

export function ProjectTabs({
  tabs,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onReorderTab,
  onMoveTab,
}: ProjectTabsProps) {
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
      const backwards = e.key === "ArrowLeft" || e.key === "ArrowUp";
      const forwards = e.key === "ArrowRight" || e.key === "ArrowDown";

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
    [tabs, onSelectTab, onMoveTab],
  );

  return (
    <section className="workbench-projects">
      <div className="workbench-project-heading workbench-rail-label">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-maestro-muted">
          Projects <span className="ml-1 opacity-60">{tabs.length}</span>
        </h2>
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
            className="flex min-h-0 flex-col overflow-y-auto"
          >
            {tabs.length === 0 ? (
              <span className="px-2 py-3 text-xs text-maestro-muted">Open a project to begin.</span>
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
        aria-label="Open new project"
        className="workbench-rail-row"
      >
        <span className="workbench-rail-icon">
          <Plus size={15} />
        </span>
        <span className="workbench-rail-label">Open project</span>
      </button>
    </section>
  );
}
