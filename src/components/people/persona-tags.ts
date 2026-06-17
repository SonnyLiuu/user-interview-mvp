import type { OutreachProjectType } from '@/lib/backend-types';
import type { GlobalPersonTags } from '@/lib/db/schema';

export type PersonaType =
  | 'potential_user'
  | 'buyer'
  | 'operator'
  | 'domain_expert'
  | 'skeptic'
  | 'connector';

export type PersonaTagMode = 'idea_validation' | 'none';

export type PersonaTag = {
  key: 'target_user' | 'builder' | 'domain_expert';
  label: string;
  pluralLabel: string;
};

const IDEA_VALIDATION_TAGS: Record<PersonaTag['key'], PersonaTag> = {
  target_user: {
    key: 'target_user',
    label: 'Target user',
    pluralLabel: 'target users',
  },
  builder: {
    key: 'builder',
    label: 'Builder',
    pluralLabel: 'builders',
  },
  domain_expert: {
    key: 'domain_expert',
    label: 'Domain expert',
    pluralLabel: 'domain experts',
  },
};

export function tagModeForOutreachProjectType(
  type: OutreachProjectType | string | null | undefined,
): PersonaTagMode {
  return type === 'idea_validation' ? 'idea_validation' : 'none';
}

export function getPersonaTag(
  personaType: string | null | undefined,
  mode: PersonaTagMode,
): PersonaTag | null {
  if (!personaType || mode === 'none') return null;

  if (mode === 'idea_validation') {
    if (personaType === 'potential_user' || personaType === 'buyer') {
      return IDEA_VALIDATION_TAGS.target_user;
    }
    if (personaType === 'operator') return IDEA_VALIDATION_TAGS.builder;
    if (personaType === 'domain_expert') return IDEA_VALIDATION_TAGS.domain_expert;
  }

  return null;
}

function hasAny(values: string[] | null | undefined, candidates: readonly string[]) {
  if (!values?.length) return false;
  const set = new Set(values);
  return candidates.some((candidate) => set.has(candidate));
}

export function getPersonaTags(
  personaType: string | null | undefined,
  globalTags: GlobalPersonTags | null | undefined,
  mode: PersonaTagMode,
): PersonaTag[] {
  if (mode === 'none') return [];

  const keys = new Set<PersonaTag['key']>();
  const primary = getPersonaTag(personaType, mode);
  if (primary) keys.add(primary.key);

  if (mode === 'idea_validation') {
    if (
      hasAny(globalTags?.role_tags, ['buyer', 'end_user']) ||
      hasAny(globalTags?.seniority_tags, ['budget_owner', 'economic_buyer']) ||
      hasAny(globalTags?.learning_value_tags, [
        'has_problem_experience',
        'owns_workflow',
        'buys_solutions',
        'evaluates_tools',
        'tried_workarounds',
        'power_user',
      ])
    ) {
      keys.add('target_user');
    }

    if (
      hasAny(globalTags?.role_tags, ['founder', 'former_founder', 'operator', 'product_leader', 'engineer', 'designer']) ||
      hasAny(globalTags?.seniority_tags, ['founder_ceo', 'technical_decision_maker'])
    ) {
      keys.add('builder');
    }

    if (
      hasAny(globalTags?.role_tags, ['domain_expert', 'advisor', 'investor']) ||
      hasAny(globalTags?.learning_value_tags, ['adjacent_expert', 'can_explain_market'])
    ) {
      keys.add('domain_expert');
    }
  }

  return visiblePersonaTagsForMode(mode).filter((tag) => keys.has(tag.key));
}

export function visiblePersonaTagsForMode(mode: PersonaTagMode): PersonaTag[] {
  if (mode === 'idea_validation') {
    return [
      IDEA_VALIDATION_TAGS.target_user,
      IDEA_VALIDATION_TAGS.builder,
      IDEA_VALIDATION_TAGS.domain_expert,
    ];
  }

  return [];
}
