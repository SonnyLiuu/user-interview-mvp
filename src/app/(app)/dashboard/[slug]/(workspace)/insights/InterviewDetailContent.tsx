import type { TranscriptInsightRecord } from '@/lib/ai/synthesize-insights';
import styles from './InsightsPage.module.css';

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

export function InterviewDetailContent({ record }: { record: TranscriptInsightRecord }) {
  const topInsights = topInterviewInsights(record);
  const missedProbes = record.review.missedProbes;
  const flags = record.review.questionFlags;

  return (
    <>
      <section className={styles.dataHeader}>
        <div>
          <p className={styles.eyebrow}>Interview analysis</p>
          <h1 className={styles.dataTitle}>{record.personName}</h1>
          <p className={styles.dataDescription}>{formatDate(record.completedAt)}</p>
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.analysisParagraph}>{record.review.summary}</p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionHeading}>The two strongest insights from this interview</h2>
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

      {missedProbes.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionHeading}>Missed follow-ups</h2>
            </div>
          </div>
          <div className={styles.flagList}>
            {missedProbes.slice(0, 4).map((probe) => (
              <article
                key={probe.context}
                className={`${styles.questionFlag} ${styles.watchFlag}`}
              >
                <p className={styles.flagQuestion}>{probe.context}</p>
                <p className={styles.flagSuggestion}>{probe.suggestedQuestion}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {flags.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionHeading}>Questions to improve next time</h2>
            </div>
          </div>
          <div className={styles.flagList}>
            {record.review.questionFlags.slice(0, 6).map((flag) => (
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
            <h2 className={styles.sectionHeading}>Full interview transcript</h2>
          </div>
        </div>
        <pre className={styles.fullTranscriptText}>{record.transcript.trim() || 'No transcript text was saved for this interview.'}</pre>
      </section>
    </>
  );
}
