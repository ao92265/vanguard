import { useState } from "react";
import { badgeBaseClass } from "@/components/session/agentPresentation";
import {
  LEDGER_KIND_ORDER,
  type LedgerDayGroup,
  type LedgerEntry,
  type LedgerEntryKind,
  type LedgerTotals,
} from "@/lib/workLedger";

/**
 * The Work Ledger: the same live work the Board shows, read as history.
 *
 * A day rail per day, newest first, each drawn from the records that day
 * actually holds; picking a rail expands that day's rows underneath. The
 * design's fourth kind (staged images), its per-entry cost column and its
 * host chip have no source in this app, so none of the three is drawn. See
 * the task report for the full list of numbers the reference claims and this
 * data cannot support.
 *
 * The `No date` rail is the point of the whole component. A record whose
 * source lost its timestamp still appears, on a rail that says so, rather
 * than being filed under a guessed day or quietly dropped.
 */

const KIND_STYLE: Record<LedgerEntryKind, { label: string; badge: string; tick: string }> = {
  merged: {
    label: "MERGED",
    badge: "bg-maestro-green/15 text-maestro-green",
    tick: "bg-maestro-green",
  },
  run: { label: "RUN", badge: "bg-maestro-blue/15 text-maestro-blue", tick: "bg-maestro-blue" },
  /* HANDOFF, not SESSION: the fleet strip below this view counts real live
     sessions, and these are the files a finished one left on disk. */
  handoff: {
    label: "HANDOFF",
    badge: "bg-maestro-muted/15 text-maestro-muted",
    tick: "bg-maestro-muted",
  },
};

/**
 * Ticks drawn on one rail before the row stops adding them. The rail's own
 * count is the truth about how many there were; the ticks are the shape of
 * the day, and past this many they stop being legible as either.
 */
const MAX_TICKS = 28;

/** Local wall-clock time of an entry, or the plain truth that there is none. */
function entryTime(entry: LedgerEntry): string {
  if (entry.timestamp === null) return "unknown";
  const ms = Date.parse(entry.timestamp);
  if (!Number.isFinite(ms)) return "unknown";
  const at = new Date(ms);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <figure className="m-0" aria-label={`${value} ${label}`}>
      <div className="font-mono text-[30px] font-semibold leading-none text-maestro-text">
        {value}
      </div>
      <figcaption className="mt-1 font-mono text-[11px] text-maestro-muted">{label}</figcaption>
    </figure>
  );
}

function DayRail({
  group,
  selected,
  onSelect,
}: {
  group: LedgerDayGroup;
  selected: boolean;
  onSelect: () => void;
}) {
  const ticks = group.entries.slice(0, MAX_TICKS);
  return (
    <button
      type="button"
      aria-label={`Expand ${group.label}, ${group.entries.length} record${group.entries.length === 1 ? "" : "s"}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-4 rounded-md px-2 py-[9px] text-left transition-colors hover:bg-maestro-card ${
        selected ? "bg-maestro-card" : ""
      }`}
    >
      <span
        className={`w-[62px] shrink-0 font-mono text-[11px] font-semibold ${
          group.undated ? "text-maestro-yellow" : "text-maestro-muted"
        }`}
      >
        {group.label}
      </span>
      <span className="flex h-[22px] min-w-0 flex-1 items-center gap-[3px] overflow-hidden">
        {ticks.map((entry) => (
          <span
            key={entry.id}
            title={`${KIND_STYLE[entry.kind].label} · ${entry.project}`}
            className={`h-[18px] w-[10px] shrink-0 rounded-[2px] opacity-85 ${KIND_STYLE[entry.kind].tick}`}
          />
        ))}
      </span>
      <span className="w-[150px] shrink-0 text-right font-mono text-[11px] text-maestro-muted">
        {group.entries.length} record{group.entries.length === 1 ? "" : "s"}
      </span>
    </button>
  );
}

function EntryRow({ entry, onOpen }: { entry: LedgerEntry; onOpen?: (href: string) => void }) {
  const kind = KIND_STYLE[entry.kind];
  const body = (
    <>
      <span className="w-[46px] shrink-0 font-mono text-[11px] text-maestro-muted">
        {entryTime(entry)}
      </span>
      <span className={`${badgeBaseClass} w-[62px] text-center font-mono ${kind.badge}`}>
        {kind.label}
      </span>
      <span className="w-[104px] shrink-0 truncate text-[12.5px] font-medium text-maestro-text">
        {entry.project}
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-[12.5px] text-maestro-text">
        {entry.title}
      </span>
      {entry.detail && (
        <span className="w-[170px] shrink-0 truncate text-right font-mono text-[11px] text-maestro-muted">
          {entry.detail}
        </span>
      )}
    </>
  );

  const shell = "flex items-center gap-[14px] border-b border-maestro-border px-2 py-2";
  const href = entry.href;
  if (!href || !onOpen) {
    return <div className={shell}>{body}</div>;
  }
  return (
    <button
      type="button"
      className={`${shell} w-full text-left transition-colors hover:bg-maestro-card`}
      onClick={() => onOpen(href)}
      title="Open on GitHub"
    >
      {body}
    </button>
  );
}

export function WorkLedger({
  groups,
  totals,
  onOpenEntry,
}: {
  groups: LedgerDayGroup[];
  totals: LedgerTotals;
  /** Opens the entries that carry a URL. Rows without one stay plain text. */
  onOpenEntry?: (href: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  /* Fall back to the newest day rather than remembering a rail that has since
     left the ledger: a selection pointing at nothing would expand nothing. */
  const expanded = groups.find((group) => group.key === selectedDay) ?? groups[0] ?? null;

  return (
    <section
      aria-label="Work ledger"
      className="flex min-h-0 flex-1 flex-col overflow-hidden px-[34px] pt-[26px]"
    >
      {/* No heading here: the chrome above already titles the screen "Ledger",
          and the mockup carries one title per screen. The section keeps its
          accessible name from aria-label, so the landmark is still findable. */}
      <div className="mb-1.5 flex items-baseline gap-3">
        <div className="flex-1" />
        <span className="font-mono text-[11.5px] text-maestro-muted">
          {LEDGER_KIND_ORDER.map((kind) => KIND_STYLE[kind].label.toLowerCase()).join(" · ")}
        </span>
        <span className="flex items-center gap-1">
          {LEDGER_KIND_ORDER.map((kind) => (
            <span
              key={kind}
              className={`h-2 w-2 rounded-[2px] ${KIND_STYLE[kind].tick}`}
              aria-hidden="true"
            />
          ))}
        </span>
      </div>

      <div className="flex items-baseline gap-[22px] border-b border-maestro-border pb-[18px] pt-[14px]">
        <Metric value={totals.merged} label="merged" />
        <Metric value={totals.runs} label="runs" />
        <Metric value={totals.handoffs} label="handoffs" />
        <Metric value={totals.projects} label="projects" />
      </div>

      {totals.unattributed > 0 && (
        <p className="pt-2 font-mono text-[11px] text-maestro-muted">
          {totals.unattributed} record{totals.unattributed === 1 ? "" : "s"} name
          {totals.unattributed === 1 ? "s" : ""} no project, so the projects count leaves{" "}
          {totals.unattributed === 1 ? "it" : "them"} out.
        </p>
      )}

      {groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center py-16">
          <span className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-maestro-muted">
            Empty ledger
          </span>
          <h2 className="text-2xl font-medium tracking-tight text-maestro-text">
            Nothing recorded yet
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-maestro-muted">
            The ledger reads three sources that carry a real instant: pull requests that have
            merged, Factory runs, and the handoff files left on disk when a session stops. None of
            them has anything yet.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pt-[14px]">
          <div className="flex flex-col">
            {groups.map((group) => (
              <DayRail
                key={group.key}
                group={group}
                selected={group.key === expanded?.key}
                onSelect={() => setSelectedDay(group.key)}
              />
            ))}
          </div>

          {expanded && (
            <section
              aria-label={`${expanded.label}, expanded`}
              className="mt-[14px] border-t border-maestro-border pt-3 pb-6"
            >
              <h2 className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted">
                {expanded.label}, expanded
              </h2>
              {expanded.undated && (
                <p className="mb-2 px-2 text-[11px] text-maestro-muted">
                  These records reached the ledger without a readable timestamp, so there is no day
                  to file them under.
                </p>
              )}
              {expanded.entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onOpen={onOpenEntry} />
              ))}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
