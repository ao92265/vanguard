import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ActRun } from "@/lib/act";
import { useActEngineStore } from "@/stores/useActEngineStore";
import { useActStore } from "@/stores/useActStore";
import { FactoryView, factoryLanes } from "../FactoryView";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));

function run(id: string, status: string, title: string): ActRun {
  return {
    id,
    title,
    status,
    stage: null,
    stages: [],
    createdAt: null,
    updatedAt: null,
    repoUrl: null,
    error: null,
  };
}

const everyStatus: ActRun[] = [
  run("r1", "queued", "Retire the glow shadows"),
  run("r2", "planning", "Collapse the two rails"),
  run("r3", "running", "Aggregate spend per day"),
  run("r4", "completed", "Ship the work ledger"),
  run("r5", "failed", "Stage pasted screenshots"),
  run("r6", "cancelled", "Fuzzy match worktree paths"),
  run("r7", "reticulating", "Unknown to this frontend"),
];

beforeEach(() => {
  useActStore.setState({
    runs: [],
    gatedRuns: [],
    detail: null,
    error: null,
    fetchedAt: 0,
    isSubmitting: false,
    submitOutcome: null,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  useActEngineStore.setState({ status: null, refresh: vi.fn().mockResolvedValue(undefined) });
});

it("keeps spec creation off the runs surface and preserves an unfinished draft when closed", () => {
  render(<FactoryView onClose={() => {}} />);
  expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New spec" }));
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Validate imports" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close spec editor" }));
  expect(screen.getByRole("button", { name: "New spec" })).toHaveFocus();
  expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New spec" }));
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Validate imports");
});

it("assigns every run to a lane, losing none to a status it does not know", () => {
  const lanes = factoryLanes(everyStatus);
  const placed = lanes.flatMap((lane) => lane.runs.map((r) => r.id));
  expect(placed.sort()).toEqual(everyStatus.map((r) => r.id).sort());
});

it("keeps completed, failed and cancelled runs in one finished lane", () => {
  const lanes = factoryLanes(everyStatus);
  const idsIn = (id: string) => lanes.find((l) => l.id === id)?.runs.map((r) => r.id);
  expect(idsIn("queued")).toEqual(["r1"]);
  expect(idsIn("planning")).toEqual(["r2"]);
  expect(idsIn("running")).toEqual(["r3"]);
  expect(idsIn("finished")).toEqual(["r4", "r5", "r6"]);
  expect(idsIn("other")).toEqual(["r7"]);
});

it("renders finished runs on the board instead of dropping them", () => {
  useActStore.setState({ runs: everyStatus, fetchedAt: Date.now() });
  render(<FactoryView onClose={() => {}} />);
  const finished = within(screen.getByRole("region", { name: /Finished/ }));
  expect(finished.getByText("Ship the work ledger")).toBeVisible();
  expect(finished.getByText("Stage pasted screenshots")).toBeVisible();
  expect(finished.getByText("Fuzzy match worktree paths")).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: /Queued/ })).getByText("Retire the glow shadows"),
  ).toBeVisible();
});

it("marks a gated run as needing you wherever its status lane puts it", () => {
  const gated = run("r8", "running", "Telegram photo routing");
  useActStore.setState({ runs: [gated], gatedRuns: [gated], fetchedAt: Date.now() });
  render(<FactoryView onClose={() => {}} />);
  const card = screen.getByRole("button", { name: /Telegram photo routing/ });
  expect(within(card).getByText("NEEDS YOU")).toBeVisible();
});
