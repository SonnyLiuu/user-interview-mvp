import styles from './PersonaBubble.module.css';
import { getPersonaTag, type PersonaTag, type PersonaTagMode, type PersonaType } from './persona-tags';

export type { PersonaTagMode, PersonaType } from './persona-tags';

const CONFIG: Record<PersonaTag['key'], { icon: React.ReactNode; mod: string }> = {
  target_user: {
    mod: styles.user,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 13.5c0-3.04 2.46-5.5 5.5-5.5s5.5 2.46 5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  builder: {
    mod: styles.operator,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.5 3.5l.7.7M11.8 11.8l.7.7M3.5 12.5l.7-.7M11.8 4.2l.7-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  domain_expert: {
    mod: styles.expert,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2a4 4 0 0 1 4 4c0 1.8-1.2 3.3-2.8 3.8L9 13H7l-.2-3.2A4 4 0 0 1 4 6a4 4 0 0 1 4-4z" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.5 14h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
};

type Props =
  | { tag: PersonaTag }
  | { type: PersonaType; mode: PersonaTagMode };

export function PersonaBubble(props: Props) {
  const tag = 'tag' in props ? props.tag : getPersonaTag(props.type, props.mode);
  if (!tag) return null;

  const cfg = CONFIG[tag.key];
  if (!cfg) return null;
  return (
    <span className={`${styles.bubble} ${cfg.mod}`}>
      <span className={styles.icon}>{cfg.icon}</span>
      <span className={styles.label}>{tag.label}</span>
    </span>
  );
}
