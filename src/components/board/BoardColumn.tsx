import type { ReactNode } from "react";
import { badgeBaseClass } from "@/components/session/agentPresentation";

/**
 * One Board lane: a coloured stage dot, a muted uppercase header, the live
 * count, an optional per-source stale badge, an optional truthful note, then
 * the cards on a raised well (design 1b's column geometry, the same shape the
 * Factory's run lanes use).
 *
 * An empty lane states why it is empty instead of rendering nothing. A lane
 * emptied by a failed poll and a lane that is genuinely clear must never look
 * the same: that is the silent under-reporting the pivot bans.
 */
export function BoardColumn({
  title,
  count,
  emptyText,
  dotClass,
  stale,
  note,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  /** Stage colour, as a Tailwind background class for the header dot. */
  dotClass: string;
  /** Message from the source that feeds this lane when its last fetch failed. */
  stale?: string | null;
  /** Header-right text, e.g. a count of what this lane deliberately does not show. */
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col" aria-label={title}>
      {/* Everything here used to refuse to shrink, so a long note ran out of
          the column and printed over the next column's title. The note gives
          way first, then the title truncates. */}
      <div className="flex min-h-[26px] items-center gap-2 overflow-hidden px-1 pb-[10px]">
        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${dotClass}`} />
        <h2 className="min-w-0 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-maestro-muted">
          {title}
        </h2>
        <span className="shrink-0 font-mono text-[11px] font-semibold text-maestro-muted">
          {count}
        </span>
        {stale && (
          <span
            className={`${badgeBaseClass} bg-maestro-yellow/15 text-maestro-yellow`}
            title={stale}
          >
            STALE
          </span>
        )}
        <div className="min-w-[8px] flex-1" />
        {note}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto rounded-[10px] bg-maestro-card p-[10px]">
        {count === 0 ? (
          <p className="px-1 py-2 text-[11.5px] leading-relaxed text-maestro-muted">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
