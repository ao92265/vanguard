import type { ActRun } from "@/lib/act";
import type { HandoffInfo } from "@/lib/bands";
import type { PullRequestInfo } from "@/stores/useGitHubStore";

/**
 * Pure assembly of the Work Ledger: the same live state the Board reads,
 * turned on its side into "what happened, and when".
 *
 * The Board answers "what stage is each piece of work in". The Ledger answers
 * "what has actually landed", so it reads the three sources that carry a real
 * instant: merged pull requests, ACT runs, and the handoff files sessions
 * leave behind. There is no new store and no new logging protocol here; if a
 * source does not record something, the Ledger does not show it.
 *
 * Timestamp honesty is the load-bearing rule. A source row whose instant is
 * missing or unparseable is kept and grouped as undated, never dropped and
 * never given a guessed date: an entry silently missing from a ledger is
 * worse than one that admits it does not know when it happened.
 */

/** The three record kinds the app's own sources can honestly produce. */
export type LedgerEntryKind = "merged" | "run" | "session";

/** Rail and legend order, and the order counts are read in. */
export const LEDGER_KIND_ORDER: LedgerEntryKind[] = ["merged", "run", "session"];

/** Day key for every entry whose source carried no readable instant. */
export const UNDATED_DAY_KEY = "undated";

export interface LedgerEntry {
  /** Stable identity: the React key, and what selection tracks. */
  id: string;
  kind: LedgerEntryKind;
  /**
   * RFC 3339 instant from the source, or null when the source had none.
   * Anything unparseable lands in the undated group rather than a guess.
   */
  timestamp: string | null;
  /** Project the entry belongs to, in the source's own words. */
  project: string;
  /** One line: what happened. */
  title: string;
  /** Second line from the source, when it carried one. Never invented. */
  detail: string | null;
  /** External URL this entry can be opened at, when one exists. */
  href: string | null;
}

export interface LedgerDayGroup {
  /** `YYYY-MM-DD` in local time, or {@link UNDATED_DAY_KEY}. */
  key: string;
  /** Rail label: `Today`, `Yesterday`, `Sun 7`, or `No date`. */
  label: string;
  /** True for the one group holding entries with no readable timestamp. */
  undated: boolean;
  /** Newest first within the day; undated entries keep source order. */
  entries: LedgerEntry[];
  /** Per-kind counts, for the rail ticks and the row's summary. */
  counts: Record<LedgerEntryKind, number>;
}

/** One merged pull request, with the project name its repo is known by. */
export interface LedgerMergedPr {
  repoPath: string;
  projectName: string;
  pr: PullRequestInfo;
}

/** Every source the Ledger reads, named so a caller cannot pass the wrong list. */
export interface LedgerSources {
  mergedPrs: LedgerMergedPr[];
  runs: ActRun[];
  handoffs: HandoffInfo[];
}

export interface LedgerTotals {
  merged: number;
  runs: number;
  sessions: number;
  /** Distinct projects named across every entry, dated or not. */
  projects: number;
  /** Days carrying at least one dated entry. */
  days: number;
  /** Entries whose source carried no readable instant. */
  undated: number;
}

/**
 * Short weekday names, spelled out rather than read off `toLocaleDateString`.
 *
 * The runtime's default locale decides both the word and the order there
 * ("Sun 6" in en-GB, "6 Sun" under the bare ICU default), which would make
 * the rail's shape a property of the machine rather than of the design.
 */
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local calendar day of an instant, the unit the rails are drawn in. */
function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayLabel(date: Date, now: Date): string {
  const key = localDayKey(date);
  if (key === localDayKey(now)) return "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === localDayKey(yesterday)) return "Yesterday";
  return `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()}`;
}

function emptyCounts(): Record<LedgerEntryKind, number> {
  return { merged: 0, run: 0, session: 0 };
}

interface Bucket {
  key: string;
  label: string;
  undated: boolean;
  /** Local midnight of the day, or -Infinity so the undated bucket sorts last. */
  sortMs: number;
  rows: { entry: LedgerEntry; ms: number }[];
}

/**
 * Group entries into day rails, newest day first, newest entry first inside
 * a day, with everything undateable collected into a final `No date` rail.
 *
 * `now` is a parameter rather than a `Date.now()` call so "Today" and
 * "Yesterday" are testable without freezing the clock.
 */
export function groupLedgerEntries(
  entries: LedgerEntry[],
  now: Date = new Date(),
): LedgerDayGroup[] {
  const buckets = new Map<string, Bucket>();

  for (const entry of entries) {
    const ms = entry.timestamp === null ? Number.NaN : Date.parse(entry.timestamp);
    const dated = Number.isFinite(ms);
    const date = dated ? new Date(ms) : null;
    const key = date ? localDayKey(date) : UNDATED_DAY_KEY;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: date ? dayLabel(date, now) : "No date",
        undated: date === null,
        sortMs: date
          ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
          : Number.NEGATIVE_INFINITY,
        rows: [],
      };
      buckets.set(key, bucket);
    }
    bucket.rows.push({ entry, ms: dated ? ms : Number.NEGATIVE_INFINITY });
  }

  return [...buckets.values()]
    .sort((a, b) => b.sortMs - a.sortMs)
    .map((bucket) => {
      const counts = emptyCounts();
      for (const row of bucket.rows) counts[row.entry.kind] += 1;
      return {
        key: bucket.key,
        label: bucket.label,
        undated: bucket.undated,
        /* Sort is stable, so undated rows (all -Infinity) keep source order
           rather than being shuffled by the comparator. */
        entries: [...bucket.rows].sort((a, b) => b.ms - a.ms).map((row) => row.entry),
        counts,
      };
    });
}

/** The branch and diff size behind a merged PR, when the poll carried them. */
function mergedDetail(pr: PullRequestInfo): string | null {
  const parts: string[] = [];
  if (pr.headRefName) parts.push(pr.headRefName);
  if (Number.isFinite(pr.additions) && Number.isFinite(pr.deletions)) {
    parts.push(`+${pr.additions} / −${pr.deletions}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function handoffDetail(handoff: HandoffInfo): string | null {
  const parts: string[] = [];
  if (handoff.branch) parts.push(handoff.branch);
  if (handoff.uncommitted > 0) parts.push(`${handoff.uncommitted} uncommitted`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Turn the three live sources into ledger entries, source order preserved.
 *
 * Nothing is filtered here: a run with no instant at all still becomes an
 * entry, and {@link groupLedgerEntries} files it under `No date`. Dropping it
 * would make the Factory's own count and the Ledger's disagree with no
 * explanation on screen.
 */
export function buildLedgerEntries({ mergedPrs, runs, handoffs }: LedgerSources): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const { repoPath, projectName, pr } of mergedPrs) {
    entries.push({
      id: `merged:${repoPath}#${pr.number}`,
      kind: "merged",
      timestamp: pr.mergedAt,
      project: projectName,
      title: `#${pr.number} ${pr.title}`,
      detail: mergedDetail(pr),
      href: pr.url,
    });
  }

  for (const run of runs) {
    entries.push({
      id: `run:${run.id}`,
      kind: "run",
      /* The instant the run last moved, falling back to when it was filed.
         Same precedence the Board's run cards use for their age. */
      timestamp: run.updatedAt ?? run.createdAt,
      /* ACT reports a repo URL, not a project name; `board.ts` makes the same
         substitution rather than inventing one. */
      project: run.repoUrl ?? "Factory run",
      title: run.title,
      detail: run.stage ? `${run.status} · ${run.stage}` : run.status,
      href: null,
    });
  }

  for (const handoff of handoffs) {
    entries.push({
      id: `session:${handoff.path}:${handoff.slug}`,
      kind: "session",
      timestamp: handoff.lastActive,
      project: handoff.repo,
      title: handoff.lastAction,
      detail: handoffDetail(handoff),
      href: null,
    });
  }

  return entries;
}

/**
 * The header numbers, each one a count of records actually present.
 *
 * Deliberately not here: spend, remote share, and anything image-shaped. No
 * source in this app records a per-entry cost or the host a session ran on,
 * so a total for either would be a number with nothing behind it.
 */
export function ledgerTotals(groups: LedgerDayGroup[]): LedgerTotals {
  const totals: LedgerTotals = {
    merged: 0,
    runs: 0,
    sessions: 0,
    projects: 0,
    days: 0,
    undated: 0,
  };
  const projects = new Set<string>();

  for (const group of groups) {
    if (group.undated) totals.undated += group.entries.length;
    else totals.days += 1;
    totals.merged += group.counts.merged;
    totals.runs += group.counts.run;
    totals.sessions += group.counts.session;
    for (const entry of group.entries) projects.add(entry.project);
  }

  totals.projects = projects.size;
  return totals;
}
