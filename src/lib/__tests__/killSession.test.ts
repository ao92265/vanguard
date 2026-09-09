import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { killSession } from "@/lib/terminal";
import { forgetTmuxSession, rememberTmuxSession } from "@/lib/tmux";
import { useTmuxOrphanStore } from "@/stores/useTmuxOrphanStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invoked = vi.mocked(invoke);

describe("killSession", () => {
  beforeEach(() => {
    invoked.mockReset();
    invoked.mockResolvedValue(undefined);
    forgetTmuxSession(7);
    useTmuxOrphanStore.setState({ orphans: [] });
  });

  /* Killing the PTY signals its process group, which under tmux is only the
     client. The agent would keep running inside the tmux server with nothing
     on screen showing it, and Stop All would report success while every agent
     carried on. */
  it("ends the tmux session as well as the terminal", async () => {
    rememberTmuxSession(7, "vanguard-7-a1b2c3");

    await killSession(7);

    expect(invoked).toHaveBeenCalledWith("kill_tmux_session", { name: "vanguard-7-a1b2c3" });
    expect(invoked).toHaveBeenCalledWith("kill_session", { sessionId: 7 });
  });

  /* The agent goes first: once the PTY is gone there is no handle left, and an
     orphan is worse than a redundant call. */
  it("stops the agent before it drops the terminal", async () => {
    rememberTmuxSession(7, "vanguard-7-a1b2c3");

    await killSession(7);

    const calls = invoked.mock.calls.map(([command]) => command);
    expect(calls.indexOf("kill_tmux_session")).toBeLessThan(calls.indexOf("kill_session"));
  });

  /* THE ONE THAT MATTERS. Session ids restart at 1 on every app launch and
     tmux sessions deliberately outlive the app, so a name derived from the id
     alone points at the PREVIOUS run's work. Closing a throwaway pane would
     kill last night's agent. Only a session this run actually launched into
     tmux may be killed. */
  it("does not touch tmux for a session it never launched into tmux", async () => {
    await killSession(7);

    const calls = invoked.mock.calls.map(([command]) => command);
    expect(calls).not.toContain("kill_tmux_session");
    expect(invoked).toHaveBeenCalledWith("kill_session", { sessionId: 7 });
  });

  /* The backend already reports every already-gone case as success, so
     anything that throws here is a live tmux session we failed to end.
     Swallowing it let Stop All clear the rows and report success while the
     agent ran on, detached. */
  it("reports a tmux session it could not end, after closing the terminal", async () => {
    rememberTmuxSession(7, "vanguard-7-a1b2c3");
    invoked.mockImplementation((command: string) =>
      command === "kill_tmux_session"
        ? Promise.reject(new Error("no server running on /tmp/tmux-502/default"))
        : Promise.resolve(),
    );

    await expect(killSession(7)).rejects.toThrow(/vanguard-7-a1b2c3/);
    /* The terminal must still close: an unkillable tmux session cannot be
       allowed to make the pane unclosable too. */
    expect(invoked).toHaveBeenCalledWith("kill_session", { sessionId: 7 });
  });

  /* A second close of the same session must not resurrect the name and go
     hunting for a tmux session that is already gone. */
  it("forgets the tmux session once it has ended it", async () => {
    rememberTmuxSession(7, "vanguard-7-a1b2c3");
    await killSession(7);
    invoked.mockClear();

    await killSession(7);

    expect(invoked.mock.calls.map(([command]) => command)).not.toContain("kill_tmux_session");
  });
});

/* Throwing is not enough on its own. Five of the seven close paths are
   `.catch(console.error)` and `useWorkspaceStore` logs each rejection, so the
   throw reaches nobody on six of them: the pane vanishes, the row is dropped
   and the agent runs on with its only trace in a console. */
describe("reporting a tmux session that would not die", () => {
  beforeEach(() => {
    invoked.mockReset();
    invoked.mockResolvedValue(undefined);
    forgetTmuxSession(7);
    useTmuxOrphanStore.setState({ orphans: [] });
  });

  it("reports it, not only to whichever caller happened to listen", async () => {
    rememberTmuxSession(7, "vanguard-7-a1b2c3d4e5f60718");
    invoked.mockImplementation((command: string) =>
      command === "kill_tmux_session" ? Promise.reject(new Error("wedged")) : Promise.resolve(),
    );

    await expect(killSession(7)).rejects.toThrow();

    const orphans = useTmuxOrphanStore.getState().orphans;
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toContain("vanguard-7-a1b2c3d4e5f60718");
  });

  it("says nothing when the close went cleanly", async () => {
    rememberTmuxSession(7, "vanguard-7-a1b2c3d4e5f60718");

    await killSession(7);

    expect(useTmuxOrphanStore.getState().orphans).toEqual([]);
  });

  /* Both halves failing must not lose the tmux half: the PTY error alone
     would drop the one fact worth carrying, that something is still running. */
  it("keeps the tmux failure when closing the terminal fails too", async () => {
    rememberTmuxSession(7, "vanguard-7-a1b2c3d4e5f60718");
    invoked.mockRejectedValue(new Error("session 7 not found"));

    await expect(killSession(7)).rejects.toThrow(/vanguard-7-a1b2c3d4e5f60718/);
    expect(useTmuxOrphanStore.getState().orphans[0]).toContain("vanguard-7-a1b2c3d4e5f60718");
  });
});
