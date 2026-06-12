import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import { getProjectInsightsState } from '@/lib/ai/synthesize-insights';
import { getOutreachStats } from '@/lib/outreach-insights';
import { getNotetakerDownloadHref } from '@/lib/notetaker-download';
import type { InsightContent } from '@/lib/db/schema';
import type { TranscriptInsightRecord } from '@/lib/ai/synthesize-insights';
import type { IdeaValidationBrief } from '@/lib/backend-types';
import { OutreachInsightsEmpty, OutreachInsightsData } from './OutreachInsights';
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

function firstItems(items: string[] | null | undefined, limit = 3) {
  return Array.isArray(items) ? items.filter(Boolean).slice(0, limit) : [];
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

function IdeaValidationContextPanel({
  brief,
  startupPath,
}: {
  brief: IdeaValidationBrief | null;
  startupPath: string | null;
}) {
  if (!startupPath) return null;

  const assumptions = firstItems(brief?.assumptionsToTest);
  const targets = firstItems(brief?.targetPeople);

  return (
    <section className={styles.ideaValidationPanel}>
      <div className={styles.ideaValidationHeader}>
        <div>
          <p className={styles.eyebrow}>Idea Validation</p>
          <h2 className={styles.ideaValidationTitle}>
            {brief ? 'Insights will track this learning plan' : 'Set the learning plan before interviews'}
          </h2>
        </div>
      </div>
      {brief ? (
        <div className={styles.ideaValidationGrid}>
          <div>
            <span className={styles.ideaValidationLabel}>Outcome</span>
            <p className={styles.ideaValidationText}>
              {brief.desiredOutcome || 'Clarify the most important market unknown before selling.'}
            </p>
          </div>
          <div>
            <span className={styles.ideaValidationLabel}>People to learn from</span>
            <p className={styles.ideaValidationText}>
              {targets.length ? targets.join(', ') : 'Target users, buyers, or experts who can explain the problem.'}
            </p>
          </div>
          <div className={styles.ideaValidationWide}>
            <span className={styles.ideaValidationLabel}>Assumptions to watch</span>
            <p className={styles.ideaValidationText}>
              {assumptions.length ? assumptions.join('; ') : 'The next interviews should clarify the riskiest startup assumptions.'}
            </p>
          </div>
        </div>
      ) : (
        <p className={styles.ideaValidationText}>
          Insights become sharper when the notetaker knows which assumptions and learning goals the current outreach project is testing.
        </p>
      )}
    </section>
  );
}

function EmptyInsights({
  installerHref,
  activeIdeaValidationBrief,
  startupPath,
}: {
  installerHref: string;
  activeIdeaValidationBrief: IdeaValidationBrief | null;
  startupPath: string | null;
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

        <IdeaValidationContextPanel brief={activeIdeaValidationBrief} startupPath={startupPath} />

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
            <a
              href={installerHref}
              className={styles.downloadButton}
            >
              Download for Windows
            </a>
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
  activeIdeaValidationBrief,
  startupPath,
  transcriptInsights,
  slug,
}: {
  content: InsightContent;
  generatedAt: Date | null;
  installerHref: string;
  activeIdeaValidationBrief: IdeaValidationBrief | null;
  startupPath: string | null;
  transcriptInsights: TranscriptInsightRecord[];
  slug: string;
}) {
  const { learningSummary, recurringThemes, assumptionTracker, interviewCoach } = content;

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

        <IdeaValidationContextPanel brief={activeIdeaValidationBrief} startupPath={startupPath} />

        <InterviewCoachPanel coach={interviewCoach} transcriptInsights={transcriptInsights} />

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

        <EvidenceReliabilitySection coach={interviewCoach} />

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

        <TranscriptInsightsSection transcriptInsights={transcriptInsights} slug={slug} />
      </div>
    </main>
  );
}

function InterviewCoachPanel({
  coach,
  transcriptInsights,
}: {
  coach: InsightContent['interviewCoach'];
  transcriptInsights: TranscriptInsightRecord[];
}) {
  const coachingIssues = transcriptInsights.flatMap((record) => {
    const conversation = `${record.personName} · ${record.source === 'interaction' ? 'Completed call' : 'Transcript'} · ${formatTranscriptDate(record.completedAt)}`;
    const questionIssues = record.review.questionFlags.map((flag, index) => ({
      id: `${record.id}-question-${index}-${flag.question}`,
      severity: flag.severity,
      conversation,
      exactMoment: flag.question,
      issue: flag.issue,
      betterProbe: flag.suggestion,
    }));
    const missedProbeIssues = record.review.missedProbes.map((probe, index) => ({
      id: `${record.id}-probe-${index}-${probe.context}`,
      severity: 'watch' as const,
      conversation,
      exactMoment: probe.context,
      issue: 'Missed follow-up. The interviewee gave a potentially useful signal, but the next question did not pin it to a concrete recent example.',
      betterProbe: probe.suggestedQuestion,
    }));
    return [...questionIssues, ...missedProbeIssues];
  }).slice(0, 6);

  return (
    <section className={styles.coachPanel}>
      <div className={styles.coachLead}>
        <div>
          <p className={styles.eyebrow}>Interview coach</p>
          <h2 className={styles.coachTitle}>{coach.verdict}</h2>
        </div>
        <span className={`${styles.reliabilityPill} ${styles[`${coach.reliability}Reliability`]}`}>
          {coach.reliability} reliability
        </span>
      </div>
      <div className={styles.coachSummary}>
        <div>
          <span className={styles.ideaValidationLabel}>Main risk</span>
          <p className={styles.coachText}>{coach.mainRisk}</p>
        </div>
      </div>
      <div className={styles.coachIssueSection}>
        <span className={styles.ideaValidationLabel}>Needs coaching</span>
        {coachingIssues.length > 0 ? (
          <div className={styles.coachIssueList}>
            {coachingIssues.map((issue) => (
              <article
                key={issue.id}
                className={`${styles.coachIssue} ${issue.severity === 'problem' ? styles.problemFlag : styles.watchFlag}`}
              >
                <p className={styles.coachConversation}>{issue.conversation}</p>
                <p className={styles.flagQuestion}>{issue.exactMoment}</p>
                <p className={styles.flagIssue}>{issue.issue}</p>
                <p className={styles.flagSuggestion}>{issue.betterProbe}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.noFlags}>No major interview-technique issues detected in the reviewed conversations.</p>
        )}
      </div>
    </section>
  );
}

function EvidenceReliabilitySection({
  coach,
}: {
  coach: InsightContent['interviewCoach'];
}) {
  if (coach.trustworthyEvidence.length === 0 && coach.cautionAreas.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Evidence quality</p>
          <h2 className={styles.sectionHeading}>What to trust, and what to treat carefully</h2>
        </div>
      </div>
      <div className={styles.evidenceQualityGrid}>
        <article className={styles.evidenceQualityPanel}>
          <h3 className={styles.sectionTitle}>Trustworthy evidence</h3>
          {coach.trustworthyEvidence.length > 0 ? (
            <div className={styles.quoteList}>
              {coach.trustworthyEvidence.map((moment) => (
                <blockquote
                  key={`trust-${moment.personName}-${moment.quote}`}
                  className={styles.quote}
                >
                  <p>{moment.quote}</p>
                  <cite>{moment.personName} · {moment.reason}</cite>
                </blockquote>
              ))}
            </div>
          ) : (
            <p className={styles.emptyNote}>No high-confidence behavioral evidence yet.</p>
          )}
        </article>
        <article className={styles.evidenceQualityPanel}>
          <h3 className={styles.sectionTitle}>Needs caution</h3>
          {coach.cautionAreas.length > 0 ? (
            <div className={styles.cautionList}>
              {coach.cautionAreas.map((area) => (
                <div
                  key={`caution-${area.personName}-${area.quote}-${area.concern}`}
                  className={styles.cautionItem}
                >
                  {area.quote && <p className={styles.cautionQuote}>{area.quote}</p>}
                  <p className={styles.cautionConcern}>{area.concern}</p>
                  <p className={styles.cautionProbe}>{area.betterProbe}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyNote}>No major evidence-quality cautions detected.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function TranscriptInsightsSection({
  transcriptInsights,
  slug,
}: {
  transcriptInsights: TranscriptInsightRecord[];
  slug: string;
}) {
  if (transcriptInsights.length === 0) return null;

  const sorted = [...transcriptInsights].sort(
    (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
  );

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Interviewees</p>
          <h2 className={styles.sectionHeading}>{sorted.length} interview{sorted.length === 1 ? '' : 's'}</h2>
        </div>
      </div>
      <div className={styles.interviewRowList}>
        {sorted.map((record) => (
          <Link
            key={`${record.source}-${record.id}`}
            href={`/dashboard/${slug}/insights/interviews/${record.source}/${record.id}`}
            className={styles.interviewRow}
          >
            <span className={styles.interviewRowName}>{record.personName}</span>
            <span className={styles.interviewRowDate}>{formatTranscriptDate(record.completedAt)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

function TabBar({ active, slug }: { active: 'outreach' | 'insights'; slug: string }) {
  const tabs = [
    { key: 'outreach' as const, label: 'Outreach' },
    { key: 'insights' as const, label: 'Insights' },
  ];

  return (
    <nav className={styles.tabBar}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`/dashboard/${slug}/insights${tab.key === 'insights' ? '?tab=insights' : ''}`}
          className={`${styles.tabPill} ${active === tab.key ? styles.tabPillActive : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === 'insights' ? 'insights' : 'outreach';

  const installerHref = getNotetakerDownloadHref();
  const lookup = await getProjectBySlugOrId(slug);
  const project = lookup?.project;

  if (!project) redirect('/dashboard');

  const startupPath = project.project_type === 'startup' ? slug : null;

  // Fetch both data sets — cheap queries, fine to run in parallel
  const [state, outreachStats] = await Promise.all([
    getProjectInsightsState(project.id),
    getOutreachStats(project.id),
  ]);

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
          installerHref={installerHref}
          activeIdeaValidationBrief={state.activeIdeaValidationBrief}
          startupPath={startupPath}
        />
      ) : (
        <>
          <DataInsights
            content={state.content}
            generatedAt={state.generatedAt}
            installerHref={installerHref}
            activeIdeaValidationBrief={state.activeIdeaValidationBrief}
            startupPath={startupPath}
            transcriptInsights={state.transcriptInsights}
            slug={slug}
          />
        </>
      )}
    </>
  );
}
