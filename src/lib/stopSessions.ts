import { killSession } from "@/lib/terminal";

/**
 * Stops every given session and reports the ones that would not stop.
 *
 * Stop All used to send each close, log any failure to the devtools console
 * and then clear the rows regardless, so it reported a clean stop while an
 * agent carried on running inside a tmux session with nothing on screen
 * showing it. A stop that cannot be trusted is worse than no stop button.
 *
 * One session refusing must not strand the others, so every close is sent
 * before any failure is reported.
 *
 * @returns one message per session that did not stop, empty when all did.
 */
export async function stopSessions(sessionIds: number[]): Promise<string[]> {
  const results = await Promise.allSettled(sessionIds.map((id) => killSession(id)));
  return results
    .filter((result) => result.status === "rejected")
    .map((result) => {
      const reason = (result as PromiseRejectedResult).reason;
      return reason instanceof Error ? reason.message : String(reason);
    });
}
