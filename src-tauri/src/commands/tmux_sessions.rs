/*!
tmux sessions Maestro did not start, and the naming it uses for the ones it did.

Alex runs most of his agents in tmux, so the app that is meant to be the one
window was blind to nearly all of his work. This is the same idea as
`external_sessions`, minus the AppleScript: tmux answers a formatted query
directly, so there is no automation permission to be refused and no window
tree to walk.

tmux missing, or no server running, is a normal empty answer. `tmux
list-sessions` exits non-zero with "no server running on ..." when nothing is
up, which is not a fault worth showing anyone.
*/

use serde::Serialize;

/// Field separator for the format string. tmux emits `#{...}` values verbatim,
/// so a separator has to be something a session name cannot contain: tmux
/// itself rejects a name holding a colon or a full stop, and this pairs both.
const FIELD: &str = ":.:";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmuxSession {
    /// Session name, which is also how you attach to it.
    pub name: String,
    /// Working directory of the active pane.
    pub cwd: String,
    /// Whether a terminal is attached to it right now.
    pub attached: bool,
    /// Unix seconds the session was created, or 0 when tmux gave nothing.
    pub created: i64,
    /// Windows in the session.
    pub windows: u32,
}

/// The format tmux is asked for. Kept next to the parser so the two cannot
/// drift apart without one file changing.
pub const LIST_FORMAT: &str = concat!(
    "#{session_name}",
    ":.:",
    "#{pane_current_path}",
    ":.:",
    "#{session_attached}",
    ":.:",
    "#{session_created}",
    ":.:",
    "#{session_windows}",
);

/// Turn tmux's output into rows, dropping anything malformed rather than
/// failing the whole read: one odd session must not hide the rest.
pub fn parse_sessions(raw: &str) -> Vec<TmuxSession> {
    raw.lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split(FIELD).collect();
            if fields.len() < 5 {
                return None;
            }
            let name = fields[0].trim();
            if name.is_empty() {
                return None;
            }
            Some(TmuxSession {
                name: name.to_string(),
                cwd: fields[1].trim().to_string(),
                /* tmux reports the number of attached clients, not a flag, so
                   anything above zero counts. */
                attached: fields[2].trim().parse::<u32>().unwrap_or(0) > 0,
                created: fields[3].trim().parse::<i64>().unwrap_or(0),
                windows: fields[4].trim().parse::<u32>().unwrap_or(1),
            })
        })
        .collect()
}

/// A tmux session name Maestro may act on. tmux forbids `:` and `.` in a name
/// and treats them as target syntax, so anything carrying them is not a name
/// we produced and is refused rather than escaped.
pub fn safe_session_name(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return None;
    }
    Some(trimmed.to_string())
}

#[tauri::command]
pub async fn list_tmux_sessions() -> Result<Vec<TmuxSession>, String> {
    let output = match tokio::process::Command::new("tmux")
        .args(["list-sessions", "-F", LIST_FORMAT])
        .output()
        .await
    {
        Ok(output) => output,
        // tmux is not installed. Nothing to show, nothing to complain about.
        Err(_) => return Ok(Vec::new()),
    };
    if !output.status.success() {
        // No server running is the ordinary case, not a failure.
        return Ok(Vec::new());
    }
    Ok(parse_sessions(&String::from_utf8_lossy(&output.stdout)))
}

/// Whether tmux is installed. An empty session list cannot answer this: no
/// server running and no tmux at all look identical from `list-sessions`, and
/// the launcher must not wrap a command in a binary that is not there.
#[tauri::command]
pub async fn tmux_available() -> bool {
    tokio::process::Command::new("tmux")
        .arg("-V")
        .output()
        .await
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// Ends a tmux session by name.
///
/// Closing a Maestro session kills the PTY's process group, which under tmux
/// is only the client: the agent would keep running inside the server with
/// nothing on screen showing it, and Stop All would report success while
/// every agent carried on. So closing calls this too.
///
/// A name that is not there is success, not a failure. The caller cannot know
/// whether a given session was launched into tmux without storing that, and
/// asking tmux to end something already gone is exactly the no-op it should
/// be.
#[tauri::command]
pub async fn kill_tmux_session(name: String) -> Result<(), String> {
    let safe = safe_session_name(&name).ok_or_else(|| "That is not a tmux session name.".to_string())?;
    match tokio::process::Command::new("tmux")
        .args(["kill-session", "-t", &safe])
        .output()
        .await
    {
        // tmux absent means there is nothing running to end.
        Err(_) => Ok(()),
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
            /* "can't find session" and "no server running" both mean the work
               is already gone, which is the state the caller wanted. */
            if stderr.contains("can't find session")
                || stderr.contains("no server running")
                || stderr.contains("session not found")
            {
                Ok(())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_session_row() {
        let rows = parse_sessions("cc-aoreilly-4:.:/Users/a/Repos/act:.:1:.:1757404975:.:2\n");
        assert_eq!(
            rows,
            vec![TmuxSession {
                name: "cc-aoreilly-4".into(),
                cwd: "/Users/a/Repos/act".into(),
                attached: true,
                created: 1_757_404_975,
                windows: 2,
            }]
        );
    }

    /* tmux counts clients rather than answering yes or no, and two terminals
       on one session is normal. Anything above zero is attached. */
    #[test]
    fn several_clients_still_reads_as_attached() {
        let rows = parse_sessions("a:.:/tmp:.:3:.:1:.:1\n");
        assert!(rows[0].attached);
        let rows = parse_sessions("a:.:/tmp:.:0:.:1:.:1\n");
        assert!(!rows[0].attached);
    }

    /* One unreadable row must not cost him the whole list. */
    #[test]
    fn a_malformed_row_is_dropped_and_the_rest_survive() {
        let rows = parse_sessions("broken\n\nb:.:/tmp/x:.:0:.:1:.:1\n");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "b");
    }

    /* The name is pasted into a tmux target, where a colon or a dot means
       "window" and "pane". A name carrying either is not one of ours. */
    #[test]
    fn a_name_that_could_retarget_tmux_is_refused() {
        assert_eq!(safe_session_name("cc-aoreilly-4"), Some("cc-aoreilly-4".into()));
        assert_eq!(safe_session_name("work:1"), None);
        assert_eq!(safe_session_name("work.0"), None);
        assert_eq!(safe_session_name("a b"), None);
        assert_eq!(safe_session_name(""), None);
        assert_eq!(safe_session_name("$(rm -rf /)"), None);
    }

    /* The parser splits on the same separator the query asks tmux for. If one
       changes without the other, every row silently becomes malformed. */
    #[test]
    fn the_query_and_the_parser_agree_on_the_separator() {
        assert_eq!(LIST_FORMAT.matches(FIELD).count(), 4);
    }
}
