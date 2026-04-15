import { SLOT_ORDER, REQUIRED_SLOTS, type SlotKey, type OnboardingState } from './slot-definitions';

/**
 * Deterministic slot selection — no AI involved.
 *
 * Priority:
 * 1. Required slots that are 'missing'
 * 2. Required slots that are 'weak'
 * 3. Optional slots that are 'missing'
 * 4. null → onboarding is finishable
 */
export function chooseNextSlot(state: OnboardingState): SlotKey | null {
  // Missing required slots first (in order)
  for (const key of SLOT_ORDER) {
    if (REQUIRED_SLOTS.includes(key) && state.completeness[key] === 'missing') {
      return key;
    }
  }

  // Weak required slots (in order)
  for (const key of SLOT_ORDER) {
    if (REQUIRED_SLOTS.includes(key) && state.completeness[key] === 'weak') {
      return key;
    }
  }

  // Optional slots that are missing (in order)
  for (const key of SLOT_ORDER) {
    if (!REQUIRED_SLOTS.includes(key) && state.completeness[key] === 'missing') {
      return key;
    }
  }

  return null;
}

/** Returns true when the required completion threshold is met. */
export function isOnboardingFinishable(state: OnboardingState): boolean {
  const solidCount = REQUIRED_SLOTS.filter(
    (k) => state.completeness[k] === 'solid',
  ).length;

  const noneAreMissing = REQUIRED_SLOTS.every(
    (k) => state.completeness[k] !== 'missing',
  );

  // At least 3 of 5 required slots solid, and none are still missing
  return noneAreMissing && solidCount >= 3;
}
