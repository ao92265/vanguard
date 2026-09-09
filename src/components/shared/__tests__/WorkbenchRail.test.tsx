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

it("changes width only when asked, never on hover or focus", () => {
  renderRail();
  const nav = screen.getByRole("navigation", { name: "Workspace" });
  const toggle = screen.getByRole("button", { name: "Wide menu" });
  expect(nav).toHaveAttribute("data-expanded", "false");

  fireEvent.mouseEnter(nav);
  expect(nav).toHaveAttribute("data-expanded", "false");
  fireEvent.focus(screen.getByRole("button", { name: "Inbox" }));
  expect(nav).toHaveAttribute("data-expanded", "false");

  fireEvent.click(toggle);
  expect(nav).toHaveAttribute("data-expanded", "true");
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  fireEvent.mouseLeave(nav);
  expect(nav).toHaveAttribute("data-expanded", "true");
});

it("puts the tools in the rail itself, with no menu to open first", () => {
  const open = renderRail();
  expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Extensions" }));
  expect(open).toHaveBeenCalledOnce();
});

it("reserves exactly the width it occupies, so widening moves the page", () => {
  renderRail();
  const nav = screen.getByRole("navigation", { name: "Workspace" });
  const slot = document.querySelector(".workbench-rail-slot");
  expect(slot).not.toBeNull();
  expect(slot).toHaveAttribute("data-expanded", "false");

  fireEvent.mouseEnter(nav);
  expect(slot).toHaveAttribute("data-expanded", "false");

  fireEvent.click(screen.getByRole("button", { name: "Wide menu" }));
  expect(slot).toHaveAttribute("data-expanded", "true");
  expect(nav).toHaveAttribute("data-expanded", "true");
});
