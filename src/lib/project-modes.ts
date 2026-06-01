import type { Foundation, ProjectType } from './backend-types';

export type FoundationFieldKind = 'text' | 'list';

export type FoundationField = {
  key: string;
  label: string;
  placeholder: string;
  kind: FoundationFieldKind;
  addLabel?: string;
};

type ProjectModeConfig = {
  label: string;
  description: string;
  creatable: boolean;
  visible: boolean;
  foundationFields: FoundationField[];
  personSections: {
    summary: string;
    keyInsights: string;
    recommendedQuestions: string;
    riskFactors: string;
  };
};

export const PROJECT_MODE_CONFIGS: Record<ProjectType, ProjectModeConfig> = {
  startup: {
    label: 'Startup',
    description: 'Startup workspace for founder learning and outreach.',
    creatable: true,
    visible: true,
    foundationFields: [
      { key: 'summary', label: 'Summary', placeholder: "Describe what you're building...", kind: 'text' },
      { key: 'painPoint', label: 'Core Problem', placeholder: 'What pain does this solve?', kind: 'text' },
      { key: 'valueProp', label: 'Value Proposition', placeholder: 'What specific value do you deliver?', kind: 'text' },
      { key: 'targetUser', label: 'Target User', placeholder: 'Who is the primary person experiencing the problem?', kind: 'text' },
      { key: 'idealPeopleTypes', label: 'Ideal People to Talk To', placeholder: 'Describe this person type...', kind: 'list', addLabel: '+ Add person type' },
      { key: 'differentiation', label: 'Differentiation', placeholder: 'What makes this different from existing solutions?', kind: 'text' },
    ],
    personSections: {
      summary: 'Summary',
      keyInsights: 'Key insights',
      recommendedQuestions: 'Questions to ask',
      riskFactors: 'Reasons to be cautious',
    },
  },
  networking: {
    label: 'Networking outreach',
    description: 'Targeted outreach based on sender goals, recipient background, and composition style.',
    creatable: false,
    visible: false,
    foundationFields: [
      { key: 'outreachGoal', label: 'Outreach Goal', placeholder: 'What are you trying to accomplish with this outreach?', kind: 'text' },
      { key: 'recipients', label: 'Recipients', placeholder: 'Who are you reaching out to?', kind: 'text' },
      { key: 'sharedContext', label: 'Shared Context', placeholder: 'What makes the message timely or relevant?', kind: 'text' },
      { key: 'desiredOutcome', label: 'Desired Outcome', placeholder: 'What should recipients do next?', kind: 'text' },
      { key: 'senderContext', label: 'Sender Context', placeholder: 'Optional: what should recipients know about you?', kind: 'text' },
      { key: 'requiredMentions', label: 'Required Mentions', placeholder: 'Specific facts every message should mention...', kind: 'list', addLabel: '+ Add mention' },
      { key: 'optionalMentions', label: 'Optional Mentions', placeholder: 'Facts to use only if they fit or the user opts in...', kind: 'list', addLabel: '+ Add optional mention' },
      { key: 'personalizationStrategy', label: 'Personalization Strategy', placeholder: 'Should messages be personalized, and how much?', kind: 'text' },
      { key: 'tone', label: 'Tone', placeholder: 'How should the message sound?', kind: 'text' },
      { key: 'channelFormat', label: 'Channel Format', placeholder: 'LinkedIn note, email, DM, character limit...', kind: 'text' },
      { key: 'messageBoundaries', label: 'Message Boundaries', placeholder: 'What should messages avoid?', kind: 'list', addLabel: '+ Add boundary' },
      { key: 'nextSourcingStep', label: 'Next Sourcing Step', placeholder: 'What sourcing or personalization action comes next?', kind: 'text' },
      { key: 'priorityRecipientTypes', label: 'Priority Recipient Types', placeholder: 'Describe people who should score highest...', kind: 'list', addLabel: '+ Add recipient type' },
      { key: 'matchRubric', label: 'Match Rubric', placeholder: 'What makes someone a strong match for this outreach?', kind: 'text' },
      { key: 'lowFitSignals', label: 'Low Fit Signals', placeholder: 'What signals should lower the match score?', kind: 'list', addLabel: '+ Add low-fit signal' },
    ],
    personSections: {
      summary: 'Outreach Angle',
      keyInsights: 'Useful Personalization',
      recommendedQuestions: 'Message Notes',
      riskFactors: 'Avoid Mentioning',
    },
  },
};

export const CREATABLE_PROJECT_TYPES = Object.entries(PROJECT_MODE_CONFIGS)
  .filter(([, config]) => config.creatable)
  .map(([projectType]) => projectType) as [ProjectType, ...ProjectType[]];

export const VISIBLE_PROJECT_TYPES = Object.entries(PROJECT_MODE_CONFIGS)
  .filter(([, config]) => config.visible)
  .map(([projectType]) => projectType) as [ProjectType, ...ProjectType[]];

export function getProjectModeConfig(projectType: ProjectType | string | null | undefined): ProjectModeConfig {
  return PROJECT_MODE_CONFIGS[projectType as ProjectType] ?? PROJECT_MODE_CONFIGS.startup;
}

export function adaptFoundationForMode(foundation: Foundation, projectType: ProjectType): Foundation {
  if (projectType !== 'networking') return foundation;
  if (foundation.outreachGoal || foundation.recipients || foundation.senderContext) return foundation;

  return {
    ...foundation,
    outreachGoal: foundation.summary ?? '',
    recipients: foundation.targetUser ?? '',
    senderContext: foundation.differentiation ?? '',
    sharedContext: foundation.painPoint ?? '',
    desiredOutcome: foundation.valueProp ?? '',
    requiredMentions: [],
    optionalMentions: [],
    personalizationStrategy: '',
    tone: '',
    channelFormat: '',
    messageBoundaries: [],
    nextSourcingStep: '',
    priorityRecipientTypes: Array.isArray(foundation.idealPeopleTypes) ? foundation.idealPeopleTypes : [],
    matchRubric: [
      foundation.summary,
      foundation.targetUser ? `Prioritize recipients like: ${foundation.targetUser}` : null,
      foundation.painPoint ? `Shared context/topic: ${foundation.painPoint}` : null,
      foundation.valueProp ? `Useful if they can respond with: ${foundation.valueProp}` : null,
    ].filter(Boolean).join('\n'),
    lowFitSignals: [],
  };
}
