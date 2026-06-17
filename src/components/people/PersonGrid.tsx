import type { Person, PersonAnalysis } from '@/lib/db/schema';
import { PersonCard } from './PersonCard';
import { getPersonaTags, visiblePersonaTagsForMode, type PersonaTagMode } from './persona-tags';
import styles from './PersonGrid.module.css';

type Props = {
  people: Person[];
  searchActive?: boolean;
  projectId: string;
  outreachProjectId?: string | null;
  tagMode: PersonaTagMode;
  slug: string;
  onPersonCreated: (person: Person) => void;
  onPersonUpdated: (person: Person) => void;
  onPersonDeleted: (personId: string) => void;
};

function coverageGap(people: Person[], tagMode: PersonaTagMode): string | null {
  const filled = people.filter((p) => p.analysis_status === 'complete');
  if (filled.length < 3) return null;

  const counts: Record<string, number> = {};
  for (const p of filled) {
    const analysis = p.analysis as PersonAnalysis | null;
    const tags = getPersonaTags(p.persona_type, analysis?.global_tags, tagMode);
    for (const tag of tags) {
      counts[tag.key] = (counts[tag.key] ?? 0) + 1;
    }
  }

  const tags = visiblePersonaTagsForMode(tagMode);
  if (tags.length === 0) return null;

  const missing = tags.filter((tag) => !counts[tag.key]);
  if (!missing.length) return null;

  const labels = Object.fromEntries(tags.map((tag) => [tag.key, tag.pluralLabel]));

  const present = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([tagKey, n]) => `${n} ${labels[tagKey] ?? tagKey}`)
    .join(' and ');

  const gap = missing[0].pluralLabel;
  if (!present) return `You have 0 ${gap}.`;

  return `You have ${present} and 0 ${gap}.`;
}

export function PersonGrid({
  people,
  searchActive = false,
  projectId,
  outreachProjectId,
  tagMode,
  slug,
  onPersonCreated,
  onPersonUpdated,
  onPersonDeleted,
}: Props) {
  // Always have at least 6 slots; add a new row of 3 whenever all slots are filled
  const minSlots = Math.max(9, people.length + 1);
  const totalSlots = Math.ceil(minSlots / 3) * 3;

  const slots = searchActive
    ? people
    : Array.from({ length: totalSlots }, (_, i) => people[i] ?? undefined);
  const firstEmptyIdx = slots.findIndex((s) => !s);

  const gap = searchActive ? null : coverageGap(people, tagMode);

  return (
    <div className={styles.wrap}>
      {gap && (
        <p className={styles.gapBanner} role="status">{gap}</p>
      )}
      {searchActive && people.length === 0 ? (
        <p className={styles.searchEmpty} role="status">No people match your search.</p>
      ) : (
        <div className={styles.grid}>
          {slots.map((person, idx) => (
            <PersonCard
              key={person?.id ?? `empty-${idx}`}
              person={person}
              isFirstEmpty={idx === firstEmptyIdx}
              projectId={projectId}
              outreachProjectId={outreachProjectId}
              tagMode={tagMode}
              slug={slug}
              onCreated={onPersonCreated}
              onUpdated={onPersonUpdated}
              onDeleted={onPersonDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
