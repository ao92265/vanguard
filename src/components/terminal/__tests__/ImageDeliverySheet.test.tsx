import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { savePastedImage } from "@/lib/terminal";
import { ImageDeliverySheet } from "../ImageDeliverySheet";

vi.mock("@/lib/terminal", () => ({ savePastedImage: vi.fn() }));

const savePastedImageMock = vi.mocked(savePastedImage);
const invokeMock = vi.mocked(invoke);

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Puts one clipboard item on `navigator.clipboard.read`. */
function stubClipboard(types: string[], blob?: Blob) {
  const read = vi.fn(async () => [
    {
      types,
      getType: async () => blob ?? new Blob([PNG_BYTES], { type: types[0] }),
    },
  ]);
  Object.defineProperty(navigator, "clipboard", { value: { read }, configurable: true });
  return read;
}

/** Fails the clipboard read the way a webview without permission does. */
function stubClipboardFailure(message: string) {
  const read = vi.fn(async () => {
    throw new Error(message);
  });
  Object.defineProperty(navigator, "clipboard", { value: { read }, configurable: true });
  return read;
}

function renderSheet(overrides?: {
  destination?: string | null;
  onDestinationChange?: (next: string | null) => void;
  onClose?: () => void;
}) {
  const props = {
    sessionId: 7,
    destination: overrides?.destination ?? null,
    onDestinationChange: overrides?.onDestinationChange ?? vi.fn(),
    onClose: overrides?.onClose ?? vi.fn(),
  };
  const view = render(<ImageDeliverySheet {...props} />);
  return { ...view, props };
}

async function readySheet(destination: string | null = null) {
  stubClipboard(["image/png"]);
  const rendered = renderSheet({ destination });
  await screen.findByText("PNG · 8 B · from the clipboard");
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  invokeMock.mockResolvedValue(undefined);
});

describe("ImageDeliverySheet", () => {
  it("names the configured destination without claiming anything about a host", async () => {
    await readySheet("linux-box");
    const dialog = screen.getByRole("dialog", { name: "Deliver image" });
    expect(dialog).toHaveTextContent("Image destination");
    expect(dialog).toHaveTextContent("linux-box");
    expect(screen.queryByText(/host key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/known_hosts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reachable/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /telegram/i })).not.toBeInTheDocument();
  });

  it("calls this machine what it is when no destination is set", async () => {
    await readySheet(null);
    expect(screen.getByRole("dialog", { name: "Deliver image" })).toHaveTextContent("this machine");
  });

  it("states the retention this backend actually applies", async () => {
    await readySheet(null);
    const dialog = screen.getByRole("dialog", { name: "Deliver image" });
    expect(dialog).toHaveTextContent("kept for 24 hours");
    expect(dialog).toHaveTextContent("removed when the session closes");
    expect(dialog).not.toHaveTextContent("turn ends");
  });

  it("shows the path the backend returned, and none before it does", async () => {
    savePastedImageMock.mockResolvedValue("/tmp/maestro-image-4f21/image.png");
    await readySheet(null);
    expect(screen.queryByText("/tmp/maestro-image-4f21/image.png")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
    await screen.findByText("/tmp/maestro-image-4f21/image.png");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Staged on this machine and pasted into the terminal.",
    );
    const [bytes, mediaType, sessionId] = savePastedImageMock.mock.calls[0];
    expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES));
    expect(mediaType).toBe("image/png");
    expect(sessionId).toBe(7);
  });

  it("delivers once however many times the button is pressed", async () => {
    let settle: ((path: string) => void) | null = null;
    savePastedImageMock.mockReturnValue(
      new Promise<string>((resolve) => {
        settle = resolve;
      }),
    );
    await readySheet(null);
    const deliver = screen.getByRole("button", { name: "Deliver image" });
    fireEvent.click(deliver);
    await waitFor(() => expect(deliver).toBeDisabled());
    fireEvent.click(deliver);
    expect(savePastedImageMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Staging the image…");
    settle?.("/tmp/maestro-image-4f21/image.png");
    await screen.findByText("/tmp/maestro-image-4f21/image.png");
  });

  it("reports a failed transfer verbatim and claims no delivery", async () => {
    savePastedImageMock.mockRejectedValue("Another image is uploading; try again");
    await readySheet(null);
    fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Another image is uploading; try again"),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not credit a transfer to a destination chosen after it started", async () => {
    let settle: ((path: string) => void) | null = null;
    savePastedImageMock.mockReturnValue(
      new Promise<string>((resolve) => {
        settle = resolve;
      }),
    );
    const onDestinationChange = vi.fn();
    stubClipboard(["image/png"]);
    const { rerender, props } = renderSheet({ destination: null, onDestinationChange });
    await screen.findByText("PNG · 8 B · from the clipboard");
    fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));

    fireEvent.change(screen.getByLabelText("Image destination host"), {
      target: { value: "linux-box" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set destination" }));
    await waitFor(() => expect(onDestinationChange).toHaveBeenCalledWith("linux-box"));
    rerender(<ImageDeliverySheet {...props} destination="linux-box" />);

    settle?.("/tmp/maestro-image-4f21/image.png");
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "The destination changed to linux-box while this transfer was running. The image went to this machine.",
    );
    expect(status).not.toHaveTextContent("Staged on linux-box");
  });

  it("says the clipboard held no image rather than offering to send one", async () => {
    stubClipboard(["text/plain"], new Blob(["hello"], { type: "text/plain" }));
    renderSheet();
    await screen.findByText("No image on the clipboard.");
    expect(screen.getByRole("button", { name: "Deliver image" })).toBeDisabled();
  });

  it("surfaces a clipboard the webview would not read", async () => {
    stubClipboardFailure("Read permission denied");
    renderSheet();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Read permission denied"),
    );
    expect(screen.getByRole("button", { name: "Deliver image" })).toBeDisabled();
  });

  it("closes on Escape and on Cancel", async () => {
    const onClose = vi.fn();
    stubClipboard(["image/png"]);
    renderSheet({ onClose });
    const dialog = await screen.findByRole("dialog", { name: "Deliver image" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

it("does not re-arm delivery after the image has been staged", async () => {
  savePastedImageMock.mockResolvedValue("/tmp/maestro-image-4f21/image.png");
  stubClipboard(["image/png"]);
  renderSheet();
  await screen.findByText("PNG · 8 B · from the clipboard");
  const deliver = screen.getByRole("button", { name: "Deliver image" });
  fireEvent.click(deliver);
  await screen.findByText("/tmp/maestro-image-4f21/image.png");
  expect(deliver).toBeDisabled();
  fireEvent.click(deliver);
  expect(savePastedImageMock).toHaveBeenCalledTimes(1);
});

it("re-arms delivery after a failure, so a retry is possible", async () => {
  savePastedImageMock.mockRejectedValueOnce("Another image is uploading; try again");
  stubClipboard(["image/png"]);
  renderSheet();
  await screen.findByText("PNG · 8 B · from the clipboard");
  const deliver = screen.getByRole("button", { name: "Deliver image" });
  fireEvent.click(deliver);
  await screen.findByRole("alert");
  expect(deliver).not.toBeDisabled();
});
