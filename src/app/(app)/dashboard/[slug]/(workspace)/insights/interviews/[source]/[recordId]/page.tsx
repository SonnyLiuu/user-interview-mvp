import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import {
  getProjectTranscriptInsight,
  type TranscriptInsightRecord,
} from '@/lib/ai/synthesize-insights';
import styles from '../../../InsightsPage.module.css';

export const dynamic = 'force-dynamic';

type InterviewInsight = {
  title: string;
  body: string;
  meta?: string;
  tone: 'strong' | 'watch';
};

function formatDate(value: Date | null) {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}

function firstItems(items: string[], limit: number) {
  return items.filter(Boolean).slice(0, limit);
}

function topInterviewInsights(record: TranscriptInsightRecord): InterviewInsight[] {
  const strong = record.review.strongEvidenceMoments.map((moment) => ({
    title: 'Strong evidence',
    body: moment.quote,
    meta: moment.reason,
    tone: 'strong' as const,
  }));
  const signals = record.review.evidenceSignals.map((signal) => ({
    title: 'Behavior signal',
    body: signal,
    meta: 'Potentially useful evidence from this interview.',
    tone: 'strong' as const,
  }));
  const weak = record.review.weakEvidenceMoments.map((moment) => ({
    title: 'Treat carefully',
    body: moment.quote,
    meta: moment.reason,
    tone: 'watch' as const,
  }));
  const flags = record.review.questionFlags.map((flag) => ({
    title: flag.severity === 'problem' ? 'Interview risk' : 'Watch this question',
    body: flag.question,
    meta: flag.issue,
    tone: 'watch' as const,
  }));

  const insights = [...strong, ...signals, ...weak, ...flags];
  if (insights.length >= 2) return insights.slice(0, 2);

  return [
    ...insights,
    {
      title: 'Interview summary',
      body: record.review.summary,
      meta: 'Use this as the starting read for the conversation.',
      tone: 'strong' as const,
    },
    {
      title: 'Next probe',
      body: record.review.suggestedFollowUps[0] ?? 'Ask for a concrete recent example, current workaround, and consequence.',
      meta: 'Best follow-up for the next interview.',
      tone: 'watch' as const,
    },
  ].slice(0, 2);
}

export default async function InterviewInsightPage({
  params,
}: {
  params: Promise<{ slug: string; source: string; recordId: string }>;
}) {
  const { slug, source, recordId } = await params;
  if (source !== 'interaction' && source !== 'transcript') notFound();

  const lookup = await getProjectBySlugOrId(slug);
  const project = lookup?.project;
  if (!project) redirect('/dashboard');

  const record = await getProjectTranscriptInsight(project.id, source, recordId);
  if (!record) notFound();

  const topInsights = topInterviewInsights(record);
  const followUps = firstItems(record.review.suggestedFollowUps, 3);
  const flags = firstItems(record.review.questionFlags.map((flag) => flag.issue), 3);
  const checklistCoverage = record.checkedCount !== null && record.topicCount !== null
    ? `${record.checkedCount}/${record.topicCount} checked`
    : null;

  return (
    <>
      <nav className={styles.tabBar}>
        <Link href={`/dashboard/${slug}/insights`} className={styles.tabPill}>
          Back to insights
        </Link>
        <span className={`${styles.tabPill} ${styles.tabPillActive}`}>
          Interview detail
        </span>
      </nav>
      <main className={styles.page}>
        <div className={styles.shellWide}>
          <section className={styles.dataHeader}>
            <div>
              <p className={styles.eyebrow}>Interview analysis</p>
              <h1 className={styles.dataTitle}>{record.personName}</h1>
              <p className={styles.dataDescription}>
                {record.outreachProjectLabel} · {record.source === 'interaction' ? 'Completed call' : 'Transcript'} · {formatDate(record.completedAt)}
              </p>
            </div>
            <div className={styles.metricStrip}>
              <div className={styles.metric}>
                <span className={`${styles.reliabilityPill} ${styles[`${record.review.reliability}Reliability`]}`}>
                  {record.review.reliability}
                </span>
                <span className={styles.metricLabel}>reliability</span>
              </div>
              {checklistCoverage ? (
                <div className={styles.metric}>
                  <span className={styles.metricValue}>{checklistCoverage}</span>
                  <span className={styles.metricLabel}>checklist</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>Top insights</p>
                <h2 className={styles.sectionHeading}>The two strongest reads from this interview</h2>
              </div>
            </div>
            <div className={styles.topInsightGrid}>
              {topInsights.map((insight) => (
                <article
                  key={`${insight.title}-${insight.body}`}
                  className={`${styles.topInsightCard} ${insight.tone === 'watch' ? styles.watchFlag : styles.strongInsight}`}
                >
                  <span className={styles.transcriptBlockLabel}>{insight.title}</span>
                  <p className={styles.topInsightBody}>{insight.body}</p>
                  {insight.meta ? <p className={styles.topInsightMeta}>{insight.meta}</p> : null}
                </article>
              ))}
            </div>
          </section>

          <section className={styles.summaryGrid}>
            <article className={styles.summaryPanel}>
              <h2 className={styles.sectionTitle}>Per-interview analysis</h2>
              <p className={styles.takeaway}>{record.review.summary}</p>
            </article>
            <article className={styles.summaryPanel}>
              <h2 className={styles.sectionTitle}>Next follow-ups</h2>
              <ul className={styles.compactList}>
                {followUps.map((followUp) => (
                  <li key={followUp}>{followUp}</li>
                ))}
              </ul>
            </article>
          </section>

          {flags.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.eyebrow}>Interview quality</p>
                  <h2 className={styles.sectionHeading}>Questions to improve next time</h2>
                </div>
              </div>
              <div className={styles.flagList}>
                {record.review.questionFlags.slice(0, 3).map((flag) => (
                  <article
                    key={`${flag.question}-${flag.issue}`}
                    className={`${styles.questionFlag} ${flag.severity === 'problem' ? styles.problemFlag : styles.watchFlag}`}
                  >
                    <p className={styles.flagQuestion}>{flag.question}</p>
                    <p className={styles.flagIssue}>{flag.issue}</p>
                    <p className={styles.flagSuggestion}>{flag.suggestion}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {record.notes.trim() ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.eyebrow}>Notes</p>
                  <h2 className={styles.sectionHeading}>Saved call notes</h2>
                </div>
              </div>
              <pre className={styles.transcriptText}>{record.notes}</pre>
            </section>
          ) : null}

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>Transcript</p>
                <h2 className={styles.sectionHeading}>Full interview transcript</h2>
              </div>
            </div>
            <pre className={styles.fullTranscriptText}>{record.transcript.trim() || 'No transcript text was saved for this interview.'}</pre>
          </section>
        </div>
      </main>
    </>
  );
}
