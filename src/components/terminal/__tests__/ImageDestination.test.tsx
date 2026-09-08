import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ImageDestination } from "../ImageDestination";

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
