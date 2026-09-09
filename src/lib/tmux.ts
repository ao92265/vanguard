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

/**
 * The line that puts a launch inside tmux: attach to that session if it
 * somehow exists, otherwise create it. Typed into the shell before the agent
 * command, so the agent ends up running inside tmux and survives the app
 * closing.
 */
export function tmuxLaunchCommand(sessionId: number): string {
  return `tmux new-session -A -s ${tmuxNameForSession(sessionId)}`;
}

/** Whether tmux is installed at all. An empty session list cannot answer it. */
export async function tmuxAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("tmux_available");
  } catch {
    return false;
  }
}

/** Ends a tmux session by name. A name that is already gone is success. */
export async function killTmuxSession(name: string): Promise<void> {
  await invoke("kill_tmux_session", { name });
}

/**
 * Waits until tmux reports a session by that name, or gives up.
 *
 * The launcher types the tmux line and then the agent command. Typing the
 * second into a shell that is still becoming tmux loses it, so this is a real
 * check rather than a pause and a hope. Returns whether the session appeared:
 * the caller has to tell him when it did not, because the work then runs
 * outside tmux and dies with the app.
 */
export async function waitForTmuxSession(
  name: string,
  { timeoutMs = 3000, everyMs = 100 } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const sessions = await listTmuxSessions().catch(() => []);
    if (sessions.some((session) => session.name === name)) return true;
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
  return false;
}

/**
 * The tmux line to type before the agent command, or null when there should
 * not be one.
 *
 * Null while attaching is the whole point: the pane is about to join an
 * existing tmux session, and creating one first would nest tmux inside tmux,
 * which tmux itself refuses.
 */
export function tmuxPreLaunchLine(attaching: boolean, sessionId: number): string | null {
  return attaching ? null : tmuxLaunchCommand(sessionId);
}
