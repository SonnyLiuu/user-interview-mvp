import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Idea Validation',
  description: 'Learn how User Interview helps founders test assumptions with the right people before they build or sell.',
};

const steps = [
  {
    number: '01',
    title: 'Turn the idea into a testable brief',
    body: 'Start with what you are building, who it is for, and what must be true. The workspace helps surface risky assumptions and turns them into focused learning goals.',
  },
  {
    number: '02',
    title: 'Find the people who can teach you',
    body: 'Research prospective users, buyers, and market experts. Each person is analyzed against your project so you can prioritize conversations with the highest learning value.',
  },
  {
    number: '03',
    title: 'Prepare outreach and interviews',
    body: 'Draft thoughtful outreach, understand why each person is relevant, and walk into every call with questions tied to the assumptions you need to test.',
  },
  {
    number: '04',
    title: 'Turn conversations into evidence',
    body: 'Add notes or transcripts after each call. User Interview pulls out evidence, missed opportunities, and patterns across conversations so your point of view gets sharper over time.',
  },
];

const outcomes = [
  'A clear picture of the problem worth solving',
  'Evidence for or against your riskiest assumptions',
  'A prioritized list of people to interview next',
  'Reusable insight across every conversation',
];

export default function IdeaValidationPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav} aria-label="Main navigation">
        <div className={styles.navInner}>
          <Link href="/" className={styles.wordmark}>User Interview</Link>
          <div className={styles.navLinks}>
            <Link href="/login" className={styles.login}>Log in</Link>
            <Link href="/get-started" className={styles.navCta}>Get started</Link>
          </div>
        </div>
      </nav>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <Link href="/#outreach-projects" className={styles.backLink}>← All outreach projects</Link>
            <div className={styles.heroGrid}>
              <div>
                <div className={styles.status}><span /> Available now</div>
                <h1>Validate the idea before you bet the company on it.</h1>
                <p className={styles.lede}>
                  Idea Validation helps you identify what must be true, find the people who know,
                  and turn every conversation into evidence you can act on.
                </p>
                <div className={styles.heroActions}>
                  <Link href="/get-started" className={styles.primaryAction}>Start validating for free</Link>
                  <span>No credit card required</span>
                </div>
              </div>

              <aside className={styles.briefCard} aria-label="Example validation brief">
                <p className={styles.cardEyebrow}>Your validation brief</p>
                <h2>Know what you need to learn next.</h2>
                <div className={styles.briefItem}>
                  <span>Core assumption</span>
                  <p>Small teams need a faster way to synthesize customer conversations.</p>
                </div>
                <div className={styles.briefItem}>
                  <span>Best person to ask</span>
                  <p>Founders currently running interviews without a research team.</p>
                </div>
                <div className={styles.briefItem}>
                  <span>Evidence to look for</span>
                  <p>Repeated workarounds, real urgency, and an existing budget or time cost.</p>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className={styles.process}>
          <div className={styles.sectionInner}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 className={styles.sectionTitle}>A learning loop built for founders.</h2>
            <div className={styles.steps}>
              {steps.map((step) => (
                <article key={step.number} className={styles.step}>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.outcomesSection}>
          <div className={styles.outcomesGrid}>
            <div>
              <p className={styles.eyebrow}>What you leave with</p>
              <h2 className={styles.sectionTitle}>More than a folder full of call notes.</h2>
              <p className={styles.outcomesIntro}>
                The goal is not to collect compliments. It is to build enough grounded conviction
                to move forward, change direction, or stop before the expensive part.
              </p>
            </div>
            <ul className={styles.outcomeList}>
              {outcomes.map((outcome) => <li key={outcome}><span>✓</span>{outcome}</li>)}
            </ul>
          </div>
        </section>

        <section className={styles.finalCta}>
          <p className={styles.eyebrow}>Idea Validation</p>
          <h2>Get closer to the truth, one conversation at a time.</h2>
          <p>Build your brief, find the right people, and start learning today.</p>
          <Link href="/get-started" className={styles.primaryAction}>Get started for free</Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>User Interview</span>
        <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        <small>© 2026 User Interview</small>
      </footer>
    </div>
  );
}
