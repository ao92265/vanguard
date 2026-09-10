import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolsEdgeToggle } from "../ToolsEdgeToggle";

describe("ToolsEdgeToggle", () => {
  it("offers a way in while the panel is closed", () => {
    const onOpen = vi.fn();
    render(<ToolsEdgeToggle open={false} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Open tools" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("gets out of the way once the panel is open, which carries its own close", () => {
    render(<ToolsEdgeToggle open onOpen={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Open tools" })).not.toBeInTheDocument();
  });
});
