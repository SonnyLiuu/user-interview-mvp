import type { GeneratedChoice } from '@/ai/tasks/onboarding/generate-next-question';
import type { SlotKey } from './slot-definitions';

type ValidationResult = { valid: true } | { valid: false; reason: string };

export function validateChoices(
  choices: GeneratedChoice[],
  targetSlot: SlotKey,
): ValidationResult {
  if (choices.length < 3 || choices.length > 5) {
    return { valid: false, reason: `Expected 3–5 choices, got ${choices.length}` };
  }

  for (const c of choices) {
    if (!c.id || !c.label || !c.normalizedValue) {
      return { valid: false, reason: 'Choice missing required fields' };
    }
    if (c.label.length > 120) {
      return { valid: false, reason: `Choice label too long: "${c.label}"` };
    }
    if (c.slotKey !== targetSlot) {
      return { valid: false, reason: `Choice slotKey mismatch: expected ${targetSlot}` };
    }
  }

  const labels = choices.map((c) => c.label.toLowerCase().trim());
  const unique = new Set(labels);
  if (unique.size !== labels.length) {
    return { valid: false, reason: 'Duplicate choice labels' };
  }

  return { valid: true };
}
