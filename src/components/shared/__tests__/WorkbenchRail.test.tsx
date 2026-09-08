import { fireEvent, render, screen, within } from "@testing-library/react";
import { Home, Package } from "lucide-react";
import { expect, it, vi } from "vitest";
import { WorkbenchRail } from "../WorkbenchRail";

function renderRail() {
  const open = vi.fn();
  render(
    <WorkbenchRail
      primary={[{ label: "Inbox", icon: Home, onClick: () => {} }]}
      tools={[{ label: "Extensions", icon: Package, onClick: open }]}
      sidebarOpen={false}
      onToggleSidebar={() => {}}
      projectNavigation={
        <div role="tablist" aria-label="Open projects">
          API
        </div>
      }
    />,
  );
  return open;
}

it("keeps project navigation inside the single workspace navigation", () => {
  renderRail();
  expect(
    within(screen.getByRole("navigation", { name: "Workspace" })).getByRole("tablist"),
  ).toHaveAccessibleName("Open projects");
});

it("reveals labels on hover and focus and keeps them revealed while pinned", () => {
  renderRail();
  const nav = screen.getByRole("navigation", { name: "Workspace" });
  expect(nav).toHaveAttribute("data-expanded", "false");
  fireEvent.mouseEnter(nav);
  expect(nav).toHaveAttribute("data-expanded", "true");
  fireEvent.mouseLeave(nav);
  expect(nav).toHaveAttribute("data-expanded", "false");
  fireEvent.focus(screen.getByRole("button", { name: "Inbox" }));
  expect(nav).toHaveAttribute("data-expanded", "true");
  fireEvent.blur(nav, { relatedTarget: document.body });
  expect(nav).toHaveAttribute("data-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "Pin navigation" }));
  fireEvent.mouseLeave(nav);
  expect(nav).toHaveAttribute("data-expanded", "true");
  expect(screen.getByRole("button", { name: "Pin navigation" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("opens More and restores its trigger focus on Escape", () => {
  const open = renderRail();
  const more = screen.getByRole("button", { name: "More" });
  fireEvent.click(more);
  fireEvent.click(screen.getByRole("button", { name: "Extensions" }));
  expect(open).toHaveBeenCalledOnce();
  expect(more).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(more);
  fireEvent.keyDown(screen.getByRole("button", { name: "Extensions" }), { key: "Escape" });
  expect(more).toHaveFocus();
  expect(more).toHaveAttribute("aria-expanded", "false");
});
