import { Factory, GitMerge, GitPullRequest, Play, TerminalSquare } from "lucide-react";
import { badgeBaseClass, SESSION_STATUS_BADGES } from "@/components/session/agentPresentation";
import type { BoardCardItem } from "@/lib/board";
import type { BackendSessionStatus } from "@/stores/useSessionStore";

/**
 * One card on the Board: the project, a one-line objective, the stage the
 * work is actually in, how long it has been there, and the needs-you flag.
 *
 * Dumb by construction. Every action arrives as `onActivate` from
 * [`BoardView`], so the click contracts stay in one place and a card can be
 * rendered from a test with plain fixtures.
 *
 * Accent discipline (spec "Visual direction"): the needs-you flag is the only
 * neon accent and the only glow on the board. Blue means working, green done,
 * yellow waiting, purple merged.
 *
 * Design 1b draws the card's state twice: as the stage chip it always had, and
 * as a coloured left edge, so a lane can be read at a glance from across the
 * board. The edge is derived from the same live state the chip is, never set
 * independently, so the two cannot disagree.
 */

/**
 * Relative age of a card's `since` timestamp.
 *
 * A local copy of HomeView's helper rather than an import: this work package
 * adds files only, and lifting eight lines out of HomeView would edit a
 * shipped surface for no behaviour change.
 */
export function relAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Stable identity for a card: its React key, and what j/k selection tracks.
 * Selection follows the card rather than a list index so a background poll
 * that inserts a card cannot move the highlight out from under the user.
 */
export function boardCardKey(item: BoardCardItem): string {
  switch (item.kind) {
    case "session":
      return `session:${item.session.id}`;
    case "handoff":
      return `handoff:${item.handoff.path}:${item.handoff.slug}`;
    case "run":
      return `run:${item.run.id}`;
    case "pr":
      return `pr:${item.repoPath}#${item.pr.number}`;
    case "external":
      return `external:${item.dir}`;
  }
}

/**
 * What activating this card does, and, when it can do nothing, why. A card
 * that looks clickable and is not would be a dead control, so the caller
 * renders the second case as plain text carrying this explanation.
 */
export function cardAction(item: BoardCardItem): { enabled: boolean; title: string } {
  switch (item.kind) {
    case "session":
      return item.tabId
        ? { enabled: true, title: "Jump to this terminal" }
        : {
            enabled: false,
            title: "This project is not open in a tab, so there is no terminal to jump to",
          };
    case "handoff":
      return { enabled: true, title: "Launch a session here, seeded with the handoff" };
    case "run":
      return { enabled: true, title: "Open this run in the Factory" };
    case "pr":
      return { enabled: true, title: "Open on GitHub" };
    case "external":
      return {
        enabled: true,
        title:
          "Peek at what this outside session is doing. Maestro cannot show its live terminal, only the transcript trail.",
      };
  }
}

/** The stage chip: session statuses reuse the shared badges, everything else carries its own truth. */
function stageChip(item: BoardCardItem): { label: string; cls: string; mono: boolean } {
  switch (item.kind) {
    case "session": {
      const badge = SESSION_STATUS_BADGES[item.session.status];
      return { label: badge.label, cls: badge.cls, mono: false };
    }
    case "handoff":
      return { label: "ON DISK", cls: "bg-maestro-yellow/15 text-maestro-yellow", mono: false };
    case "run":
      /* The raw stage string, never a prettified one: an ACT stage the
         keyword table does not recognise lands in Building and must show
         what it actually is (board.ts's fallback contract). */
      return { label: item.stageLabel, cls: "bg-maestro-muted/15 text-maestro-muted", mono: true };
    case "pr":
      return {
        label: item.stageLabel.toUpperCase(),
        cls: item.pr.mergedAt
          ? "bg-maestro-purple/15 text-maestro-purple"
          : item.needsYou
            ? "bg-maestro-accent/15 text-maestro-accent"
            : "bg-maestro-blue/15 text-maestro-blue",
        mono: false,
      };
    case "external":
      /* Blue means working, matching live sessions: this work IS live, it
         just is not Maestro's to open. */
      return { label: "OUTSIDE MAESTRO", cls: "bg-maestro-blue/15 text-maestro-blue", mono: false };
  }
}

/** Left-edge colour per session status: the badge vocabulary, as a border. */
const SESSION_EDGE: Record<BackendSessionStatus, string> = {
  Starting: "border-l-maestro-orange",
  Idle: "border-l-maestro-muted",
  Working: "border-l-maestro-blue",
  NeedsInput: "border-l-maestro-accent",
  Done: "border-l-maestro-green",
  Error: "border-l-maestro-red",
  Timeout: "border-l-maestro-red",
};

/**
 * The card's status edge (design 1b's `borderLeft`).
 *
 * Needs-you wins over everything else, because that is the one thing the
 * board exists to surface; below it each kind carries its own truth.
 */
export function cardEdgeClass(item: BoardCardItem): string {
  if (item.needsYou) return "border-l-maestro-accent";
  switch (item.kind) {
    case "session":
      return SESSION_EDGE[item.session.status];
    case "handoff":
      return "border-l-maestro-yellow";
    case "run":
      return "border-l-maestro-blue";
    case "pr":
      return item.pr.mergedAt ? "border-l-maestro-purple" : "border-l-maestro-blue";
    case "external":
      /* Blue means working, matching live sessions: this work IS live. */
      return "border-l-maestro-blue";
  }
}

function cardIcon(item: BoardCardItem) {
  switch (item.kind) {
    case "session":
    case "external":
      return TerminalSquare;
    case "handoff":
      return Play;
    case "run":
      return Factory;
    case "pr":
      return item.pr.mergedAt ? GitMerge : GitPullRequest;
  }
}

export function BoardCard({
  item,
  selected,
  onActivate,
}: {
  item: BoardCardItem;
  selected: boolean;
  onActivate: () => void;
}) {
  const action = cardAction(item);
  const chip = stageChip(item);
  const Icon = cardIcon(item);

  const shell = [
    "w-full rounded-[9px] border border-maestro-border border-l-2 px-3 py-[11px] text-left",
    cardEdgeClass(item),
    item.needsYou ? "bg-maestro-accent/5" : "bg-maestro-surface",
    selected ? "ring-1 ring-maestro-text/50" : "",
  ].join(" ");

  const body = (
    <>
      <span className="mb-[5px] flex min-w-0 items-center gap-1.5">
        <Icon size={10} className="shrink-0 text-maestro-muted" />
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-maestro-muted">
          {item.projectName}
        </span>
        {item.since && (
          <span className="shrink-0 font-mono text-[10px] text-maestro-muted">
            {relAgo(item.since)}
          </span>
        )}
      </span>
      <span className="block min-w-0 text-[12.5px] font-medium leading-[1.35] text-maestro-text">
        {item.objective}
      </span>
      <span className="mt-[7px] flex flex-wrap items-center gap-1">
        <span className={`${badgeBaseClass} ${chip.cls} ${chip.mono ? "font-mono" : ""}`}>
          {chip.label}
        </span>
        {item.needsYou && (
          <span className={`${badgeBaseClass} bg-maestro-accent/20 text-maestro-accent`}>
            NEEDS YOU
          </span>
        )}
      </span>
    </>
  );

  if (!action.enabled) {
    return (
      <div
        className={`${shell} cursor-default`}
        title={action.title}
        data-selected={selected || undefined}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${shell} transition-colors hover:border-maestro-muted/50`}
      onClick={onActivate}
      title={action.title}
      data-selected={selected || undefined}
    >
      {body}
    </button>
  );
}
