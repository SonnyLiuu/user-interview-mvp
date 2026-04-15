export const generateFoundationSchema = {
  type: 'object',
  properties: {
    foundation: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'A clear 2–4 sentence description of what the startup is, who it is for, and why it matters.',
        },
        targetUser: {
          type: 'string',
          description: 'The primary user persona in 1–2 sentences.',
        },
        painPoint: {
          type: 'string',
          description: 'The core problem the product addresses, stated clearly.',
        },
        valueProp: {
          type: 'string',
          description: 'What specific value the product delivers.',
        },
        idealPeopleTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Types of people who would be ideal early users or customers.',
        },
        differentiation: {
          type: 'string',
          description: 'What makes this different from existing solutions, if known.',
        },
        disqualifiers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Who would NOT be a good fit.',
        },
      },
      required: ['summary', 'targetUser', 'painPoint', 'valueProp', 'idealPeopleTypes'],
    },
  },
  required: ['foundation'],
} as const;
