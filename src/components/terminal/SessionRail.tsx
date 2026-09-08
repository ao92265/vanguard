import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { useSessionStore } from "@/stores/useSessionStore";
import { SessionStatusDot, ThinkingIndicator } from "./ThinkingIndicator";

/**
 * The session rail beside a zoomed terminal: every pane in this grid, listed,
 * with the zoomed one marked.
 *
 * It is navigation only. Picking a row calls the same zoom action the old
 * horizontal tab strip called, which is CSS-only: every PTY stays mounted and
 * keeps its scrollback. Nothing here kills, parks or respawns a session.
 *
 * The design's per-row host badge is not drawn: sessions all run locally, and
 * the only per-session host this app knows is an image destination, which is
 * not an execution host. See the task report.
 */

const LABEL_CLASS =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted";

export function SessionRail({
  count,
  onExitZoom,
  onNewTerminal,
  children,
}: {
  /** Panes listed in the rail. */
  count: number;
  onExitZoom: () => void;
  /** Omitted when the grid is already at its session cap. */
  onNewTerminal?: () => void;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label="Sessions"
      className="flex w-[268px] shrink-0 flex-col gap-2 overflow-hidden py-4 pl-5 pr-1"
    >
      <div className="flex items-center gap-2 pb-0.5">
        <span className={LABEL_CLASS}>Sessions</span>
        <span className="font-mono text-[10.5px] font-semibold text-maestro-muted">{count}</span>
        <div className="flex-1" />
        {onNewTerminal && (
          <button
            type="button"
            onClick={onNewTerminal}
            className="rounded-md bg-maestro-accent px-2.5 py-1 text-[11.5px] font-medium text-maestro-onAccent"
          >
            New terminal <span className="font-mono opacity-70">⌘T</span>
          </button>
        )}
        <button
          type="button"
          onClick={onExitZoom}
          aria-label="Exit zoom"
          title="Exit zoom"
          className="rounded p-0.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {children}
      </div>
      <p className="m-0 rounded-[9px] border border-dashed border-maestro-border px-3 py-2.5 font-mono text-[11px] leading-relaxed text-maestro-muted">
        Paste an image into a terminal to stage it and hand the agent its path.
      </p>
    </nav>
  );
}

export function SessionRailRow({
  slotId,
  index,
  isActive,
  label,
  sessionId,
  tail,
  onSelect,
  onToggleFlag,
}: {
  slotId: string;
  index: number;
  isActive: boolean;
  label: string;
  sessionId: number | null;
  /** The session's own last word about itself, when it has said anything. */
  tail?: string;
  onSelect: () => void;
  /** Clicking the already-active row toggles the warning flag (header parity). */
  onToggleFlag?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slotId,
  });

  // A row activated by keyboard (Alt+Arrow / number keys) can sit outside the
  // scrolled range. "nearest" limits the scroll to the rail itself.
  const nodeRef = useRef<HTMLElement | null>(null);
  const combinedRef = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      nodeRef.current = node;
    },
    [setNodeRef],
  );
  useEffect(() => {
    if (isActive) nodeRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [isActive]);

  const isFlagged = useSessionStore(
    (s) => sessionId !== null && s.flaggedSessionIds.includes(sessionId),
  );
  // Attention highlight (auto-unparked because the agent needs input): the
  // same yellow chrome as the warning flag, cleared by selecting the session.
  const hasAttention = useSessionStore(
    (s) => sessionId !== null && s.attentionSessionIds.includes(sessionId),
  );

  // Attention-first click semantics on the active row: the first click only
  // acknowledges the attention highlight. It must not also set the warning
  // flag, or the chrome stays yellow and the user has flagged the session
  // without knowing.
  const handleActiveClick = () => {
    if (hasAttention && sessionId !== null) {
      useSessionStore.getState().clearSessionAttention(sessionId);
      return;
    }
    onToggleFlag?.();
  };

  const description = isActive
    ? onToggleFlag
      ? hasAttention
        ? `${label} (needs input: click to clear the attention highlight)`
        : `${label} (click to ${isFlagged ? "clear" : "set"} warning flag)`
      : `${label} (click to exit zoom)`
    : `Switch to ${label}`;

  return (
    <button
      ref={combinedRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
      type="button"
      onClick={isActive && onToggleFlag ? handleActiveClick : onSelect}
      aria-label={description}
      title={description}
      aria-current={isActive ? "true" : undefined}
      className={`
        flex shrink-0 flex-col gap-1.5 rounded-[9px] border px-3 py-2.5 text-left transition-colors
        ${isFlagged || hasAttention ? "warning-flag" : ""}
        ${
          isActive
            ? "border-maestro-blue bg-maestro-blue/10"
            : "border-maestro-border bg-maestro-card hover:border-maestro-muted/50"
        }
      `}
    >
      <span className="flex items-center gap-2">
        {sessionId !== null && (
          <>
            <ThinkingIndicator sessionId={sessionId} size={3} />
            <SessionStatusDot sessionId={sessionId} />
          </>
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-maestro-text">
          {label}
        </span>
        <span className="font-mono text-[10px] text-maestro-muted">{index + 1}</span>
      </span>
      {tail && (
        <span className="truncate font-mono text-[10.5px] leading-snug text-maestro-muted">
          {tail}
        </span>
      )}
    </button>
  );
}
