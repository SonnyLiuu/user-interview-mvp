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

export function HeroTabs() {
  return (
    <div className={styles.workspacePreview} aria-label="Preview of the User Interview people workspace">
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
                  <p>Head of Product · Stripe</p>
                </div>
                <span className={styles.previewSaved}>Saved</span>
              </div>
              <div className={styles.previewProfileTags}>
                <span>Target user</span>
                <span>Product leader</span>
                <span>Domain expert</span>
              </div>
              <p className={styles.previewProfileSummary}>
                Strong fit for testing how product teams collect, synthesize, and act on customer interview evidence.
              </p>
              <div className={styles.previewSources}>
                <span>in LinkedIn</span>
                <span>↗ Personal site</span>
                <span>3 sources researched</span>
              </div>
            </div>
            <div className={styles.previewMatchScore}>
              <svg viewBox="0 0 86 50" fill="none" aria-hidden="true">
                <path d="M8 43a35 35 0 0 1 70 0" stroke="#eadcca" strokeWidth="7" strokeLinecap="round" />
                <path d="M8 43A35 35 0 0 1 72 18" stroke="#4a8c5c" strokeWidth="7" strokeLinecap="round" />
                <circle cx="72" cy="18" r="5" fill="#4a8c5c" />
              </svg>
              <strong>92</strong>
              <span>High match</span>
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
                  {[
                    ['Recipient fit', 95],
                    ['Topic overlap', 91],
                    ['Evidence confidence', 88],
                    ['Response usefulness', 90],
                  ].map(([label, score]) => (
                    <div key={label} className={styles.previewFactor}>
                      <div><span>{label}</span><strong>{score}</strong></div>
                      <i><b style={{ width: `${score}%` }} /></i>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.previewDetailCard}>
                <span className={styles.previewSectionKicker}>What to learn</span>
                <h3>Best questions for this conversation</h3>
                <ul className={styles.previewQuestionList}>
                  <li>Walk me through the last customer interview that changed a product decision.</li>
                  <li>Where does evidence become hardest to organize or trust?</li>
                </ul>
              </section>
            </div>

            <aside className={styles.previewDetailAside}>
              <section className={styles.previewDetailCard}>
                <span className={styles.previewSectionKicker}>Outreach stage</span>
                <div className={styles.previewStageTrack}>
                  <span className={styles.previewStageDone}>Researched</span>
                  <i />
                  <span>Contacted</span>
                  <i />
                  <span>Interviewed</span>
                </div>
                <button type="button" className={styles.previewPrimaryAction}>Prepare outreach</button>
              </section>

              <section className={styles.previewDetailCard}>
                <span className={styles.previewSectionKicker}>Useful evidence</span>
                <div className={styles.previewEvidenceItem}>
                  <strong>Owns customer discovery systems</strong>
                  <p>Led research operations across product and design teams.</p>
                </div>
                <div className={styles.previewEvidenceItem}>
                  <strong>Recently discussed synthesis gaps</strong>
                  <p>Public writing points to the exact workflow under validation.</p>
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
