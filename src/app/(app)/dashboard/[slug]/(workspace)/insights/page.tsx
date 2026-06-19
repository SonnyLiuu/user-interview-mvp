import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import { getProjectInsightsState, getProjectTranscriptInsight } from '@/lib/ai/synthesize-insights';
import { getOutreachStats } from '@/lib/outreach-insights';
import { getNotetakerDownloadHref } from '@/lib/notetaker-download';
import type { InsightContent } from '@/lib/db/schema';
import type { TranscriptInsightRecord } from '@/lib/ai/synthesize-insights';
import type { ProjectType } from '@/lib/backend-types';
import { getPersonaTag, tagModeForOutreachProjectType, type PersonaTagMode } from '@/components/people/persona-tags';
import { OutreachInsightsEmpty, OutreachInsightsData } from './OutreachInsights';
import { InterviewDetailContent } from './InterviewDetailContent';
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

function WindowsLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.platformLogo}>
      <path d="M2.75 4.65 10.5 3.6v7.48H2.75V4.65Zm8.75-1.18 9.75-1.32v8.93H11.5V3.47ZM2.75 12.08h7.75v7.48l-7.75-1.05v-6.43Zm8.75 0h9.75V21l-9.75-1.32v-7.6Z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${styles.platformLogo} ${styles.appleLogo}`}
    >
      <path d="M17.05 12.54c.02-2.02 1.66-2.99 1.74-3.04a3.72 3.72 0 0 0-2.93-1.59c-1.23-.13-2.43.74-3.06.74-.64 0-1.6-.72-2.65-.7a3.9 3.9 0 0 0-3.29 2.01c-1.42 2.46-.36 6.08 1 8.07.68.97 1.47 2.06 2.52 2.02 1.03-.04 1.42-.65 2.67-.65 1.24 0 1.61.65 2.68.62 1.11-.02 1.8-.98 2.45-1.96a8.07 8.07 0 0 0 1.12-2.29 3.49 3.49 0 0 1-2.25-3.23ZM15.06 6.61a3.56 3.56 0 0 0 .81-2.56 3.64 3.64 0 0 0-2.35 1.22 3.4 3.4 0 0 0-.84 2.46 3 3 0 0 0 2.38-1.12Z" />
    </svg>
  );
}

function formatDate(value: Date | null) {
  if (!value) return 'Not generated yet';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}

function formatTranscriptDate(value: Date | null) {
  if (!value) return 'Date unavailable';
  return formatDate(value);
}

function EmptyInsights({
  windowsInstallerHref,
  macInstallerHref,
}: {
  windowsInstallerHref: string;
  macInstallerHref: string;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>Insights</p>
          <h1 className={styles.title}>
            Turn validation interviews into startup evidence.
          </h1>
          <p className={styles.description}>
            This page synthesizes interview notes and transcripts against your
            Idea Validation plan, so the recurring themes and assumption
            updates stay tied to the current bottleneck.
          </p>
        </section>

        <section className={styles.unlockGrid}>
          <div className={styles.primaryPanel}>
            <h2 className={styles.panelTitle}>
              Gather AI insights from your interviews
            </h2>
            <p className={styles.panelBody}>
              User Interview Notetaker keeps a visible checklist beside calls to
              automatically check questions as they are covered, and saves your call transcript
              back to this dashboard when the call ends. Get learning summaries of
              what happened during your calls as well as track vital assumptions
              for your startup.
            </p>
            <div className={styles.downloadActions}>
              <a
                href={windowsInstallerHref}
                className={styles.downloadButton}
              >
                <WindowsLogo />
                Download for Windows
              </a>
              <a
                href={macInstallerHref}
                className={styles.macDownloadButton}
              >
                <AppleLogo />
                Download for Mac
              </a>
            </div>
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

function InterviewOverviewOpener({ opener }: { opener: string }) {
  return (
    <section className={styles.overviewOpener}>
      <p className={styles.overviewText}>{opener}</p>
    </section>
  );
}

function DataInsights({
  content,
  transcriptInsights,
  projectType,
  slug,
}: {
  content: InsightContent;
  transcriptInsights: TranscriptInsightRecord[];
  projectType: ProjectType;
  slug: string;
}) {
  const { recurringThemes, assumptionTracker } = content;

  return (
    <main className={styles.page}>
      <div className={styles.shellWide}>
        <section className={styles.insightsHeader}>
          <div>
            <p className={styles.eyebrow}>Insights</p>
          </div>
        </section>

        <InterviewOverviewOpener opener={content.overviewOpener} />

        <PersonaBreakdownSection
          breakdown={content.personaBreakdown}
          tagMode={projectType === 'startup' ? 'idea_validation' : 'none'}
        />

        <TranscriptInsightsSection transcriptInsights={transcriptInsights} projectType={projectType} slug={slug} />

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Assumption tracker</p>
              <h2 className={styles.sectionHeading}>What is getting stronger or weaker</h2>
            </div>
          </div>
          <div className={styles.assumptionList}>
            {assumptionTracker.map((item) => (
              <article
                key={item.assumption}
                className={styles.assumptionRow}
              >
                <div className={styles.assumptionTitleRow}>
                  <h3 className={styles.assumptionTitle}>{item.assumption}</h3>
                  <span className={`${styles.statusPill} ${styles[item.status]}`}>
                    {statusLabels[item.status]}
                  </span>
                </div>
                {item.evidence.length > 0 && (
                  <ul className={styles.evidenceList}>
                    {item.evidence.map((evidence) => (
                      <li key={`${item.assumption}-${evidence}`}>{evidence}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Interview issues</p>
              <h2 className={styles.sectionHeading}>Biggest issues and patterns found</h2>
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
      </div>
    </main>
  );
}

function PersonaBreakdownSection({
  breakdown,
  tagMode,
}: {
  breakdown: InsightContent['personaBreakdown'];
  tagMode: PersonaTagMode;
}) {
  const byTag = new Map<string, InsightContent['personaBreakdown'][number] & { tagLabel: string }>();
  for (const item of breakdown ?? []) {
    const tag = getPersonaTag(item.personaType, tagMode);
    if (!tag) continue;

    const existing = byTag.get(tag.key);
    if (existing) {
      byTag.set(tag.key, {
        ...existing,
        peopleCount: existing.peopleCount + item.peopleCount,
      });
      continue;
    }

    byTag.set(tag.key, { ...item, tagLabel: tag.label });
  }

  const visibleBreakdown = Array.from(byTag.values());
  if (visibleBreakdown.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Response by persona</p>
          <h2 className={styles.sectionHeading}>How each group responded</h2>
        </div>
      </div>
      <div className={styles.personaBreakdownGrid}>
        {visibleBreakdown.map((item) => (
          <article key={item.personaType} className={styles.personaBreakdownCard}>
            <div className={styles.personaBreakdownHeader}>
              <span className={styles.personaBreakdownType}>
                {item.tagLabel}
              </span>
              <span className={styles.personaBreakdownCount}>
                {item.peopleCount} {item.peopleCount === 1 ? 'person' : 'people'}
              </span>
            </div>
            <h3 className={styles.personaBreakdownHeadline}>{item.headline}</h3>
            <p className={styles.personaBreakdownBody}>{item.keyFinding}</p>
            {item.representativeQuote && (
              <blockquote className={styles.personaBreakdownQuote}>
                <p>&ldquo;{item.representativeQuote.quote}&rdquo;</p>
                <cite>&mdash; {item.representativeQuote.personName}</cite>
              </blockquote>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function TranscriptInsightsSection({
  transcriptInsights,
  projectType,
  slug,
}: {
  transcriptInsights: TranscriptInsightRecord[];
  projectType: ProjectType;
  slug: string;
}) {
  if (transcriptInsights.length === 0) return null;

  const sorted = [...transcriptInsights].sort(
    (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
  );

  return (
    <section className={styles.intervieweePanel}>
      <div className={styles.intervieweeHeader}>
        <div>
          <p className={styles.eyebrow}>Interviewees</p>
          <h2 className={styles.intervieweeTitle}>People interviewed</h2>
        </div>
        <span className={styles.intervieweeCount}>
          {sorted.length} interview{sorted.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className={styles.interviewFileExplorer}>
        <div className={styles.interviewFileHeader} aria-hidden="true">
          <span>Name</span>
          <span>Type</span>
          <span>Interviewed</span>
        </div>
        {sorted.map((record) => {
          const tagMode = projectType === 'startup'
            ? tagModeForOutreachProjectType(record.outreachProjectType)
            : 'none';
          const tag = getPersonaTag(record.personaType, tagMode);
          return (
            <Link
              key={`${record.source}-${record.id}`}
              href={`/dashboard/${slug}/insights?tab=insights&interview=${record.source}:${record.id}`}
              className={styles.intervieweeCard}
            >
              <span className={styles.interviewFileName}>
                <span className={styles.intervieweeName}>{record.personName}</span>
              </span>
              <span className={`${styles.intervieweeMeta} ${styles.intervieweeType}`}>
                {tag?.label || 'Interview'}
              </span>
              <span className={`${styles.intervieweeMeta} ${styles.intervieweeDate}`}>
                {formatTranscriptDate(record.completedAt)}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

function TabBar({
  active,
  slug,
  interviewTab,
}: {
  active: 'outreach' | 'insights';
  slug: string;
  interviewTab?: { label: string; closeHref: string } | null;
}) {
  const tabs = [
    { key: 'outreach' as const, label: 'Outreach' },
    { key: 'insights' as const, label: 'Interview' },
  ];

  return (
    <nav className={styles.tabBar}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`/dashboard/${slug}/insights${tab.key === 'insights' ? '?tab=insights' : ''}`}
          className={`${styles.tabPill} ${active === tab.key && !interviewTab ? styles.tabPillActive : ''}`}
        >
          {tab.label}
        </Link>
      ))}
      {interviewTab ? (
        <span className={`${styles.tabPill} ${styles.tabPillActive}`}>
          {interviewTab.label}
          <Link
            href={interviewTab.closeHref}
            className={styles.tabClose}
            aria-label={`Close ${interviewTab.label}`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Link>
        </span>
      ) : null}
    </nav>
  );
}

export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; interview?: string }>;
}) {
  const { slug } = await params;
  const { tab, interview } = await searchParams;
  const activeTab = tab === 'insights' ? 'insights' : 'outreach';

  // Parse interview param: "transcript:recordId" or "interaction:recordId"
  let interviewSource: 'interaction' | 'transcript' | null = null;
  let interviewRecordId: string | null = null;
  if (interview) {
    const colon = interview.indexOf(':');
    if (colon > 0) {
      const source = interview.slice(0, colon);
      if (source === 'interaction' || source === 'transcript') {
        interviewSource = source;
        interviewRecordId = interview.slice(colon + 1);
      }
    }
  }

  const windowsInstallerHref = getNotetakerDownloadHref('windows');
  const macInstallerHref = getNotetakerDownloadHref('macos');
  const lookup = await getProjectBySlugOrId(slug);
  const project = lookup?.project;

  if (!project) redirect('/dashboard');

  // Fetch data — include interview record if opening an interview tab
  const [state, outreachStats, interviewRecord] = await Promise.all([
    getProjectInsightsState(project.id),
    getOutreachStats(project.id),
    interviewSource && interviewRecordId
      ? getProjectTranscriptInsight(project.id, interviewSource, interviewRecordId)
      : null,
  ]);

  const interviewTab = interviewRecord
    ? {
        label: interviewRecord.personName,
        closeHref: `/dashboard/${slug}/insights?tab=insights`,
      }
    : null;

  // ── Interview detail (inline tab) ─────────────────────────────────────

  if (interviewTab) {
    return (
      <>
        <TabBar active="insights" slug={slug} interviewTab={interviewTab} />
        <main className={styles.page}>
          <div className={styles.shellWide}>
            <InterviewDetailContent record={interviewRecord!} />
          </div>
        </main>
      </>
    );
  }

  // ── Outreach tab (default) ────────────────────────────────────────────

  if (activeTab === 'outreach') {
    return (
      <>
        <TabBar active="outreach" slug={slug} />
        {outreachStats.totalContacted === 0 ? (
          <OutreachInsightsEmpty slug={slug} />
        ) : (
          <OutreachInsightsData stats={outreachStats} slug={slug} />
        )}
      </>
    );
  }

  // ── Insights tab ──────────────────────────────────────────────────────

  return (
    <>
      <TabBar active="insights" slug={slug} />
      {state.kind === 'empty' ? (
        <EmptyInsights
          windowsInstallerHref={windowsInstallerHref}
          macInstallerHref={macInstallerHref}
        />
      ) : (
        <>
          <DataInsights
            content={state.content}
            transcriptInsights={state.transcriptInsights}
            projectType={project.project_type}
            slug={slug}
          />
        </>
      )}
    </>
  );
}
