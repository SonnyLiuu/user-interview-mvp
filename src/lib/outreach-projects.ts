import type {
  OutreachProjectAvailability,
  OutreachProjectType,
  OutreachProjectTypeConfig,
} from './backend-types';

export const OUTREACH_PROJECT_TYPE_CONFIGS: Record<OutreachProjectType, OutreachProjectTypeConfig> = {
  idea_validation: {
    type: 'idea_validation',
    label: 'Idea Validation',
    description: 'Learn from target users, customers, buyers, or market experts before selling.',
    purpose: 'Learn, not sell.',
    iconKey: 'search',
    availability: 'active',
  },
  customer_acquisition: {
    type: 'customer_acquisition',
    label: 'Customer Acquisition',
    description: 'Book qualified demos or sales calls.',
    purpose: 'Turn qualified prospects into sales conversations.',
    iconKey: 'target',
    availability: 'coming_soon',
  },
  beta_users: {
    type: 'beta_users',
    label: 'Finding Beta Users',
    description: 'Find early users or design partners who will shape the product.',
    purpose: 'Recruit early users who actively help shape the product.',
    iconKey: 'users',
    availability: 'coming_soon',
  },
  investor: {
    type: 'investor',
    label: 'Investor Outreach',
    description: 'Get meetings with relevant investors.',
    purpose: "Reach investors who fit the startup's stage, market, and raise.",
    iconKey: 'briefcase',
    availability: 'coming_soon',
  },
  partnership: {
    type: 'partnership',
    label: 'Partnership Outreach',
    description: 'Create mutual value with another company.',
    purpose: 'Start business development conversations with clear mutual value.',
    iconKey: 'handshake',
    availability: 'coming_soon',
  },
  recruiting: {
    type: 'recruiting',
    label: 'Recruiting Outreach',
    description: 'Find candidates, collaborators, or founding team members.',
    purpose: 'Reach people who could join or meaningfully contribute.',
    iconKey: 'user-plus',
    availability: 'coming_soon',
  },
  advisor: {
    type: 'advisor',
    label: 'Advisor Outreach',
    description: 'Get advice, credibility, or strategic support.',
    purpose: 'Reach advisors who can improve judgment, credibility, or access.',
    iconKey: 'sparkles',
    availability: 'coming_soon',
  },
  press_creator: {
    type: 'press_creator',
    label: 'Press / Creator Outreach',
    description: 'Get coverage, distribution, or attention.',
    purpose: 'Reach press, creators, or influencers for distribution.',
    iconKey: 'megaphone',
    availability: 'coming_soon',
  },
};

export const OUTREACH_PROJECT_TYPES = Object.keys(OUTREACH_PROJECT_TYPE_CONFIGS) as [
  OutreachProjectType,
  ...OutreachProjectType[],
];

export const ACTIVE_OUTREACH_PROJECT_TYPES = OUTREACH_PROJECT_TYPES.filter(
  (type) => OUTREACH_PROJECT_TYPE_CONFIGS[type].availability === 'active',
) as [OutreachProjectType, ...OutreachProjectType[]];

export const VISIBLE_OUTREACH_PROJECT_TYPES = OUTREACH_PROJECT_TYPES.filter(
  (type) => OUTREACH_PROJECT_TYPE_CONFIGS[type].availability !== 'hidden',
) as [OutreachProjectType, ...OutreachProjectType[]];

export function getOutreachProjectTypeConfig(
  type: OutreachProjectType | string | null | undefined,
): OutreachProjectTypeConfig {
  return OUTREACH_PROJECT_TYPE_CONFIGS[type as OutreachProjectType] ?? OUTREACH_PROJECT_TYPE_CONFIGS.idea_validation;
}

export function isOutreachProjectTypeAvailable(
  type: OutreachProjectType | string | null | undefined,
  availability: OutreachProjectAvailability = 'active',
) {
  return getOutreachProjectTypeConfig(type).availability === availability;
}
