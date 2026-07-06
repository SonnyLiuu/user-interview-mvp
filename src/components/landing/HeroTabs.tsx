import styles from './LandingPage.module.css';

function FoundationIcon() {
  return <svg viewBox="0 0 22 22" fill="none" aria-hidden="true"><rect x="3" y="2" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 7h8M7 11h8M7 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function PeopleIcon() {
  return <svg viewBox="0 0 22 22" fill="none" aria-hidden="true"><circle cx="11" cy="7.4" r="3.2" stroke="currentColor" strokeWidth="1.5"/><path d="M5.2 18c.5-3.6 2.65-5.4 5.8-5.4s5.3 1.8 5.8 5.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function BoardIcon() {
  return <svg viewBox="0 0 22 22" fill="none" aria-hidden="true"><rect x="2" y="4" width="5" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="4" width="5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="16" y="4" width="5" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
function InsightsIcon() {
  return <svg viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M4 15.5l4.4-5 3.4 3.2L17.5 7M14.1 7h3.4v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

const navItems = [
  { label: 'Foundation', icon: <FoundationIcon /> },
  { label: 'People', icon: <PeopleIcon /> },
  { label: 'Board', icon: <BoardIcon /> },
  { label: 'Insights', icon: <InsightsIcon /> },
];

const matchFactors: [string, number][] = [
  ['Recipient fit', 95],
  ['Topic overlap', 91],
  ['Shared context', 72],
  ['Evidence confidence', 88],
  ['Personalization', 85],
  ['Response usefulness', 90],
];

const stageLabels = ['Researched', 'Contacted', 'To Interview', 'Completed'];

export function HeroTabs() {
  return (
    <div className={styles.workspacePreview} aria-label="Preview of a researched person in the User Interview workspace">
      <aside className={styles.previewSidebar}>
        <div className={styles.previewLogo} title="Startup Foundry">SF</div>
        <nav className={styles.previewNav} aria-label="Preview navigation">
          {navItems.map((item) => (
            <div key={item.label} className={`${styles.previewNavItem} ${item.label === 'People' ? styles.previewNavItemActive : ''}`} title={item.label}>
              {item.icon}
            </div>
          ))}
        </nav>
        <div className={styles.previewAccount} aria-hidden="true"><PeopleIcon /></div>
        <span className={styles.previewHandle} aria-hidden="true">›</span>
      </aside>

      <div className={styles.previewApp}>
        <header className={styles.previewTopbar}>
          <div className={styles.previewProjectSelector}>
            <span>Project</span>
            <strong>Idea Validation</strong>
            <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 4.5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </header>

        <main className={styles.previewDetailMain}>
          <div className={styles.previewBack}>← <span>People research</span></div>

          <section className={styles.previewProfileHeader}>
            <div className={styles.previewAvatar}>SC</div>
            <div className={styles.previewProfileIdentity}>
              <div className={styles.previewNameRow}>
                <div>
                  <h2>Sarah Chen</h2>
                  <p>Head of Product · Meridian Labs</p>
                </div>
                <span className={styles.previewSaved}>
                  <svg viewBox="0 0 18 22" fill="currentColor" aria-hidden="true">
                    <path d="M3 2h12a1 1 0 0 1 1 1v16.27a.5.5 0 0 1-.82.39L9 15.5l-6.18 4.16A.5.5 0 0 1 2 19.27V3a1 1 0 0 1 1-1z" />
                  </svg>
                  Saved
                </span>
              </div>
              <div className={styles.previewProfileTags}>
                <span className={styles.previewTagUser}>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M2.5 13.5c0-3.04 2.46-5.5 5.5-5.5s5.5 2.46 5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Target user
                </span>
                <span className={styles.previewTagBuilder}>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.5 3.5l.7.7M11.8 11.8l.7.7M3.5 12.5l.7-.7M11.8 4.2l.7-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Builder
                </span>
              </div>
              <p className={styles.previewProfileSummary}>
                As a product leader who owns the customer discovery workflow at a growing startup, Sarah directly represents the target persona and can pressure-test where interview evidence gets lost between calls and decisions.
              </p>
              <div className={styles.previewSources}>
                <a>LinkedIn</a>
                <a>Personal site</a>
                <span>3 sources researched</span>
              </div>
            </div>
            <div className={styles.previewMatchGauge} role="img" aria-label="92 out of 100 match score">
              <svg viewBox="0 0 104 62" aria-hidden="true">
                <path className={styles.previewGaugeTrack} d="M8 54a44 44 0 0 1 88 0" pathLength="100" />
                <path className={styles.previewGaugeFill} d="M8 54a44 44 0 0 1 88 0" pathLength="100" strokeDasharray="92 100" />
              </svg>
              <div className={styles.previewGaugeValue}>
                <strong>92</strong>
                <span>Match</span>
              </div>
            </div>
          </section>

          <div className={styles.previewDetailColumns}>
            <div className={styles.previewDetailPrimary}>
              <section className={styles.previewDetailCard}>
                <div className={styles.previewDetailHeading}>
                  <div>
                    <span>Idea validation fit</span>
                    <h3>A high-leverage learning conversation</h3>
                  </div>
                  <span className={styles.previewFitBadge}>Strong fit</span>
                </div>
                <p className={styles.previewFitSummary}>
                  Sarah directly owns the workflow you are validating and can explain where research evidence gets lost between interviews and product decisions.
                </p>
                <div className={styles.previewFactors}>
                  {matchFactors.map(([label, score]) => (
                    <div key={label} className={styles.previewFactor}>
                      <div><span>{label}</span><strong>{score}</strong></div>
                      <i><b style={{ width: `${score}%` }} /></i>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.previewDetailCard}>
                <span className={styles.previewSectionKicker}>How to approach</span>
                <h3>Best angles for this conversation</h3>
                <ul className={styles.previewQuestionList}>
                  <li>Explore how recent customer interviews changed product decisions.</li>
                  <li>Probe where evidence gets hardest to organize or trust.</li>
                </ul>
              </section>
            </div>

            <aside className={styles.previewDetailAside}>
              <section className={styles.previewDetailCard}>
                <span className={styles.previewSectionKicker}>Outreach stage</span>
                <div className={styles.previewStageTrack}>
                  {stageLabels.map((label, index) => (
                    <span key={label} className={index === 0 ? styles.previewStageCurrent : undefined}>
                      {index > 0 && <i />}
                      {label}
                    </span>
                  ))}
                </div>
                <button type="button" className={styles.previewPrimaryAction}>Prepare outreach</button>
              </section>

              <section className={styles.previewDetailCard}>
                <span className={styles.previewSectionKicker}>Useful evidence</span>
                <div className={styles.previewEvidenceList}>
                  <p>Currently leads product and research operations at Meridian Labs.</p>
                  <p>Recently wrote about synthesis gaps between user interviews and roadmap calls.</p>
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
