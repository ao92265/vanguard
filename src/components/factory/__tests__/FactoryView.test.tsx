import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useActEngineStore } from "@/stores/useActEngineStore";
import { useActStore } from "@/stores/useActStore";
import { FactoryView } from "../FactoryView";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));

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
  fireEvent.click(screen.getByRole("button", { name: "New run" }));
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Validate imports" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close spec editor" }));
  expect(screen.getByRole("button", { name: "New run" })).toHaveFocus();
  expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New run" }));
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Validate imports");
});
