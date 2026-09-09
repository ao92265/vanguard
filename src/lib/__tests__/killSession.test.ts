import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { killSession } from "@/lib/terminal";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invoked = vi.mocked(invoke);

describe("killSession", () => {
  beforeEach(() => {
    invoked.mockReset();
    invoked.mockResolvedValue(undefined);
  });

  /* Killing the PTY signals its process group, which under tmux is only the
     client. The agent would keep running inside the tmux server with nothing
     on screen showing it, and Stop All would report success while every
     agent carried on. */
  it("ends the tmux session as well as the terminal", async () => {
    await killSession(7);

    const calls = invoked.mock.calls.map(([command]) => command);
    expect(calls).toContain("kill_tmux_session");
    expect(calls).toContain("kill_session");
    expect(invoked).toHaveBeenCalledWith("kill_tmux_session", { name: "vanguard-7" });
  });

  /* The agent goes first: once the PTY is gone there is no handle left, and
     an orphan is worse than a redundant call. */
  it("stops the agent before it drops the terminal", async () => {
    await killSession(7);

    const calls = invoked.mock.calls.map(([command]) => command);
    expect(calls).toContain("kill_tmux_session");
    expect(calls.indexOf("kill_tmux_session")).toBeLessThan(calls.indexOf("kill_session"));
  });

  /* Most sessions were never launched into tmux, and a session that has
     already gone is the state the caller wanted. Neither may stop the close. */
  it("still closes the terminal when there is no tmux session to end", async () => {
    invoked.mockImplementation((command: string) =>
      command === "kill_tmux_session" ? Promise.reject(new Error("nope")) : Promise.resolve(),
    );

    await expect(killSession(7)).resolves.toBeUndefined();
    expect(invoked).toHaveBeenCalledWith("kill_tmux_session", { name: "vanguard-7" });
    expect(invoked).toHaveBeenCalledWith("kill_session", { sessionId: 7 });
  });
});
