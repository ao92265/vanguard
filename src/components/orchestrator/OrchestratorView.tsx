import { Check, Play, RefreshCw, Send, ShieldCheck, ShieldOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  isProposalExpired,
  type Proposal,
  type ProposalStatus,
  proposalPreview,
  type ScopeEntry,
} from "@/lib/orchestrator";
import { ORCHESTRATOR_SESSION_NAME, useOrchestratorStore } from "@/stores/useOrchestratorStore";
import { type SessionConfig, useSessionStore } from "@/stores/useSessionStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface OrchestratorViewProps {
  onClose: () => void;
}

/**
 * The queue is a file drop, so it only changes as fast as the orchestrator
 * writes. Matches rohcna's panel cadence — fast enough that an approval feels
 * immediate, slow enough to be free.
 */
const POLL_INTERVAL_MS = 1500;

const STATUS_BADGES: Record<ProposalStatus, string> = {
  pending: "bg-maestro-blue/15 text-maestro-blue",
  approved: "bg-maestro-blue/15 text-maestro-blue",
  sent: "bg-maestro-green/15 text-maestro-green",
  rejected: "bg-maestro-muted/15 text-maestro-muted",
  expired: "bg-maestro-muted/15 text-maestro-muted",
  blocked: "bg-amber-500/15 text-amber-400",
  error: "bg-red-500/15 text-red-400",
};

const labelClass =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted";
const chipClass =
  "flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-3 py-[5px] font-mono text-[11.5px] font-medium transition-colors";

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** How a session reads in the scope list and on a proposal. */
export function sessionLabel(session: SessionConfig): string {
  const name = session.name?.trim();
  const where = basename(session.worktree_path ?? session.project_path);
  const base = name && name.length > 0 ? name : where;
  return session.branch ? `${base} — ${session.branch}` : base;
}

/**
 * One proposal awaiting (or past) a decision: what it wants to say on the
 * left, its own status next to the actions on the right.
 *
 * The status is the queue's own word for the row (pending, sent, blocked),
 * never a risk score: nothing upstream rates a proposal, and a made-up
 * severity is exactly the sort of thing an operator would trust.
 */
function ProposalRow({
  proposal,
  targetLabel,
  onDecide,
}: {
  proposal: Proposal;
  targetLabel: string;
  onDecide: (approve: boolean) => void;
}) {
  const decidable = proposal.status === "pending";
  const preview = proposalPreview(proposal);
  return (
    <li
      aria-label={preview}
      className="flex flex-wrap items-center gap-3 rounded-[10px] border border-maestro-border bg-maestro-card px-4 py-[14px]"
    >
      <div className="min-w-0 flex-1 basis-64">
        <div className="mb-1 whitespace-pre-wrap text-[13.5px] font-medium text-maestro-text [overflow-wrap:anywhere]">
          {preview}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-maestro-muted">
          <span className="[overflow-wrap:anywhere]">→ {targetLabel}</span>
          {proposal.note && (
            <>
              <span aria-hidden="true">·</span>
              <span className="[overflow-wrap:anywhere]">{proposal.note}</span>
            </>
          )}
        </div>
        {proposal.error && (
          <div className="mt-1 font-mono text-[11.5px] text-red-400">{proposal.error}</div>
        )}
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-[3px] font-mono text-[11px] font-medium ${STATUS_BADGES[proposal.status]}`}
      >
        {proposal.status}
      </span>
      {decidable && (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onDecide(true)}
            className="rounded-lg bg-maestro-accent px-[15px] py-[7px] text-[12.5px] font-medium text-maestro-on-accent transition-opacity hover:opacity-90"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onDecide(false)}
            className="rounded-lg border border-maestro-border px-[15px] py-[7px] text-[12.5px] font-medium text-maestro-muted transition-colors hover:text-maestro-text"
          >
            Reject
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Orchestrator — a goal box over one headless session, scoped to the sessions
 * you tick, with everything it wants to say to them held in an approval queue.
 *
 * The orchestrator itself is an ordinary Maestro session (launched down the
 * normal `PendingLaunch` path), so it shows up as a terminal you can watch and
 * close like any other. It has no route into the other sessions except this
 * queue.
 */
export function OrchestratorView({ onClose }: OrchestratorViewProps) {
  const { proposals, safeMode, scope, sessionId, error, refresh, setSafeMode, setScope, decide } =
    useOrchestratorStore();
  const setSessionId = useOrchestratorStore((s) => s.setSessionId);
  const launch = useOrchestratorStore((s) => s.launch);
  const sendGoal = useOrchestratorStore((s) => s.sendGoal);
  const clear = useOrchestratorStore((s) => s.clear);

  const sessions = useSessionStore((s) => s.sessions);
  const activeTab = useWorkspaceStore((s) => s.tabs.find((t) => t.active) ?? null);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // The orchestrator is found by the name it launches under, so closing and
  // reopening this panel — or restarting the app — re-attaches to the running
  // one instead of starting a second.
  const orchestratorSession = useMemo(
    () => sessions.find((s) => s.name === ORCHESTRATOR_SESSION_NAME) ?? null,
    [sessions],
  );
  useEffect(() => {
    setSessionId(orchestratorSession?.id ?? null);
  }, [orchestratorSession, setSessionId]);

  /** Everything the orchestrator could be pointed at — never itself. */
  const drivable = useMemo(
    () => sessions.filter((s) => s.id !== orchestratorSession?.id),
    [sessions, orchestratorSession],
  );

  const labelFor = useCallback(
    (targetSessionId: number): string => {
      const session = sessions.find((s) => s.id === targetSessionId);
      return session ? sessionLabel(session) : `session ${targetSessionId}`;
    },
    [sessions],
  );

  const toggleScope = useCallback(
    (session: SessionConfig) => {
      const next: ScopeEntry[] = scope.some((e) => e.sessionId === session.id)
        ? scope.filter((e) => e.sessionId !== session.id)
        : [
            ...scope,
            {
              sessionId: session.id,
              label: sessionLabel(session),
              cwd: session.working_directory ?? session.worktree_path ?? session.project_path,
            },
          ];
      void setScope(next);
    },
    [scope, setScope],
  );

  const handleSend = useCallback(() => {
    if (!goal.trim() || busy) return;
    setBusy(true);
    const done = () => {
      setGoal("");
      setBusy(false);
    };
    if (sessionId === null) {
      // First goal starts the session, exactly as rohcna's panel does: the
      // brief and the goal go out together as the launch prompt.
      if (!activeTab) {
        setBusy(false);
        return;
      }
      void launch(activeTab.id, activeTab.projectPath, goal).then(done);
    } else {
      void sendGoal(goal).then(done);
    }
  }, [goal, busy, sessionId, activeTab, launch, sendGoal]);

  const now = Date.now();
  // Expiry is lazy backend-side, so a row can be past its TTL between polls;
  // showing it as still-decidable would offer a button that cannot fire.
  const pending = proposals.filter((p) => p.status === "pending" && !isProposalExpired(p, now));
  const history = proposals
    .filter((p) => !pending.includes(p))
    .slice(-30)
    .reverse();
  const blockedFromLaunch = sessionId === null && !activeTab;

  return (
    /* z-50: same overlay shell as Home/Factory/Landscape (eagle zoom is z-40). */
    <div className="absolute inset-0 z-50 flex flex-col bg-maestro-bg">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-[34px] pb-4 pt-[30px]">
        <h1 className="font-mono text-[13px] font-semibold uppercase tracking-[0.09em] text-maestro-muted">
          Orchestrator
        </h1>
        <span className="font-mono text-[12px] text-maestro-muted">
          {sessionId === null ? "not running" : "running"}
          {safeMode ? " · safe mode: nothing runs without your yes" : " · free run"}
          {pending.length > 0 && ` · ${pending.length} waiting on you`}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void setSafeMode(!safeMode)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11.5px] font-medium transition-colors ${
            safeMode
              ? "bg-maestro-green/15 text-maestro-green hover:bg-maestro-green/25"
              : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
          }`}
          title={
            safeMode
              ? "Safe mode: every proposal waits for your approval"
              : "Free run: proposals are pre-approved and delivered as they arrive"
          }
        >
          {safeMode ? <ShieldCheck size={12} /> : <ShieldOff size={12} />}
          {safeMode ? "Safe mode" : "Free run"}
        </button>
        <button
          type="button"
          onClick={() => void clear()}
          className="rounded-lg px-2.5 py-1.5 text-[12px] text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          title="Fresh start — drop the queue and the scope. Safe mode stays as it is."
        >
          Fresh start
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded p-1.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          aria-label="Refresh queue"
        >
          <RefreshCw size={13} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          aria-label="Close orchestrator"
        >
          <X size={14} />
        </button>
      </div>

      {!safeMode && (
        <div className="shrink-0 border-y border-amber-500/30 bg-amber-500/10 px-[34px] py-2 text-[11.5px] text-amber-400">
          Free run: proposals are delivered to your sessions without asking. Turn safe mode back on
          to review them first.
        </div>
      )}
      {error && (
        <div className="shrink-0 border-y border-red-500/30 bg-red-500/10 px-[34px] py-2 text-[11.5px] text-red-400">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[34px] pb-[30px] pt-4">
        <section
          aria-label="Goal and scope"
          className="shrink-0 rounded-[11px] border border-maestro-border bg-maestro-card px-5 py-[18px]"
        >
          <div className={`${labelClass} mb-[9px]`}>Goal</div>
          <textarea
            aria-label="Goal"
            className="w-full resize-y rounded-lg border border-maestro-border bg-maestro-surface px-3.5 py-3 text-[18px] font-medium leading-[1.45] text-maestro-text placeholder:text-maestro-muted focus:border-maestro-accent focus:outline-none"
            rows={2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              scope.length > 0
                ? `What should the ${scope.length} scoped session(s) get done?`
                : "What should the fleet get done?"
            }
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={!goal.trim() || busy || blockedFromLaunch}
              className="flex items-center gap-1.5 rounded-lg bg-maestro-accent px-[15px] py-[7px] text-[12.5px] font-medium text-maestro-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {sessionId === null ? <Play size={12} /> : <Send size={12} />}
              {sessionId === null ? "Start orchestrator" : "Send goal"}
            </button>
            {blockedFromLaunch && (
              <span className="text-[11.5px] text-maestro-muted">
                Open a project tab first: the orchestrator launches into it like any other session.
              </span>
            )}
          </div>

          <div className="mt-[14px] flex flex-wrap items-center gap-2">
            {drivable.length === 0 ? (
              <span className="font-mono text-[11.5px] text-maestro-muted">
                No other sessions running.
              </span>
            ) : (
              drivable.map((session) => {
                const ticked = scope.some((e) => e.sessionId === session.id);
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => toggleScope(session)}
                    aria-pressed={ticked}
                    className={`${chipClass} ${
                      ticked
                        ? "bg-maestro-accent/15 text-maestro-accent hover:bg-maestro-accent/25"
                        : "border border-dashed border-maestro-border text-maestro-muted hover:text-maestro-text"
                    }`}
                    title={
                      ticked
                        ? "In scope for this goal. Click to remove it."
                        : "Add this session to the scope."
                    }
                  >
                    {ticked ? (
                      <Check size={11} className="shrink-0" />
                    ) : (
                      <span aria-hidden="true">+</span>
                    )}
                    <span className="truncate">{sessionLabel(session)}</span>
                  </button>
                );
              })
            )}
          </div>
          <p className="mt-2.5 text-[11.5px] text-maestro-muted">
            {scope.length > 0
              ? "The goal may only touch the ticked sessions. A proposal for anything else is blocked, not queued."
              : "No scope set: every session is fair game. Tick the ones this goal may touch."}
          </p>
        </section>

        <section aria-label="Proposals" className="min-h-0">
          <div className={`${labelClass} mb-2.5`}>
            Proposals
            {pending.length > 0 && ` · ${pending.length} waiting`}
          </div>
          {pending.length === 0 && history.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-maestro-border px-4 py-3 text-[12px] text-maestro-muted">
              {sessionId === null
                ? "Give the orchestrator a goal to begin. Everything it wants to say to your sessions lands here first."
                : "Nothing proposed yet. It reads your sessions before it suggests anything."}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-[9px]">
                {pending.map((proposal) => (
                  <ProposalRow
                    key={proposal.id}
                    proposal={proposal}
                    targetLabel={labelFor(proposal.targetSessionId)}
                    onDecide={(approve) => void decide(proposal.id, approve)}
                  />
                ))}
              </ul>
              {history.length > 0 && (
                <>
                  <div className={`${labelClass} mb-2.5 mt-4`}>Recent</div>
                  <ul className="flex flex-col gap-[9px]">
                    {history.map((proposal) => (
                      <ProposalRow
                        key={proposal.id}
                        proposal={proposal}
                        targetLabel={labelFor(proposal.targetSessionId)}
                        onDecide={() => {}}
                      />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
