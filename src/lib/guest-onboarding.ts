import type { EntryGoal, Foundation } from '@/lib/backend-types';

export const GUEST_ONBOARDING_COOKIE = 'ui_guest_onboarding';
export const GUEST_ONBOARDING_MAX_AGE = 60 * 60 * 24 * 7;

export type GuestOnboardingProfile = {
  startupStage?: string;
  entryGoal?: EntryGoal;
};

export type GuestOnboardingStatus = {
  projectId: string;
  profile: GuestOnboardingProfile;
  sessionStatus: 'new' | 'active' | 'ready' | 'completed';
  hasFoundation: boolean;
  expiresAt: string;
};

export type GuestFoundationPreview = {
  foundation: Foundation;
};
