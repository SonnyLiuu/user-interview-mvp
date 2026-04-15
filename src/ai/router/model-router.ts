import type { AIProvider } from '@/ai/providers/base';
import { anthropicProvider } from '@/ai/providers/anthropic';
import { openaiProvider } from '@/ai/providers/openai';

export type AITaskName =
  | 'onboarding.extractKickoffIdea'
  | 'onboarding.generateNextQuestionWithChoices'
  | 'onboarding.extractCustomSlotAnswer'
  | 'foundation.generateFoundationFromOnboarding';

type ModelRoute = {
  provider: AIProvider;
  model: string;
};

function getConfiguredProvider(): 'anthropic' | 'openai' {
  return process.env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
}

const DEFAULT_MODELS: Record<'anthropic' | 'openai', string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
};

const TASK_ROUTES: Record<AITaskName, Record<'anthropic' | 'openai', string>> = {
  'onboarding.extractKickoffIdea': DEFAULT_MODELS,
  'onboarding.generateNextQuestionWithChoices': DEFAULT_MODELS,
  'onboarding.extractCustomSlotAnswer': DEFAULT_MODELS,
  'foundation.generateFoundationFromOnboarding': DEFAULT_MODELS,
};

export function resolveRoute(taskName: AITaskName): ModelRoute {
  const providerName = getConfiguredProvider();
  const modelByProvider = TASK_ROUTES[taskName];

  return {
    provider: providerName === 'anthropic' ? anthropicProvider : openaiProvider,
    model: modelByProvider[providerName],
  };
}
