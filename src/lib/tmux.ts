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

/**
 * tmux forbids `:` and `.` in a session name and reads them as window and
 * pane targets, so a name carrying either was not made by us. Mirrors the
 * backend's `safe_session_name`: both sides refuse rather than escape.
 */
export function isSafeTmuxName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 128 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}

/**
 * The command that attaches a pane to an existing tmux session, or null when
 * the name is not one we will put on a command line. Null is a refusal, not a
 * fallback: attaching to the wrong session is worse than not attaching.
 */
export function tmuxAttachCommand(name: string): string | null {
  return isSafeTmuxName(name) ? `tmux attach -t ${name.trim()}` : null;
}
