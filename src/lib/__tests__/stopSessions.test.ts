import { beforeEach, describe, expect, it, vi } from "vitest";
import { stopSessions } from "@/lib/stopSessions";
import { killSession } from "@/lib/terminal";

vi.mock("@/lib/terminal", () => ({ killSession: vi.fn() }));

const kill = vi.mocked(killSession);

describe("stopSessions", () => {
  beforeEach(() => {
    kill.mockReset();
    kill.mockResolvedValue(undefined);
  });

  it("stops every session it was given", async () => {
    await stopSessions([1, 2, 3]);

    expect(kill).toHaveBeenCalledTimes(3);
  });

  /* One session refusing to die must not leave the others running. */
  it("keeps going after one of them fails", async () => {
    kill.mockImplementation(async (id: number) => {
      if (id === 2) throw new Error("tmux session vanguard-2-a1b2c3 is still running");
    });

    await stopSessions([1, 2, 3]);

    expect(kill).toHaveBeenCalledTimes(3);
  });

  /* THE POINT. Stop All used to log a failure to the devtools console and
     then clear the rows, so it reported a clean stop while an agent carried
     on running inside a tmux session nobody could see. */
  it("reports the sessions it could not stop", async () => {
    kill.mockImplementation(async (id: number) => {
      if (id === 2) throw new Error("tmux session vanguard-2-a1b2c3 is still running");
    });

    const failures = await stopSessions([1, 2, 3]);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("vanguard-2-a1b2c3");
  });

  it("says nothing when every session stopped", async () => {
    expect(await stopSessions([1, 2, 3])).toEqual([]);
  });
});
