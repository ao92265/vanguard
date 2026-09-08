import { RefreshCw, X } from "lucide-react";
import { useEffect } from "react";
import { ActivityTimeline } from "@/components/pulse/ActivityTimeline";
import { FlowScoreCard } from "@/components/pulse/FlowScoreCard";
import { MetricsPulse } from "@/components/pulse/MetricsPulse";
import { badgeBaseClass } from "@/components/session/agentPresentation";
import { PULSE_STALE_MS, usePulseStore } from "@/stores/usePulseStore";

interface PulseViewProps {
  onClose: () => void;
}

/** Poll while Pulse is on screen; nothing polls it while it is closed. */
const POLL_INTERVAL_MS = 60 * 1000;

/**
 * Pulse: today's timeline, the flow score, and the metrics both are read off.
 *
 * The overlay shell is the one every other full-screen view uses (see
 * `FactoryView`); the numbers come from `usePulseStore`, which never throws —
 * an unreadable repo or an unauthenticated `gh` shows as a stale badge here,
 * not an empty screen.
 *
 * Design 1b's Pulse is a mono uppercase title, four numbers at display size,
 * one wide timeline, then the detail. What it is NOT is the reference's
 * agent-hours, average wait and busiest host: nothing in this app measures
 * how long an agent worked, how long it waited on you, or which machine it
 * ran on, so those three tiles and both summary cards are absent rather than
 * filled with something that reads true and is not.
 */
export function PulseView({ onClose }: PulseViewProps) {
  const { metrics, flow, activity, fetchedAt, error, isRefreshing, refresh } = usePulseStore();

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const stale = fetchedAt > 0 && Date.now() - fetchedAt > PULSE_STALE_MS;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-maestro-bg">
      <div className="flex shrink-0 items-baseline gap-3 px-[34px] pb-[18px] pt-[30px]">
        <h1 className="font-mono text-[13px] font-semibold uppercase tracking-[0.09em] text-maestro-muted">
          Pulse
        </h1>
        {metrics && (
          <span className="font-mono text-[12px] text-maestro-muted">{metrics.date}</span>
        )}
        {stale && (
          <span className={`${badgeBaseClass} bg-maestro-muted/15 text-maestro-muted`}>STALE</span>
        )}
        {error && (
          <span className="truncate text-[11px] text-maestro-yellow" title={error}>
            {error}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          className="rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text disabled:opacity-40"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw size={13} className={isRefreshing ? "animate-spin" : undefined} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          aria-label="Close"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>

      {metrics === null || flow === null ? (
        <div className="flex flex-1 items-center justify-center text-xs text-maestro-muted">
          {isRefreshing ? "Reading today…" : "No reading yet."}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-[34px] pb-[30px]">
          <div className="mx-auto flex max-w-5xl flex-col gap-[26px]">
            <MetricsPulse metrics={metrics} />
            <FlowScoreCard flow={flow} />
            <section aria-label="Today">
              <h2 className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted">
                Today
              </h2>
              <ActivityTimeline events={activity} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
