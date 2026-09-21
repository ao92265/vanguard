import { useCallback, useEffect, useRef, useState } from "react";
import { type BotConversation, type BotMessage, fetchBotConversation } from "@/lib/bot";

const POLL_INTERVAL_MS = 5_000;

/**
 * Polls the bot conversation while the panel is open and the window is focused.
 *
 * The bot daemon is a separate launchd service that restarts whenever it is
 * rebuilt, so being unreachable is an ordinary state rather than an error. When
 * a poll fails the last good page stays on screen and `offline` goes true, which
 * is the difference between "the bot is quiet" and "we stopped looking".
 *
 * `messages` is null until the first successful fetch, so an empty conversation
 * and a conversation that has not loaded yet can be told apart.
 */
export function useBotConversation(enabled: boolean) {
  const [messages, setMessages] = useState<BotMessage[] | null>(null);
  const [chatName, setChatName] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const page: BotConversation = await fetchBotConversation();
      setMessages(page.messages);
      setChatName(page.chatName);
      setOffline(false);
      setReason(null);
    } catch (err) {
      // Keep whatever is already on screen. Blanking the panel on a restart
      // would throw away the only copy of the conversation the user can see.
      setOffline(true);
      setReason(String(err));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (!document.hasFocus()) return;
      void refresh();
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { messages, chatName, offline, reason, refresh };
}
