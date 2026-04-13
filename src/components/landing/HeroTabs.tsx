'use client';

import { useState } from 'react';
import styles from './LandingPage.module.css';

const TABS = ['Project Brief', 'Person Analysis', 'Conversation Prep', 'Conversation Insights'] as const;
type Tab = typeof TABS[number];

function ProjectBriefMockup() {
  return (
    <>
      <p className={styles.mockupCardTitle}>Project Brief</p>
      <div className={styles.mockupDivider} />
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Idea summary</span>
        <p className={styles.mockupRow} style={{ display: 'block', lineHeight: 1.5 }}>
          AI-assisted discovery for early-stage founders — enters before outreach.
        </p>
      </div>
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Assumptions</span>
        <div className={styles.mockupRow}>
          <span style={{ color: '#7c6854', flexShrink: 0 }}>●</span>
          <span style={{ flex: 1 }}>Pain is acute enough</span>
          <span className={`${styles.badge} ${styles.badgeStrengthened}`}>strengthened</span>
        </div>
        <div className={styles.mockupRow}>
          <span style={{ color: '#7c6854', flexShrink: 0 }}>●</span>
          <span style={{ flex: 1 }}>Budget holders exist</span>
          <span className={`${styles.badge} ${styles.badgeUnvalidated}`}>unvalidated</span>
        </div>
        <div className={styles.mockupRow}>
          <span style={{ color: '#7c6854', flexShrink: 0 }}>●</span>
          <span style={{ flex: 1 }}>No good solution today</span>
          <span className={`${styles.badge} ${styles.badgeWeakened}`}>weakened</span>
        </div>
      </div>
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Recommended conversations</span>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`}>→ 2 potential users</div>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`}>→ 1 budget holder · 1 skeptic</div>
      </div>
    </>
  );
}

function PersonAnalysisMockup() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div>
          <p className={styles.mockupCardTitle}>Sarah Chen</p>
          <p className={styles.mockupCardSub}>Head of Product · Stripe</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <span className={`${styles.badge} ${styles.badgePersona}`}>potential_user</span>
        <span className={`${styles.badge} ${styles.badgeValue}`}>high value</span>
      </div>
      <div className={styles.mockupDivider} />
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Learning value</span>
        <p className={styles.mockupRow} style={{ display: 'block', lineHeight: 1.5 }}>
          Direct experience with founder tooling decisions at early growth stage.
        </p>
      </div>
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Interview category</span>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`}>→ Problem validation</div>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`}>→ Workflow & tooling</div>
      </div>
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Suggested angle</span>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`}>→ Pain with existing tools</div>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`}>→ Budget authority on tooling</div>
      </div>
    </>
  );
}

function ConversationPrepMockup() {
  return (
    <>
      <p className={styles.mockupCardTitle}>Conversation Prep · Sarah Chen</p>
      <div className={styles.mockupDivider} />
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Outreach draft</span>
        <p className={styles.mockupRow} style={{ display: 'block', lineHeight: 1.5 }}>
          Hi Sarah — I&apos;m exploring how early-stage founders manage discovery. Your experience at Stripe seems directly relevant. Would you be open to a 15-min call?
        </p>
      </div>
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Call objective</span>
        <p className={styles.mockupRow} style={{ display: 'block', lineHeight: 1.5 }}>
          Understand her discovery workflow and pain points with current tools.
        </p>
      </div>
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Top questions</span>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`} style={{ alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0 }}>1.</span>
          <span>Walk me through your last discovery sprint — what tools did you use?</span>
        </div>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`} style={{ alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0 }}>2.</span>
          <span>Where did things fall through the cracks after the calls?</span>
        </div>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`} style={{ alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0 }}>3.</span>
          <span>Who else should I talk to?</span>
        </div>
      </div>
    </>
  );
}

function ConversationInsightsMockup() {
  return (
    <>
      <p className={styles.mockupCardTitle}>Conversation Insights · Sarah Chen</p>
      <div className={styles.mockupDivider} />
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>What you learned</span>
        <p className={styles.mockupRow} style={{ display: 'block', lineHeight: 1.5 }}>
          Discovery workflow is manual and fragmented. No single tool handles both outreach and synthesis.
        </p>
      </div>
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>Assumption updates</span>
        <div className={styles.mockupRow}>
          <span style={{ color: '#7c6854', flexShrink: 0 }}>●</span>
          <span style={{ flex: 1 }}>Pain is acute enough</span>
          <span className={`${styles.badge} ${styles.badgeStrengthened}`}>strengthened</span>
        </div>
        <div className={styles.mockupRow}>
          <span style={{ color: '#7c6854', flexShrink: 0 }}>●</span>
          <span style={{ flex: 1 }}>No good solution today</span>
          <span className={`${styles.badge} ${styles.badgeStrengthened}`}>strengthened</span>
        </div>
      </div>
      <div className={styles.mockupSection}>
        <span className={styles.mockupLabel}>What you missed</span>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`}>→ Didn&apos;t ask about budget authority</div>
        <div className={`${styles.mockupRow} ${styles.mockupRowMuted}`}>→ No closing ask for referrals</div>
      </div>
    </>
  );
}

export function HeroTabs() {
  const [active, setActive] = useState<Tab>('Project Brief');

  return (
    <div className={styles.heroTabs}>
      <div className={styles.tabStrip}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`${styles.tab} ${active === tab ? styles.tabActive : ''}`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className={styles.mockupCard}>
        {active === 'Project Brief' && <ProjectBriefMockup />}
        {active === 'Person Analysis' && <PersonAnalysisMockup />}
        {active === 'Conversation Prep' && <ConversationPrepMockup />}
        {active === 'Conversation Insights' && <ConversationInsightsMockup />}
      </div>
    </div>
  );
}
