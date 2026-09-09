import { create } from "zustand";

/**
 * tmux sessions a close could not end.
 *
 * `killSession` throws when the tmux half fails, but six of its seven callers
 * close a pane with `.catch(console.error)` and then drop the row, so the
 * throw alone reaches nobody: the agent runs on, detached, and the only trace
 * is in a devtools console. Reporting from inside the close wrapper is what
 * makes every path say so, rather than the one path that happened to be
 * written to listen.
 */
interface TmuxOrphanState {
  /** One message per tmux session left running, newest last. */
  orphans: string[];
  report: (message: string) => void;
  clear: () => void;
}

export const useTmuxOrphanStore = create<TmuxOrphanState>((set) => ({
  orphans: [],
  report: (message) =>
    set((state) =>
      /* The same wedged tmux server across a Stop All would otherwise say the
         same thing ten times. */
      state.orphans.includes(message) ? state : { orphans: [...state.orphans, message] },
    ),
  clear: () => set({ orphans: [] }),
}));
