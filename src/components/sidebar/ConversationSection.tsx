import { MessageSquare, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useBotConversation } from "@/hooks/useBotConversation";
import type { BotMessage } from "@/lib/bot";
import { SectionHeader } from "./sectionChrome";

/** "09:14" in local time. Falls back to the raw value if it will not parse. */
function clockTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "Today", "Yesterday", or a date. Used for the separators between days. */
function dayLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(at)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return at.toLocaleDateString([], { day: "numeric", month: "short" });
}

/**
 * The bot prefixes its agent replies with its own name ("Vanguard: ..."), which
 * is how the daemon's read loop used to tell them apart. On screen the sender is
 * already obvious from which side the line sits on, so the prefix is noise.
 */
function withoutNamePrefix(message: BotMessage): string {
  if (!message.fromBot) return message.content;
  const colon = message.content.indexOf(": ");
  if (colon <= 0 || colon > 24) return message.content;
  return message.content.slice(colon + 2);
}

function Turn({ message }: { message: BotMessage }) {
  const body = withoutNamePrefix(message);
  return (
    <div className={`flex flex-col ${message.fromBot ? "items-start" : "items-end"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap break-words ${
          message.fromBot
            ? "bg-maestro-card/70 text-maestro-text"
            : "bg-maestro-accent/15 text-maestro-text"
        }`}
      >
        {body || <span className="text-maestro-muted italic">(empty message)</span>}
      </div>
      <span className="mt-0.5 px-1 text-[10px] text-maestro-muted/70">
        {clockTime(message.timestamp)}
      </span>
    </div>
  );
}

/**
 * The recent Telegram conversation with the Vanguard bot.
 *
 * Both halves are real only from the day the daemon started recording its own
 * replies. Anything older is inbound-only, because the bot's sends were never
 * written down and Telegram's polling API does not hand them back.
 */
export function ConversationSection() {
  const { messages, chatName, offline, reason, refresh } = useBotConversation(true);
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastId = messages?.[messages.length - 1]?.id;

  // Stick to the newest turn as it arrives, the way a chat window does.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, []);
  useEffect(() => {
    if (lastId) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastId]);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        icon={MessageSquare}
        label={chatName ?? "Conversation"}
        badge={
          offline ? (
            <span
              title={reason ?? "The bot is not answering"}
              className="flex items-center gap-1 rounded bg-maestro-card px-1.5 py-0.5 text-[10px] text-maestro-muted"
            >
              <WifiOff size={10} aria-hidden="true" />
              Offline
            </span>
          ) : null
        }
        right={
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Refresh conversation"
            title="Refresh conversation"
            className="rounded p-0.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          >
            <RefreshCw size={11} aria-hidden="true" />
          </button>
        }
      />

      {messages === null ? (
        <p className="px-1 text-xs text-maestro-muted">
          {offline ? "Cannot reach the bot." : "Loading the conversation…"}
        </p>
      ) : messages.length === 0 ? (
        <p className="px-1 text-xs text-maestro-muted">
          Nothing here yet. Message the bot on Telegram and it will show up.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((message, index) => {
            const previous = index > 0 ? messages[index - 1] : null;
            const startsNewDay =
              !previous || dayLabel(previous.timestamp) !== dayLabel(message.timestamp);
            return (
              <div key={message.id} className="flex flex-col gap-2">
                {startsNewDay && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-px flex-1 bg-maestro-border/30" />
                    <span className="text-[10px] text-maestro-muted/80">
                      {dayLabel(message.timestamp)}
                    </span>
                    <div className="h-px flex-1 bg-maestro-border/30" />
                  </div>
                )}
                <Turn message={message} />
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
      )}
    </div>
  );
}
