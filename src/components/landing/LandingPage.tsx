import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  OUTREACH_PROJECT_TYPE_CONFIGS,
  VISIBLE_OUTREACH_PROJECT_TYPES,
} from '@/lib/outreach-projects';
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

function IconTarget({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke={color} strokeWidth="1.4"/>
      <circle cx="9" cy="9" r="2.5" stroke={color} strokeWidth="1.4"/>
      <line x1="9" y1="1.5" x2="9" y2="4" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="9" y1="14" x2="9" y2="16.5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="1.5" y1="9" x2="4" y2="9" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="14" y1="9" x2="16.5" y2="9" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconUsers({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6" r="2.5" stroke={color} strokeWidth="1.4"/>
      <path d="M2 15c0-2.6 2-4.5 4.5-4.5S11 12.4 11 15" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M11.5 4.2a2.2 2.2 0 0 1 0 4.1" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M12 10.8c2.2.3 3.8 1.9 3.8 4.2" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconBriefcase({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="14" height="10" rx="2" stroke={color} strokeWidth="1.4"/>
      <path d="M6.5 5V3.8A1.8 1.8 0 0 1 8.3 2h1.4a1.8 1.8 0 0 1 1.8 1.8V5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M2 8.5h14" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconChains({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M7.2 5.4 8.6 4a3 3 0 0 1 4.2 0l1.2 1.2a3 3 0 0 1 0 4.2l-1.4 1.4" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M10.8 12.6 9.4 14a3 3 0 0 1-4.2 0L4 12.8a3 3 0 0 1 0-4.2l1.4-1.4" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M7.2 10.8 10.8 7.2" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconUserPlus({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="7" cy="6" r="3" stroke={color} strokeWidth="1.4"/>
      <path d="M2 16c0-3 2.2-5 5-5 1.6 0 3 .6 3.9 1.6" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M14 9.5v5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M11.5 12h5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconSparkles({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M8.5 2.5 9.8 6l3.7 1.3-3.7 1.3-1.3 3.9-1.3-3.9-3.7-1.3L7.2 6l1.3-3.5z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M14 11.5l.6 1.5 1.4.5-1.4.5-.6 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5z" stroke={color} strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  );
}

function IconMegaphone({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 10h3l7 3.5v-9L6 8H3a1.5 1.5 0 0 0 0 3z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M6 10.5 7 15" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M15 7.2c.6.5.9 1.1.9 1.8s-.3 1.3-.9 1.8" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

// ── Project type data ────────────────────────────────────────────────────────

type LandingIcon = ComponentType<{ color: string }>;

const PROJECT_ICON_MAP: Record<string, LandingIcon> = {
  search: IconSearch,
  target: IconTarget,
  users: IconUsers,
  briefcase: IconBriefcase,
  handshake: IconChains,
  'user-plus': IconUserPlus,
  sparkles: IconSparkles,
  megaphone: IconMegaphone,
};

const PROJECT_CARD_COLORS = [
  { iconColor: '#a4532b', iconBg: '#fce9dc' },
  { iconColor: '#2f6b3b', iconBg: '#eef7ea' },
  { iconColor: '#1d4ed8', iconBg: '#eff6ff' },
  { iconColor: '#6d28d9', iconBg: '#f5f3ff' },
  { iconColor: '#1e6a7a', iconBg: '#ecfeff' },
  { iconColor: '#92400e', iconBg: '#fffbeb' },
  { iconColor: '#9f1239', iconBg: '#fff1f3' },
  { iconColor: '#365314', iconBg: '#f7fee7' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className={styles.page}>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.wordmark}>User Interview</Link>
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
            Your AI-native startup outreach workspace.
          </h1>
          <p className={styles.heroSub}>
            Automate the research, keep your human touch. Pressure-test ideas, find the right people to talk to, and get help preparing and debriefing every conversation. All in one place. 
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
      <section id="outreach-projects" className={styles.featureSection}>
        <div className={styles.container}>
          <div className={styles.featureHeader}>
            <p className={styles.eyebrow}>What it does</p>
            <h2 className={styles.featureHeading}>Run the outreach project your startup needs next.</h2>
            <p className={styles.featureIntro}>
              Start with Idea Validation today, then use the same research, people analysis, prep, and debrief workflow across every kind of founder outreach.
            </p>
          </div>
          <div className={styles.featureGrid}>
            {VISIBLE_OUTREACH_PROJECT_TYPES.map((type, index) => {
              const config = OUTREACH_PROJECT_TYPE_CONFIGS[type];
              const Icon = PROJECT_ICON_MAP[config.iconKey] ?? IconDocument;
              const colors = PROJECT_CARD_COLORS[index % PROJECT_CARD_COLORS.length];
              const isActive = config.availability === 'active';

              return (
                <div key={config.type} className={styles.featureCard}>
                  <div className={styles.featureTopRow}>
                    <div className={styles.featureIconWrap} style={{ background: colors.iconBg }}>
                      <Icon color={colors.iconColor} />
                    </div>
                    <span
                      className={[
                        styles.featureStatus,
                        isActive ? styles.featureStatusActive : styles.featureStatusSoon,
                      ].join(' ')}
                    >
                      {isActive ? 'Available now' : 'Coming soon'}
                    </span>
                  </div>
                  <h3 className={styles.featureTitle}>{config.label}</h3>
                  <p className={styles.featureBody}>{config.description}</p>
                  <p className={styles.featurePurpose}>{config.purpose}</p>
                  {isActive && (
                    <Link
                      href={`/projects/${config.type.replaceAll('_', '-')}`}
                      className={styles.featureLink}
                      aria-label={`Learn more about ${config.label}`}
                    >
                      See how it works <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </div>
              );
            })}
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
            <span className={styles.footerWordmark}>User Interview</span>
            <div className={styles.footerLinks}>
              <Link href="/privacy" className={styles.footerLink}>Privacy</Link>
              <Link href="/terms" className={styles.footerLink}>Terms</Link>
            </div>
          </div>
          <div className={styles.footerRow2}>
            <span className={styles.footerTagline}>
              User Interview helps new founders get to product-market fit faster and with less wasted time and effort. <br />We are in early access and would love to hear from you: <a href="mailto:feedback@userinterview.app" className={styles.footerEmail}>feedback@userinterview.app</a>
            </span>
            <span className={styles.footerCopy}>&copy; 2026 User Interview</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
