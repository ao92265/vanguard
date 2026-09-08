import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionRail } from "../SessionRail";

describe("SessionRail", () => {
  it("counts the sessions it is listing", () => {
    render(
      <SessionRail count={4} onExitZoom={vi.fn()}>
        <div>row</div>
      </SessionRail>,
    );
    const rail = screen.getByRole("navigation", { name: "Sessions" });
    expect(rail).toHaveTextContent("Sessions");
    expect(rail).toHaveTextContent("4");
  });

  it("keeps the grid one click away", () => {
    const onExitZoom = vi.fn();
    render(
      <SessionRail count={1} onExitZoom={onExitZoom}>
        <div>row</div>
      </SessionRail>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Exit zoom" }));
    expect(onExitZoom).toHaveBeenCalledTimes(1);
  });

  it("offers a new terminal only when the grid can take one", () => {
    const onNewTerminal = vi.fn();
    const { rerender } = render(
      <SessionRail count={1} onExitZoom={vi.fn()} onNewTerminal={onNewTerminal}>
        <div>row</div>
      </SessionRail>,
    );
    fireEvent.click(screen.getByRole("button", { name: /New terminal/ }));
    expect(onNewTerminal).toHaveBeenCalledTimes(1);
    rerender(
      <SessionRail count={1} onExitZoom={vi.fn()}>
        <div>row</div>
      </SessionRail>,
    );
    expect(screen.queryByRole("button", { name: /New terminal/ })).not.toBeInTheDocument();
  });

  it("describes the paste route this app actually has", () => {
    render(
      <SessionRail count={1} onExitZoom={vi.fn()}>
        <div>row</div>
      </SessionRail>,
    );
    const rail = screen.getByRole("navigation", { name: "Sessions" });
    expect(rail).toHaveTextContent("Paste an image into a terminal");
    expect(rail).not.toHaveTextContent("host");
  });
});
