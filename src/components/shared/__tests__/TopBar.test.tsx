import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TopBar } from "../TopBar";

/**
 * TopBar's whole job is now mapping App's state onto the rail's destination
 * and tool lists. The rail's own behaviour (hover labels, pinning, the More
 * popup's focus handling) is covered by WorkbenchRail.test.tsx, and the
 * toolbar those tests used to render was deleted along with its layout.
 */
describe("TopBar", () => {
  it("keeps Ledger distinct from Board and disables New session at capacity", () => {
    const ledger = vi.fn();
    const add = vi.fn();
    const board = vi.fn();
    render(
      <TopBar
        sidebarOpen
        onToggleSidebar={vi.fn()}
        boardViewOpen
        ledgerViewOpen
        onOpenLedger={ledger}
        onSetBoardView={board}
        onAddSession={add}
        canAddSession={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Ledger" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Board" })).not.toHaveAttribute("aria-current");
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(board).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    expect(add).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New session" })).toBeDisabled();
  });

  it("keeps the current rail destination open when selected again", () => {
    const toggle = vi.fn();
    render(
      <TopBar sidebarOpen onToggleSidebar={() => {}} homeViewOpen onToggleHomeView={toggle} />,
    );
    const inbox = screen.getByRole("button", { name: "Inbox" });
    expect(inbox).toHaveAttribute("aria-current", "page");
    fireEvent.click(inbox);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("routes Board and Terminals from the rail to their explicit destinations", () => {
    const select = vi.fn();
    const { rerender } = render(
      <TopBar sidebarOpen onToggleSidebar={() => {}} onSetBoardView={select} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(select).toHaveBeenLastCalledWith(true);
    rerender(
      <TopBar sidebarOpen boardViewOpen onToggleSidebar={() => {}} onSetBoardView={select} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Terminals" }));
    expect(select).toHaveBeenLastCalledWith(false);
  });

  it("dispatches the tools without a menu to open first", () => {
    const onOpenWorkflows = vi.fn();
    const onOpenExtensions = vi.fn();
    render(
      <TopBar
        sidebarOpen
        onToggleSidebar={vi.fn()}
        onOpenWorkflows={onOpenWorkflows}
        onOpenExtensions={onOpenExtensions}
      />,
    );

    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Workflows" }));
    expect(onOpenWorkflows).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Extensions" }));
    expect(onOpenExtensions).toHaveBeenCalledTimes(1);
  });

  it("widens only when its own control is used, never on hover", () => {
    render(<TopBar sidebarOpen onToggleSidebar={vi.fn()} />);
    const rail = screen.getByRole("navigation", { name: "Workspace" });
    expect(rail).toHaveAttribute("data-expanded", "false");

    fireEvent.mouseEnter(rail);
    expect(rail).toHaveAttribute("data-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Wide menu" }));
    expect(rail).toHaveAttribute("data-expanded", "true");
  });
});
