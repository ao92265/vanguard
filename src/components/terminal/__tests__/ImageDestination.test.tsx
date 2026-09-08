import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ImageDestination } from "../ImageDestination";

// The sheet has its own test file; here it only has to be openable and
// closable so the bar's focus handling can be checked.
vi.mock("../ImageDeliverySheet", () => ({
  ImageDeliverySheet: ({
    onClose,
    onDestinationChange,
  }: {
    onClose: () => void;
    onDestinationChange: (next: string | null) => void;
  }) => (
    <div role="dialog" aria-label="Deliver image">
      <button type="button" onClick={onClose}>
        Close the sheet
      </button>
      <button type="button" onClick={() => onDestinationChange("linux-box")}>
        Retarget from the sheet
      </button>
    </div>
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

it("does not allow a destination change until its initial lookup completes", () => {
  vi.mocked(invoke).mockReturnValue(new Promise(() => {}));
  render(<ImageDestination sessionId={7} />);
  expect(screen.getByRole("button", { name: "Apply", hidden: true })).toBeDisabled();
});

it("shows the saved session destination only after the backend accepts it", async () => {
  vi.mocked(invoke).mockResolvedValue(null);
  render(<ImageDestination sessionId={7} />);
  await screen.findByText("Images: this machine");
  fireEvent.change(screen.getByLabelText("Image SSH target"), { target: { value: "linux-box" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply", hidden: true }));
  await screen.findByText("Images: linux-box");
  expect(invoke).toHaveBeenCalledWith("set_image_target", { sessionId: 7, target: "linux-box" });
});

it("keeps the existing destination and displays a failed change", async () => {
  vi.mocked(invoke).mockResolvedValueOnce("linux-box").mockRejectedValueOnce("Session is gone");
  render(<ImageDestination sessionId={7} />);
  await screen.findByText("Images: linux-box");
  fireEvent.change(screen.getByLabelText("Image SSH target"), { target: { value: "other-host" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply", hidden: true }));
  await waitFor(() =>
    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("Session is gone"),
  );
  expect(screen.getByText("Images: linux-box")).toBeInTheDocument();
});

it("opens the delivery sheet from the terminal bar", async () => {
  vi.mocked(invoke).mockResolvedValue("linux-box");
  render(<ImageDestination sessionId={7} />);
  await screen.findByText("Images: linux-box");
  expect(screen.queryByRole("dialog", { name: "Deliver image" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
  expect(screen.getByRole("dialog", { name: "Deliver image" })).toBeInTheDocument();
});

it("returns focus to the button that opened the sheet", async () => {
  vi.mocked(invoke).mockResolvedValue(null);
  render(<ImageDestination sessionId={7} />);
  await screen.findByText("Images: this machine");
  const opener = screen.getByRole("button", { name: "Deliver image" });
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole("button", { name: "Close the sheet" }));
  await waitFor(() => expect(document.activeElement).toBe(opener));
});

it("carries a destination the sheet changed back into the bar", async () => {
  vi.mocked(invoke).mockResolvedValue(null);
  render(<ImageDestination sessionId={7} />);
  await screen.findByText("Images: this machine");
  fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
  fireEvent.click(screen.getByRole("button", { name: "Retarget from the sheet" }));
  await screen.findByText("Images: linux-box");
});

it("tells the terminal to stand its paste listener down while the sheet is up", async () => {
  vi.mocked(invoke).mockResolvedValue(null);
  const onSheetOpenChange = vi.fn();
  const { unmount } = render(
    <ImageDestination sessionId={7} onSheetOpenChange={onSheetOpenChange} />,
  );
  await screen.findByText("Images: this machine");
  expect(onSheetOpenChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
  expect(onSheetOpenChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "Close the sheet" }));
  expect(onSheetOpenChange).toHaveBeenLastCalledWith(false);
  // An unmount mid-sheet must not leave the terminal permanently muted.
  fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
  expect(onSheetOpenChange).toHaveBeenLastCalledWith(true);
  unmount();
  expect(onSheetOpenChange).toHaveBeenLastCalledWith(false);
});

it("does not offer delivery until the destination lookup has landed", async () => {
  // A sheet opened here could only guess at the one fact it exists to report:
  // the backend reads its own target when it stages.
  vi.mocked(invoke).mockReturnValue(new Promise(() => {}));
  render(<ImageDestination sessionId={7} />);
  expect(screen.getByRole("button", { name: "Deliver image" })).toBeDisabled();
});

it("does not offer delivery when the destination lookup failed", async () => {
  vi.mocked(invoke).mockRejectedValue("Session is gone");
  render(<ImageDestination sessionId={7} />);
  await screen.findByText("Images: destination unavailable");
  expect(screen.getByRole("button", { name: "Deliver image" })).toBeDisabled();
});
