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

/** The order the browser's sequential focus navigation would visit, which is
 *  DOM order for everything the rail renders (no positive tabindex). */
function tabOrder(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button, [href], input, [tabindex]")].filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("tabindex") !== "-1",
  );
}

it("places the More popup after its trigger so forward tabbing reaches it", () => {
  renderRail();
  const nav = screen.getByRole("navigation", { name: "Workspace" });
  const more = screen.getByRole("button", { name: "More" });
  fireEvent.click(more);

  const popupId = more.getAttribute("aria-controls");
  expect(popupId).toBeTruthy();
  const popup = document.getElementById(popupId as string);
  expect(popup).not.toBeNull();

  const order = tabOrder(nav);
  const next = order[order.indexOf(more) + 1];
  expect(next).toBeDefined();
  expect((popup as HTMLElement).contains(next)).toBe(true);

  // Tabbing INTO the popup must not trip the nav's blur-capture close.
  fireEvent.blur(more, { relatedTarget: next });
  expect(more).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Extensions" })).toBeInTheDocument();
});

it("only reserves content width when pinned, so hover never reflows the terminals", () => {
  renderRail();
  const nav = screen.getByRole("navigation", { name: "Workspace" });
  const slot = document.querySelector(".workbench-rail-slot");
  expect(slot).not.toBeNull();
  expect(slot).toHaveAttribute("data-pinned", "false");

  fireEvent.mouseEnter(nav);
  expect(nav).toHaveAttribute("data-expanded", "true");
  expect(slot).toHaveAttribute("data-pinned", "false");
  expect(nav).toHaveAttribute("data-pinned", "false");

  fireEvent.click(screen.getByRole("button", { name: "Pin navigation" }));
  expect(slot).toHaveAttribute("data-pinned", "true");
  expect(nav).toHaveAttribute("data-pinned", "true");
});
