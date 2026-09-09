import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import {
  isSafeTmuxName,
  newTmuxSessionName,
  rememberTmuxSession,
  tmuxAttachCommand,
  tmuxLaunchCommand,
  tmuxPreLaunchLine,
  tmuxSessionFor,
  waitForTmuxSession,
} from "@/lib/tmux";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("tmux names", () => {
  /* The name is pasted onto a command line, where a colon or a dot is tmux
     target syntax and a space or a backtick is the shell's. Refusing is the
     only safe answer: attaching to the wrong session is worse than not
     attaching at all. */
  it("refuses a name that could retarget tmux or reach the shell", () => {
    expect(tmuxAttachCommand("cc-aoreilly-4")).toBe("tmux attach -t cc-aoreilly-4");
    expect(tmuxAttachCommand("work:1")).toBeNull();
    expect(tmuxAttachCommand("work.0")).toBeNull();
    expect(tmuxAttachCommand("a b")).toBeNull();
    expect(tmuxAttachCommand("$(rm -rf ~)")).toBeNull();
    expect(tmuxAttachCommand("a;reboot")).toBeNull();
    expect(tmuxAttachCommand("")).toBeNull();
  });

  it("agrees with itself about what is safe", () => {
    expect(isSafeTmuxName(newTmuxSessionName(12))).toBe(true);
  });

  it("says which session a launched tmux session belongs to", () => {
    expect(newTmuxSessionName(12)).toMatch(/^vanguard-12-[0-9a-f]{6}$/);
  });

  /* THE ONE THAT MATTERS. Session ids come from an in-process counter that
     restarts at 1 on every app launch, while these tmux sessions are built to
     outlive the app. A name derived from the id alone therefore names the
     PREVIOUS run's work: the first launch after a restart would join last
     night's agent, and closing that pane would kill it. */
  it("never gives two launches the same name, even for the same session id", () => {
    const names = new Set(Array.from({ length: 200 }, () => newTmuxSessionName(1)));
    expect(names.size).toBe(200);
  });
});

describe("launching into tmux", () => {
  /* No -A. It JOINS a session already carrying the name rather than failing,
     so with any name collision it is the flag that types a fresh agent
     command line into an agent that is already running. */
  it("creates the session and refuses to join one that already exists", () => {
    expect(tmuxLaunchCommand("vanguard-7-a1b2c3")).toBe("tmux new-session -s vanguard-7-a1b2c3");
    expect(tmuxLaunchCommand("vanguard-7-a1b2c3")).not.toContain("-A");
  });
});

describe("remembering what a launch created", () => {
  /* The close path kills a name it was handed, never one it worked out, so
     the launch has to hand it over. */
  it("hands the close path the name the launch actually used", () => {
    const name = newTmuxSessionName(4);
    rememberTmuxSession(4, name);
    expect(tmuxSessionFor(4)).toBe(name);
  });

  it("knows nothing about a session that was never launched into tmux", () => {
    expect(tmuxSessionFor(9999)).toBeNull();
  });
});

describe("waiting for the tmux session to exist", () => {
  it("returns true as soon as tmux reports the name", async () => {
    const listed = vi
      .mocked(invoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { name: "vanguard-7", cwd: "/x", attached: false, created: 0, windows: 1 },
      ]);

    await expect(waitForTmuxSession("vanguard-7", { timeoutMs: 1000, everyMs: 1 })).resolves.toBe(
      true,
    );
    expect(listed).toHaveBeenCalledTimes(2);
  });

  /* A false here is what makes the launcher tell him the work is not in tmux.
     Returning true on a timeout would leave him believing it survives the app
     closing when it does not. */
  it("gives up rather than reporting a session that never appeared", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    await expect(waitForTmuxSession("vanguard-7", { timeoutMs: 20, everyMs: 1 })).resolves.toBe(
      false,
    );
  });
});

describe("deciding whether to wrap a launch in tmux", () => {
  it("wraps an ordinary launch", () => {
    expect(tmuxPreLaunchLine(false, "vanguard-3-a1b2c3")).toBe(
      "tmux new-session -s vanguard-3-a1b2c3",
    );
  });

  /* Attaching is already going into tmux. Creating a session first would nest
     tmux inside tmux, which tmux refuses, and the attach would never run. */
  it("does not wrap an attach, which would nest tmux inside tmux", () => {
    expect(tmuxPreLaunchLine(true, "vanguard-3-a1b2c3")).toBeNull();
  });
});
