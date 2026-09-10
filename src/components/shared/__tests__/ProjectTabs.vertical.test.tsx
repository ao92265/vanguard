import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProjectTabs } from "../ProjectTabs";

vi.mock("@/hooks/useProjectStatus", () => ({
  useProjectStatus: () => ({ status: "idle", sessionCount: 0 }),
  STATUS_COLORS: { idle: "bg-maestro-muted" },
}));

it("selects and reorders vertical projects with vertical arrow keys", () => {
  const select = vi.fn();
  const move = vi.fn();
  const close = vi.fn();
  render(
    <ProjectTabs
      tabs={[
        { id: "a", name: "API", active: true },
        { id: "b", name: "Web", active: false },
      ]}
      onSelectTab={select}
      onMoveTab={move}
      onCloseTab={close}
      onNewTab={() => {}}
      onReorderTab={() => {}}
    />,
  );
  expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");
  fireEvent.keyDown(screen.getByRole("tab", { name: /API/ }), { key: "ArrowDown" });
  expect(select).toHaveBeenLastCalledWith("b");
  expect(screen.getByRole("tab", { name: /Web/ })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("tab", { name: /Web/ }), {
    key: "ArrowUp",
    ctrlKey: true,
    shiftKey: true,
  });
  expect(move).toHaveBeenLastCalledWith("b", "left");
  select.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Close Web" }));
  expect(close).toHaveBeenCalledWith("b");
  expect(select).not.toHaveBeenCalled();
});
