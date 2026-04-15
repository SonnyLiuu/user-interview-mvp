import type { GeneratedChoice } from '@/ai/tasks/onboarding/generate-next-question';
import type { SlotKey } from './slot-definitions';

const FALLBACKS: Record<SlotKey, { question: string; choices: Omit<GeneratedChoice, 'slotKey'>[]; customPlaceholder: string }> = {
  ideaSummary: {
    question: "What are you building?",
    choices: [
      { id: 'a', label: 'A SaaS tool for businesses', normalizedValue: 'A SaaS tool for businesses' },
      { id: 'b', label: 'A consumer app', normalizedValue: 'A consumer app' },
      { id: 'c', label: 'A marketplace connecting two groups', normalizedValue: 'A marketplace connecting two groups' },
      { id: 'd', label: 'A services business with AI/software support', normalizedValue: 'A services business with AI/software support' },
    ],
    customPlaceholder: 'Describe what you\'re building in a sentence or two...',
  },
  targetUser: {
    question: "Who is the primary person you're building this for?",
    choices: [
      { id: 'a', label: 'Individual professionals / knowledge workers', normalizedValue: 'Individual professionals or knowledge workers' },
      { id: 'b', label: 'Small business owners', normalizedValue: 'Small business owners' },
      { id: 'c', label: 'Teams at mid-size companies', normalizedValue: 'Teams at mid-size companies' },
      { id: 'd', label: 'Enterprise teams', normalizedValue: 'Enterprise teams' },
      { id: 'e', label: 'Consumers / general public', normalizedValue: 'Consumers or general public' },
    ],
    customPlaceholder: 'Describe the primary person you\'re building this for...',
  },
  painPoint: {
    question: "What's the core problem this solves?",
    choices: [
      { id: 'a', label: 'Too much manual work / repetitive tasks', normalizedValue: 'Too much manual or repetitive work' },
      { id: 'b', label: 'Hard to find the right information', normalizedValue: 'Difficulty finding the right information' },
      { id: 'c', label: 'Coordination or communication breakdown', normalizedValue: 'Coordination or communication breakdown' },
      { id: 'd', label: 'Existing tools are too complex or expensive', normalizedValue: 'Existing tools are too complex or expensive' },
    ],
    customPlaceholder: 'Describe the core problem in your own words...',
  },
  valueProp: {
    question: "What's the main value you deliver?",
    choices: [
      { id: 'a', label: 'Save significant time', normalizedValue: 'Saves significant time' },
      { id: 'b', label: 'Reduce cost', normalizedValue: 'Reduces cost' },
      { id: 'c', label: 'Improve quality of outcomes', normalizedValue: 'Improves quality of outcomes' },
      { id: 'd', label: 'Remove painful friction', normalizedValue: 'Removes painful friction from a workflow' },
    ],
    customPlaceholder: 'Describe the specific value you deliver...',
  },
  idealPeopleTypes: {
    question: "Who would be ideal early users or customers?",
    choices: [
      { id: 'a', label: 'Founders at early-stage startups', normalizedValue: 'Founders at early-stage startups' },
      { id: 'b', label: 'Operators at SMBs (10–200 employees)', normalizedValue: 'Operators at small to mid-size businesses' },
      { id: 'c', label: 'Domain experts / practitioners', normalizedValue: 'Domain experts or practitioners in the field' },
      { id: 'd', label: 'Power users of existing incumbent tools', normalizedValue: 'Power users frustrated with existing tools' },
    ],
    customPlaceholder: 'Describe your ideal early user...',
  },
  differentiation: {
    question: "What makes this different from existing solutions?",
    choices: [
      { id: 'a', label: 'Much simpler / lower friction', normalizedValue: 'Much simpler and lower friction than alternatives' },
      { id: 'b', label: 'Focused on a specific niche others ignore', normalizedValue: 'Focused on a niche the incumbent tools ignore' },
      { id: 'c', label: 'AI-native workflow vs legacy tool', normalizedValue: 'AI-native approach vs legacy tools' },
      { id: 'd', label: 'Better price-to-value ratio', normalizedValue: 'Better price-to-value ratio' },
    ],
    customPlaceholder: 'Describe what makes your approach different...',
  },
  disqualifiers: {
    question: "Who would NOT be a good fit?",
    choices: [
      { id: 'a', label: 'Enterprise companies with strict compliance', normalizedValue: 'Enterprise companies with strict compliance requirements' },
      { id: 'b', label: 'People who prefer fully manual processes', normalizedValue: 'People who prefer fully manual processes' },
      { id: 'c', label: 'Teams with no budget', normalizedValue: 'Teams with no budget or buying authority' },
      { id: 'd', label: 'Industries requiring deep domain customization', normalizedValue: 'Industries requiring heavy domain customization' },
    ],
    customPlaceholder: 'Describe who this is not a good fit for...',
  },
};

export function getFallbackChoices(slotKey: SlotKey): {
  question: string;
  choices: GeneratedChoice[];
  customPlaceholder: string;
} {
  const fb = FALLBACKS[slotKey];
  return {
    question: fb.question,
    choices: fb.choices.map((c) => ({ ...c, slotKey })),
    customPlaceholder: fb.customPlaceholder,
  };
}
