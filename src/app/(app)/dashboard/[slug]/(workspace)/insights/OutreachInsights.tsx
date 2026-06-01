import Link from 'next/link';
import type { OutreachStats } from '@/lib/outreach-insights';
import styles from './InsightsPage.module.css';

// ── Helpers ────────────────────────────────────────────────────────────────────

const OUTCOME_COLORS: Record<string, string> = {
  noResponse: '#c4b5a5',
  notInterested: '#d4a08a',
  successfulCall: '#5b9e8a',
  partial: '#8aafb5',
};

const OUTCOME_LABELS: Record<string, string> = {
  noResponse: 'No response',
  notInterested: 'Declined',
  successfulCall: 'Call completed',
  partial: 'Partial',
};

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function funnelPct(current: number, previous: number): string {
  if (previous === 0) return '—';
  return `${Math.round((current / previous) * 100)}%`;
}

// ── Empty state ────────────────────────────────────────────────────────────────

export function OutreachInsightsEmpty({ slug }: { slug: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>Outreach Insights</p>
          <h1 className={styles.title}>No outreach sent yet</h1>
          <p className={styles.description}>
            Send outreach messages from the Board to start tracking response
            rates, conversion funnels, and persona effectiveness here.
          </p>
        </section>

        <section className={styles.unlockGrid}>
          <div className={styles.primaryPanel}>
            <h2 className={styles.panelTitle}>Track your outreach performance</h2>
            <p className={styles.panelBody}>
              Once you start contacting people, this page will show your
              response rate, outcome breakdown, conversion funnel, and which
              persona types respond best — so you can sharpen your targeting.
            </p>
            <Link href={`/dashboard/${slug}/board`} className={styles.downloadButton}>
              Go to Board
            </Link>
          </div>

          <div className={styles.sidePanel}>
            <h2 className={styles.sideTitle}>What you&apos;ll see</h2>
            <ul className={styles.valueList}>
              {[
                'Response rate across all contacts',
                'Outcome breakdown by persona type',
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

export function OutreachInsightsData({ stats, slug }: { stats: OutreachStats; slug: string }) {
  const { totalFound, totalContacted, totalResponded, responseRate, outcomeCounts, funnel, byPersonaType, stalePeople } = stats;

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

        {/* ── Two-column: Funnel + Persona ────────────────────────────── */}
        <div className={styles.summaryGrid}>
          <FunnelPanel funnel={funnel} />
          <PersonaPanel byPersonaType={byPersonaType} totalContacted={totalContacted} />
        </div>

        {/* ── Stale outreach ──────────────────────────────────────────── */}
        {stalePeople.length > 0 && (
          <StalePanel stalePeople={stalePeople} slug={slug} />
        )}
      </div>
    </main>
  );
}

// ── Outcome bar ────────────────────────────────────────────────────────────────

function OutcomeBar({ outcomeCounts, totalContacted }: { outcomeCounts: OutreachStats['outcomeCounts']; totalContacted: number }) {
  const entries = Object.entries(outcomeCounts) as Array<[string, number]>;

  if (totalContacted === 0) {
    return <p className={styles.emptyNote}>No people contacted yet.</p>;
  }

  return (
    <div className={styles.outcomeBarShell}>
      <div className={styles.outcomeBarTrack}>
        {entries.map(([key, count]) =>
          count > 0 ? (
            <div
              key={key}
              className={styles.outcomeBarSegment}
              style={{
                width: pct(count, totalContacted),
                backgroundColor: OUTCOME_COLORS[key] ?? '#c4b5a5',
              }}
            />
          ) : null,
        )}
      </div>
      <div className={styles.outcomeLegend}>
        {entries.map(([key, count]) => (
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
  );
}

// ── Funnel panel ───────────────────────────────────────────────────────────────

function FunnelPanel({ funnel }: { funnel: OutreachStats['funnel'] }) {
  const stages = [
    { key: 'bookmarked', label: 'Found', count: funnel.bookmarked },
    { key: 'sent', label: 'Contacted', count: funnel.sent },
    { key: 'scheduled', label: 'Scheduled', count: funnel.scheduled },
    { key: 'completed', label: 'Completed', count: funnel.completed },
  ] as const;

  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <article className={styles.summaryPanel}>
      <h2 className={styles.sectionTitle}>Conversion funnel</h2>
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

// ── Persona panel ──────────────────────────────────────────────────────────────

function PersonaPanel({
  byPersonaType,
  totalContacted,
}: {
  byPersonaType: OutreachStats['byPersonaType'];
  totalContacted: number;
}) {
  if (byPersonaType.length === 0) {
    return (
      <article className={styles.summaryPanel}>
        <h2 className={styles.sectionTitle}>Response by persona</h2>
        <p className={styles.emptyNote}>No contacted people with persona data yet.</p>
      </article>
    );
  }

  return (
    <article className={styles.summaryPanel}>
      <h2 className={styles.sectionTitle}>Response by persona</h2>
      <div className={styles.personaTable}>
        {byPersonaType.map((p) => (
          <div key={p.personaType} className={styles.personaRow}>
            <div className={styles.personaInfo}>
              <span className={styles.personaName}>{p.personaType}</span>
              <span className={styles.personaCount}>
                {p.responded}/{p.contacted}
              </span>
            </div>
            <div className={styles.personaBarTrack}>
              <div
                className={styles.personaBarFill}
                style={{ width: `${p.responseRate}%` }}
              />
            </div>
            <span className={styles.personaRate}>{p.responseRate}%</span>
          </div>
        ))}
      </div>
    </article>
  );
}

// ── Stale panel ────────────────────────────────────────────────────────────────

function StalePanel({
  stalePeople,
  slug,
}: {
  stalePeople: OutreachStats['stalePeople'];
  slug: string;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Needs follow-up</p>
          <h2 className={styles.sectionHeading}>
            {stalePeople.length} {stalePeople.length === 1 ? 'person' : 'people'} haven&apos;t responded
          </h2>
        </div>
      </div>
      <div className={styles.staleList}>
        {stalePeople.map((person) => (
          <Link
            key={person.id}
            href={`/dashboard/${slug}/people/${person.id}`}
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
