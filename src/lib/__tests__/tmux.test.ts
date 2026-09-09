import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import {
  isSafeTmuxName,
  tmuxAttachCommand,
  tmuxLaunchCommand,
  tmuxNameForSession,
  tmuxPreLaunchLine,
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
    expect(isSafeTmuxName(tmuxNameForSession(12))).toBe(true);
  });

  it("names a launched session after the session it belongs to", () => {
    expect(tmuxNameForSession(12)).toBe("vanguard-12");
  });
});

describe("launching into tmux", () => {
  /* -A attaches if the name is somehow taken rather than failing the launch,
     which matters because the name is derived from the session id and an id
     can be reused after a restart. */
  it("creates the session, or joins one already carrying that name", () => {
    expect(tmuxLaunchCommand(7)).toBe("tmux new-session -A -s vanguard-7");
  });

  /* The close path derives the name from the id rather than storing it, so
     the two must agree exactly or closing would kill nothing. */
  it("names it the same way the close path will look for it", () => {
    expect(tmuxLaunchCommand(7)).toContain(tmuxNameForSession(7));
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
    expect(tmuxPreLaunchLine(false, 3)).toBe("tmux new-session -A -s vanguard-3");
  });

  /* Attaching is already going into tmux. Creating a session first would nest
     tmux inside tmux, which tmux refuses, and the attach would never run. */
  it("does not wrap an attach, which would nest tmux inside tmux", () => {
    expect(tmuxPreLaunchLine(true, 3)).toBeNull();
  });
});
