import 'server-only';

export const newProjectOnboardingChatEnabled =
  process.env.NEW_PROJECT_ONBOARDING_CHAT_ENABLED !== 'false';

export const outreachProjectOnboardingChatEnabled =
  process.env.OUTREACH_PROJECT_ONBOARDING_CHAT_ENABLED === 'true';
