import styles from './PersonaBubble.module.css';

export type PersonaType =
  | 'potential_user'
  | 'buyer'
  | 'operator'
  | 'domain_expert'
  | 'skeptic'
  | 'connector';

const CONFIG: Record<PersonaType, { label: string; icon: React.ReactNode; mod: string }> = {
  potential_user: {
    label: 'Potential user',
    mod: styles.user,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 13.5c0-3.04 2.46-5.5 5.5-5.5s5.5 2.46 5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  buyer: {
    label: 'Buyer',
    mod: styles.buyer,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="5" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 5V4a3 3 0 0 1 6 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  operator: {
    label: 'Operator',
    mod: styles.operator,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.5 3.5l.7.7M11.8 11.8l.7.7M3.5 12.5l.7-.7M11.8 4.2l.7-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  domain_expert: {
    label: 'Domain expert',
    mod: styles.expert,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2a4 4 0 0 1 4 4c0 1.8-1.2 3.3-2.8 3.8L9 13H7l-.2-3.2A4 4 0 0 1 4 6a4 4 0 0 1 4-4z" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.5 14h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  skeptic: {
    label: 'Skeptic',
    mod: styles.skeptic,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.5 6.5c0-1 .5-1.5 1.5-1.5s1.5.5 1.5 1.5c0 .75-.5 1.1-1 1.4C8 8.2 8 8.5 8 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="11" r=".8" fill="currentColor" />
      </svg>
    ),
  },
  connector: {
    label: 'Connector',
    mod: styles.connector,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="3" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="13" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="13" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.3" />
        <path d="M4.8 8l6.4-3.2M4.8 8l6.4 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
};

export function PersonaBubble({ type }: { type: PersonaType }) {
  const cfg = CONFIG[type];
  if (!cfg) return null;
  return (
    <span className={`${styles.bubble} ${cfg.mod}`}>
      <span className={styles.icon}>{cfg.icon}</span>
      <span className={styles.label}>{cfg.label}</span>
    </span>
  );
}
