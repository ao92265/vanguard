import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  ExternalLink,
  Factory,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ControlPanel } from "@/components/factory/control/ControlPanel";
import { relAgo } from "@/components/factory/control/primitives";
import { EngineBadge } from "@/components/factory/EngineBadge";
import { badgeBaseClass } from "@/components/session/agentPresentation";
import { type ActRun, type ActSpecInput, isTerminal, runNeedsYou, stageSummary } from "@/lib/act";
import { useActControlStore } from "@/stores/useActControlStore";
import { useActEngineStore } from "@/stores/useActEngineStore";
import { ACT_STALE_MS, useActStore } from "@/stores/useActStore";

interface FactoryViewProps {
  onClose: () => void;
}

/** Poll faster while the factory is on screen; Home's 5-min tick covers the rest. */
const POLL_INTERVAL_MS = 30 * 1000;

/** ACT portal statuses → badge colours (Maestro semantics: blue working, green done). */
const RUN_BADGES: Record<string, string> = {
  queued: "bg-maestro-muted/15 text-maestro-muted",
  planning: "bg-maestro-blue/15 text-maestro-blue",
  running: "bg-maestro-blue/15 text-maestro-blue",
  completed: "bg-maestro-green/15 text-maestro-green",
  failed: "bg-red-500/15 text-red-400",
  cancelled: "bg-maestro-muted/15 text-maestro-muted",
};

function runBadge(status: string): string {
  return RUN_BADGES[status] ?? "bg-maestro-muted/15 text-maestro-muted";
}

/** Meta-line tone for a run whose own status is the thing worth reading. */
const STATUS_TONES: Record<string, string> = {
  completed: "text-maestro-green",
  failed: "text-red-400",
  cancelled: "text-maestro-muted",
};

export type FactoryLaneId = "queued" | "planning" | "running" | "finished" | "other";

export interface FactoryLane {
  id: FactoryLaneId;
  name: string;
  /** Colour of the lane's dot, as a Tailwind background class. */
  dotClass: string;
  runs: ActRun[];
}

const LANE_DEFS: { id: FactoryLaneId; name: string; dotClass: string }[] = [
  { id: "queued", name: "Queued", dotClass: "bg-maestro-muted" },
  { id: "planning", name: "Planning", dotClass: "bg-maestro-blue" },
  { id: "running", name: "Running", dotClass: "bg-maestro-blue" },
  { id: "finished", name: "Finished", dotClass: "bg-maestro-accent" },
  { id: "other", name: "Other", dotClass: "bg-maestro-yellow" },
];

/**
 * Which lane a run belongs to, from its status alone.
 *
 * `other` exists so a status this frontend has never seen still lands
 * somewhere visible. A run that falls out of the board is a run nobody
 * chases, so the board takes an unfamiliar word over a lost row.
 */
export function laneForStatus(status: string): FactoryLaneId {
  if (status === "queued") return "queued";
  if (status === "planning") return "planning";
  if (status === "running") return "running";
  if (isTerminal(status)) return "finished";
  return "other";
}

/** Split runs into the board's lanes. Pure: same runs in, same lanes out. */
export function factoryLanes(runs: ActRun[]): FactoryLane[] {
  return LANE_DEFS.map((lane) => ({
    ...lane,
    runs: runs.filter((run) => laneForStatus(run.status) === lane.id),
  }));
}

const fieldClass =
  "w-full rounded-lg border border-maestro-border bg-maestro-card px-3.5 py-3 text-[13px] text-maestro-text placeholder:text-maestro-muted focus:border-maestro-accent focus:outline-none";
const labelClass =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted";

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * What ACT does with a spec once it has it. Behaviour, not a forecast: no
 * stage count, host or budget is claimed here, because none of that is known
 * until the run answers.
 */
const HANDOVER_STEPS = [
  "Plans the work from what you wrote here.",
  "Runs the stages it planned, one at a time.",
  "Stops at any gate that needs your decision.",
  "Links the result once it has produced one.",
];

/** The spec form: what ACT needs to replace a developer for one task. */
function SpecForm() {
  const { submit, isSubmitting, submitOutcome } = useActStore();
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [audience, setAudience] = useState("");
  const [mustHaves, setMustHaves] = useState("");
  const [nonGoals, setNonGoals] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");

  const canSubmit = title.trim() && problem.trim() && !isSubmitting;

  const handleSubmit = useCallback(() => {
    const spec: ActSpecInput = {
      title: title.trim(),
      problem: problem.trim(),
      audience: audience.trim(),
      mustHaves: linesToList(mustHaves),
      nonGoals: linesToList(nonGoals),
      successCriteria: linesToList(successCriteria),
    };
    void submit(spec).then((outcome) => {
      if (outcome?.accepted) {
        setTitle("");
        setProblem("");
        setAudience("");
        setMustHaves("");
        setNonGoals("");
        setSuccessCriteria("");
      }
    });
  }, [title, problem, audience, mustHaves, nonGoals, successCriteria, submit]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] px-[34px] py-[26px] lg:overflow-y-auto">
        <label className="flex flex-col gap-[7px]">
          <span className={labelClass}>Title</span>
          <input
            className={fieldClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What to build"
          />
        </label>
        <label className="flex flex-col gap-[7px]">
          <span className={labelClass}>Problem</span>
          <textarea
            className={`${fieldClass} min-h-[76px] resize-y leading-[1.5]`}
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="What hurts today, and for whom"
          />
        </label>
        <label className="flex flex-col gap-[7px]">
          <span className={labelClass}>Audience</span>
          <input
            className={fieldClass}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Who uses the result"
          />
        </label>
        <div className="flex flex-wrap gap-[18px]">
          <label className="flex min-w-[220px] flex-1 flex-col gap-[7px]">
            <span className={labelClass}>Must haves</span>
            <textarea
              className={`${fieldClass} min-h-[70px] resize-y text-[12.5px] leading-[1.6]`}
              value={mustHaves}
              onChange={(e) => setMustHaves(e.target.value)}
              placeholder="one per line"
            />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-[7px]">
            <span className={labelClass}>Non-goals</span>
            <textarea
              className={`${fieldClass} min-h-[70px] resize-y text-[12.5px] leading-[1.6]`}
              value={nonGoals}
              onChange={(e) => setNonGoals(e.target.value)}
              placeholder="one per line"
            />
          </label>
        </div>
        <label className="flex flex-col gap-[7px]">
          <span className={labelClass}>Success criteria</span>
          <textarea
            className={`${fieldClass} min-h-[70px] resize-y text-[12.5px] leading-[1.6]`}
            value={successCriteria}
            onChange={(e) => setSuccessCriteria(e.target.value)}
            placeholder="one per line"
          />
        </label>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-4 border-t border-maestro-border bg-maestro-surface px-[30px] py-[26px] lg:w-[380px] lg:border-l lg:border-t-0 lg:overflow-y-auto">
        <span className={labelClass}>What ACT will do</span>
        <div className="flex flex-col gap-2.5">
          {HANDOVER_STEPS.map((step, index) => (
            <div key={step} className="flex items-baseline gap-2.5">
              <span className="font-mono text-[11px] font-semibold text-maestro-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 text-[12.5px] leading-[1.5] text-maestro-text">{step}</span>
            </div>
          ))}
        </div>
        {submitOutcome && (
          <p
            className={`rounded-lg border px-3.5 py-3 font-mono text-[12px] leading-[1.55] ${
              submitOutcome.accepted
                ? "border-maestro-green/40 text-maestro-green"
                : "border-maestro-yellow/40 text-maestro-yellow"
            }`}
          >
            {submitOutcome.accepted
              ? `Run queued (${submitOutcome.complexity ?? "complexity pending"}${
                  submitOutcome.stages?.length ? `, stages: ${submitOutcome.stages.join(", ")}` : ""
                }).`
              : submitOutcome.httpStatus === 429
                ? `ACT is at its in-flight limit (${submitOutcome.currentInFlight ?? "?"}/${submitOutcome.limit ?? "?"}). Try again when a run finishes.`
                : submitOutcome.httpStatus === 402
                  ? `ACT's token budget is exhausted (${submitOutcome.usedTokens ?? "?"} of ${submitOutcome.capTokens ?? "?"} used, ${submitOutcome.remainingTokens ?? 0} left).`
                  : (submitOutcome.error ?? "ACT rejected the spec.")}
          </p>
        )}
        <div className="flex-1" />
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="rounded-lg bg-maestro-accent py-[11px] text-center text-[13px] font-medium text-maestro-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isSubmitting ? "Handing over…" : "Start the run"}
        </button>
      </div>
    </div>
  );
}

/** Progress pips: one per stage, in the stage order ACT reports. */
function StagePips({ run }: { run: ActRun }) {
  if (run.stages.length === 0) return null;
  return (
    <span className="flex items-center gap-[5px]">
      {run.stages.map((stage) => (
        <span
          key={stage.name}
          title={`${stage.name}: ${stage.status}`}
          className={`h-1 w-4 rounded-sm ${
            stage.status === "completed"
              ? "bg-maestro-green"
              : stage.status === "running"
                ? "bg-maestro-blue"
                : "bg-maestro-border"
          }`}
        />
      ))}
    </span>
  );
}

/** One run on the board. The lane says where it is; the card says what it is. */
function RunCard({ run, gated, onOpen }: { run: ActRun; gated: boolean; onOpen: () => void }) {
  const meta = run.stage ?? run.status;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full flex-col gap-[7px] rounded-[9px] border bg-maestro-surface px-[13px] py-3 text-left transition-colors hover:border-maestro-muted/50 ${
        gated ? "border-maestro-accent/55" : "border-maestro-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-[7px]">
        {gated && (
          <span className="shrink-0 rounded bg-maestro-accent px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.05em] text-maestro-on-accent">
            NEEDS YOU
          </span>
        )}
        <span className="font-mono text-[10.5px] text-maestro-muted">{relAgo(run.updatedAt)}</span>
        {run.repoUrl && <ExternalLink size={10} className="shrink-0 text-maestro-muted" />}
      </div>
      <p className="text-[13px] font-medium leading-[1.35] text-maestro-text [overflow-wrap:anywhere]">
        {run.title}
      </p>
      <div className="flex items-center gap-[5px]">
        <StagePips run={run} />
        <div className="flex-1" />
        <span
          className={`truncate font-mono text-[10.5px] ${STATUS_TONES[run.status] ?? "text-maestro-muted"}`}
        >
          {meta}
        </span>
      </div>
    </button>
  );
}

/** One run, opened: stages, the gate when there is one, the PR when done. */
function RunDetail({ onBack }: { onBack: () => void }) {
  const { detail, detailGates, detailError, cancelRun, unblockTask, resolveGate } = useActStore();
  if (!detail) return null;
  const gated = runNeedsYou(detail);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-[30px] py-[26px]">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          aria-label="Back to runs"
        >
          <ArrowLeft size={14} />
        </button>
        <span className={`${badgeBaseClass} ${runBadge(detail.status)}`}>
          {detail.status.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 text-[13.5px] font-medium text-maestro-text [overflow-wrap:anywhere]">
          {detail.title}
        </span>
        {!isTerminal(detail.status) && (
          <button
            type="button"
            onClick={() => void cancelRun(detail.id)}
            className="rounded border border-maestro-border px-1.5 py-0.5 text-[11px] text-maestro-muted transition-colors hover:border-red-500/50 hover:text-red-400"
          >
            Cancel run
          </button>
        )}
      </div>

      {detailError && <p className="text-[11px] text-maestro-yellow">{detailError}</p>}

      <p className="font-mono text-[11.5px] text-maestro-muted">{stageSummary(detail)}</p>

      <div className="flex flex-wrap gap-1.5">
        {detail.stages.map((s) => (
          <span
            key={s.name}
            className={`${badgeBaseClass} ${
              s.status === "completed"
                ? "bg-maestro-green/15 text-maestro-green"
                : s.status === "running"
                  ? "bg-maestro-blue/15 text-maestro-blue animate-pulse"
                  : "bg-maestro-muted/15 text-maestro-muted"
            }`}
          >
            {s.name}
          </span>
        ))}
      </div>

      {gated && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-maestro-accent/40 p-3">
          <span className="text-[12px] font-semibold text-maestro-accent">
            Stopped on low confidence: the run is waiting on you.
          </span>
          <div className="flex flex-wrap gap-2">
            {/* Low-confidence blocks live on the TASK, not in the gates
                subsystem — clearing one goes through the tasks route
                (review b43c16d, HIGH #1). */}
            <button
              type="button"
              onClick={() => detail.task?.id && void unblockTask(detail.task.id, true)}
              className="rounded border border-maestro-green/50 px-2 py-1 text-[11px] text-maestro-green transition-colors hover:bg-maestro-green/10"
            >
              Approve and continue
            </button>
            <button
              type="button"
              onClick={() => detail.task?.id && void unblockTask(detail.task.id, false)}
              className="rounded border border-red-500/50 px-2 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/10"
              title="Archives the task; the run will not continue"
            >
              Reject and archive
            </button>
          </div>
        </div>
      )}

      {detailGates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-maestro-yellow/40 p-3">
          <span className="text-[12px] font-semibold text-maestro-yellow">
            Pipeline gate{detailGates.length === 1 ? "" : "s"} waiting for a decision.
          </span>
          {detailGates.map((gate) => (
            <div key={gate.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-[11.5px] text-maestro-text [overflow-wrap:anywhere]">
                {gate.title}
              </span>
              {gate.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void resolveGate(gate.id, option)}
                  className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                    option === "approve"
                      ? "border-maestro-green/50 text-maestro-green hover:bg-maestro-green/10"
                      : "border-maestro-border text-maestro-muted hover:text-maestro-text"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {detail.repoUrl && (
        <button
          type="button"
          onClick={() =>
            detail.repoUrl &&
            void openUrl(detail.repoUrl).catch((err) => console.error("Failed to open:", err))
          }
          className="flex w-fit items-center gap-1.5 rounded border border-maestro-border px-2 py-1 text-[11px] text-maestro-text transition-colors hover:border-maestro-green/50"
        >
          <ExternalLink size={11} /> Open the result
        </button>
      )}

      {detail.error && (
        <p className="rounded border border-red-500/30 px-2 py-1.5 text-[11px] text-red-400">
          {detail.error}
        </p>
      )}
    </div>
  );
}

type FactoryTab = "runs" | "control";

/**
 * Factory, the ACT lane. Two tabs over one engine: Runs shows every run on a
 * board of stage lanes and hands over new specs, Control shows and sets what
 * the engine is allowed to do on its own. ACT unreachable renders as an
 * offline chip and yesterday's board, never an error wall.
 */
export function FactoryView({ onClose }: FactoryViewProps) {
  const [tab, setTab] = useState<FactoryTab>("runs");
  const [specOpen, setSpecOpen] = useState(false);
  const newRunRef = useRef<HTMLButtonElement>(null);
  const specRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (specOpen && tab === "runs") specRef.current?.querySelector("input")?.focus();
  }, [specOpen, tab]);
  const { runs, gatedRuns, fetchedAt, error, isPolling, detail, refresh, openDetail, closeDetail } =
    useActStore();

  const refreshEngine = useActEngineStore((state) => state.refresh);
  const refreshControl = useActControlStore((state) => state.refreshAll);
  /* The two lanes poll separately, so the header control has to follow
     whichever one is on screen rather than the runs poller alone. */
  const isControlPolling = useActControlStore((state) => state.isPolling);
  const tabIsPolling = tab === "control" ? isControlPolling : isPolling;
  const engineState = useActEngineStore((state) => state.status?.state ?? null);

  useEffect(() => {
    void refresh();
    void refreshEngine();
    const timer = setInterval(() => {
      void refresh();
      void refreshEngine();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh, refreshEngine]);

  const closeSpec = useCallback(() => {
    setSpecOpen(false);
    newRunRef.current?.focus();
  }, []);

  const gatedIds = new Set(gatedRuns.map((r) => r.id));
  const offline = fetchedAt === 0;
  /* fetchedAt changes on every successful poll, so this recomputes at least
     once per interval; a stricter clock would need a render tick for no
     user-visible gain (review b43c16d, LOW). */
  const stale = !offline && (error !== null || Date.now() - fetchedAt > ACT_STALE_MS);
  /* Lanes are derived, never stored: a run moves because its status moved. */
  const lanes = factoryLanes(runs).filter((lane) => lane.id !== "other" || lane.runs.length > 0);
  const specVisible = tab === "runs" && specOpen;

  return (
    /* z-50: same overlay shell as Home/Landscape (eagle zoom is z-40). */
    <div className="absolute inset-0 z-50 flex flex-col bg-maestro-bg">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-[30px] pb-[18px] pt-[26px]">
        <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.09em] text-maestro-muted">
          Factory
        </span>
        {gatedRuns.length > 0 && (
          <span className="font-mono text-[12px] text-maestro-accent">
            {gatedRuns.length} waiting on you
          </span>
        )}
        <div className="flex-1" />
        <EngineBadge runsFetchedAt={fetchedAt} stale={stale} />
        {tab === "runs" && (
          <span className="font-mono text-[11.5px] text-maestro-muted">
            {runs.length} run{runs.length === 1 ? "" : "s"}
          </span>
        )}
        <div className="flex overflow-hidden rounded-md border border-maestro-border">
          {(
            [
              ["runs", "Runs", Factory],
              ["control", "Control", SlidersHorizontal],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                tab === id
                  ? "bg-maestro-accent/20 text-maestro-accent"
                  : "text-maestro-muted hover:bg-maestro-card hover:text-maestro-text"
              }`}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            void (tab === "control" ? refreshControl() : refresh());
          }}
          disabled={tabIsPolling}
          className="rounded p-1.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text disabled:opacity-50"
          aria-label={tab === "control" ? "Refresh control panel" : "Refresh runs"}
        >
          <RefreshCw size={13} className={tabIsPolling ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("runs");
            setSpecOpen(true);
          }}
          aria-expanded={specVisible}
          ref={newRunRef}
          className="flex items-center gap-1.5 rounded-[7px] bg-maestro-accent px-3.5 py-1.5 text-[12px] font-medium text-maestro-on-accent transition-opacity hover:opacity-90"
        >
          <Plus size={13} />
          New spec
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          aria-label="Close factory"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {tab === "control" && <ControlPanel />}
        {tab === "runs" &&
          (detail ? (
            <RunDetail onBack={closeDetail} />
          ) : runs.length === 0 ? (
            <div className="min-w-0 flex-1 px-[30px] pb-[26px]">
              <p className="rounded-[10px] border border-dashed border-maestro-border px-4 py-3 text-[12px] text-maestro-muted">
                {engineState === "starting"
                  ? "ACT is starting. The board fills itself as soon as it answers."
                  : offline
                    ? "ACT is not running. Press Start ACT above and the factory picks it up on its own."
                    : "No runs yet. Choose New spec to hand one over."}
              </p>
            </div>
          ) : (
            <div
              className="grid min-h-0 min-w-0 flex-1 gap-[14px] overflow-x-auto px-[30px] pb-[26px]"
              style={{
                gridTemplateColumns: `repeat(${lanes.length}, minmax(190px, 1fr))`,
              }}
            >
              {lanes.map((lane) => (
                <section key={lane.id} aria-label={lane.name} className="flex min-h-0 flex-col">
                  <div className="flex items-center gap-2 px-1 pb-[10px]">
                    <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${lane.dotClass}`} />
                    <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-maestro-muted">
                      {lane.name}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-maestro-muted">
                      {lane.runs.length}
                    </span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto rounded-[10px] bg-maestro-card p-[10px]">
                    {lane.runs.map((run) => (
                      <RunCard
                        key={run.id}
                        run={run}
                        gated={gatedIds.has(run.id)}
                        onOpen={() => void openDetail(run.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ))}
      </div>

      {/* Full-area spec editor. It stays mounted so an unfinished draft
          survives a trip back to the board. */}
      <section
        ref={specRef}
        aria-label="New run specification"
        hidden={!specVisible}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeSpec();
          }
        }}
        className={specVisible ? "absolute inset-0 z-10 flex flex-col bg-maestro-bg" : "hidden"}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-maestro-border px-[34px] py-5">
          <span className="text-[20px] font-semibold text-maestro-text">Hand ACT a spec</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={closeSpec}
            className="flex items-center gap-2 rounded px-2 py-1 text-[12.5px] text-maestro-muted transition-colors hover:text-maestro-text"
            aria-label="Close spec editor"
          >
            Close
            <span className="font-mono text-[11px] opacity-70">esc</span>
          </button>
        </div>
        <SpecForm />
      </section>
    </div>
  );
}
