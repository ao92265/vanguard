import { invoke } from "@tauri-apps/api/core";

/** A tmux session, as the backend's `list_tmux_sessions` reports it. */
export interface TmuxSession {
  /** Session name, which is also how you attach to it. */
  name: string;
  /** Working directory of the active pane. */
  cwd: string;
  /** Whether a terminal is attached right now. */
  attached: boolean;
  /** Unix seconds it was created, or 0 when tmux gave nothing. */
  created: number;
  windows: number;
}

/** tmux missing or no server running is an empty list, never an error. */
export async function listTmuxSessions(): Promise<TmuxSession[]> {
  return invoke<TmuxSession[]>("list_tmux_sessions");
}

/**
 * The tmux session name Maestro gives work it launches itself. Kept here
 * rather than at the call site so the launcher and anything matching sessions
 * back to rows read the same rule.
 */
export function tmuxNameForSession(sessionId: number): string {
  return `vanguard-${sessionId}`;
}
