export const extractKickoffIdeaSchema = {
  type: 'object',
  properties: {
    ideaSummary: {
      type: 'string',
      description: 'A concise 1–3 sentence summary of what the founder is building and for whom.',
    },
    quality: {
      type: 'string',
      enum: ['weak', 'solid'],
      description:
        '"solid" if the message clearly identifies what is being built and who it is for. "weak" if vague, missing the customer, or unclear on the core problem.',
    },
  },
  required: ['ideaSummary', 'quality'],
} as const;

export const generateNextQuestionSchema = {
  type: 'object',
  properties: {
    question: {
      type: 'string',
      description: 'The question to ask the founder about the target slot.',
    },
    choices: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string', description: 'Short display label, max ~60 characters.' },
          normalizedValue: { type: 'string', description: 'Clean value to store in onboarding state.' },
        },
        required: ['id', 'label', 'normalizedValue'],
      },
    },
    customPlaceholder: {
      type: 'string',
      description: 'Placeholder text for the custom answer input when the user selects "Something else".',
    },
  },
  required: ['question', 'choices', 'customPlaceholder'],
} as const;

export const extractCustomSlotAnswerStringSchema = {
  type: 'object',
  properties: {
    value: { type: 'string', description: 'Extracted value for the slot.' },
    quality: {
      type: 'string',
      enum: ['weak', 'solid'],
      description: '"solid" if specific and clearly addresses the slot; "weak" if vague.',
    },
  },
  required: ['value', 'quality'],
} as const;

export const extractCustomSlotAnswerArraySchema = {
  type: 'object',
  properties: {
    values: {
      type: 'array',
      items: { type: 'string' },
      description: 'Extracted values for the slot (one or more items).',
    },
    quality: {
      type: 'string',
      enum: ['weak', 'solid'],
      description: '"solid" if specific and clearly addresses the slot; "weak" if vague.',
    },
  },
  required: ['values', 'quality'],
} as const;
