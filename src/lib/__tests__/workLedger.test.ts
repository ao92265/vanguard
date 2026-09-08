import { describe, expect, it } from "vitest";
import type { ActRun } from "@/lib/act";
import type { HandoffInfo } from "@/lib/bands";
import {
  buildLedgerEntries,
  groupLedgerEntries,
  type LedgerEntry,
  ledgerTotals,
  UNDATED_DAY_KEY,
} from "@/lib/workLedger";
import type { PullRequestInfo } from "@/stores/useGitHubStore";

/* Fixtures are fully synthetic: this repo is public, so no real handoff
   slugs, project paths or pull request URLs appear here. Timestamps are
   built from local-time components on purpose: the rails are days as the
   user's clock reads them, so a UTC string would make the suite pass or
   fail on the machine's timezone (see the "tests inherit your machine"
   lesson). */

function at(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function entry(over: Partial<LedgerEntry> & { id: string }): LedgerEntry {
  return {
    kind: "handoff",
    timestamp: at(2026, 9, 8, 10),
    project: "proj-a",
    title: "did a thing",
    detail: null,
    href: null,
    ...over,
  };
}

const NOW = new Date(2026, 8, 8, 18, 0, 0, 0);

describe("groupLedgerEntries", () => {
  it("puts an entry under its own day, keyed by the local date", () => {
    const groups = groupLedgerEntries(
      [entry({ id: "one", timestamp: at(2026, 9, 8, 10), kind: "handoff", title: "Checks" })],
      NOW,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-09-08");
    expect(groups[0].label).toBe("Today");
    expect(groups[0].undated).toBe(false);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["one"]);
  });

  it("orders days newest first and entries newest first inside a day", () => {
    const groups = groupLedgerEntries(
      [
        entry({ id: "older-day", timestamp: at(2026, 9, 6, 9) }),
        entry({ id: "today-early", timestamp: at(2026, 9, 8, 9) }),
        entry({ id: "yesterday", timestamp: at(2026, 9, 7, 23) }),
        entry({ id: "today-late", timestamp: at(2026, 9, 8, 17) }),
      ],
      NOW,
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-09-08", "2026-09-07", "2026-09-06"]);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Sun 6"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["today-late", "today-early"]);
  });

  it("keeps an unparseable timestamp as undated instead of inventing a day", () => {
    const groups = groupLedgerEntries(
      [
        entry({ id: "dated", timestamp: at(2026, 9, 8, 10) }),
        entry({ id: "broken", timestamp: "not a date" }),
        entry({ id: "missing", timestamp: null }),
      ],
      NOW,
    );

    const undated = groups.find((g) => g.undated);
    expect(undated?.key).toBe(UNDATED_DAY_KEY);
    expect(undated?.label).toBe("No date");
    expect(undated?.entries.map((e) => e.id)).toEqual(["broken", "missing"]);
    /* Every entry that went in comes back out: the failure this guards is a
       ledger that quietly shortens itself when a source misreports a date. */
    expect(groups.flatMap((g) => g.entries.map((e) => e.id)).sort()).toEqual([
      "broken",
      "dated",
      "missing",
    ]);
  });

  it("sorts the undated group last, below every day that has a date", () => {
    const groups = groupLedgerEntries(
      [
        entry({ id: "broken", timestamp: "" }),
        entry({ id: "old", timestamp: at(2026, 1, 2, 9) }),
        entry({ id: "new", timestamp: at(2026, 9, 8, 9) }),
      ],
      NOW,
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-09-08", "2026-01-02", UNDATED_DAY_KEY]);
  });

  it("counts each day by kind so the rail can draw what it is made of", () => {
    const groups = groupLedgerEntries(
      [
        entry({ id: "m1", kind: "merged", timestamp: at(2026, 9, 8, 8) }),
        entry({ id: "m2", kind: "merged", timestamp: at(2026, 9, 8, 9) }),
        entry({ id: "r1", kind: "run", timestamp: at(2026, 9, 8, 10) }),
        entry({ id: "s1", kind: "handoff", timestamp: at(2026, 9, 7, 10) }),
      ],
      NOW,
    );

    expect(groups[0].counts).toEqual({ merged: 2, run: 1, handoff: 0 });
    expect(groups[1].counts).toEqual({ merged: 0, run: 0, handoff: 1 });
  });

  it("returns no groups at all for an empty ledger", () => {
    expect(groupLedgerEntries([], NOW)).toEqual([]);
  });
});

function pr(over: Partial<PullRequestInfo> = {}): PullRequestInfo {
  return {
    number: 12,
    title: "Widen the importer",
    url: "https://example.test/pr/12",
    headRefName: "feat/importer",
    additions: 40,
    deletions: 4,
    mergedAt: at(2026, 9, 8, 14),
    ...over,
  } as PullRequestInfo;
}

function run(over: Partial<ActRun> = {}): ActRun {
  return {
    id: "run-1",
    title: "Ship the importer",
    status: "completed",
    stage: "verify",
    stages: [],
    createdAt: at(2026, 9, 7, 9),
    updatedAt: at(2026, 9, 7, 11),
    repoUrl: null,
    error: null,
    ...over,
  };
}

function handoff(over: Partial<HandoffInfo> = {}): HandoffInfo {
  return {
    slug: "hand-1",
    path: "/tmp/proj-b",
    repo: "proj-b",
    branch: "feat/thing",
    uncommitted: 2,
    lastCommit: null,
    asks: [],
    lastAction: "left the migration half applied",
    waiting: false,
    lastActive: at(2026, 9, 6, 16),
    stale: false,
    orphan: false,
    ...over,
  };
}

describe("buildLedgerEntries", () => {
  it("reads merged pull requests, runs and handoffs into their own kinds", () => {
    const entries = buildLedgerEntries({
      mergedPrs: [{ repoPath: "/tmp/proj-a", projectName: "proj-a", pr: pr() }],
      runs: [run()],
      handoffs: [handoff()],
    });

    expect(entries.map((e) => e.kind)).toEqual(["merged", "run", "handoff"]);
    expect(entries.map((e) => e.timestamp)).toEqual([
      at(2026, 9, 8, 14),
      at(2026, 9, 7, 11),
      at(2026, 9, 6, 16),
    ]);
    expect(entries[0].project).toBe("proj-a");
    expect(entries[0].title).toContain("Widen the importer");
    expect(entries[0].href).toBe("https://example.test/pr/12");
    expect(entries[1].project).toBe("Factory run");
    /* A run with no repo URL has no project to name, so the placeholder label
       carries no identity with it and nothing downstream can count it. */
    expect(entries[1].projectKey).toBeNull();
    expect(entries[0].projectKey).toBe("proj-a");
    expect(entries[2].project).toBe("proj-b");
    expect(entries[2].projectKey).toBe("proj-b");
    expect(entries[2].title).toBe("left the migration half applied");
  });

  it("falls back to a run's creation instant, and keeps a run that has neither", () => {
    const entries = buildLedgerEntries({
      mergedPrs: [],
      runs: [
        run({ id: "no-update", updatedAt: null }),
        run({ id: "no-instant", createdAt: null, updatedAt: null }),
      ],
      handoffs: [],
    });

    expect(entries.map((e) => e.timestamp)).toEqual([at(2026, 9, 7, 9), null]);
    expect(entries).toHaveLength(2);
  });

  it("omits a detail line a source did not supply rather than printing a hole", () => {
    const entries = buildLedgerEntries({
      mergedPrs: [
        {
          repoPath: "/tmp/proj-a",
          projectName: "proj-a",
          pr: pr({ headRefName: undefined, additions: undefined, deletions: undefined } as never),
        },
      ],
      runs: [],
      handoffs: [handoff({ branch: null, uncommitted: 0 })],
    });

    expect(entries[0].detail).toBeNull();
    expect(entries[1].detail).toBeNull();
  });

  it("resolves one repo to one identity however the three sources spell it", () => {
    const entries = buildLedgerEntries({
      mergedPrs: [{ repoPath: "/tmp/proj-a", projectName: "proj-a", pr: pr() }],
      runs: [run({ repoUrl: "https://example.test/acme/Proj-A.git" })],
      handoffs: [handoff({ repo: "proj-a" })],
    });

    expect(entries.map((e) => e.projectKey)).toEqual(["proj-a", "proj-a", "proj-a"]);
  });

  it("gives a run whose repo URL names nothing no identity at all", () => {
    const entries = buildLedgerEntries({
      mergedPrs: [],
      runs: [run({ repoUrl: "   " }), run({ id: "slashes", repoUrl: "https://example.test/" })],
      handoffs: [],
    });

    expect(entries.map((e) => e.projectKey)).toEqual([null, null]);
  });
});

describe("ledgerTotals", () => {
  it("counts only what the sources actually carry", () => {
    const groups = groupLedgerEntries(
      buildLedgerEntries({
        mergedPrs: [
          { repoPath: "/tmp/proj-a", projectName: "proj-a", pr: pr() },
          { repoPath: "/tmp/proj-a", projectName: "proj-a", pr: pr({ number: 13 }) },
        ],
        runs: [run(), run({ id: "run-2", createdAt: null, updatedAt: null })],
        handoffs: [handoff()],
      }),
      NOW,
    );

    /* Two real projects, proj-a and proj-b. The two runs carry no repo URL,
       so "Factory run" is a label with no project behind it and must not be
       counted as a third. */
    expect(ledgerTotals(groups)).toEqual({
      merged: 2,
      runs: 2,
      handoffs: 1,
      projects: 2,
      days: 3,
      undated: 1,
      unattributed: 2,
    });
  });

  it("reports zeros for an empty ledger rather than an absent reading", () => {
    expect(ledgerTotals([])).toEqual({
      merged: 0,
      runs: 0,
      handoffs: 0,
      projects: 0,
      days: 0,
      undated: 0,
      unattributed: 0,
    });
  });
  it("counts distinct repos once even when the three sources spell them apart", () => {
    const groups = groupLedgerEntries(
      buildLedgerEntries({
        mergedPrs: [{ repoPath: "/tmp/proj-a", projectName: "proj-a", pr: pr() }],
        runs: [run({ repoUrl: "https://example.test/acme/proj-a" })],
        handoffs: [handoff({ repo: "proj-a" })],
      }),
      NOW,
    );

    const totals = ledgerTotals(groups);
    expect(totals.projects).toBe(1);
    expect(totals.unattributed).toBe(0);
  });
});
