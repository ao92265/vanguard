import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { savePastedImage } from "../terminal";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it("binds image bytes to their session in the raw IPC request", async () => {
  const data = new Uint8Array([255, 216, 255, 217]);
  await (savePastedImage as (...args: unknown[]) => Promise<unknown>)(data, "image/jpeg", 7);
  expect(invoke).toHaveBeenCalledWith("save_pasted_image", data, {
    headers: { "media-type": "image/jpeg", "session-id": "7" },
  });
});
