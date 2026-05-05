import type { AIProvider } from '@/ai/providers/base';
import { anthropicProvider } from '@/ai/providers/anthropic';
import { openaiProvider } from '@/ai/providers/openai';
import { geminiProvider } from '@/ai/providers/gemini';
import { env } from '@/lib/server-env';

export type AITaskName =
  | 'onboarding.extractKickoffIdea'
  | 'onboarding.generateNextQuestionWithChoices'
  | 'onboarding.extractCustomSlotAnswer'
  | 'foundation.generateFoundationFromOnboarding';

type ModelRoute = {
  provider: AIProvider;
  model: string;
};

function getConfiguredProvider(): 'anthropic' | 'openai' | 'gemini' {
  return env.AI_PROVIDER;
}

const DEFAULT_MODELS: Record<'anthropic' | 'openai' | 'gemini', string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
};

const TASK_ROUTES: Record<AITaskName, Record<'anthropic' | 'openai' | 'gemini', string>> = {
  'onboarding.extractKickoffIdea': DEFAULT_MODELS,
  'onboarding.generateNextQuestionWithChoices': DEFAULT_MODELS,
  'onboarding.extractCustomSlotAnswer': DEFAULT_MODELS,
  'foundation.generateFoundationFromOnboarding': DEFAULT_MODELS,
};

const PROVIDERS: Record<'anthropic' | 'openai' | 'gemini', AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
};

export function resolveRoute(taskName: AITaskName): ModelRoute {
  const providerName = getConfiguredProvider();
  const modelByProvider = TASK_ROUTES[taskName];

  return {
    provider: PROVIDERS[providerName],
    model: modelByProvider[providerName],
  };
}
