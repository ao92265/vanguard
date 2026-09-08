import { Play, Search, UserRound } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { EcosystemStrip } from "@/components/shared/EcosystemStrip";
import { modLabel } from "@/lib/shortcuts";
import { useClaudeAccountStore } from "@/stores/useClaudeAccountStore";
import { SystemMetrics } from "./SystemMetrics";
import { TerminalNavigator } from "./TerminalNavigator";
import { UsageBar } from "./UsageBar";

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

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  return (
    <div className="workbench-footer no-select">
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
          className="relative z-10 flex items-center gap-2 rounded-lg bg-maestro-accent px-4 py-1.5 text-xs font-medium text-white shadow-md shadow-black/20 transition-colors hover:bg-maestro-accent/80"
        >
          <Play size={11} fill="currentColor" />
          {unlaunchedCount === 1 ? "Launch Session" : `Launch All (${unlaunchedCount})`}
        </button>
      )}

      <div className="workbench-footer-usage">
        <div className="workbench-footer-extra">
          <EcosystemStrip />
          <SystemMetrics />
        </div>
        <UsageBar />
      </div>
    </div>
  );
}
