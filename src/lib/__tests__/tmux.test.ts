import { describe, expect, it } from "vitest";
import { isSafeTmuxName, tmuxAttachCommand, tmuxNameForSession } from "@/lib/tmux";

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
