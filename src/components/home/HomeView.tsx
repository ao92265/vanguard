import { ask } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Clock,
  ExternalLink,
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
import { SESSION_STATUS_BADGES } from "@/components/session/agentPresentation";
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

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
}

/** The queue's time column: one glance, no units to read. Empty when unknown. */
function shortAgo(at: number | null): string {
  if (at === null) return "";
  const ms = Date.now() - at;
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const queueBadgeClass =
  "shrink-0 whitespace-nowrap rounded px-[7px] py-0.5 font-mono text-[10px] font-semibold tracking-[0.05em]";
const actionClass =
  "flex shrink-0 items-center gap-2 rounded-lg border border-maestro-border px-3.5 py-2 text-[12.5px] font-medium text-maestro-text transition-colors hover:border-maestro-muted/60 disabled:cursor-default disabled:opacity-50";
const primaryActionClass =
  "flex shrink-0 items-center gap-2 rounded-lg bg-maestro-accent px-3.5 py-2 text-[12.5px] font-medium text-maestro-on-accent transition-opacity hover:opacity-90 disabled:opacity-40";
const factLabelClass =
  "mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-maestro-muted";
const dividerLabelClass =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-maestro-muted";

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
      return {
        title: item.handoff.repo,
        context: item.handoff.repo,
        detail: item.handoff.lastAction,
      };
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

/** The row badge: what kind of decision this is, in the queue's own words. */
function queueBadge(item: BandItem): { label: string; cls: string } {
  switch (item.kind) {
    case "session":
      return SESSION_STATUS_BADGES[item.session.status];
    /* Both kinds of handoff share the band (bands.ts admits one on asks OR
       waiting), so the badge is the only thing that separates a snapshot that
       asked you a question from one that just has notes on disk. */
    case "handoff":
      return item.handoff.waiting
        ? { label: "ASKED YOU", cls: "bg-maestro-accent/15 text-maestro-accent" }
        : { label: "HANDOFF", cls: "bg-maestro-yellow/15 text-maestro-yellow" };
    case "pr":
      return item.pr.mergedAt
        ? { label: "MERGED", cls: "bg-maestro-purple/15 text-maestro-purple" }
        : { label: "CHANGES REQ", cls: "bg-maestro-accent/15 text-maestro-accent" };
    case "run":
      return { label: "FACTORY GATE", cls: "bg-maestro-accent/15 text-maestro-accent" };
  }
}

/** The mono line beside the project name: where this row actually lives. */
function itemSubtitle(item: BandItem): string {
  switch (item.kind) {
    case "session":
      return [item.session.branch, `session #${item.session.id}`].filter(Boolean).join(" · ");
    case "handoff":
      return item.handoff.branch ?? "";
    case "pr":
      return item.pr.mergedAt ? "merged pull request" : "changes requested";
    case "run":
      return item.run.stage ?? item.run.status;
  }
}

/**
 * Everything the row is asking you, newest last.
 *
 * A handoff can carry several questions and the card shows all of them: one
 * of them is why the row is in this band at all, and picking one would hide a
 * question nobody else is going to ask again. Its last action is a fact, not
 * the question, so it lives in the strip below rather than in the headline.
 */
function itemAskLines(item: BandItem): string[] {
  switch (item.kind) {
    case "session":
      return [itemSummary(item).detail].filter(Boolean);
    case "handoff": {
      const asks = item.handoff.asks.filter(Boolean);
      return asks.length > 0 ? asks : [item.handoff.lastAction].filter(Boolean);
    }
    case "pr":
      return [`#${item.pr.number} ${item.pr.title}`];
    case "run":
      return [item.run.title];
  }
}

/** When the row last moved, in epoch ms. Null when nothing records it. */
function itemTimestamp(item: BandItem): number | null {
  switch (item.kind) {
    case "session":
      return item.session.lastMcpUpdateTime ?? null;
    case "handoff":
      return parseMs(item.handoff.lastActive);
    case "pr":
      return parseMs(item.pr.mergedAt);
    case "run":
      return parseMs(item.run.updatedAt);
  }
}

function itemTime(item: BandItem): string {
  return shortAgo(itemTimestamp(item));
}

/**
 * The strip along the bottom of the focus card: only facts the row actually
 * carries. A missing worktree or a session with no recorded last action drops
 * its column rather than filling it with a plausible-looking path.
 */
function focusFacts(item: BandItem): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  switch (item.kind) {
    case "session": {
      const where = item.session.worktree_path ?? item.session.working_directory ?? null;
      if (where) facts.push({ label: "Worktree", value: where });
      facts.push({ label: "Project", value: item.session.project_path });
      if (item.session.statusMessage) {
        facts.push({ label: "Last action", value: item.session.statusMessage });
      }
      return facts;
    }
    case "handoff":
      facts.push({ label: "Worktree", value: item.handoff.path });
      if (item.handoff.lastAction) {
        facts.push({ label: "Last action", value: item.handoff.lastAction });
      }
      if (item.handoff.uncommitted > 0) {
        facts.push({ label: "Uncommitted", value: `${item.handoff.uncommitted} files` });
      } else if (item.handoff.lastCommit) {
        facts.push({ label: "Last commit", value: item.handoff.lastCommit.msg });
      }
      if (facts.length < 3) {
        facts.push({ label: "Last active", value: relAgo(item.handoff.lastActive) });
      }
      return facts.slice(0, 3);
    case "pr":
      facts.push({ label: "Repository", value: item.repoPath });
      facts.push({ label: "Pull request", value: `#${item.pr.number}` });
      if (item.pr.mergedAt) facts.push({ label: "Merged", value: relAgo(item.pr.mergedAt) });
      return facts;
    case "run": {
      facts.push({ label: "Run", value: item.run.id });
      facts.push({ label: "Status", value: item.run.status });
      if (item.run.updatedAt) {
        facts.push({ label: "Last update", value: relAgo(item.run.updatedAt) });
      }
      return facts;
    }
  }
}

/**
 * Keystrokes belong to whatever is being typed into. The queue's j/k stay out
 * of form fields, rich-text surfaces and any terminal on screen behind the
 * overlay. A terminal swallows every key it is given, and it must keep them.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest("input, textarea, select, .xterm, .terminal-cell") !== null;
}

/** Actions for a session row: everything Home can do without leaving Home. */
function SessionActions({
  session,
  tabId,
  onNavigate,
  onDraftReply,
  snoozeKey,
}: {
  session: SessionConfig;
  tabId: string | null;
  onNavigate: HomeViewProps["onNavigate"];
  /** Blocked-band extras; the other two bands pass nothing and render as before. */
  onDraftReply?: (session: SessionConfig) => void;
  snoozeKey?: SnoozeKey;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  /* The same store action the terminal header's click-to-rename uses — one
     rename path, two surfaces. Blank clears the custom name (the backend
     normalizes an empty string back to None). */
  const commitName = () => {
    const trimmed = nameValue.trim();
    useSessionStore.getState().renameSession(session.id, trimmed || null);
    setEditingName(false);
  };

  return (
    <>
      <button
        type="button"
        className={primaryActionClass}
        disabled={!tabId}
        onClick={() => tabId && onNavigate(tabId, session.id)}
        title={tabId ? "Jump to this terminal" : "Project not open in a tab"}
      >
        Open terminal
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
          className="w-40 shrink-0 rounded-lg border border-maestro-accent bg-maestro-card px-2.5 py-2 text-[12.5px] text-maestro-text outline-none"
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
          className={`${actionClass} text-maestro-muted`}
          title="Rename this session"
        >
          <Pencil size={12} /> Rename
        </button>
      )}

      {onDraftReply && (
        <button
          type="button"
          onClick={() => onDraftReply(session)}
          className={`${actionClass} text-maestro-muted`}
          title="Draft a reply with AI — a suggestion you edit and send yourself"
        >
          <Sparkles size={12} /> Draft reply
        </button>
      )}
      {snoozeKey && <SnoozeButton snoozeKey={snoozeKey} label="this session" />}
    </>
  );
}

function HandoffActions({
  handoff,
  onLaunch,
  onDismiss,
  snoozeKey,
}: {
  handoff: HandoffInfo;
  onLaunch: (h: HandoffInfo) => void;
  onDismiss: (h: HandoffInfo) => void;
  snoozeKey: SnoozeKey;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onLaunch(handoff)}
        className={primaryActionClass}
        title="Launch a session here, seeded with the handoff"
      >
        <Play size={12} /> Resume
      </button>
      <SnoozeButton snoozeKey={snoozeKey} label="this handoff" />
      <button
        type="button"
        onClick={() => onDismiss(handoff)}
        className={`${actionClass} text-maestro-muted hover:border-maestro-red/50 hover:text-maestro-red`}
        title="Delete this handoff snapshot from disk — it will not come back"
      >
        <Trash2 size={12} /> Dismiss
      </button>
    </>
  );
}

/** The focused decision, in full: what is asked, and what you can do about it. */
function FocusCard({
  entry,
  total,
  onNavigate,
  onDraftReply,
  onLaunchHandoff,
  onDismissHandoff,
  snoozeKey,
}: {
  entry: QueueEntry;
  total: number;
  onNavigate: HomeViewProps["onNavigate"];
  onDraftReply: (session: SessionConfig) => void;
  onLaunchHandoff: (h: HandoffInfo) => void;
  onDismissHandoff: (h: HandoffInfo) => void;
  snoozeKey?: SnoozeKey;
}) {
  const { item } = entry;
  const summary = itemSummary(item);
  const badge = queueBadge(item);
  const subtitle = itemSubtitle(item);
  const time = itemTime(item);
  const facts = focusFacts(item);
  const askLines = itemAskLines(item);

  return (
    <>
      <div className="flex flex-wrap items-center gap-[9px] border-b border-maestro-border px-5 py-[13px]">
        <span className="shrink-0 rounded bg-maestro-accent px-[7px] py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-maestro-on-accent">
          {entry.rank} of {total}
        </span>
        <span className="text-[13.5px] font-medium text-maestro-text">{summary.context}</span>
        {subtitle && (
          <span className="min-w-0 font-mono text-[11.5px] text-maestro-muted [overflow-wrap:anywhere]">
            {subtitle}
          </span>
        )}
        <div className="flex-1" />
        <span className={`${queueBadgeClass} ${badge.cls}`}>{badge.label}</span>
        {time && <span className="font-mono text-[11px] text-maestro-muted">{time}</span>}
      </div>

      <div className="px-5 pb-5 pt-[22px]">
        <div className="mb-5 flex max-w-[820px] flex-col gap-3">
          {(askLines.length > 0 ? askLines : [summary.title]).map((line) => (
            <p
              key={line}
              className="text-[22px] font-semibold leading-[1.4] text-maestro-text [overflow-wrap:anywhere] [text-wrap:pretty]"
            >
              {line}
            </p>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-[9px]">
          {item.kind === "session" && (
            <SessionActions
              session={item.session}
              tabId={item.tabId}
              onNavigate={onNavigate}
              onDraftReply={
                item.session.status === "NeedsInput" && entry.band === "blocked"
                  ? onDraftReply
                  : undefined
              }
              snoozeKey={snoozeKey}
            />
          )}
          {item.kind === "handoff" && (
            <HandoffActions
              handoff={item.handoff}
              onLaunch={onLaunchHandoff}
              onDismiss={onDismissHandoff}
              snoozeKey={entry.key}
            />
          )}
          {item.kind === "pr" && (
            <button
              type="button"
              className={primaryActionClass}
              onClick={() =>
                void openUrl(item.pr.url).catch((err) => console.error("Failed to open PR:", err))
              }
              title="Open on GitHub"
            >
              <ExternalLink size={12} /> Open on GitHub
            </button>
          )}
          {item.kind === "pr" && snoozeKey && (
            <SnoozeButton snoozeKey={snoozeKey} label="this pull request" />
          )}
          {item.kind === "run" && (
            <button
              type="button"
              className={primaryActionClass}
              onClick={() => {
                void useActStore.getState().openDetail(item.run.id);
                useHomeViewStore.getState().close();
                useFactoryViewStore.getState().open();
              }}
              title="Open this run in the Factory to approve or reject the gate"
            >
              Open in the Factory
            </button>
          )}
          {item.kind === "run" && snoozeKey && (
            <SnoozeButton snoozeKey={snoozeKey} label="this run" />
          )}
          <div className="flex-1" />
          <span className="font-mono text-[11.5px] text-maestro-muted">J next · K previous</span>
        </div>
      </div>

      {facts.length > 0 && (
        <div className="flex flex-wrap border-t border-maestro-border bg-maestro-surface">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="min-w-[200px] flex-1 border-l border-maestro-border px-5 py-[11px] first:border-l-0"
            >
              <div className={factLabelClass}>{fact.label}</div>
              <div className="font-mono text-[11.5px] text-maestro-text [overflow-wrap:anywhere]">
                {fact.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** One waiting row: rank, what kind, whose it is, what it asks, how long. */
function QueueRow({
  entry,
  onInspect,
}: {
  entry: QueueEntry;
  onInspect: (entry: QueueEntry) => void;
}) {
  const summary = itemSummary(entry.item);
  const badge = queueBadge(entry.item);
  const time = itemTime(entry.item);
  const lines = itemAskLines(entry.item);
  const ask = lines[lines.length - 1] ?? "";
  return (
    <li>
      <button
        type="button"
        onClick={() => onInspect(entry)}
        aria-label={
          summary.context === summary.title
            ? `Inspect ${summary.title}`
            : `Inspect ${summary.context}: ${summary.title}`
        }
        /* The row has room for the most recent ask only; every one of them is
           on the card the moment the row is chosen, and in the tooltip
           meanwhile. */
        title={lines.join("\n")}
        className="flex w-full flex-wrap items-center gap-3 rounded-lg bg-maestro-card px-3.5 py-[11px] text-left transition-colors hover:bg-maestro-surface"
      >
        <span className="w-[14px] shrink-0 font-mono text-[11px] font-semibold text-maestro-muted">
          {entry.rank}
        </span>
        <span className={`${queueBadgeClass} ${badge.cls}`}>{badge.label}</span>
        <span className="w-24 shrink-0 truncate text-[12.5px] font-medium text-maestro-text">
          {summary.context}
        </span>
        <span className="min-w-[12rem] flex-1 truncate text-[12.5px] text-maestro-muted">
          {ask}
        </span>
        <span className="w-11 shrink-0 text-right font-mono text-[11px] text-maestro-muted">
          {time}
        </span>
      </button>
    </li>
  );
}

/** A band of the queue under its own hairline divider. */
function QueueSection({
  label,
  entries,
  emptyText,
  onInspect,
  stale,
  action,
}: {
  label: string;
  entries: QueueEntry[];
  emptyText: string;
  onInspect: (entry: QueueEntry) => void;
  stale?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-[22px]">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className={dividerLabelClass}>{label}</span>
        {stale && (
          <span
            className={`${queueBadgeClass} bg-maestro-yellow/15 text-maestro-yellow`}
            title={stale}
          >
            STALE
          </span>
        )}
        <span className="h-px flex-1 bg-maestro-border" />
        {action}
      </div>
      {entries.length === 0 ? (
        <p className="px-3.5 text-[12px] text-maestro-muted">{emptyText}</p>
      ) : (
        <ul aria-label={label} className="flex flex-col gap-px">
          {entries.map((entry) => (
            <QueueRow key={entry.key} entry={entry} onInspect={onInspect} />
          ))}
        </ul>
      )}
    </div>
  );
}

type QueueBand = "blocked" | "parked" | "landed" | "running";

interface QueueEntry {
  item: BandItem;
  key: string;
  band: QueueBand;
  /** 1-based position in the whole queue, so the focus card can say "3 of 9". */
  rank: number;
}

/**
 * Home, the decision queue. One item has your attention at the top, the rest
 * wait beneath it in the only order that matters: what is blocked on you,
 * what landed since you looked, what is running.
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
     hidden row with no way back is indistinguishable from a lost one.
     Every band is filtered, not only the blocked one: putting off a parked
     handoff used to hide nothing, so the count stayed where it was however
     many rows you had dealt with. */
  const blocked = useMemo(
    () => partitionSnoozed(filtered(bands.blocked), snoozeEntries, Date.now()),
    [bands.blocked, filtered, snoozeEntries],
  );
  const parked = useMemo(
    () => partitionSnoozed(filtered(bands.parked), snoozeEntries, Date.now()),
    [bands.parked, filtered, snoozeEntries],
  );
  const landed = useMemo(
    () => partitionSnoozed(filtered(bands.landed), snoozeEntries, Date.now()),
    [bands.landed, filtered, snoozeEntries],
  );
  const running = useMemo(
    () => partitionSnoozed(filtered(bands.running), snoozeEntries, Date.now()),
    [bands.running, filtered, snoozeEntries],
  );
  /* One shelf for everything put off, in band order. Four shelves would make
     the way back depend on which band the row happened to sit in. */
  const snoozed = useMemo(
    () => [...blocked.snoozed, ...parked.snoozed, ...landed.snoozed, ...running.snoozed],
    [blocked.snoozed, parked.snoozed, landed.snoozed, running.snoozed],
  );

  /* One flat queue in band order, so the focus card and j/k agree on what
     "next" means, while each band keeps its own divider below. */
  const queue = useMemo(() => {
    const entries: QueueEntry[] = [];
    const push = (items: BandItem[], band: QueueBand) => {
      for (const item of items) {
        entries.push({ item, key: bandItemKey(item), band, rank: entries.length + 1 });
      }
    };
    push(blocked.visible, "blocked");
    push(parked.visible, "parked");
    push(landed.visible, "landed");
    push(running.visible, "running");
    return entries;
  }, [blocked.visible, parked.visible, landed.visible, running.visible]);

  /* Nothing selected means the top of the queue is what needs you: the card
     is never empty while the queue is not. */
  const focused = queue.find((entry) => entry.key === selectedKey) ?? queue[0] ?? null;
  const focusedKey = focused?.key ?? null;

  const inspect = useCallback(
    (entry: QueueEntry) => {
      setSelectedKey(entry.key);
      if (entry.key === focusedKey) focusDetail();
    },
    [focusedKey, focusDetail],
  );

  useEffect(() => {
    if (selectedKey) focusDetail();
  }, [selectedKey, focusDetail]);

  /* A selection whose row has left the queue falls back to the top rather
     than leaving the card showing work that is no longer there. */
  useEffect(() => {
    if (selectedKey && !queue.some((entry) => entry.key === selectedKey)) setSelectedKey(null);
  }, [queue, selectedKey]);

  /* j/k walk the queue, clamped at both ends. Everything that owns the
     keyboard for itself (the tour, the draft dialog, a field, a terminal)
     gets it first. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const forward = event.key === "j";
      const back = event.key === "k";
      if (!forward && !back) return;
      if (useTourStore.getState().isOpen) return;
      if (useReplyDraftStore.getState().target) return;
      if (isTypingTarget(event.target)) return;
      if (queue.length === 0) return;

      const at = queue.findIndex((entry) => entry.key === focusedKey);
      const next = Math.min(Math.max((at < 0 ? 0 : at) + (forward ? 1 : -1), 0), queue.length - 1);
      event.preventDefault();
      const key = queue[next].key;
      setSelectedKey(key);
      if (key === focusedKey) focusDetail();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [queue, focusedKey, focusDetail]);

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

  const rest = (band: QueueBand) =>
    queue.filter((entry) => entry.band === band && entry.key !== focusedKey);

  /* The reference's "oldest 41m". It is the least recently updated blocked
     row, not the longest wait: nothing records when a row started waiting,
     and rows without a timestamp of their own are simply not candidates. */
  const oldestBlocked = shortAgo(
    blocked.visible
      .map(itemTimestamp)
      .filter((at): at is number => at !== null)
      .reduce<number | null>((oldest, at) => (oldest === null || at < oldest ? at : oldest), null),
  );

  const prsStale =
    prsError ??
    (repoPrs.some((r) => r.error)
      ? `Could not poll: ${repoPrs
          .filter((r) => r.error)
          .map((r) => r.projectName)
          .join(", ")}`
      : null);

  return (
    /* z-50 like the landscape overlay: the zoomed eagle pane sits at z-40. */
    <div className="absolute inset-0 z-50 flex flex-col bg-maestro-bg">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-[34px] pb-2.5 pt-[26px]">
        {/* The rail navigates here as "Inbox", so the title and the close
            control say Inbox too. The reference's own words for this screen,
            "Blocked on you", stay on the count beside it, which is where the
            other five screens put what their number means. */}
        <h1 className="font-mono text-[13px] font-semibold uppercase tracking-[0.09em] text-maestro-muted">
          Inbox
        </h1>
        <span className="font-mono text-[13px] font-semibold text-maestro-accent">
          {blocked.visible.length} blocked on you
        </span>
        <div className="flex-1" />
        {oldestBlocked && (
          <span
            className="font-mono text-[11.5px] text-maestro-muted"
            title="How long the blocked row that has gone longest without an update has been sitting there"
          >
            oldest {oldestBlocked}
          </span>
        )}
        <span className="font-mono text-[11.5px] text-maestro-muted">
          {landed.visible.length} landed · {running.visible.length} running
        </span>
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
          aria-label="Close inbox"
        >
          <X size={14} />
        </button>
      </div>

      {/* Fleet strip: one chip per status with a live count; click filters.
          Idle sessions live in no band, so that chip is a count, not a filter
          (clicking it would blank all three bands — review fc0e6b9, LOW #2). */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-[34px] pb-3">
        {STRIP_ORDER.map((status) => {
          const count = bands.counts[status];
          const badge = SESSION_STATUS_BADGES[status];
          const active = statusFilter === status;
          const countOnly = status === "Idle";
          const chipContent = (
            <>
              <span className={`${queueBadgeClass} ${badge.cls}`}>{badge.label}</span>
              <span className="font-mono text-[10.5px]">{count}</span>
            </>
          );
          const chipTitle = `${badge.label}: ${count} session${count === 1 ? "" : "s"}`;
          if (countOnly) {
            return (
              <span
                key={status}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border border-maestro-border px-2 py-1 text-maestro-muted ${
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
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 transition-colors ${
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[34px] pb-8">
        <ClosedBatchShelf onRestore={handleRestore} />

        <section
          ref={detailRef}
          tabIndex={-1}
          aria-label="Work detail"
          className="overflow-hidden rounded-xl border border-maestro-accent/45 bg-maestro-card"
        >
          {focused ? (
            <div key={focusedKey}>
              <FocusCard
                entry={focused}
                total={queue.length}
                onNavigate={onNavigate}
                onDraftReply={handleDraftReply}
                onLaunchHandoff={launchHandoff}
                onDismissHandoff={handleDismissHandoff}
                snoozeKey={focused.key}
              />
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 px-5 py-8">
              <Inbox size={24} strokeWidth={1.2} className="text-maestro-muted" />
              <h2 className="text-[18px] font-medium text-maestro-text">Nothing is waiting</h2>
              <p className="max-w-md text-[12.5px] leading-relaxed text-maestro-muted">
                No session is asking, nothing has landed and nothing is running. New work appears
                here on its own.
              </p>
            </div>
          )}
        </section>

        <QueueSection
          label="Then"
          entries={rest("blocked")}
          emptyText="Nothing else is blocked on you."
          onInspect={inspect}
        />

        {/* Parked is not "blocked on you": nobody is waiting on these, they
            are yours to pick up. Kept in the queue so j/k still reach them. */}
        <QueueSection
          label="Parked, pick up when you want"
          entries={rest("parked")}
          emptyText="No handoffs are waiting on disk."
          onInspect={inspect}
          stale={handoffsError}
          action={
            bands.moreHandoffs > 0 ? (
              <span
                className="font-mono text-[10.5px] text-maestro-muted/70"
                title="Older handoffs on disk, one per directory, hidden to keep the queue short"
              >
                +{bands.moreHandoffs} more handoffs on disk
              </span>
            ) : undefined
          }
        />

        {snoozed.length > 0 && (
          <div className="mt-[22px]">
            <div className="mb-2.5 flex items-center gap-2.5">
              <Clock size={11} className="text-maestro-muted" />
              <span className={dividerLabelClass}>Snoozed</span>
              <span className="font-mono text-[10.5px] text-maestro-muted/70">
                {snoozed.length}
              </span>
              <span className="h-px flex-1 bg-maestro-border" />
            </div>
            <div className="flex flex-col gap-px">
              {snoozed.map((item) => {
                const key = bandItemKey(item);
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-3 rounded-lg bg-maestro-card px-3.5 py-2.5 opacity-70"
                  >
                    <span className="min-w-[12rem] flex-1 truncate text-[12px] text-maestro-muted">
                      {itemSummary(item).title}
                    </span>
                    <button
                      type="button"
                      onClick={() => unsnooze(key)}
                      className="shrink-0 rounded border border-maestro-border px-2 py-0.5 text-[11px] text-maestro-muted transition-colors hover:border-maestro-muted/50 hover:text-maestro-text"
                      title="Bring this row back to the band now"
                    >
                      Bring back
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <QueueSection
          label="Landed since you looked"
          entries={rest("landed")}
          emptyText="Nothing new has landed."
          onInspect={inspect}
          /* A partially failed poll must not read as "nothing landed" —
             that is silent under-reporting on a decision queue. */
          stale={prsStale}
          action={
            <button
              type="button"
              onClick={markSeen}
              className="rounded border border-maestro-border px-2 py-0.5 font-mono text-[10.5px] text-maestro-muted transition-colors hover:text-maestro-text"
              title="Merged PRs up to now stop counting as news"
            >
              Mark seen
            </button>
          }
        />

        <QueueSection
          label="Running"
          entries={rest("running")}
          emptyText="Nothing is running."
          onInspect={inspect}
        />
      </div>

      {/* Suggestion panel for a blocked session. Renders nothing with no target. */}
      <ReplyDraftDialog onNavigate={handleNavigateToSession} />
    </div>
  );
}
