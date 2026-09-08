import { HelpCircle, LayoutGrid, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BoardCard, boardCardKey, cardAction } from "@/components/board/BoardCard";
import { BoardColumn } from "@/components/board/BoardColumn";
import { BoardPeek } from "@/components/board/BoardPeek";
import { WorkLedger } from "@/components/board/WorkLedger";
import { badgeBaseClass, SESSION_STATUS_BADGES } from "@/components/session/agentPresentation";
import type { BandTab, HandoffInfo } from "@/lib/bands";
import {
  assembleBoard,
  BOARD_COLUMN_ORDER,
  type BoardCardItem,
  type BoardColumnKey,
  type BoardReviewRequests,
} from "@/lib/board";
import { buildLedgerEntries, groupLedgerEntries, ledgerTotals } from "@/lib/workLedger";
import { useActStore } from "@/stores/useActStore";
import { useBandStore } from "@/stores/useBandStore";
import { useGitHubWatchdogStore } from "@/stores/useGitHubWatchdogStore";
import type { BackendSessionStatus } from "@/stores/useSessionStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { useTourStore } from "@/stores/useTourStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

/**
 * The Board: every piece of live work, in the stage it is honestly in.
 *
 * A layer over the permanently mounted grid (the HomeView pattern), not a
 * replacement for it. Assembly is `assembleBoard`, so this file only renders
 * and routes clicks; the column rules are unit-tested next door in
 * `src/lib/__tests__/board.test.ts`.
 *
 * Cards are deliberately not draggable. A card's stage is derived from live
 * state, so a drag would either do nothing or move a card to a stage the work
 * is not in, and both are dead controls in the pivot's terms.
 *
 * Two faces, one layer. `mode="board"` is the stage view above; `mode="ledger"`
 * hands the same sources to [`WorkLedger`], which reads them as history rather
 * than as stages. They share this component because they share the polling and
 * the staleness reporting, not because they render anything alike.
 */

interface BoardViewProps {
  /** Leave the Board and focus a terminal (or just its project). */
  onNavigateSession: (tabId: string, sessionId?: number) => void;
  /** Open an ACT run in the Factory (its gate lives there). */
  onOpenRun: (runId: string) => void;
  /** Start a session in the handoff's directory, seeded with it. */
  onLaunchHandoff: (handoff: HandoffInfo) => void;
  /** Open a pull request in the browser. */
  onOpenPr: (url: string) => void;
  /** Close the Board layer to reveal the terminal grid underneath. */
  onShowGrid: () => void;
  /**
   * Open a directory as a Maestro tab without launching a session in it,
   * for adopting the project an outside claude is working in.
   */
  onOpenProject: (dir: string) => void;
  /**
   * A z-50 overlay (Home, Factory, Landscape, Workflows) is stacked over the
   * Board. They open without closing it, so while one is up the Board's keys
   * must go dead: j/k/Enter acting on cards nobody can see activated hidden
   * work (review finding 1 on 4f3f27a).
   */
  overlayOpen: boolean;
  /**
   * Which face of the work sources this layer shows. The rail's Board and
   * Ledger entries pick it; defaults to the Board so every existing caller
   * and test keeps the view it had.
   */
  mode?: "board" | "ledger";
}

/** Per stage: its header, its empty sentence, and its dot colour (design 1b). */
const COLUMN_META: Record<BoardColumnKey, { title: string; emptyText: string; dot: string }> = {
  suggested: {
    title: "Suggested",
    emptyText: "No handoffs are waiting on disk.",
    dot: "bg-maestro-muted",
  },
  planning: {
    title: "Planning",
    emptyText: "Nothing is being planned.",
    dot: "bg-maestro-purple",
  },
  building: { title: "Building", emptyText: "Nothing is being built.", dot: "bg-maestro-blue" },
  checking: { title: "Checking", emptyText: "Nothing is being checked.", dot: "bg-maestro-yellow" },
  review: {
    title: "Review",
    emptyText: "Nothing is waiting on review.",
    dot: "bg-maestro-accent",
  },
  done: {
    title: "Done",
    emptyText: "Nothing has finished since you looked.",
    dot: "bg-maestro-green",
  },
};

/** Fleet strip display order: what needs you first, calmest last (Home's order). */
const STRIP_ORDER: BackendSessionStatus[] = [
  "NeedsInput",
  "Working",
  "Starting",
  "Done",
  "Error",
  "Timeout",
  "Idle",
];

const headerButtonClass =
  "shrink-0 rounded p-1.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text";

export function BoardView({
  onNavigateSession,
  onOpenRun,
  onLaunchHandoff,
  onOpenPr,
  onShowGrid,
  onOpenProject,
  overlayOpen,
  mode = "board",
}: BoardViewProps) {
  const sessions = useSessionStore(useShallow((s) => s.sessions));
  const tabs = useWorkspaceStore(useShallow((s) => s.tabs));
  const {
    handoffs,
    repoPrs,
    handoffsError,
    prsError,
    processesError,
    isRefreshing,
    watermarkMs,
    externallyActiveDirs,
    refresh,
    markSeen,
  } = useBandStore();
  const runs = useActStore(useShallow((s) => s.runs));
  const gatedRuns = useActStore(useShallow((s) => s.gatedRuns));
  const actError = useActStore((s) => s.error);
  const watchdogProjects = useGitHubWatchdogStore(useShallow((s) => s.projects));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<BoardColumnKey | "all">("all");
  const ledgerRef = useRef<HTMLDivElement>(null);
  const [peekItem, setPeekItem] = useState<Extract<BoardCardItem, { kind: "external" }> | null>(
    null,
  );

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

  const reviewRequests: BoardReviewRequests[] = useMemo(
    () =>
      watchdogProjects.map((p) => ({
        repoPath: p.repoPath,
        projectName: p.name,
        reviewRequests: p.reviewRequests,
      })),
    [watchdogProjects],
  );

  /* The 5-minute polling loop lives at App level (useBandPolling) so the
     Vanguard snapshot stays fresh with the Board closed; opening the Board
     tops the data up once so the first paint is not up to 5 minutes old. */
  useEffect(() => {
    void refresh();
    void useActStore.getState().refresh();
  }, [refresh]);

  const columns = useMemo(
    () =>
      assembleBoard({
        sessions,
        tabs: bandTabs,
        handoffs,
        repoPrs,
        runs,
        gatedRuns,
        reviewRequests,
        watermarkMs,
        activeDirs: externallyActiveDirs,
      }),
    [
      sessions,
      bandTabs,
      handoffs,
      repoPrs,
      runs,
      gatedRuns,
      reviewRequests,
      watermarkMs,
      externallyActiveDirs,
    ],
  );

  /* The ledger reads the same three polls the board does, as history rather
     than as stages: merged pull requests, Factory runs, and the handoff files
     on disk. Nothing new is fetched and nothing new is written. */
  const ledgerGroups = useMemo(
    () =>
      groupLedgerEntries(
        buildLedgerEntries({
          mergedPrs: repoPrs.flatMap((repo) =>
            repo.merged.map((pr) => ({
              repoPath: repo.repoPath,
              projectName: repo.projectName,
              pr,
            })),
          ),
          runs,
          handoffs,
        }),
      ),
    [repoPrs, runs, handoffs],
  );
  const ledgerCounts = useMemo(() => ledgerTotals(ledgerGroups), [ledgerGroups]);
  /* The projects half is dropped rather than printed as zero when no record
     named one: "across 0 projects" reads as a finding about the projects,
     when it is a fact about the records. */
  const ledgerRecords = ledgerCounts.merged + ledgerCounts.runs + ledgerCounts.handoffs;
  const ledgerSummary =
    ledgerCounts.projects === 0
      ? `${ledgerRecords} record${ledgerRecords === 1 ? "" : "s"}`
      : `${ledgerRecords} record${ledgerRecords === 1 ? "" : "s"} across ${ledgerCounts.projects} project${ledgerCounts.projects === 1 ? "" : "s"}`;

  /* Reading order for j/k: column by column, left to right, top to bottom.
     Only cards Enter can act on: parking the selection on a card that
     silently no-ops is a dead control by keyboard, and the why-disabled
     explanation is hover-only (review finding 4 on 4f3f27a). */
  const flat = useMemo(
    () =>
      BOARD_COLUMN_ORDER.filter((key) => stageFilter === "all" || key === stageFilter)
        .flatMap((key) => columns[key])
        .filter((item) => cardAction(item).enabled),
    [columns, stageFilter],
  );

  const activate = useCallback(
    (item: BoardCardItem) => {
      switch (item.kind) {
        case "session":
          if (item.tabId) onNavigateSession(item.tabId, item.session.id);
          return;
        case "handoff":
          onLaunchHandoff(item.handoff);
          return;
        case "run":
          onOpenRun(item.run.id);
          return;
        case "pr":
          onOpenPr(item.pr.url);
          return;
        case "external":
          /* Maestro cannot open or zoom a session it did not spawn; the
             honest action is the read-only peek at its transcript trail. */
          setPeekItem(item);
          return;
      }
    },
    [onNavigateSession, onLaunchHandoff, onOpenRun, onOpenPr],
  );

  /* Selection follows the card, so when the card itself leaves the board
     (tab closed, handoff went live outside) the ring must go with it: a
     ringed card j/k/Enter no longer see is a dead control wearing focus. */
  useEffect(() => {
    if (selectedKey && !flat.some((item) => boardCardKey(item) === selectedKey)) {
      setSelectedKey(null);
    }
  }, [flat, selectedKey]);

  const focusSelectedCard = useCallback(() => {
    const selected = ledgerRef.current?.querySelector<HTMLButtonElement>(
      'button[data-selected="true"]',
    );
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView?.({ block: "nearest" });
  }, []);

  useEffect(() => {
    if (selectedKey && !overlayOpen && !peekItem && mode === "board") focusSelectedCard();
  }, [selectedKey, overlayOpen, peekItem, focusSelectedCard, mode]);

  /* Same for the peek: when its directory stops being live outside (the
     poll dropped it, or the session ended), a panel still saying "working
     outside Maestro" would be asserting a present tense nobody verified. */
  useEffect(() => {
    if (
      peekItem &&
      !columns.building.some((c) => c.kind === "external" && c.dir === peekItem.dir)
    ) {
      setPeekItem(null);
    }
  }, [columns, peekItem]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      /* The tour's focus trap only traps Tab, so every other key still
         reaches this listener behind its modal (useAppKeyboard.ts makes the
         same early return for the same reason). Same guard while a z-50
         overlay covers the board: these keys would act on hidden cards. */
      if (overlayOpen) return;
      /* j/k/Enter walk board cards. The ledger has none, so in that mode the
         keys must go dead rather than move a selection nobody can see. */
      if (mode !== "board") return;
      if (useTourStore.getState().isOpen) return;
      /* The peek is modal over the board: its own focus trap owns Escape
         and Tab; everything here goes dead so j/k/Enter cannot act on the
         cards hidden behind it. */
      if (peekItem) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select") ||
          (event.key === "Enter" && target.closest("button, a, summary, [role=tab]")))
      ) {
        return;
      }
      if (flat.length === 0) return;

      const at = flat.findIndex((item) => boardCardKey(item) === selectedKey);
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const next =
          event.key === "j"
            ? at < 0
              ? 0
              : (at + 1) % flat.length
            : at < 0
              ? flat.length - 1
              : (at - 1 + flat.length) % flat.length;
        const key = boardCardKey(flat[next]);
        setSelectedKey(key);
        if (key === selectedKey) focusSelectedCard();
      } else if (event.key === "Enter" && at >= 0) {
        event.preventDefault();
        activate(flat[at]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flat, selectedKey, activate, overlayOpen, peekItem, focusSelectedCard, mode]);

  /* A partially failed PR poll must not read as "nothing in review": naming
     the repos that failed is the difference between stale and wrong. */
  const prsStale =
    prsError ??
    (repoPrs.some((r) => r.error)
      ? `Could not poll: ${repoPrs
          .filter((r) => r.error)
          .map((r) => r.projectName)
          .join(", ")}`
      : null);

  function staleFor(key: BoardColumnKey): string | null {
    /* A failed process scan empties the live outside-Maestro cards AND
       drops their handoffs back into Suggested with a live Launch action;
       both columns say so, since launching a second agent onto a directory
       already being driven is the harmful direction. */
    if (key === "suggested") return handoffsError ?? processesError;
    if (key === "building") return processesError;
    if (key === "review" || key === "done") return prsStale;
    return null;
  }

  function noteFor(key: BoardColumnKey) {
    if (key !== "suggested") return undefined;
    const activeOutside = externallyActiveDirs.size;
    if (columns.moreHandoffs === 0 && activeOutside === 0) return undefined;
    return (
      <span className="flex shrink-0 items-center gap-2 text-[10px] text-maestro-muted/70">
        {columns.moreHandoffs > 0 && (
          <span title="Older handoffs on disk, one per directory, hidden to keep the column short">
            +{columns.moreHandoffs} more on disk
          </span>
        )}
        {activeOutside > 0 && (
          <span title="Directories with a claude process already running outside Vanguard, so their handoffs are not waiting for anyone">
            {activeOutside} active outside Vanguard
          </span>
        )}
      </span>
    );
  }

  const warnings = [
    ...new Set([handoffsError, prsStale, processesError, actError].filter(Boolean)),
  ];
  const visibleStages = BOARD_COLUMN_ORDER.filter((key) =>
    stageFilter === "all"
      ? columns[key].length > 0 || staleFor(key) || noteFor(key)
      : key === stageFilter,
  );
  const total = BOARD_COLUMN_ORDER.reduce((sum, key) => sum + columns[key].length, 0);

  return (
    /* z-45: above the zoomed grid pane (z-40) and below the Home/Factory/
       Landscape/Workflows overlays (z-50), which therefore keep stacking on
       top of the Board with no change to the overlay-exclusivity rules. */
    <div className="absolute inset-0 z-[45] flex flex-col bg-maestro-bg">
      {/* The reference gives the two faces different gutters (30px on Board,
          34px on Ledger) because there they are separate screens with their
          own headers. One header serves both here, so it follows the face it
          is titling rather than leaving the title 4px off its own body. */}
      <div
        className={`flex shrink-0 flex-wrap items-baseline gap-3 pb-[18px] pt-[26px] ${
          mode === "ledger" ? "px-[34px]" : "px-[30px]"
        }`}
      >
        <h1 className="font-mono text-[13px] font-semibold uppercase tracking-[0.09em] text-maestro-muted">
          {mode === "ledger" ? "Ledger" : "Board"}
        </h1>
        <p className="font-mono text-[12px] text-maestro-muted">
          {mode === "ledger" ? ledgerSummary : `${total} piece${total === 1 ? "" : "s"} of work`}
        </p>
        {actError && (
          <span
            className={`${badgeBaseClass} bg-maestro-yellow/15 text-maestro-yellow`}
            title={`Factory runs may be out of date: ${actError}`}
          >
            FACTORY STALE
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={markSeen}
          className="shrink-0 rounded border border-maestro-border px-1.5 py-0.5 text-[10px] text-maestro-muted transition-colors hover:text-maestro-text"
          title="Merged pull requests and finished runs up to now stop counting as news"
        >
          Mark seen
        </button>
        <button
          type="button"
          onClick={() => useTourStore.getState().open()}
          className={headerButtonClass}
          aria-label="Show tour"
          title="Show the app tour"
        >
          <HelpCircle size={13} />
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          className={`${headerButtonClass} disabled:opacity-50`}
          aria-label="Refresh"
          title="Refresh handoffs and pull requests"
        >
          <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          onClick={onShowGrid}
          className="flex shrink-0 items-center gap-1.5 rounded-[7px] border border-maestro-border px-[13px] py-[5px] text-[12px] font-medium text-maestro-muted transition-colors hover:text-maestro-text"
          aria-label="Grid view"
          title="Show the terminal grid"
        >
          <LayoutGrid size={12} /> Show the terminals instead
        </button>
      </div>

      {mode === "board" && (
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-maestro-border px-[30px]"
          aria-label="Work stages"
        >
          {(["all", ...BOARD_COLUMN_ORDER] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-label={`Filter ${key === "all" ? "All" : COLUMN_META[key].title}`}
              aria-pressed={stageFilter === key}
              onClick={() => setStageFilter(key)}
              className={`shrink-0 border-b-2 px-3 py-3 text-[12px] transition-colors ${stageFilter === key ? "border-maestro-accent text-maestro-text" : "border-transparent text-maestro-muted hover:text-maestro-text"}`}
            >
              {key === "all" ? "All work" : COLUMN_META[key].title}
              <span className="ml-2 font-mono text-[10px] text-maestro-muted">
                {key === "all" ? total : columns[key].length}
              </span>
            </button>
          ))}
        </nav>
      )}
      {warnings.length > 0 && (
        <output className="border-b border-maestro-yellow/20 bg-maestro-yellow/5 px-8 py-3 text-xs text-maestro-yellow">
          Some sources are out of date: {warnings.join(" · ")}
        </output>
      )}
      {mode === "ledger" ? (
        <WorkLedger
          groups={ledgerGroups}
          totals={ledgerCounts}
          onOpenEntry={(href) => onOpenPr(href)}
        />
      ) : visibleStages.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center px-[30px] py-16">
          <span className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-maestro-muted">
            {warnings.length ? "Incomplete snapshot" : "Clear workspace"}
          </span>
          <h2 className="text-2xl font-medium tracking-tight text-maestro-text">
            {warnings.length ? "Work sources unavailable" : "No live work yet"}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-maestro-muted">
            Start a terminal in one of your projects. Sessions, handoffs and pull requests will
            appear here as work progresses.
          </p>
          <button
            type="button"
            onClick={onShowGrid}
            className="mt-6 rounded-md border border-maestro-border px-4 py-2 text-xs text-maestro-text hover:bg-maestro-card"
          >
            Open terminals
          </button>
        </div>
      ) : (
        /* Lanes side by side, the reference's board geometry. They scroll
           horizontally rather than shrinking below a legible card width, so a
           narrow window loses none of the six stages. */
        <div
          ref={ledgerRef}
          className="grid min-h-0 min-w-0 flex-1 gap-[14px] overflow-x-auto px-[30px] pb-[26px] pt-[18px]"
          style={{ gridTemplateColumns: `repeat(${visibleStages.length}, minmax(200px, 1fr))` }}
        >
          {visibleStages.map((key) => {
            const items = columns[key];
            return (
              <BoardColumn
                key={key}
                title={COLUMN_META[key].title}
                count={items.length}
                emptyText={COLUMN_META[key].emptyText}
                dotClass={COLUMN_META[key].dot}
                stale={staleFor(key)}
                note={noteFor(key)}
              >
                {items.map((item) => {
                  const cardKey = boardCardKey(item);
                  return (
                    <BoardCard
                      key={cardKey}
                      item={item}
                      selected={cardKey === selectedKey}
                      onActivate={() => {
                        setSelectedKey(cardKey);
                        activate(item);
                      }}
                    />
                  );
                })}
              </BoardColumn>
            );
          })}
        </div>
      )}

      {/* Fleet strip: plain counts, not chips that look clickable. Idle
          sessions get no card anywhere on the board, so this strip is the
          only place they stay visible. */}
      <div className="flex h-8 shrink-0 items-center gap-1.5 overflow-x-auto border-t border-maestro-border px-3">
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-maestro-muted/70">
          Fleet
        </span>
        {STRIP_ORDER.map((status) => {
          const count = columns.counts[status];
          const badge = SESSION_STATUS_BADGES[status];
          return (
            <span
              key={status}
              className={`flex shrink-0 items-center gap-1 rounded border border-maestro-border px-1.5 py-0.5 text-[10px] text-maestro-muted ${
                count === 0 ? "opacity-40" : ""
              }`}
              title={`${badge.label}: ${count} session${count === 1 ? "" : "s"}`}
            >
              <span className={`${badgeBaseClass} ${badge.cls}`}>{badge.label}</span>
              <span>{count}</span>
            </span>
          );
        })}
        <div className="flex-1" />
        <span className="shrink-0 text-[10px] text-maestro-muted/70">
          {mode === "ledger" ? "Pick a day to expand it" : "j and k move, Enter opens"}
        </span>
      </div>

      {peekItem && (
        <BoardPeek
          dir={peekItem.dir}
          cwds={peekItem.cwds}
          projectName={peekItem.projectName}
          onClose={() => setPeekItem(null)}
          onOpenProject={(dir) => {
            setPeekItem(null);
            onOpenProject(dir);
          }}
        />
      )}
    </div>
  );
}
