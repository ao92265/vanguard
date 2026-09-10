import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type StagedImage, savePastedImage } from "@/lib/terminal";
import { ImageDeliverySheet, type ImageDestinationState } from "../ImageDeliverySheet";

vi.mock("@/lib/terminal", () => ({ savePastedImage: vi.fn() }));

const savePastedImageMock = vi.mocked(savePastedImage);
const invokeMock = vi.mocked(invoke);

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Where the backend stages an image with no SSH destination, on this machine. */
const LOCAL_PATH = "/var/folders/9v/T/maestro-image-4f21/image.png";
/** Where it stages one on an SSH destination. */
const REMOTE_PATH = "/tmp/maestro-image-4f21/image.png";

const known = (ssh: string | null): ImageDestinationState => ({ known: true, ssh });
const loading: ImageDestinationState = { known: false, reason: "loading" };
const unavailable = (message: string): ImageDestinationState => ({
  known: false,
  reason: "unavailable",
  message,
});

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
  destination?: ImageDestinationState;
  onDestinationChange?: (next: string | null) => void;
  onClose?: () => void;
}) {
  const props = {
    sessionId: 7,
    destination: overrides?.destination ?? known(null),
    onDestinationChange: overrides?.onDestinationChange ?? vi.fn(),
    onClose: overrides?.onClose ?? vi.fn(),
  };
  const view = render(<ImageDeliverySheet {...props} />);
  return { ...view, props };
}

async function readySheet(destination: ImageDestinationState = known(null)) {
  stubClipboard(["image/png"]);
  const rendered = renderSheet({ destination });
  await screen.findByText("PNG · 8 B · from the clipboard");
  return rendered;
}

/** The shape `save_pasted_image` resolves with. */
function staged(path: string, destination: string | null): StagedImage {
  return { path, destination };
}

beforeEach(() => {
  vi.clearAllMocks();
  invokeMock.mockResolvedValue(undefined);
});

describe("ImageDeliverySheet destination reporting", () => {
  it("names the configured destination without claiming anything about a host", async () => {
    await readySheet(known("linux-box"));
    const dialog = screen.getByRole("dialog", { name: "Deliver image" });
    expect(dialog).toHaveTextContent("Image destination");
    expect(dialog).toHaveTextContent("linux-box");
    expect(screen.queryByText(/host key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/known_hosts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reachable/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /telegram/i })).not.toBeInTheDocument();
  });

  it("calls this machine what it is when no destination is set", async () => {
    await readySheet(known(null));
    expect(screen.getByRole("dialog", { name: "Deliver image" })).toHaveTextContent("this machine");
  });

  it("does not name a place while the destination lookup is in flight", async () => {
    await readySheet(loading);
    const dialog = screen.getByRole("dialog", { name: "Deliver image" });
    expect(dialog).toHaveTextContent("still loading");
    expect(dialog).not.toHaveTextContent("this machine");
  });

  it("does not name a place when the destination lookup failed", async () => {
    await readySheet(unavailable("Session is gone"));
    const dialog = screen.getByRole("dialog", { name: "Deliver image" });
    expect(dialog).toHaveTextContent("not known");
    expect(dialog).toHaveTextContent("Session is gone");
    expect(dialog).not.toHaveTextContent("this machine");
  });
});

describe("ImageDeliverySheet delivery", () => {
  it("shows the path the backend returned, and none before it does", async () => {
    savePastedImageMock.mockResolvedValue(staged(LOCAL_PATH, null));
    await readySheet(known(null));
    expect(screen.queryByText(LOCAL_PATH)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
    await screen.findByText(LOCAL_PATH);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Staged on this machine and pasted into the terminal.",
    );
    const [bytes, mediaType, sessionId] = savePastedImageMock.mock.calls[0];
    expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES));
    expect(mediaType).toBe("image/png");
    expect(sessionId).toBe(7);
  });

  it("reports where the backend says the image went, not what the sheet was showing", async () => {
    // The backend snapshots its own target inside save(); a set_image_target
    // that lands before that snapshot stages the image somewhere the sheet was
    // not showing, and with_current then accepts it.
    savePastedImageMock.mockResolvedValue(staged(REMOTE_PATH, "linux-box"));
    await readySheet(known(null));
    fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "The destination changed while this transfer was running. The image went to linux-box, not this machine.",
    );
    expect(status).not.toHaveTextContent("Staged on this machine");
  });

  it("delivers once however many times the button is pressed", async () => {
    let settle: ((value: StagedImage) => void) | null = null;
    savePastedImageMock.mockReturnValue(
      new Promise<StagedImage>((resolve) => {
        settle = resolve;
      }),
    );
    await readySheet(known(null));
    const deliver = screen.getByRole("button", { name: "Deliver image" });
    fireEvent.click(deliver);
    await waitFor(() => expect(deliver).toBeDisabled());
    fireEvent.click(deliver);
    expect(savePastedImageMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Staging the image…");
    settle?.(staged(LOCAL_PATH, null));
    await screen.findByText(LOCAL_PATH);
  });

  it("reports a failed transfer verbatim and claims no delivery", async () => {
    // The refusal the backend actually raises when the destination moves
    // between save()'s snapshot and the stdin write.
    savePastedImageMock.mockRejectedValue("Image destination changed during upload; try again");
    await readySheet(known(null));
    fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Image destination changed during upload; try again",
      ),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not re-arm delivery after the image has been staged", async () => {
    savePastedImageMock.mockResolvedValue(staged(LOCAL_PATH, null));
    await readySheet(known(null));
    const deliver = screen.getByRole("button", { name: "Deliver image" });
    fireEvent.click(deliver);
    await screen.findByText(LOCAL_PATH);
    expect(deliver).toBeDisabled();
    fireEvent.click(deliver);
    expect(savePastedImageMock).toHaveBeenCalledTimes(1);
  });

  it("re-arms delivery after a failure, so a retry is possible", async () => {
    savePastedImageMock.mockRejectedValueOnce("Another image is uploading; try again");
    await readySheet(known(null));
    const deliver = screen.getByRole("button", { name: "Deliver image" });
    fireEvent.click(deliver);
    await screen.findByRole("alert");
    expect(deliver).not.toBeDisabled();
  });
});

describe("ImageDeliverySheet what happens to it", () => {
  it("admits the agent is handed a local path when the image stays on this machine", async () => {
    await readySheet(known(null));
    const dialog = screen.getByRole("dialog", { name: "Deliver image" });
    expect(dialog).toHaveTextContent("that local path is what the agent is handed");
    expect(dialog).not.toHaveTextContent("No local file path is handed over");
  });

  it("says the path belongs to the destination when one is set", async () => {
    await readySheet(known("linux-box"));
    expect(screen.getByRole("dialog", { name: "Deliver image" })).toHaveTextContent(
      "a file on linux-box, not on this machine",
    );
  });

  it("cannot disagree with the path panel about where the image went", async () => {
    savePastedImageMock.mockResolvedValue(staged(REMOTE_PATH, "linux-box"));
    await readySheet(known(null));
    fireEvent.click(screen.getByRole("button", { name: "Deliver image" }));
    await screen.findByText(REMOTE_PATH);
    const dialog = screen.getByRole("dialog", { name: "Deliver image" });
    expect(dialog).toHaveTextContent("a file on linux-box, not on this machine");
    expect(dialog).not.toHaveTextContent("that local path is what the agent is handed");
  });

  it("states the retention this backend actually applies", async () => {
    await readySheet(known(null));
    const dialog = screen.getByRole("dialog", { name: "Deliver image" });
    expect(dialog).toHaveTextContent("kept for 24 hours");
    expect(dialog).toHaveTextContent("removed when the session closes");
    expect(dialog).not.toHaveTextContent("turn ends");
  });
});

describe("ImageDeliverySheet clipboard and dismissal", () => {
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

  it("still lets the destination be changed from inside the sheet", async () => {
    const onDestinationChange = vi.fn();
    stubClipboard(["image/png"]);
    renderSheet({ destination: known(null), onDestinationChange });
    await screen.findByText("PNG · 8 B · from the clipboard");
    fireEvent.change(screen.getByLabelText("Image destination host"), {
      target: { value: "linux-box" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set destination" }));
    await waitFor(() => expect(onDestinationChange).toHaveBeenCalledWith("linux-box"));
    expect(invokeMock).toHaveBeenCalledWith("set_image_target", {
      sessionId: 7,
      target: "linux-box",
    });
  });
});
