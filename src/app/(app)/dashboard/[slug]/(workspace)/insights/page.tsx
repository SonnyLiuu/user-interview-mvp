import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { insights, interactions, people, transcripts } from '@/lib/db/schema';
import { getProjectInsightsState, getProjectTranscriptInsight } from '@/lib/ai/synthesize-insights';
import { getOutreachStats } from '@/lib/outreach-insights';
import { getNotetakerDownloadHref } from '@/lib/notetaker-download';
import { listOutreachProjects } from '@/lib/backend-server';
import { requireOwnedProjectBySlug } from '@/lib/project-access';
import type { InsightContent } from '@/lib/db/schema';
import type { TranscriptInsightRecord } from '@/lib/ai/synthesize-insights';
import type { ProjectType } from '@/lib/backend-types';
import { getPersonaTag, tagModeForOutreachProjectType, type PersonaTagMode } from '@/components/people/persona-tags';
import { OutreachInsightsEmpty, OutreachInsightsData } from './OutreachInsights';
import { InterviewDetailContent } from './InterviewDetailContent';
import styles from './InsightsPage.module.css';
import EntryGoalWelcome from '@/components/welcome/EntryGoalWelcome';

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

function formatTranscriptDate(value: Date | null) {
  if (!value) return 'Date unavailable';
  return formatDate(value);
}

async function deleteInterviewRecord(
  slug: string,
  source: TranscriptInsightRecord['source'],
  recordId: string,
) {
  'use server';

  const { project } = await requireOwnedProjectBySlug(slug);

  if (source === 'interaction') {
    const [row] = await db
      .select({
        id: interactions.id,
        personId: interactions.person_id,
        transcriptRaw: interactions.transcript_raw,
      })
      .from(interactions)
      .innerJoin(people, eq(interactions.person_id, people.id))
      .where(and(eq(people.project_id, project.id), eq(interactions.id, recordId)))
      .limit(1);

    if (row) {
      await db.delete(interactions).where(eq(interactions.id, row.id));
      const transcriptRaw = row.transcriptRaw?.trim();
      if (row.personId && transcriptRaw) {
        await db
          .delete(transcripts)
          .where(and(
            eq(transcripts.person_id, row.personId),
            eq(transcripts.type, 'call'),
            eq(transcripts.content, transcriptRaw),
          ));
      }
    }
  } else {
    const [row] = await db
      .select({ id: transcripts.id })
      .from(transcripts)
      .innerJoin(people, eq(transcripts.person_id, people.id))
      .where(and(eq(people.project_id, project.id), eq(transcripts.id, recordId)))
      .limit(1);

    if (row) {
      await db.delete(transcripts).where(eq(transcripts.id, row.id));
    }
  }

  await db
    .update(insights)
    .set({ is_current: false })
    .where(and(eq(insights.project_id, project.id), eq(insights.is_current, true)));

  revalidatePath(`/dashboard/${slug}/insights`);
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
            Capture your interviews
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
              help you remember what to cover, then saves your call transcript
              back to this dashboard when the call ends. Analysis is based on
              the transcript and your saved notes, so you get learning summaries
              of what happened during your calls and can track vital assumptions
              for your startup.
            </p>
            <div className={styles.downloadActions}>
              <a
                href={windowsInstallerHref}
                className={styles.downloadButton}
              >
                Download for Windows
              </a>
              <a
                href={macInstallerHref}
                className={styles.secondaryDownload}
              >
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
  outreachProjectId,
}: {
  content: InsightContent;
  transcriptInsights: TranscriptInsightRecord[];
  projectType: ProjectType;
  slug: string;
  outreachProjectId?: string | null;
}) {
  const { recurringThemes, assumptionTracker } = content;

  return (
    <main className={styles.page}>
      <div className={styles.shellWide}>
        <section className={styles.insightsHeader}>
          <div>
            <p className={styles.eyebrow}>Insights</p>
            <h1 className={styles.dataTitle}>Interview insights</h1>
          </div>
        </section>

        <InterviewOverviewOpener opener={content.overviewOpener} />

        <PersonaBreakdownSection
          breakdown={content.personaBreakdown}
          tagMode={projectType === 'startup' ? 'idea_validation' : 'none'}
        />

        <TranscriptInsightsSection
          transcriptInsights={transcriptInsights}
          projectType={projectType}
          slug={slug}
          outreachProjectId={outreachProjectId}
        />

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
  outreachProjectId,
}: {
  transcriptInsights: TranscriptInsightRecord[];
  projectType: ProjectType;
  slug: string;
  outreachProjectId?: string | null;
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
          <span />
        </div>
        {sorted.map((record) => {
          const tagMode = projectType === 'startup'
            ? tagModeForOutreachProjectType(record.outreachProjectType)
            : 'none';
          const tag = getPersonaTag(record.personaType, tagMode);
          const detailParams = new URLSearchParams({ tab: 'insights', interview: `${record.source}:${record.id}` });
          if (outreachProjectId) detailParams.set('outreachProjectId', outreachProjectId);
          return (
            <div
              key={`${record.source}-${record.id}`}
              className={styles.intervieweeCard}
            >
              <Link
                href={`/dashboard/${slug}/insights?${detailParams.toString()}`}
                className={styles.intervieweeCardLink}
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
              <form action={deleteInterviewRecord.bind(null, slug, record.source, record.id)}>
                <button
                  type="submit"
                  className={styles.interviewDeleteButton}
                  aria-label={`Delete interview with ${record.personName}`}
                  title="Delete interview"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </form>
            </div>
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
  outreachProjectId,
  interviewTab,
}: {
  active: 'outreach' | 'insights';
  slug: string;
  outreachProjectId?: string | null;
  interviewTab?: { label: string; closeHref: string } | null;
}) {
  const tabs = [
    { key: 'outreach' as const, label: 'Outreach' },
    { key: 'insights' as const, label: 'Interview' },
  ];
  const hrefForTab = (tab: 'outreach' | 'insights') => {
    const params = new URLSearchParams();
    if (tab === 'insights') params.set('tab', 'insights');
    if (outreachProjectId) params.set('outreachProjectId', outreachProjectId);
    const query = params.toString();
    return `/dashboard/${slug}/insights${query ? `?${query}` : ''}`;
  };

  return (
    <nav className={styles.tabBar}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={hrefForTab(tab.key)}
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
  searchParams: Promise<{ tab?: string; interview?: string; welcome?: string; outreachProjectId?: string | string[] }>;
}) {
  const { slug } = await params;
  const { tab, interview, welcome, outreachProjectId } = await searchParams;
  const activeTab = tab === 'insights' ? 'insights' : 'outreach';
  const requestedOutreachProjectId = Array.isArray(outreachProjectId)
    ? outreachProjectId[0]
    : outreachProjectId;

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
  const { project } = await requireOwnedProjectBySlug(slug);
  const outreachProjects = project.project_type === 'startup'
    ? await listOutreachProjects(project.id)
    : [];
  const selectedOutreachProject =
    outreachProjects.find((candidate) => (
      candidate.id === requestedOutreachProjectId && candidate.status !== 'archived'
    )) ?? null;
  const insightOutreachProjectId = project.project_type === 'startup'
    ? selectedOutreachProject?.id
    : undefined;

  // Fetch data — include interview record if opening an interview tab
  const [state, outreachStats, interviewRecord] = await Promise.all([
    getProjectInsightsState(project.id, insightOutreachProjectId),
    getOutreachStats(project.id, insightOutreachProjectId),
    interviewSource && interviewRecordId
      ? getProjectTranscriptInsight(project.id, interviewSource, interviewRecordId, insightOutreachProjectId)
      : null,
  ]);

  const scopedInsightsHref = (() => {
    const params = new URLSearchParams({ tab: 'insights' });
    if (insightOutreachProjectId) params.set('outreachProjectId', insightOutreachProjectId);
    return `/dashboard/${slug}/insights?${params.toString()}`;
  })();
  const interviewTab = interviewRecord
    ? {
        label: interviewRecord.personName,
        closeHref: scopedInsightsHref,
      }
    : null;

  // ── Interview detail (inline tab) ─────────────────────────────────────

  if (interviewTab) {
    return (
      <>
        <TabBar active="insights" slug={slug} outreachProjectId={insightOutreachProjectId} interviewTab={interviewTab} />
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
        <TabBar active="outreach" slug={slug} outreachProjectId={insightOutreachProjectId} />
        {outreachStats.totalContacted === 0 ? (
          <OutreachInsightsEmpty slug={slug} outreachProjectId={insightOutreachProjectId} />
        ) : (
          <OutreachInsightsData stats={outreachStats} slug={slug} outreachProjectId={insightOutreachProjectId} />
        )}
      </>
    );
  }

  // ── Insights tab ──────────────────────────────────────────────────────

  return (
    <>
      <TabBar active="insights" slug={slug} outreachProjectId={insightOutreachProjectId} />
      {welcome === '1' && (
        <div className={styles.page}>
          <div className={styles.shellWide}>
            <EntryGoalWelcome
              entryGoal={project.entry_goal}
              projectId={project.id}
              actionHref={insightOutreachProjectId
                ? `/dashboard/${slug}/people?outreachProjectId=${encodeURIComponent(insightOutreachProjectId)}`
                : `/dashboard/${slug}/people`}
              actionLabel="Add an interviewee"
            />
          </div>
        </div>
      )}
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
            outreachProjectId={insightOutreachProjectId}
          />
        </>
      )}
    </>
  );
}
