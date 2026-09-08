import { ask } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  CircleDot,
  Clock,
  GitMerge,
  GitPullRequest,
  HelpCircle,
  Inbox,
  Pencil,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ClosedBatchShelf } from "@/components/home/ClosedBatchShelf";
import { ReplyDraftDialog } from "@/components/home/ReplyDraftDialog";
import { SnoozeButton } from "@/components/home/SnoozeButton";
import { badgeBaseClass, SESSION_STATUS_BADGES } from "@/components/session/agentPresentation";
import { useLaunchHandoff } from "@/hooks/useLaunchHandoff";
import { useRestoreClosedBatch } from "@/hooks/useRestoreClosedBatch";
import { assembleBands, type BandItem, type BandTab, type HandoffInfo } from "@/lib/bands";
import {
  bandItemKey,
  partitionSnoozed,
  projectDisplayName,
  type SnoozeKey,
} from "@/lib/sessionActions";
import { useActStore } from "@/stores/useActStore";
import { useBandStore } from "@/stores/useBandStore";
import { useClosedSessionsStore } from "@/stores/useClosedSessionsStore";
import { useFactoryViewStore } from "@/stores/useFactoryViewStore";
import { useHomeViewStore } from "@/stores/useHomeViewStore";
import { useReplyDraftStore } from "@/stores/useReplyDraftStore";
import type { BackendSessionStatus, SessionConfig } from "@/stores/useSessionStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { useSnoozeStore } from "@/stores/useSnoozeStore";
import { useTourStore } from "@/stores/useTourStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface HomeViewProps {
  /** Leave Home and focus a terminal (or just its project) — LandscapeView's contract. */
  onNavigate: (tabId: string, sessionId?: number) => void;
  onClose: () => void;
}

/** Fleet strip display order: what needs you first, calmest last. */
const STRIP_ORDER: BackendSessionStatus[] = [
  "NeedsInput",
  "Working",
  "Starting",
  "Done",
  "Error",
  "Timeout",
  "Idle",
];

function relAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const rowClass = "inbox-actions flex min-h-14 w-full flex-wrap items-center gap-3 py-4 text-left";

function itemSummary(item: BandItem): { title: string; context: string; detail: string } {
  switch (item.kind) {
    case "session":
      return {
        title: item.session.name || item.projectName,
        context: item.projectName,
        detail:
          item.session.needsInputPrompt ||
          item.session.statusMessage ||
          SESSION_STATUS_BADGES[item.session.status].label,
      };
    case "handoff":
      return { title: item.handoff.repo, context: "Handoff", detail: item.handoff.lastAction };
    case "pr":
      return {
        title: `#${item.pr.number} ${item.pr.title}`,
        context: item.projectName,
        detail: item.pr.mergedAt ? "Merged pull request" : "Changes requested",
      };
    case "run":
      return {
        title: item.run.title,
        context: "Factory",
        detail: item.run.stage || item.run.status,
      };
  }
}

function StatusBadge({ status }: { status: BackendSessionStatus }) {
  const badge = SESSION_STATUS_BADGES[status];
  return <span className={`${badgeBaseClass} ${badge.cls}`}>{badge.label}</span>;
}

interface SessionRowProps {
  item: BandItem;
  onNavigate: HomeViewProps["onNavigate"];
  /** Blocked-band extras; the other two bands pass nothing and render as before. */
  onDraftReply?: (session: SessionConfig) => void;
  snoozeKey?: SnoozeKey;
}

/**
 * Body of a session row, past the kind guard, so the row's own hooks (the
 * rename field) sit at the top of a component that always renders.
 */
function SessionRowBody({
  session,
  tabId,
  projectName,
  onNavigate,
  onDraftReply,
  snoozeKey,
}: Omit<SessionRowProps, "item"> & {
  session: SessionConfig;
  tabId: string | null;
  projectName: string;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const detail =
    session.status === "NeedsInput"
      ? (session.needsInputPrompt ?? "Waiting for your input")
      : (session.statusMessage ?? "");

  /* The same store action the terminal header's click-to-rename uses — one
     rename path, two surfaces. Blank clears the custom name (the backend
     normalizes an empty string back to None). */
  const commitName = () => {
    const trimmed = nameValue.trim();
    useSessionStore.getState().renameSession(session.id, trimmed || null);
    setEditingName(false);
  };

  return (
    <div className={rowClass}>
      <button
        type="button"
        className={`flex min-w-0 flex-1 items-center gap-2 text-left ${
          tabId ? "" : "cursor-default"
        }`}
        onClick={() => tabId && onNavigate(tabId, session.id)}
        title={tabId ? "Jump to this terminal" : "Project not open in a tab"}
      >
        <StatusBadge status={session.status} />
        <span className="shrink-0 text-[12px] font-medium text-maestro-text">{projectName}</span>
        {!editingName && session.name && (
          <span className="shrink-0 text-[11px] text-maestro-muted">{session.name}</span>
        )}
        {session.branch && (
          <span className="shrink-0 rounded bg-maestro-muted/10 px-1 text-[10px] text-maestro-muted">
            {session.branch}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] text-maestro-muted">{detail}</span>
      </button>

      {editingName ? (
        <input
          type="text"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") setEditingName(false);
          }}
          placeholder="Session name"
          aria-label="Rename session"
          className="w-32 shrink-0 rounded border border-maestro-accent bg-maestro-card px-1 py-0 text-[11px] text-maestro-text outline-none"
          // biome-ignore lint/a11y/noAutofocus: revealed by an explicit click-to-rename, same as TerminalHeader's field.
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setNameValue(session.name ?? "");
            setEditingName(true);
          }}
          className="shrink-0 rounded border border-maestro-border px-1.5 py-0.5 text-[11px] text-maestro-muted transition-colors hover:border-maestro-muted/50 hover:text-maestro-text"
          title="Rename this session"
        >
          <Pencil size={11} />
        </button>
      )}

      {onDraftReply && (
        <button
          type="button"
          onClick={() => onDraftReply(session)}
          className="flex shrink-0 items-center gap-1 rounded border border-maestro-border px-1.5 py-0.5 text-[11px] text-maestro-muted transition-colors hover:border-maestro-accent/50 hover:text-maestro-accent"
          title="Draft a reply with AI — a suggestion you edit and send yourself"
        >
          <Sparkles size={11} /> Draft reply
        </button>
      )}
      {snoozeKey && <SnoozeButton snoozeKey={snoozeKey} label="this session" />}
    </div>
  );
}

function SessionRow({ item, ...rest }: SessionRowProps) {
  if (item.kind !== "session") return null;
  return (
    <SessionRowBody
      session={item.session}
      tabId={item.tabId}
      projectName={item.projectName}
      {...rest}
    />
  );
}

function PrRow({ item }: { item: BandItem }) {
  if (item.kind !== "pr") return null;
  const { pr, projectName } = item;
  const merged = pr.mergedAt !== null;
  return (
    <button
      type="button"
      className={rowClass}
      onClick={() => void openUrl(pr.url).catch((err) => console.error("Failed to open PR:", err))}
      title="Open on GitHub"
    >
      {merged ? (
        <GitMerge size={13} className="shrink-0 text-maestro-purple" />
      ) : (
        <GitPullRequest size={13} className="shrink-0 text-maestro-accent" />
      )}
      <span
        className={`${badgeBaseClass} ${
          merged
            ? "bg-maestro-purple/15 text-maestro-purple"
            : "bg-maestro-accent/15 text-maestro-accent"
        }`}
      >
        {merged ? "MERGED" : "CHANGES REQUESTED"}
      </span>
      <span className="shrink-0 text-[12px] font-medium text-maestro-text">{projectName}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-maestro-muted">
        #{pr.number} {pr.title}
      </span>
      {merged && pr.mergedAt && (
        <span className="shrink-0 text-[10px] text-maestro-muted">{relAgo(pr.mergedAt)}</span>
      )}
    </button>
  );
}

/** An ACT run stopped at a confidence gate; clicking opens it in the Factory. */
function RunRow({ item }: { item: BandItem }) {
  if (item.kind !== "run") return null;
  const { run } = item;
  return (
    <button
      type="button"
      className={rowClass}
      onClick={() => {
        void useActStore.getState().openDetail(run.id);
        useHomeViewStore.getState().close();
        useFactoryViewStore.getState().open();
      }}
      title="Open this run in the Factory to approve or reject the gate"
    >
      <span className={`${badgeBaseClass} bg-maestro-accent/15 text-maestro-accent`}>
        FACTORY GATE
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-maestro-text">
        {run.title}
      </span>
      {run.stage && <span className="shrink-0 text-[10px] text-maestro-muted">{run.stage}</span>}
    </button>
  );
}

function HandoffRow({
  item,
  onLaunch,
  onDismiss,
  snoozeKey,
}: {
  item: BandItem;
  onLaunch: (h: HandoffInfo) => void;
  onDismiss: (h: HandoffInfo) => void;
  snoozeKey: SnoozeKey;
}) {
  if (item.kind !== "handoff") return null;
  const h = item.handoff;
  return (
    <div className={rowClass}>
      <span className={`${badgeBaseClass} bg-maestro-yellow/15 text-maestro-yellow`}>HANDOFF</span>
      <span className="shrink-0 text-[12px] font-medium text-maestro-text">{h.repo}</span>
      {h.branch && (
        <span className="shrink-0 rounded bg-maestro-muted/10 px-1 text-[10px] text-maestro-muted">
          {h.branch}
        </span>
      )}
      {h.waiting && (
        <span className={`${badgeBaseClass} bg-maestro-accent/15 text-maestro-accent`}>
          ASKED YOU
        </span>
      )}
      {h.uncommitted > 0 && (
        <span className="shrink-0 text-[10px] text-maestro-yellow">
          {h.uncommitted} uncommitted
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] text-maestro-muted" title={h.lastAction}>
        {h.lastAction || h.asks[h.asks.length - 1] || ""}
      </span>
      <span className="shrink-0 text-[10px] text-maestro-muted">{relAgo(h.lastActive)}</span>
      <button
        type="button"
        onClick={() => onLaunch(h)}
        className="flex shrink-0 items-center gap-1 rounded border border-maestro-border px-1.5 py-0.5 text-[11px] text-maestro-muted transition-colors hover:border-maestro-green/50 hover:text-maestro-green"
        title="Launch a session here, seeded with the handoff"
      >
        <Play size={11} /> Resume
      </button>
      <SnoozeButton snoozeKey={snoozeKey} label="this handoff" />
      <button
        type="button"
        onClick={() => onDismiss(h)}
        className="flex shrink-0 items-center gap-1 rounded border border-maestro-border px-1.5 py-0.5 text-[11px] text-maestro-muted transition-colors hover:border-maestro-red/50 hover:text-maestro-red"
        title="Delete this handoff snapshot from disk — it will not come back"
      >
        <Trash2 size={11} /> Dismiss
      </button>
    </div>
  );
}

function Band({
  onInspect,
  selectedKey,
  title,
  icon,
  items,
  emptyText,
  stale,
  action,
}: {
  onInspect: (item: BandItem, trigger: HTMLElement) => void;
  selectedKey: string | null;
  title: string;
  icon: React.ReactNode;
  items: BandItem[];
  emptyText: string;
  stale?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold tracking-tight text-maestro-text">{title}</h2>
        <span className="rounded bg-maestro-card px-1.5 py-0.5 font-mono text-[11px] text-maestro-muted">
          {items.length}
        </span>
        {stale && (
          <span
            className={`${badgeBaseClass} bg-maestro-yellow/15 text-maestro-yellow`}
            title={stale}
          >
            STALE
          </span>
        )}
        <div className="flex-1" />
        {action}
      </div>
      {items.length === 0 ? (
        <p className="border-t border-maestro-border/60 py-4 text-xs text-maestro-muted">
          {emptyText}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const key = bandItemKey(item);
            const summary = itemSummary(item);
            return (
              <button
                key={key}
                type="button"
                onClick={(event) => onInspect(item, event.currentTarget)}
                aria-label={`Inspect ${summary.context}: ${summary.title}`}
                aria-pressed={selectedKey === key}
                className={`flex min-h-20 w-full flex-col gap-2 rounded-md px-4 py-3 text-left transition-colors ${selectedKey === key ? "bg-maestro-accent/10 text-maestro-text" : "text-maestro-text hover:bg-maestro-surface"}`}
              >
                <span className="flex w-full min-w-0 items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{summary.title}</span>
                  <span className="shrink-0 text-[10px] text-maestro-muted">{summary.context}</span>
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed text-maestro-muted">
                  {summary.detail}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Home — the decision queue. Three bands, in the only order that matters:
 * what is blocked on you, what landed since you looked, what is running.
 * Everything else in the app is reachable from here, not shown here.
 */
export function HomeView({ onNavigate, onClose }: HomeViewProps) {
  const sessions = useSessionStore(useShallow((s) => s.sessions));
  const tabs = useWorkspaceStore(useShallow((s) => s.tabs));
  const {
    handoffs,
    repoPrs,
    handoffsError,
    prsError,
    isRefreshing,
    watermarkMs,
    externallyActiveDirs,
    refresh,
    markSeen,
  } = useBandStore();
  const gatedRuns = useActStore(useShallow((s) => s.gatedRuns));
  const snoozeEntries = useSnoozeStore(useShallow((s) => s.entries));
  const unsnooze = useSnoozeStore((s) => s.unsnooze);
  const closedBatches = useClosedSessionsStore(useShallow((s) => s.batches));
  const [statusFilter, setStatusFilter] = useState<BackendSessionStatus | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const inspectTriggerRef = useRef<HTMLElement | null>(null);
  const focusDetail = useCallback(() => {
    detailRef.current?.focus({ preventScroll: true });
    detailRef.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const bandTabs: BandTab[] = useMemo(
    () =>
      tabs.map((t) => ({
        id: t.id,
        name: t.name,
        projectPath: t.projectPath,
        selectedRepoPath: t.selectedRepoPath,
      })),
    [tabs],
  );

  /* The 5-minute polling loop lives at App level (useBandPolling) so the
     Vanguard snapshot stays fresh with Home closed; opening Home just tops
     the data up once so the first paint isn't up to 5 minutes old. */
  useEffect(() => {
    void refresh();
    void useActStore.getState().refresh();
  }, [refresh]);

  /* Expiry is time-based, so nothing re-renders on its own when a deadline
     passes. A minute's granularity is right for a snooze measured in hours
     and for a 30-minute undo shelf. */
  useEffect(() => {
    const tick = () => {
      useSnoozeStore.getState().prune();
      useClosedSessionsStore.getState().prune();
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  /* `activeDirs` is what keeps a handoff from being called blocked-on-you
     while a claude session is already running in its directory outside
     Maestro. The Board reads the same field; Home would otherwise keep
     showing the row the Board has already dropped. */
  const bands = useMemo(
    () =>
      assembleBands({
        sessions,
        tabs: bandTabs,
        handoffs,
        repoPrs,
        gatedRuns,
        watermarkMs,
        activeDirs: externallyActiveDirs,
      }),
    [sessions, bandTabs, handoffs, repoPrs, gatedRuns, watermarkMs, externallyActiveDirs],
  );

  /** The strip filter narrows session rows; other rows stay (they have no status). */
  const filtered = useCallback(
    (items: BandItem[]) =>
      statusFilter === null
        ? items
        : items.filter((i) => i.kind !== "session" || i.session.status === statusFilter),
    [statusFilter],
  );

  const launchHandoff = useLaunchHandoff(onNavigate);
  const restoreClosedBatch = useRestoreClosedBatch(onNavigate);

  /* Snoozed rows leave the band but stay reachable in a shelf below it — a
     hidden row with no way back is indistinguishable from a lost one. */
  const blocked = useMemo(
    () => partitionSnoozed(filtered(bands.blocked), snoozeEntries, Date.now()),
    [bands.blocked, filtered, snoozeEntries],
  );
  const selectedItem = [
    ...blocked.visible,
    ...filtered(bands.landed),
    ...filtered(bands.running),
  ].find((item) => bandItemKey(item) === selectedKey);
  const inspect = (item: BandItem, trigger: HTMLElement) => {
    inspectTriggerRef.current = trigger;
    const key = bandItemKey(item);
    setSelectedKey(key);
    if (key === selectedKey) focusDetail();
  };
  useEffect(() => {
    if (selectedKey) focusDetail();
  }, [selectedKey, focusDetail]);
  useEffect(() => {
    if (selectedKey && !selectedItem) setSelectedKey(null);
  }, [selectedItem, selectedKey]);

  const handleRestore = useCallback(
    (batchId: string) => {
      const batch = closedBatches.find((b) => b.id === batchId);
      if (batch) restoreClosedBatch(batch);
    },
    [closedBatches, restoreClosedBatch],
  );

  /* Dismiss deletes the snapshot file, so it asks first — every other action
     on this screen is reversible and this one is not. */
  const handleDismissHandoff = useCallback((h: HandoffInfo) => {
    void ask(
      `Delete the handoff snapshot for ${h.repo}? It is removed from disk and cannot be restored.`,
      { title: "Dismiss handoff", kind: "warning" },
    )
      .then(async (confirmed) => {
        if (!confirmed) return;
        const error = await useBandStore.getState().dismissHandoff(h.slug);
        if (error) console.error("Failed to dismiss handoff:", error);
      })
      .catch((err) => console.error("Failed to dismiss handoff:", err));
  }, []);

  /* After inserting a draft the user has to SEE the input line to press Enter
     on it, so the dialog hands the session back here to jump to. A session
     whose project has no open tab has no terminal to jump to; the text is in
     its stdin either way. */
  const handleNavigateToSession = useCallback(
    (sessionId: number) => {
      const session = sessions.find((s) => s.id === sessionId);
      const tabId = session
        ? (bandTabs.find((t) => t.projectPath === session.project_path)?.id ?? null)
        : null;
      if (tabId) onNavigate(tabId, sessionId);
    },
    [sessions, bandTabs, onNavigate],
  );

  const handleDraftReply = useCallback((session: SessionConfig) => {
    void useReplyDraftStore.getState().open({
      sessionId: session.id,
      projectPath: session.working_directory ?? session.worktree_path ?? session.project_path,
      question: session.needsInputPrompt ?? session.statusMessage ?? "",
      repo: projectDisplayName(session.project_path),
      branch: session.branch,
      statusMessage: session.statusMessage ?? null,
    });
  }, []);

  return (
    /* z-50 like the landscape overlay: the zoomed eagle pane sits at z-40. */
    <div className="inbox-screen absolute inset-0 z-50 flex flex-col bg-maestro-bg">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-maestro-border px-3">
        <span className="mr-1 shrink-0 text-[12px] font-semibold text-maestro-text">Inbox</span>

        {/* Fleet strip: one chip per status with a live count; click filters.
            Idle sessions live in no band, so that chip is a count, not a filter
            (clicking it would blank all three bands — review fc0e6b9, LOW #2). */}
        {STRIP_ORDER.map((status) => {
          const count = bands.counts[status];
          const badge = SESSION_STATUS_BADGES[status];
          const active = statusFilter === status;
          const countOnly = status === "Idle";
          const chipContent = (
            <>
              <span className={`${badgeBaseClass} ${badge.cls}`}>{badge.label}</span>
              <span>{count}</span>
            </>
          );
          const chipTitle = `${badge.label}: ${count} session${count === 1 ? "" : "s"}`;
          if (countOnly) {
            return (
              <span
                key={status}
                className={`flex shrink-0 items-center gap-1 rounded border border-maestro-border px-1.5 py-0.5 text-[10px] text-maestro-muted ${
                  count === 0 ? "opacity-40" : ""
                }`}
                title={chipTitle}
              >
                {chipContent}
              </span>
            );
          }
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(active ? null : status)}
              disabled={count === 0 && !active}
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                active
                  ? "border-maestro-accent/60 text-maestro-text"
                  : "border-maestro-border text-maestro-muted hover:text-maestro-text"
              } ${count === 0 && !active ? "opacity-40" : ""}`}
              title={chipTitle}
            >
              {chipContent}
            </button>
          );
        })}

        <div className="flex-1" />
        <button
          type="button"
          onClick={() => useTourStore.getState().open()}
          className="rounded p-1.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          aria-label="Show tour"
          title="Show the app tour"
        >
          <HelpCircle size={13} />
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          className="rounded p-1.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text disabled:opacity-50"
          aria-label="Refresh"
          title="Refresh handoffs and pull requests"
        >
          <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          aria-label="Close home"
        >
          <X size={14} />
        </button>
      </div>

      {/* Bands */}
      <div className="inbox-workspace min-h-0 flex-1 overflow-y-auto">
        <div className="inbox-queue flex min-w-0 flex-col gap-6 px-6 py-8">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight text-maestro-text">
              Your attention
            </h1>
            <p className="mt-2 text-sm text-maestro-muted">
              {blocked.visible.length} items need a decision. Select one to see the context.
            </p>
          </header>
          <ClosedBatchShelf onRestore={handleRestore} />
          <Band
            onInspect={inspect}
            selectedKey={selectedItem ? selectedKey : null}
            title="Blocked on you"
            icon={<CircleDot size={12} className="text-maestro-accent" />}
            items={blocked.visible}
            emptyText="Nothing is blocked on you."
            stale={handoffsError}
            action={
              bands.moreHandoffs > 0 ? (
                <span
                  className="text-[10px] text-maestro-muted/70"
                  title="Older handoffs on disk, one per directory, hidden to keep the queue short"
                >
                  +{bands.moreHandoffs} more handoffs on disk
                </span>
              ) : undefined
            }
          />

          {blocked.snoozed.length > 0 && (
            <section>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Clock size={12} className="text-maestro-muted" />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-maestro-muted">
                  Snoozed
                </h2>
                <span className="text-[11px] text-maestro-muted/70">{blocked.snoozed.length}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {blocked.snoozed.map((item) => {
                  const key = bandItemKey(item);
                  const label =
                    item.kind === "session"
                      ? (item.session.name ?? item.projectName)
                      : item.kind === "handoff"
                        ? item.handoff.repo
                        : item.kind === "pr"
                          ? `#${item.pr.number} ${item.pr.title}`
                          : item.run.title;
                  return (
                    <div
                      key={key}
                      className="flex w-full items-center gap-2 rounded border border-maestro-border bg-maestro-card px-3 py-2 text-left opacity-70"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-maestro-muted">
                        {label}
                      </span>
                      <button
                        type="button"
                        onClick={() => unsnooze(key)}
                        className="shrink-0 rounded border border-maestro-border px-1.5 py-0.5 text-[11px] text-maestro-muted transition-colors hover:border-maestro-muted/50 hover:text-maestro-text"
                        title="Bring this row back to the band now"
                      >
                        Bring back
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <Band
            title="Landed since you looked"
            onInspect={inspect}
            selectedKey={selectedItem ? selectedKey : null}
            icon={<CheckCircle2 size={12} className="text-maestro-green" />}
            items={filtered(bands.landed)}
            emptyText="Nothing new has landed."
            /* A partially failed poll must not read as "nothing landed" —
               that is silent under-reporting on a decision queue. */
            stale={
              prsError ??
              (repoPrs.some((r) => r.error)
                ? `Could not poll: ${repoPrs
                    .filter((r) => r.error)
                    .map((r) => r.projectName)
                    .join(", ")}`
                : null)
            }
            action={
              <button
                type="button"
                onClick={markSeen}
                className="rounded border border-maestro-border px-1.5 py-0.5 text-[10px] text-maestro-muted transition-colors hover:text-maestro-text"
                title="Merged PRs up to now stop counting as news"
              >
                Mark seen
              </button>
            }
          />
          <Band
            title="Running"
            onInspect={inspect}
            selectedKey={selectedItem ? selectedKey : null}
            icon={<Inbox size={12} className="text-maestro-blue" />}
            items={filtered(bands.running)}
            emptyText="Nothing is running."
          />
        </div>
        <section
          ref={detailRef}
          tabIndex={-1}
          aria-label="Work detail"
          data-selected={!!selectedItem}
          className="inbox-detail min-w-0 border-l border-maestro-border bg-maestro-surface/40 px-6 py-8"
        >
          {selectedItem ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-maestro-muted">{itemSummary(selectedItem).context}</p>
                  <h2 className="mt-3 break-words text-2xl font-semibold tracking-tight text-maestro-text">
                    {itemSummary(selectedItem).title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedKey(null);
                    inspectTriggerRef.current?.focus();
                  }}
                  aria-label="Close work detail"
                  className="rounded-md p-3 text-maestro-muted hover:bg-maestro-card"
                >
                  <X size={16} />
                </button>
              </div>
              <div key={selectedKey} className="mt-6 border-t border-maestro-border">
                {selectedItem.kind === "session" ? (
                  <SessionRow
                    item={selectedItem}
                    onNavigate={onNavigate}
                    onDraftReply={
                      selectedItem.session.status === "NeedsInput" ? handleDraftReply : undefined
                    }
                    snoozeKey={
                      blocked.visible.some((item) => bandItemKey(item) === selectedKey)
                        ? bandItemKey(selectedItem)
                        : undefined
                    }
                  />
                ) : selectedItem.kind === "pr" ? (
                  <PrRow item={selectedItem} />
                ) : selectedItem.kind === "run" ? (
                  <RunRow item={selectedItem} />
                ) : (
                  <>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-maestro-text">
                      {[selectedItem.handoff.lastAction, ...selectedItem.handoff.asks]
                        .filter(Boolean)
                        .join("\n\n")}
                    </p>
                    <HandoffRow
                      item={selectedItem}
                      onLaunch={launchHandoff}
                      onDismiss={handleDismissHandoff}
                      snoozeKey={bandItemKey(selectedItem)}
                    />
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-64 flex-col justify-center">
              <Inbox size={28} strokeWidth={1.2} className="text-maestro-muted" />
              <h2 className="mt-5 text-xl font-medium text-maestro-text">
                Room to make a decision
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-maestro-muted">
                Select an item from the queue. Inspecting it will not launch work or send a reply.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Suggestion panel for a blocked session. Renders nothing with no target. */}
      <ReplyDraftDialog onNavigate={handleNavigateToSession} />
    </div>
  );
}
