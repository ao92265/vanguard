import { invoke } from "@tauri-apps/api/core";

/**
 * Thin wrapper around the Vanguard bot relay command
 * (`src-tauri/src/commands/bot.rs`). The webview cannot reach the bot daemon
 * directly because of the CSP, so every call goes through Tauri.
 */

/** One turn of the conversation. Mirrors Rust `BotMessage`. */
export interface BotMessage {
  id: string;
  senderName: string;
  content: string;
  /** ISO timestamp, used for ordering and for the day separators. */
  timestamp: string;
  /** True when the bot wrote this line, false when Alex did. */
  fromBot: boolean;
}

/** One page of a conversation. Mirrors Rust `BotConversation`. */
export interface BotConversation {
  chat: string | null;
  chatName: string | null;
  /** Oldest first, ready to render straight down. */
  messages: BotMessage[];
  hasMore: boolean;
  nextBefore: string | null;
}

/**
 * Read one page of the bot conversation.
 *
 * Omit `chat` to let the daemon's own registered group list decide, which is
 * what the panel does: hardcoding a chat id would put a personal identifier in
 * a public repository.
 */
export function fetchBotConversation(options?: {
  chat?: string;
  limit?: number;
  before?: string;
}): Promise<BotConversation> {
  return invoke<BotConversation>("bot_conversation", {
    chat: options?.chat ?? null,
    limit: options?.limit ?? null,
    before: options?.before ?? null,
  });
}
