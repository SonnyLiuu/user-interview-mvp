export const SLOT_KEYS = [
  'ideaSummary',
  'targetUser',
  'painPoint',
  'valueProp',
  'idealPeopleTypes',
  'differentiation',
  'disqualifiers',
] as const;

export type SlotKey = (typeof SLOT_KEYS)[number];

export const REQUIRED_SLOTS: SlotKey[] = [
  'ideaSummary',
  'targetUser',
  'painPoint',
  'valueProp',
  'idealPeopleTypes',
];

export const OPTIONAL_SLOTS: SlotKey[] = ['differentiation', 'disqualifiers'];

// Deterministic progression order — app logic uses this, not AI
export const SLOT_ORDER: SlotKey[] = [
  'ideaSummary',
  'targetUser',
  'painPoint',
  'valueProp',
  'idealPeopleTypes',
  'differentiation',
  'disqualifiers',
];

export type SlotQuality = 'missing' | 'weak' | 'solid';

export type OnboardingState = {
  ideaSummary: string | null;
  targetUser: string | null;
  painPoint: string | null;
  valueProp: string | null;
  idealPeopleTypes: string[];
  differentiation: string | null;
  disqualifiers: string[];
  completeness: Record<SlotKey, SlotQuality>;
};

export function emptyOnboardingState(): OnboardingState {
  const completeness = Object.fromEntries(
    SLOT_KEYS.map((k) => [k, 'missing' as SlotQuality]),
  ) as Record<SlotKey, SlotQuality>;

  return {
    ideaSummary: null,
    targetUser: null,
    painPoint: null,
    valueProp: null,
    idealPeopleTypes: [],
    differentiation: null,
    disqualifiers: [],
    completeness,
  };
}
