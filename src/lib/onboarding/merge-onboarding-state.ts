import { type SlotKey, type SlotQuality, type OnboardingState } from './slot-definitions';

type SlotPatch = {
  slotKey: SlotKey;
  value: string | string[];
  quality: SlotQuality;
};

/**
 * Merges a single slot update into the existing onboarding state.
 * Returns a new state object (does not mutate).
 */
export function mergeSlotPatch(state: OnboardingState, patch: SlotPatch): OnboardingState {
  const { slotKey, value, quality } = patch;

  const next: OnboardingState = {
    ...state,
    completeness: { ...state.completeness, [slotKey]: quality },
  };

  if (slotKey === 'idealPeopleTypes' || slotKey === 'disqualifiers') {
    next[slotKey] = Array.isArray(value) ? value : [value as string];
  } else {
    // All other slots are string | null
    (next as Record<string, unknown>)[slotKey] = Array.isArray(value)
      ? value.join(', ')
      : (value as string);
  }

  return next;
}

/**
 * Merges the kickoff extraction result into onboarding state.
 */
export function mergeKickoffIdea(
  state: OnboardingState,
  ideaSummary: string,
  quality: 'weak' | 'solid',
): OnboardingState {
  return mergeSlotPatch(state, {
    slotKey: 'ideaSummary',
    value: ideaSummary,
    quality,
  });
}
