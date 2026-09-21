//! HTTP relay for the Vanguard bot's conversation history.
//!
//! The webview cannot call the bot daemon directly because of its CSP, so this
//! relays through Tauri, the same way the ACT commands do.
//!
//! "Bot unreachable" is a normal state, not an error to shout about: the daemon
//! is a separate launchd service and it restarts whenever it is rebuilt. The
//! frontend keeps its last payload on screen and marks it offline.

use directories::BaseDirs;
use reqwest::{Client, Url};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

const DEFAULT_BOT_URL: &str = "http://127.0.0.1:8787";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(4);
const DEFAULT_LIMIT: u32 = 50;

/// Sender the daemon writes on rows it authored. Mirrors `BOT_SENDER` in the
/// bot's `src/db.ts`. Both halves of the conversation come back from the
/// history route, and this is the only thing that tells them apart.
const BOT_SENDER: &str = "bot:self";

/// Group folder the daemon registers Telegram chats under, used to pick the
/// conversation when the caller does not name one.
const TELEGRAM_FOLDER: &str = "telegram";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BotMessage {
    pub id: String,
    pub sender_name: String,
    pub content: String,
    pub timestamp: String,
    /// True when the bot wrote this line, false when Alex did.
    pub from_bot: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BotConversation {
    /// Chat this page came from, so the caller can page without re-resolving it.
    pub chat: Option<String>,
    pub chat_name: Option<String>,
    /// Oldest first, ready to render straight down.
    pub messages: Vec<BotMessage>,
    pub has_more: bool,
    pub next_before: Option<String>,
}

fn base_url() -> String {
    std::env::var("MAESTRO_BOT_URL")
        .unwrap_or_else(|_| DEFAULT_BOT_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

/// Read the bot dashboard token from disk.
///
/// Deliberately a file and not an environment variable: a token exported in a
/// shell profile is invisible to a packaged app launched from Finder, which is
/// a failure that looks like an unexplained 401. The daemon creates this file
/// itself on first run.
fn token() -> Result<String, String> {
    let base = BaseDirs::new().ok_or_else(|| "No home directory".to_string())?;
    let path = base
        .home_dir()
        .join(".config")
        .join("nanoclaw")
        .join("dashboard-token");
    let raw = std::fs::read_to_string(&path).map_err(|error| {
        format!("Cannot read the bot dashboard token ({}): {error}", path.display())
    })?;
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        return Err("The bot dashboard token file is empty".to_string());
    }
    Ok(trimmed)
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to build bot client: {error}"))
}

fn endpoint(segments: &[&str]) -> Result<Url, String> {
    let mut url =
        Url::parse(&base_url()).map_err(|error| format!("Invalid bot URL: {error}"))?;
    {
        let mut path = url
            .path_segments_mut()
            .map_err(|_| "Invalid bot URL: cannot accept path segments".to_string())?;
        path.pop_if_empty();
        path.extend(segments.iter().copied());
    }
    Ok(url)
}

fn text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|s| !s.is_empty())
}

/// Turn one history row into a renderable line. Rows without an id or a
/// timestamp cannot be keyed or ordered, so they are dropped rather than shown
/// in the wrong place.
pub(crate) fn normalize_message(row: &Value) -> Option<BotMessage> {
    let id = text(row, "id")?;
    let timestamp = text(row, "timestamp")?;
    let sender = text(row, "sender").unwrap_or_default();
    Some(BotMessage {
        id,
        sender_name: text(row, "sender_name").unwrap_or_else(|| "Unknown".to_string()),
        content: row
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        timestamp,
        from_bot: sender == BOT_SENDER,
    })
}

/// Pick the conversation to show when the caller has not named one.
///
/// Prefers a Telegram group, because that is the conversation this panel
/// exists for, and falls back to the first group so a differently configured
/// setup still shows something rather than an empty panel.
pub(crate) fn pick_chat(groups: &[Value]) -> Option<(String, Option<String>)> {
    let telegram = groups
        .iter()
        .find(|g| text(g, "folder").as_deref() == Some(TELEGRAM_FOLDER));
    let chosen = telegram.or_else(|| groups.first())?;
    Some((text(chosen, "jid")?, text(chosen, "name")))
}

async fn fetch_json(url: Url, token: &str) -> Result<Value, String> {
    let response = client()?
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|error| format!("Bot request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => "The bot refused the dashboard token. It may have been rotated; restart the bot.".to_string(),
            403 => "The bot refused the request as non-local.".to_string(),
            code => format!("The bot returned {code}"),
        });
    }
    response
        .json()
        .await
        .map_err(|error| format!("The bot returned malformed JSON: {error}"))
}

/// Resolve which chat to read, asking the daemon only when necessary.
async fn resolve_chat(token: &str) -> Result<(String, Option<String>), String> {
    let payload = fetch_json(endpoint(&["api", "data"])?, token).await?;
    let groups = payload
        .get("groups")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    pick_chat(&groups).ok_or_else(|| "The bot has no registered chats yet".to_string())
}

#[tauri::command]
pub async fn bot_conversation(
    chat: Option<String>,
    limit: Option<u32>,
    before: Option<String>,
) -> Result<BotConversation, String> {
    let token = token()?;

    let (chat_jid, chat_name) = match chat.filter(|c| !c.is_empty()) {
        Some(explicit) => (explicit, None),
        None => resolve_chat(&token).await?,
    };

    let mut url = endpoint(&["api", "history"])?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("chat", &chat_jid);
        query.append_pair("limit", &limit.unwrap_or(DEFAULT_LIMIT).to_string());
        if let Some(cursor) = before.as_deref().filter(|c| !c.is_empty()) {
            query.append_pair("before", cursor);
        }
    }

    let payload = fetch_json(url, &token).await?;
    let messages = payload
        .get("messages")
        .and_then(Value::as_array)
        .map(|rows| rows.iter().filter_map(normalize_message).collect())
        .unwrap_or_default();

    Ok(BotConversation {
        chat: Some(chat_jid),
        chat_name,
        messages,
        has_more: payload
            .get("hasMore")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        next_before: text(&payload, "nextBefore"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn tells_the_two_halves_of_the_conversation_apart() {
        let mine = normalize_message(&json!({
            "id": "tg-1", "sender": "12345", "sender_name": "Alex",
            "content": "what is blocked", "timestamp": "2026-09-21T09:00:01.000Z"
        }))
        .expect("row should normalize");
        let theirs = normalize_message(&json!({
            "id": "tg-2", "sender": "bot:self", "sender_name": "Vanguard",
            "content": "two things", "timestamp": "2026-09-21T09:00:02.000Z"
        }))
        .expect("row should normalize");

        assert!(!mine.from_bot);
        assert!(theirs.from_bot);
    }

    #[test]
    fn drops_a_row_that_cannot_be_ordered() {
        // No timestamp means it cannot be placed, and rendering it at the wrong
        // point in the conversation is worse than leaving it out.
        assert!(normalize_message(&json!({"id": "tg-1", "content": "hi"})).is_none());
        assert!(normalize_message(&json!({"timestamp": "2026-09-21T09:00:01.000Z"})).is_none());
    }

    #[test]
    fn keeps_an_empty_message_body() {
        // An empty send is still a turn in the conversation.
        let row = normalize_message(&json!({
            "id": "tg-3", "sender": "bot:self", "content": "",
            "timestamp": "2026-09-21T09:00:03.000Z"
        }))
        .expect("an empty body is still a message");
        assert_eq!(row.content, "");
        assert_eq!(row.sender_name, "Unknown");
    }

    #[test]
    fn prefers_the_telegram_chat_over_the_others() {
        let groups = vec![
            json!({"jid": "x@g.us", "name": "Some group", "folder": "main"}),
            json!({"jid": "tg:99", "name": "Telegram (Alex)", "folder": "telegram"}),
        ];
        let (jid, name) = pick_chat(&groups).expect("a telegram chat exists");
        assert_eq!(jid, "tg:99");
        assert_eq!(name.as_deref(), Some("Telegram (Alex)"));
    }

    #[test]
    fn falls_back_to_the_first_chat_rather_than_showing_nothing() {
        let groups = vec![json!({"jid": "x@g.us", "name": "Some group", "folder": "main"})];
        assert_eq!(pick_chat(&groups).expect("falls back").0, "x@g.us");
    }

    #[test]
    fn no_chats_at_all_is_none_not_a_panic() {
        assert!(pick_chat(&[]).is_none());
    }
}
