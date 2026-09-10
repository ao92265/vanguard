import type { PulseMetrics, PulseSpark } from "@/lib/pulse";

/**
 * The day in numbers: what shipped, what was touched, what the agents did,
 * and what is still waiting on you, with an hour-by-hour timeline over it.
 *
 * Design 1b's Pulse leads with four numbers at display size and one wide
 * timeline. The four are this app's own headline counts, not the reference's:
 * it shows agent-hours, average wait and interruptions, and nothing in Maestro
 * measures any of the three (see the task report). The timeline keeps its
 * commit marks under the bars, because "when did something actually land"
 * is the half of the day the tool-call bars cannot tell you.
 */

/** The reference's axis: first, middle and last label, not one per bar. */
function axisLabels(hours: string[]): string[] {
  if (hours.length <= 3) return hours;
  return [hours[0], hours[Math.floor((hours.length - 1) / 2)], hours[hours.length - 1]];
}

/** Tool calls per hour, with the hours something landed marked underneath. */
function Timeline({ spark }: { spark: PulseSpark }) {
  const peak = Math.max(...spark.activity, 1);
  return (
    <div>
      <div
        className="flex h-[110px] items-end gap-[5px]"
        role="img"
        aria-label="Tool calls by hour"
      >
        {spark.hours.map((label, index) => {
          const value = spark.activity[index];
          return (
            <div
              key={label}
              className={`flex-1 rounded-[2px] opacity-80 ${
                value >= peak * 0.6 && value > 0 ? "bg-maestro-accent" : "bg-maestro-blue"
              }`}
              style={{ height: `${Math.max((value / peak) * 100, 2)}%` }}
              title={`${label} · ${value} tool calls, ${spark.commits[index]} commits`}
            />
          );
        })}
      </div>
      <div className="mt-[5px] flex gap-[5px]" role="img" aria-label="Hours something landed">
        {spark.hours.map((label, index) => (
          <span
            key={label}
            className="h-[3px] flex-1 rounded-full bg-maestro-green"
            style={{ opacity: spark.commits[index] > 0 ? 1 : 0 }}
            title={`${label} · ${spark.commits[index]} commits`}
          />
        ))}
      </div>
      <div className="mt-[7px] flex justify-between font-mono text-[10px] text-maestro-muted">
        {axisLabels(spark.hours).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

/** One display-size number and the words for what it counts. */
function Headline({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <figure className="m-0" aria-label={`${value} ${label}`}>
      <div
        className={`font-mono text-[46px] font-semibold leading-none ${tone ?? "text-maestro-text"}`}
      >
        {value}
      </div>
      <figcaption className="mt-[7px] font-mono text-[11px] text-maestro-muted">{label}</figcaption>
    </figure>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="text-maestro-muted">{label}</span>
      <span className="flex-1 border-b border-dotted border-maestro-border" />
      <span className="font-mono text-maestro-text">{value}</span>
    </div>
  );
}

export function MetricsPulse({ metrics }: { metrics: PulseMetrics }) {
  const { headline, shipped, touched, activity, focus, attention } = metrics;
  const nothingYet = shipped.commits === 0 && activity.toolCalls === 0 && shipped.prsOpened === 0;

  return (
    <section className="flex flex-col gap-[26px]" aria-label="Today in numbers">
      <div className="flex flex-wrap items-baseline gap-x-[34px] gap-y-4">
        <Headline value={headline.commits} label="commits" />
        <Headline value={headline.prs} label="pull requests" />
        <Headline value={headline.repos} label="repos touched" />
        <Headline
          value={headline.waiting}
          label="waiting on you"
          tone={headline.waiting > 0 ? "text-maestro-accent" : undefined}
        />
      </div>

      {nothingYet ? (
        <p className="text-[11px] text-maestro-muted">{metrics.empty}</p>
      ) : (
        <Timeline spark={metrics.spark} />
      )}

      <div className="grid gap-x-6 gap-y-1 border-t border-maestro-border pt-3 sm:grid-cols-2">
        <Row
          label="Shipped"
          value={`${shipped.commits} commits · ${shipped.prsOpened} opened · ${shipped.prsMerged} merged`}
        />
        <Row
          label="Touched"
          value={`${touched.files} files · +${touched.added} / −${touched.removed}`}
        />
        <Row
          label="Agent work"
          value={`${activity.edits} edits · ${activity.toolCalls} tool calls`}
        />
        <Row
          label="Tests"
          value={
            activity.testRuns === 0
              ? "none run"
              : `${activity.testRuns} runs · ${activity.testsPass} passed · ${activity.testsFail} failed`
          }
        />
        <Row
          label="Focus"
          value={`${focus.active} live · ${focus.repos} repos · ${focus.switches} switches`}
        />
        <Row
          label="Attention"
          value={`${attention.waiting} waiting · ${attention.dirtyTrees} dirty trees`}
        />
      </div>
    </section>
  );
}
