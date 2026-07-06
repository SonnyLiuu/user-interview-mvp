import Link from 'next/link';
import type { OutreachStats } from '@/lib/outreach-insights';
import styles from './InsightsPage.module.css';

// ── Helpers ────────────────────────────────────────────────────────────────────

const OUTCOME_COLORS: Record<string, string> = {
  noResponse: '#c4b5a5',
  notInterested: '#d4a08a',
  successfulCall: '#5b9e8a',
  partial: '#8aafb5',
  awaiting: '#e8d9c4',
};

const OUTCOME_LABELS: Record<string, string> = {
  noResponse: 'No response',
  notInterested: 'Declined',
  successfulCall: 'Call completed',
  partial: 'Partial',
  awaiting: 'Awaiting',
};

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function funnelPct(current: number, previous: number): string {
  if (previous === 0) return '—';
  return `${Math.round((current / previous) * 100)}%`;
}

function outcomeTakeaway(chartEntries: Array<[string, number]>, totalContacted: number): string {
  const sorted = [...chartEntries].sort((a, b) => b[1] - a[1]);
  const [topKey, topCount] = sorted[0] ?? ['awaiting', 0];
  const completed = chartEntries.find(([key]) => key === 'successfulCall')?.[1] ?? 0;
  const noResponse = chartEntries.find(([key]) => key === 'noResponse')?.[1] ?? 0;
  const awaiting = chartEntries.find(([key]) => key === 'awaiting')?.[1] ?? 0;
  const completedRate = pct(completed, totalContacted);
  const noResponseRate = pct(noResponse + awaiting, totalContacted);
  const topLabel = (OUTCOME_LABELS[topKey] ?? topKey).toLowerCase();

  if (topKey === 'successfulCall') {
    return `Completed calls are the strongest outcome so far, making up ${completedRate} of contacted people. Keep the sources and outreach patterns that produced these conversations visible as you scale.`;
  }

  if (topKey === 'awaiting' || topKey === 'noResponse') {
    return `${topLabel} is the dominant state right now. ${noResponseRate} of contacted people have not produced a clear reply yet, so follow-up timing and message fit are the biggest levers to inspect.`;
  }

  if (topKey === 'notInterested') {
    return `Declines are the most visible response pattern so far. That usually points to a targeting or opening-angle problem worth tightening before adding more volume.`;
  }

  return `${OUTCOME_LABELS[topKey] ?? topKey} leads the outcome mix at ${pct(topCount, totalContacted)}. Completed calls are currently ${completedRate}, so the next read should focus on what separates conversations from stalled outreach.`;
}

// ── Empty state ────────────────────────────────────────────────────────────────

function scopedHref(slug: string, section: 'people' | 'board', outreachProjectId?: string | null) {
  const base = `/dashboard/${slug}/${section}`;
  return outreachProjectId
    ? `${base}?outreachProjectId=${encodeURIComponent(outreachProjectId)}`
    : base;
}

export function OutreachInsightsEmpty({
  slug,
  outreachProjectId,
}: {
  slug: string;
  outreachProjectId?: string | null;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>Outreach Insights</p>
          <h1 className={styles.title}>No outreach sent yet</h1>
          <p className={styles.description}>
            Send outreach messages from the Board to start tracking response
            rates, conversion funnels, and follow-up opportunities here.
          </p>
        </section>

        <section className={styles.unlockGrid}>
          <div className={styles.primaryPanel}>
            <h2 className={styles.panelTitle}>Track your outreach performance</h2>
            <p className={styles.panelBody}>
              Once you start contacting people, this page will show your
              response rate, outcome breakdown, conversion funnel, and stale
              outreach that may need follow-up.
            </p>
            <Link href={scopedHref(slug, 'board', outreachProjectId)} className={styles.downloadButton}>
              Go to Board
            </Link>
          </div>

          <div className={styles.sidePanel}>
            <h2 className={styles.sideTitle}>What you&apos;ll see</h2>
            <ul className={styles.valueList}>
              {[
                'Response rate across all contacts',
                'Outcome breakdown by response type',
                'Conversion funnel to find bottlenecks',
                'Stale outreach that needs follow-up',
              ].map((point) => (
                <li key={point} className={styles.valueItem}>
                  <span aria-hidden="true" className={styles.valueDot} />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

// ── Data state ─────────────────────────────────────────────────────────────────

export function OutreachInsightsData({
  stats,
  slug,
  outreachProjectId,
}: {
  stats: OutreachStats;
  slug: string;
  outreachProjectId?: string | null;
}) {
  const { totalFound, totalContacted, totalResponded, responseRate, outcomeCounts, funnel, stalePeople } = stats;

  return (
    <main className={styles.page}>
      <div className={styles.shellWide}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <section className={styles.dataHeader}>
          <div>
            <p className={styles.eyebrow}>Outreach Insights</p>
            <h1 className={styles.dataTitle}>
              {responseRate !== null
                ? `${responseRate}% response rate`
                : 'Start contacting people'}
            </h1>
            <p className={styles.dataDescription}>
              {totalContacted > 0
                ? `${totalResponded} of ${totalContacted} people responded. ${totalFound} total in pipeline.`
                : 'Contact people from the Board to see outreach performance.'}
            </p>
          </div>
          <div className={styles.metricStrip}>
            <div className={styles.metric}>
              <span className={styles.metricValue}>{totalContacted}</span>
              <span className={styles.metricLabel}>contacted</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricValue}>{totalResponded}</span>
              <span className={styles.metricLabel}>responded</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricValue}>
                {responseRate !== null ? `${responseRate}%` : '—'}
              </span>
              <span className={styles.metricLabel}>response rate</span>
            </div>
          </div>
        </section>

        {/* ── Outcome breakdown ───────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Outcome breakdown</p>
              <h2 className={styles.sectionHeading}>How people responded</h2>
            </div>
          </div>
          <OutcomeBar outcomeCounts={outcomeCounts} totalContacted={totalContacted} />
        </section>

        {/* ── Conversion funnel ───────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Conversion funnel</p>
              <h2 className={styles.sectionHeading}>Where people drop off</h2>
            </div>
          </div>
          <FunnelPanel funnel={funnel} />
        </section>

        {/* ── Stale outreach ──────────────────────────────────────────── */}
        {stalePeople.length > 0 && (
          <StalePanel stalePeople={stalePeople} slug={slug} outreachProjectId={outreachProjectId} />
        )}
      </div>
    </main>
  );
}

// ── Outcome pie ────────────────────────────────────────────────────────────────

function OutcomeBar({ outcomeCounts, totalContacted }: { outcomeCounts: OutreachStats['outcomeCounts']; totalContacted: number }) {
  const entries = Object.entries(outcomeCounts) as Array<[string, number]>;
  const accounted = entries.reduce((sum, [, count]) => sum + count, 0);
  const awaiting = Math.max(totalContacted - accounted, 0);
  const chartEntries = awaiting > 0 ? [...entries, ['awaiting', awaiting] as [string, number]] : entries;

  let start = 0;
  const pieGradient = chartEntries
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const end = start + (count / totalContacted) * 100;
      const stop = `${OUTCOME_COLORS[key] ?? '#c4b5a5'} ${start}% ${end}%`;
      start = end;
      return stop;
    })
    .join(', ');

  if (totalContacted === 0) {
    return <p className={styles.emptyNote}>No people contacted yet.</p>;
  }

  const takeaway = outcomeTakeaway(chartEntries, totalContacted);

  return (
    <div className={styles.outcomePieShell}>
      <div
        className={styles.outcomePie}
        style={{ background: `conic-gradient(${pieGradient})` }}
        aria-label={`${totalContacted} contacted people by outcome`}
        role="img"
      >
        <div className={styles.outcomePieCenter}>
          <span className={styles.outcomePieValue}>{totalContacted}</span>
          <span className={styles.outcomePieLabel}>contacted</span>
        </div>
      </div>
      <div className={styles.outcomeReadout}>
        <div className={styles.outcomeTakeawayPanel}>
          <h3 className={styles.outcomeTakeawayTitle}>Response takeaway</h3>
          <p className={styles.outcomeTakeawayText}>{takeaway}</p>
        </div>
        <div className={styles.outcomeLegend}>
          {chartEntries.map(([key, count]) => (
            <div key={key} className={styles.outcomeLegendItem}>
              <span
                className={styles.outcomeLegendDot}
                style={{ backgroundColor: OUTCOME_COLORS[key] ?? '#c4b5a5' }}
              />
              <span className={styles.outcomeLegendLabel}>
                {OUTCOME_LABELS[key] ?? key}
              </span>
              <span className={styles.outcomeLegendCount}>
                {count} ({pct(count, totalContacted)})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Funnel panel ───────────────────────────────────────────────────────────────

function FunnelPanel({ funnel }: { funnel: OutreachStats['funnel'] }) {
  const stages = [
    { key: 'sent', label: 'Contacted', count: funnel.sent },
    { key: 'responded', label: 'Responded', count: funnel.responded },
    { key: 'scheduled', label: 'Completed', count: funnel.scheduled },
  ] as const;

  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <article className={styles.summaryPanel}>
      <div className={styles.funnelList}>
        {stages.map((stage, i) => {
          const prev = i > 0 ? stages[i - 1].count : stage.count;
          return (
            <div key={stage.key} className={styles.funnelRow}>
              <div className={styles.funnelLabel}>
                <span>{stage.label}</span>
                <span className={styles.funnelCount}>{stage.count}</span>
              </div>
              <div className={styles.funnelBarTrack}>
                <div
                  className={styles.funnelBarFill}
                  style={{ width: `${Math.round((stage.count / maxCount) * 100)}%` }}
                />
              </div>
              {i > 0 && (
                <span className={styles.funnelDrop}>
                  {funnelPct(stage.count, prev)} conversion
                </span>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

// ── Stale panel ────────────────────────────────────────────────────────────────

function StalePanel({
  stalePeople,
  slug,
  outreachProjectId,
}: {
  stalePeople: OutreachStats['stalePeople'];
  slug: string;
  outreachProjectId?: string | null;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Needs follow-up</p>
          <h2 className={styles.sectionHeading}>
            {`${stalePeople.length} ${stalePeople.length === 1 ? 'person' : 'people'} haven't responded`}
          </h2>
        </div>
      </div>
      <div className={styles.staleList}>
        {stalePeople.map((person) => (
          <Link
            key={person.id}
            href={outreachProjectId
              ? `/dashboard/${slug}/people/${person.id}?outreachProjectId=${encodeURIComponent(outreachProjectId)}`
              : `/dashboard/${slug}/people/${person.id}`}
            className={styles.staleCard}
          >
            <span className={styles.staleName}>{person.name}</span>
            <span className={styles.staleAge}>
              Contacted {person.daysSinceContact} days ago
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
