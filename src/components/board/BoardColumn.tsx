import type { ReactNode } from "react";
import { badgeBaseClass } from "@/components/session/agentPresentation";

/**
 * One Board column: a muted uppercase header (the Band header pattern), the
 * live count, an optional per-source stale badge, an optional truthful note,
 * then the cards.
 *
 * An empty column states why it is empty instead of rendering nothing. A
 * column emptied by a failed poll and a column that is genuinely clear must
 * never look the same: that is the silent under-reporting the pivot bans.
 */
export function BoardColumn({
  title,
  count,
  emptyText,
  stale,
  note,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  /** Message from the source that feeds this column when its last fetch failed. */
  stale?: string | null;
  /** Header-right text, e.g. a count of what this column deliberately does not show. */
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col" aria-label={title}>
      <div className="mb-2 flex min-h-7 items-center gap-2">
        <h2 className="shrink-0 text-[13px] font-semibold text-maestro-text">{title}</h2>
        <span className="shrink-0 rounded bg-maestro-card px-1.5 py-0.5 font-mono text-[11px] text-maestro-muted">
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
        <div className="flex-1" />
        {note}
      </div>
      {count === 0 ? (
        <p className="py-3 text-xs leading-relaxed text-maestro-muted">{emptyText}</p>
      ) : (
        <div className="divide-y divide-maestro-border border-y border-maestro-border">
          {children}
        </div>
      )}
    </section>
  );
}
