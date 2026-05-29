import Link from 'next/link';
import { redirect } from 'next/navigation';
import { env } from '@/lib/server-env';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import { getProjectInsightsState } from '@/lib/ai/synthesize-insights';
import type { InsightContent } from '@/lib/db/schema';
import styles from './InsightsPage.module.css';

export const dynamic = 'force-dynamic';

const valuePoints = [
  'Capture call notes and transcript automatically',
  'Connect conversations back to assumptions',
  'Spot patterns across completed interviews',
];

const statusLabels: Record<InsightContent['assumptionTracker'][number]['status'], string> = {
  strengthening: 'Strengthening',
  weakening: 'Weakening',
  unclear: 'Unclear',
  new: 'New',
};

function formatDate(value: Date | null) {
  if (!value) return 'Not generated yet';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}

function EmptyInsights({ installerHref }: { installerHref: string | undefined }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>Insights</p>
          <h1 className={styles.title}>
            Learn what your calls are really telling you.
          </h1>
          <p className={styles.description}>
            Insights will synthesize your interview notes and transcripts into
            recurring themes, assumption updates, and the next conversations
            that would reduce uncertainty fastest.
          </p>
        </section>

        <section className={styles.unlockGrid}>
          <div className={styles.primaryPanel}>
            <h2 className={styles.panelTitle}>
              Gather real insights from your interviews
            </h2>
            <p className={styles.panelBody}>
              Foundry Overlay sits beside Zoom, keeps your call brief visible,
              auto-checks questions as they are covered, and saves notes back to
              this dashboard when the call ends.
            </p>
            {installerHref ? (
              <a
                href={installerHref}
                download
                className={styles.downloadButton}
              >
                Download Windows notetaker
              </a>
            ) : (
              <Link
                href="/download"
                className={styles.fallbackButton}
              >
                View download page
              </Link>
            )}
            <span className={styles.note}>
              Requires a Foundry account. Windows only for now.
            </span>
          </div>

          <div className={styles.sidePanel}>
            <h2 className={styles.sideTitle}>What gets unlocked</h2>
            <ul className={styles.valueList}>
              {valuePoints.map((point) => (
                <li
                  key={point}
                  className={styles.valueItem}
                >
                  <span
                    aria-hidden="true"
                    className={styles.valueDot}
                  />
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

function DataInsights({
  content,
  generatedAt,
  installerHref,
}: {
  content: InsightContent;
  generatedAt: Date | null;
  installerHref: string | undefined;
}) {
  const { learningSummary, recurringThemes, assumptionTracker } = content;

  return (
    <main className={styles.page}>
      <div className={styles.shellWide}>
        <section className={styles.dataHeader}>
          <div>
            <p className={styles.eyebrow}>Insights</p>
            <h1 className={styles.dataTitle}>{learningSummary.headline}</h1>
            <p className={styles.dataDescription}>{learningSummary.summary}</p>
          </div>
          <div className={styles.metricStrip}>
            <div className={styles.metric}>
              <span className={styles.metricValue}>{learningSummary.callsAnalyzed}</span>
              <span className={styles.metricLabel}>calls analyzed</span>
            </div>
            <div className={styles.metric}>
              <span className={`${styles.evidencePill} ${styles[learningSummary.evidenceLevel]}`}>
                {learningSummary.evidenceLevel}
              </span>
              <span className={styles.metricLabel}>evidence level</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricDate}>{formatDate(generatedAt)}</span>
              <span className={styles.metricLabel}>last refreshed</span>
            </div>
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryPanel}>
            <h2 className={styles.sectionTitle}>Top takeaway</h2>
            <p className={styles.takeaway}>{learningSummary.topTakeaway}</p>
          </article>
          <article className={styles.summaryPanel}>
            <h2 className={styles.sectionTitle}>Next focus</h2>
            <p className={styles.takeaway}>{learningSummary.nextFocus}</p>
          </article>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Recurring themes</p>
              <h2 className={styles.sectionHeading}>Patterns across conversations</h2>
            </div>
          </div>
          <div className={styles.themeGrid}>
            {recurringThemes.map((theme) => (
              <article
                key={theme.theme}
                className={styles.themeCard}
              >
                <div className={styles.cardMeta}>
                  <span>{theme.callCount} call{theme.callCount === 1 ? '' : 's'}</span>
                  <span className={`${styles.strengthPill} ${styles[theme.evidenceStrength]}`}>
                    {theme.evidenceStrength}
                  </span>
                </div>
                <h3 className={styles.cardTitle}>{theme.theme}</h3>
                <p className={styles.cardBody}>{theme.description}</p>
                {theme.supportingQuotes.length > 0 && (
                  <div className={styles.quoteList}>
                    {theme.supportingQuotes.map((quote) => (
                      <blockquote
                        key={`${theme.theme}-${quote.personName}-${quote.quote}`}
                        className={styles.quote}
                      >
                        <p>{quote.quote}</p>
                        <cite>{quote.personName}</cite>
                      </blockquote>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Assumption tracker</p>
              <h2 className={styles.sectionHeading}>What is getting stronger or weaker</h2>
            </div>
            {installerHref && (
              <a
                href={installerHref}
                download
                className={styles.secondaryDownload}
              >
                Download notetaker
              </a>
            )}
          </div>
          <div className={styles.assumptionList}>
            {assumptionTracker.map((item) => (
              <article
                key={item.assumption}
                className={styles.assumptionRow}
              >
                <div className={styles.assumptionMain}>
                  <div className={styles.assumptionTitleRow}>
                    <h3 className={styles.assumptionTitle}>{item.assumption}</h3>
                    <span className={`${styles.statusPill} ${styles[item.status]}`}>
                      {statusLabels[item.status]}
                    </span>
                  </div>
                  <ul className={styles.evidenceList}>
                    {item.evidence.map((evidence) => (
                      <li key={`${item.assumption}-${evidence}`}>{evidence}</li>
                    ))}
                  </ul>
                </div>
                <div className={styles.nextQuestion}>
                  <span className={styles.nextLabel}>Next question</span>
                  <p>{item.nextQuestion}</p>
                  <span className={styles.confidence}>Confidence: {item.confidence}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export default async function InsightsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const installerHref = env.FOUNDRY_OVERLAY_INSTALLER_URL?.trim();
  const lookup = await getProjectBySlugOrId(slug);
  const project = lookup?.project;

  if (!project) redirect('/dashboard');

  const state = await getProjectInsightsState(project.id);

  if (state.kind === 'empty') {
    return <EmptyInsights installerHref={installerHref} />;
  }

  return (
    <DataInsights
      content={state.content}
      generatedAt={state.generatedAt}
      installerHref={installerHref}
    />
  );
}
