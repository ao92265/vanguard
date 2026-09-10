import { Play, Search, UserRound } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { EcosystemStrip } from "@/components/shared/EcosystemStrip";
import { modLabel } from "@/lib/shortcuts";
import { useClaudeAccountStore } from "@/stores/useClaudeAccountStore";
import { SystemMetrics } from "./SystemMetrics";
import { TerminalNavigator } from "./TerminalNavigator";
import { UsageBar } from "./UsageBar";

/** Footer content-box width at which the ancillary readouts have room. They
 *  are mounted only above it, never merely hidden: display:none left both of
 *  them fetching and polling on a timer with nothing on screen. */
const FOOTER_EXTRA_MIN_WIDTH = 1400;

interface BottomBarProps {
  onSearch?: () => void;
  actions?: ReactNode;
  /** Number of total slots (pre-launch + launched) */
  slotCount: number;
  /** Number of actually running sessions */
  launchedCount: number;
  onLaunchAll: () => void;
  /** Footer navigator: bring the given session in front of the user. */
  onNavigateToSession: (tabId: string, sessionId: number) => void;
}

export function BottomBar({
  onSearch,
  actions,
  slotCount,
  launchedCount,
  onLaunchAll,
  onNavigateToSession,
}: BottomBarProps) {
  const unlaunchedCount = slotCount - launchedCount;
  const account = useClaudeAccountStore((s) => s.account);
  const fetchAccount = useClaudeAccountStore((s) => s.fetch);
  const footerRef = useRef<HTMLDivElement>(null);
  const [showExtra, setShowExtra] = useState(false);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Measured rather than guessed, and it cannot feed back: the footer is a
  // wrapped flex row whose width comes from the column it sits in, never from
  // its own content, and the observer only ever writes a boolean.
  useEffect(() => {
    const node = footerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width ?? 0;
      setShowExtra(width >= FOOTER_EXTRA_MIN_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    /* Nothing in here may sit in a stacking context that does not clear the
       terminal layers: TerminalNavigator's drop-up rises out of the footer
       into the region the board (z-45) and the zoomed pane (z-40) cover, and
       its own z-index is clamped to whatever the footer's context is. A
       transform here was the first way that happened; the footer's container
       query is the second. `.workbench-footer` carries the explicit z-index
       that keeps clearing both. */
    <div ref={footerRef} className="workbench-footer no-select">
      <div className="workbench-footer-sessions">
        <TerminalNavigator onNavigate={onNavigateToSession} />
        {account?.email && (
          <div
            className="workbench-footer-account flex min-w-0 items-center gap-1.5 text-[11px] text-maestro-muted"
            title={`Claude Code account: ${account.email}`}
          >
            <UserRound size={12} className="shrink-0" />
            <span className="truncate">{account.email}</span>
          </div>
        )}
      </div>
      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          aria-label="Find project or terminal"
          className="workbench-quick-open"
        >
          <Search size={12} />
          <span>Jump to anything</span>
          <kbd>{modLabel()}P</kbd>
        </button>
      )}
      {actions}
      {/* Hide until launchable. With nothing to launch this used to render a
          permanently disabled "Launch Sessions", and that dead state was the
          only one ever wearing the label. The pre-launch empty state carries
          its own add-session affordance, so nothing is lost by hiding it. */}
      {unlaunchedCount > 0 && (
        <button
          type="button"
          onClick={onLaunchAll}
          className="relative z-10 flex items-center gap-2 rounded-lg bg-maestro-accent px-4 py-1.5 text-xs font-medium text-maestro-on-accent shadow-md shadow-black/20 transition-colors hover:bg-maestro-accent/80"
        >
          <Play size={11} fill="currentColor" />
          {unlaunchedCount === 1 ? "Launch Session" : `Launch All (${unlaunchedCount})`}
        </button>
      )}

      <div className="workbench-footer-usage">
        {showExtra && (
          <div className="workbench-footer-extra">
            <EcosystemStrip />
            <SystemMetrics />
          </div>
        )}
        <UsageBar />
      </div>
    </div>
  );
}
