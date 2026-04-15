import Link from 'next/link';
import { HeroTabs } from './HeroTabs';
import styles from './LandingPage.module.css';

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function IconDocument({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3" y="1.5" width="12" height="15" rx="2" stroke={color} strokeWidth="1.4"/>
      <line x1="6" y1="6" x2="12" y2="6" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="6" y1="9" x2="12" y2="9" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="6" y1="12" x2="10" y2="12" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function IconPerson({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="6" r="3" stroke={color} strokeWidth="1.4"/>
      <path d="M3 16c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconChat({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 3.5C2 2.67 2.67 2 3.5 2h11c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5H6l-4 3V3.5z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  );
}

function IconSearch({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5" stroke={color} strokeWidth="1.4"/>
      <line x1="12" y1="12" x2="16" y2="16" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconMail({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="1.5" y="4" width="15" height="10" rx="1.5" stroke={color} strokeWidth="1.4"/>
      <path d="M1.5 5l7.5 5 7.5-5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconPhone({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M5 2h3l1.5 3.5-2 1.5a9 9 0 0 0 3.5 3.5l1.5-2L16 10v3a2 2 0 0 1-2 2A13 13 0 0 1 3 4a2 2 0 0 1 2-2z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  );
}

function IconNote({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M10 2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-6-6z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M10 2v6h6" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconTrend({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <polyline points="2,13 6,8 9,11 13,5 16,8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="13,5 16,5 16,8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Feature card data ─────────────────────────────────────────────────────────

const FEATURES = [
  {
    title: 'Pressure-test your idea',
    body: 'Structured intake exposes weak spots and surfaces what\'s actually promising before anyone hears your pitch.',
    iconColor: '#a4532b',
    iconBg: '#fce9dc',
    Icon: IconDocument,
  },
  {
    title: 'Analyze people against your hypothesis',
    body: 'Paste a URL or profile. AI crawls public sources and scores learning value for your specific research goal.',
    iconColor: '#2f6b3b',
    iconBg: '#eef7ea',
    Icon: IconSearch,
  },
  {
    title: 'Generate outreach that fits the person',
    body: 'Message, email, and call brief are distinct outputs — each tailored to the channel and persona type.',
    iconColor: '#1d4ed8',
    iconBg: '#eff6ff',
    Icon: IconMail,
  },
  {
    title: 'Build call prep in seconds',
    body: 'Conversation objective, question sequence, signals to watch, and a closing ask for referrals.',
    iconColor: '#6d28d9',
    iconBg: '#f5f3ff',
    Icon: IconPhone,
  },
  {
    title: 'Debrief and improve after every call',
    body: 'Paste notes or transcript. Get coaching on what you missed, what you learned, and who to talk to next.',
    iconColor: '#92400e',
    iconBg: '#fffbeb',
    Icon: IconNote,
  },
  {
    title: 'Watch assumptions evolve',
    body: 'The Project Brief updates after every debrief. See which hypotheses are strengthening and which are weakening.',
    iconColor: '#1e6a7a',
    iconBg: '#ecfeff',
    Icon: IconTrend,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className={styles.page}>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.wordmark}>Startup Foundry</Link>
          <div className={styles.navLinks}>
            <Link href="/login" className={styles.navLogin}>Log in</Link>
            <Link href="/signup" className={styles.navCta}>Get started</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.container}>
          <h1 className={styles.heroHeadline}>
            Your personal AI-powered startup forge.
          </h1>
          <p className={styles.heroSub}>
            Forge your startup idea, find the right people to network with, reach out intelligently,
            and consolidate insights across conversations to build a smarter, more connected founder.
          </p>
          <Link href="/signup" className={styles.ctaButton}>
            Get started for free
          </Link>
          <span className={styles.ctaNote}>No waitlist. No credit card required.</span>
          <HeroTabs />
        </div>
      </section>

      <div className={styles.dotsZone}>
      <div className={styles.divider} />

      {/* ── What You Get ─────────────────────────────────────────────────── */}
      <section className={styles.whatYouGet}>
        <div className={styles.container}>
          <div className={styles.whatYouGetGrid}>
            <div className={styles.whatYouGetItem}>
              <div className={styles.whatYouGetIcon}>
                <IconDocument color="#a4532b" />
              </div>
              <h3 className={styles.whatYouGetTitle}>Project Brief</h3>
              <p className={styles.whatYouGetBody}>
                Pressure-test your idea. Find strengths, weak spots,
                assumptions, and recommended first conversations. <b>Find your moneymaker.</b>
              </p>
            </div>
            <div className={styles.whatYouGetItem}>
              <div className={styles.whatYouGetIcon}>
                <IconPerson color="#a4532b" />
              </div>
              <h3 className={styles.whatYouGetTitle}>Person Analysis</h3>
              <p className={styles.whatYouGetBody}>
                 Get an AI analysis of their learning value, rationale, and interview category. <b>Save time researching before you reach out.</b>
              </p>
            </div>
            <div className={styles.whatYouGetItem}>
              <div className={styles.whatYouGetIcon}>
                <IconChat color="#a4532b" />
              </div>
              <h3 className={styles.whatYouGetTitle}>Conversation Prep</h3>
              <p className={styles.whatYouGetBody}>
                Automatically generate outreach drafts, whether for email or phone calls. <b>Improve your networking outreach.</b>
              </p>
            </div>
            <div className={styles.whatYouGetItem}>
              <div className={styles.whatYouGetIcon}>
                <IconTrend color="#a4532b" />
              </div>
              <h3 className={styles.whatYouGetTitle}>Conversation Insights</h3>
              <p className={styles.whatYouGetBody}>
                Paste your call notes or transcript. Get a debrief with what you actually learned, where you missed something, and how your assumptions are holding up. <b>Learn more from every conversation.</b>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Cards ────────────────────────────────────────────────── */}
      <section className={styles.featureSection}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>What it does</p>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.featureCard}>
                <div className={styles.featureIconWrap} style={{ background: f.iconBg }}>
                  <f.Icon color={f.iconColor} />
                </div>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className={styles.divider} />
</div>{/* ── end dotsZone ── */}

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className={styles.closingCta}>
        <div className={styles.container}>
          <h2 className={styles.closingHeading}>Ready to start?</h2>
          <p className={styles.closingSub}>
            Sign up and start your first project in a few minutes. Free to use.
          </p>
          <Link href="/signup" className={styles.ctaButton}>
            Get started
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerRow1}>
            <span className={styles.footerWordmark}>Startup Foundry</span>
            <div className={styles.footerLinks}>
              <Link href="/privacy" className={styles.footerLink}>Privacy</Link>
              <Link href="/terms" className={styles.footerLink}>Terms</Link>
            </div>
          </div>
          <div className={styles.footerRow2}>
            <span className={styles.footerTagline}>
              Startup Foundry wants to help new founders get to product-market fit faster and with less wasted time and effort. <br />We are in early access and would love to hear from you: <a href="mailto:feedback@startupfoundry.app" className={styles.footerEmail}>feedback@startupfoundry.app</a>
            </span>
            <span className={styles.footerCopy}>&copy; 2026 Startup Foundry</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
