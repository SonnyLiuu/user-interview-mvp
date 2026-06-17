import styles from './LandingPage.module.css';

const workspaceSteps = [
  { label: 'Foundation', meta: 'Advisor sharpened scope' },
  { label: 'People', meta: '14 researched matches' },
  { label: 'Board', meta: '9 active conversations' },
  { label: 'Insights', meta: '31% response rate' },
];

const people = [
  {
    name: 'Sarah Chen',
    role: 'Head of Product',
    company: 'Stripe',
    score: 92,
    persona: 'Target user',
    note: 'Strong fit for workflow pain and current workaround research.',
  },
  {
    name: 'Priya Raman',
    role: 'Founder',
    company: 'OpsPilot',
    score: 86,
    persona: 'Builder',
    note: 'Can explain workflow constraints, switching triggers, and founder priorities.',
  },
  {
    name: 'Marco Lee',
    role: 'Product advisor',
    company: 'Independent',
    score: 74,
    persona: 'Domain expert',
    note: 'Useful for pressure-testing market assumptions before scaling outreach.',
  },
];

const boardColumns = [
  { label: 'To contact', count: 8 },
  { label: 'Sent', count: 4 },
  { label: 'Scheduled', count: 2 },
  { label: 'Completed', count: 3 },
];

export function HeroTabs() {
  return (
    <div className={styles.workspacePreview} aria-label="Product workspace preview">
      <div className={styles.previewSidebar}>
        <div className={styles.previewProjectMark}>UI</div>
        <div className={styles.previewProjectCopy}>
          <span className={styles.previewProjectLabel}>Startup</span>
          <strong>Idea validation</strong>
        </div>
        <nav className={styles.previewNav} aria-label="Preview navigation">
          {workspaceSteps.map((step, index) => (
            <div
              key={step.label}
              className={`${styles.previewNavItem} ${index === 1 ? styles.previewNavItemActive : ''}`}
            >
              <span className={styles.previewNavDot} aria-hidden="true" />
              <span>
                <strong>{step.label}</strong>
                <small>{step.meta}</small>
              </span>
            </div>
          ))}
        </nav>
      </div>

      <div className={styles.previewMain}>
        <div className={styles.previewTopbar}>
          <div>
            <p className={styles.previewEyebrow}>AI-assisted outreach workspace</p>
            <h2 className={styles.previewTitle}>Find the right people, then keep the pipeline moving.</h2>
          </div>
          <span className={styles.previewStatus}>Live research</span>
        </div>

        <div className={styles.previewGrid}>
          <section className={styles.previewPanel}>
            <div className={styles.previewPanelHeader}>
              <span className={styles.previewPanelKicker}>Foundation advisor</span>
              <span className={styles.previewPill}>Ready</span>
            </div>
            <h3 className={styles.previewPanelTitle}>Recommended first outreach project</h3>
            <p className={styles.previewPanelText}>
              Validate whether early-stage founders feel enough pain around fragmented customer discovery to change tools.
            </p>
            <div className={styles.previewChipRow}>
              <span>Target users</span>
              <span>Builders</span>
              <span>Domain experts</span>
            </div>
          </section>

          <section className={`${styles.previewPanel} ${styles.previewPeoplePanel}`}>
            <div className={styles.previewPanelHeader}>
              <span className={styles.previewPanelKicker}>People research</span>
              <span className={styles.previewPill}>Quick + deep</span>
            </div>
            <div className={styles.previewInputBar}>
              <span>Paste URLs or profile text</span>
              <strong>Research</strong>
            </div>
            <div className={styles.previewPeopleList}>
              {people.map((person) => (
                <article key={person.name} className={styles.previewPersonCard}>
                  <div className={styles.previewPersonTop}>
                    <div>
                      <h3>{person.name}</h3>
                      <p>{person.role} at {person.company}</p>
                    </div>
                    <span>{person.score}</span>
                  </div>
                  <div className={styles.previewPersonMeta}>
                    <span>{person.persona}</span>
                    <span>Interview fit</span>
                  </div>
                  <p>{person.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.previewPanel}>
            <div className={styles.previewPanelHeader}>
              <span className={styles.previewPanelKicker}>Board</span>
              <span className={styles.previewPill}>Drag to update</span>
            </div>
            <div className={styles.previewBoard}>
              {boardColumns.map((column) => (
                <div key={column.label} className={styles.previewBoardColumn}>
                  <span>{column.label}</span>
                  <strong>{column.count}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.previewPanel}>
            <div className={styles.previewPanelHeader}>
              <span className={styles.previewPanelKicker}>Outreach insights</span>
              <span className={styles.previewPill}>Updating</span>
            </div>
            <div className={styles.previewMetricRow}>
              <div>
                <strong>31%</strong>
                <span>response rate</span>
              </div>
              <div>
                <strong>3</strong>
                <span>follow-ups due</span>
              </div>
            </div>
            <div className={styles.previewInsightBar}>
              <span style={{ width: '46%' }} />
              <span style={{ width: '26%' }} />
              <span style={{ width: '18%' }} />
              <span style={{ width: '10%' }} />
            </div>
            <p className={styles.previewPanelText}>
              Target users are responding best. Rework the opening angle for budget holders before adding more volume.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
