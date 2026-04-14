import type { ProjectBrief } from '@/lib/db/schema';
import styles from './BriefView.module.css';

type Assumption = {
  assumption: string;
  status: 'unvalidated' | 'strengthened' | 'weakened';
  evidence: string[];
};

type RecommendedConversation = {
  persona_type: string;
  why: string;
  what_to_learn: string;
  urgency: 'high' | 'medium' | 'low';
};

type Props = {
  brief: ProjectBrief;
};

const STATUS_LABEL: Record<string, string> = {
  unvalidated: 'Unvalidated',
  strengthened: 'Strengthened',
  weakened: 'Weakened',
};

const URGENCY_LABEL: Record<string, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

export default function BriefView({ brief }: Props) {
  const assumptions = (brief.assumptions as Assumption[] | null) ?? [];
  const recommended = (brief.recommended_conversations as RecommendedConversation[] | null) ?? [];

  return (
    <div className={styles.brief}>
      {brief.idea_summary && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Idea Summary</h2>
          <p className={styles.summary}>{brief.idea_summary}</p>
        </section>
      )}

      {brief.strengths && brief.strengths.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Strengths</h2>
          <ul className={styles.list}>
            {brief.strengths.map((s, i) => (
              <li key={i} className={styles.listItemPositive}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {brief.weaknesses && brief.weaknesses.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Weaknesses</h2>
          <ul className={styles.list}>
            {brief.weaknesses.map((w, i) => (
              <li key={i} className={styles.listItemNegative}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {brief.most_promising_avenues && brief.most_promising_avenues.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Most Promising Avenues</h2>
          <ul className={styles.list}>
            {brief.most_promising_avenues.map((a, i) => (
              <li key={i} className={styles.listItem}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {assumptions.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Assumptions to Validate</h2>
          <div className={styles.assumptions}>
            {assumptions.map((a, i) => (
              <div key={i} className={styles.assumption}>
                <div className={styles.assumptionHeader}>
                  <span className={styles.assumptionText}>{a.assumption}</span>
                  <span className={`${styles.statusBadge} ${styles[`status_${a.status}`]}`}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </div>
                {a.evidence && a.evidence.length > 0 && (
                  <ul className={styles.evidence}>
                    {a.evidence.map((e, j) => (
                      <li key={j}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {recommended.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recommended First Conversations</h2>
          <div className={styles.conversations}>
            {recommended.map((r, i) => (
              <div key={i} className={styles.conversation}>
                <div className={styles.conversationHeader}>
                  <span className={styles.personaType}>{r.persona_type}</span>
                  <span className={styles.urgency}>{URGENCY_LABEL[r.urgency] ?? r.urgency}</span>
                </div>
                <p className={styles.conversationWhy}>{r.why}</p>
                <p className={styles.conversationLearn}>
                  <span className={styles.learnLabel}>What to learn: </span>
                  {r.what_to_learn}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
