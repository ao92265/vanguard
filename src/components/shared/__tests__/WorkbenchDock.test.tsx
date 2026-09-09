import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { UtilityPanelKind } from "../UtilityPanel";
import { WorkbenchDock } from "../WorkbenchDock";

function DockHarness() {
  const [panel, setPanel] = useState<UtilityPanelKind | null>(null);
  const [git, setGit] = useState(false);
  return (
    <WorkbenchDock
      activePanel={panel}
      gitOpen={git}
      onSelect={(next) => setPanel((current) => (current === next ? null : next))}
      onToggleGit={() => setGit((value) => !value)}
    />
  );
}

it("selects each distinct utility and closes it on a second selection", () => {
  render(<DockHarness />);
  for (const name of ["AI", "Processes", "Notes", "Memory", "Second Brain", "Git"]) {
    const button = screen.getByRole("button", { name });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  }
});

it("preserves distinct utility route identifiers", () => {
  const select = vi.fn();
  render(
    <WorkbenchDock activePanel="notes" gitOpen={false} onSelect={select} onToggleGit={() => {}} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Second Brain" }));
  expect(select).toHaveBeenCalledWith("secondbrain");
  expect(screen.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "AI" })).toHaveAttribute("aria-pressed", "false");
});

/* The dock is a 68px column of six controls. Spelled out they were words
   ("Proc", "Mem", "Brain") that abbreviate to something nobody reads faster
   than a glyph, and abbreviating is what a narrow column forces. Icons carry
   the same six meanings in the same width, and the name stays reachable
   through the tooltip and the accessible name, which is what the other tests
   here select on. */
it("shows each utility as an icon rather than a word", () => {
  render(<DockHarness />);
  for (const name of ["Git", "AI", "Processes", "Notes", "Memory", "Second Brain"]) {
    const button = screen.getByRole("button", { name });
    expect(button.querySelector("svg")).not.toBeNull();
    /* Letters, not "empty": a health badge legitimately puts a count inside
       these buttons, and asserting emptiness would quietly stop testing the
       moment one appeared. */
    expect(button.textContent ?? "").not.toMatch(/[A-Za-z]/);
  }
});
