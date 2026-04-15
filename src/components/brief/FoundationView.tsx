import styles from './BriefView.module.css';

export type Foundation = {
  summary: string;
  targetUser: string;
  painPoint: string;
  valueProp: string;
  idealPeopleTypes: string[];
  differentiation?: string | null;
  disqualifiers?: string[];
};

export default function FoundationView({ foundation }: { foundation: Foundation }) {
  return (
    <div className={styles.brief}>
      {foundation.summary && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Summary</h2>
          <p className={styles.summary}>{foundation.summary}</p>
        </section>
      )}

      {foundation.targetUser && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Target User</h2>
          <p className={styles.summary}>{foundation.targetUser}</p>
        </section>
      )}

      {foundation.painPoint && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Core Problem</h2>
          <p className={styles.summary}>{foundation.painPoint}</p>
        </section>
      )}

      {foundation.valueProp && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Value Proposition</h2>
          <p className={styles.summary}>{foundation.valueProp}</p>
        </section>
      )}

      {foundation.idealPeopleTypes && foundation.idealPeopleTypes.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Ideal People to Talk To</h2>
          <ul className={styles.list}>
            {foundation.idealPeopleTypes.map((p, i) => (
              <li key={i} className={styles.listItem}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      {foundation.differentiation && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Differentiation</h2>
          <p className={styles.summary}>{foundation.differentiation}</p>
        </section>
      )}

      {foundation.disqualifiers && foundation.disqualifiers.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Disqualifiers</h2>
          <ul className={styles.list}>
            {foundation.disqualifiers.map((d, i) => (
              <li key={i} className={styles.listItemNegative}>{d}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
