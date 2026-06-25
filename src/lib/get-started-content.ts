import type { EntryGoal } from '@/lib/backend-types';

export type ChoiceContent<T extends string> = {
  id: T;
  label: string;
  blurbTitle: string;
  blurbBody: string;
};

export const STARTUP_STAGE_OPTIONS: ChoiceContent<string>[] = [
  {
    id: 'idea',
    label: 'Exploring a problem or idea',
    blurbTitle: 'This is the best time to start talking',
    blurbBody: 'You do not need a finished product—or even a fully formed idea—to learn something valuable. Early conversations can reveal which problems are real, who feels them most, and whether the idea is worth pursuing before you invest months building it.',
  },
  {
    id: 'validating',
    label: 'Validating an idea with potential users',
    blurbTitle: 'Turn your assumptions into evidence',
    blurbBody: 'You probably have a picture of the customer, their problem, and why your solution could work. The next step is to challenge that picture, distinguish genuine demand from encouraging feedback, and learn what must be true for the idea to succeed.',
  },
  {
    id: 'mvp',
    label: 'Building an MVP',
    blurbTitle: 'Keep building connected to learning',
    blurbBody: 'Once you start building, it becomes easy to focus on features instead of evidence. Regular conversations help you decide what belongs in the MVP, what can wait, and whether the product solves a problem people care enough about.',
  },
  {
    id: 'launched',
    label: 'Launched and looking for early traction',
    blurbTitle: 'Early traction comes from getting specific',
    blurbBody: 'Finding your first users is rarely about reaching everyone. It is about identifying the people who feel the problem most strongly, understanding what gets their attention, and learning why they engage—or walk away.',
  },
  {
    id: 'growing',
    label: 'Growing an established product',
    blurbTitle: 'Growth creates new questions',
    blurbBody: 'As a product grows, customer needs become more varied and assumptions become harder to spot. Consistent conversations can uncover new segments, sharpen positioning, explain churn, and reveal opportunities hidden inside customer behavior.',
  },
  {
    id: 'advisor',
    label: 'I help or advise startups',
    blurbTitle: 'Help founders replace guesses with evidence',
    blurbBody: 'The most useful guidance often begins with better questions. This process helps pressure-test assumptions, identify the people a founder should learn from, and turn scattered conversations into evidence the team can act on.',
  },
];

export const ENTRY_GOAL_OPTIONS: ChoiceContent<EntryGoal>[] = [
  {
    id: 'pressure_test_idea',
    label: 'Pressure-test my idea',
    blurbTitle: 'Find the weak spots before the market does',
    blurbBody: 'A promising idea still rests on assumptions about the problem, customer, timing, and willingness to change. We will identify the riskiest assumptions and shape conversations that test them before you commit more time or money.',
  },
  {
    id: 'find_interviewees',
    label: 'Find the right people to interview',
    blurbTitle: 'Who you talk to shapes what you learn',
    blurbBody: 'A thoughtful interview with the wrong person can still produce misleading evidence. We will clarify who can teach you the most, why their perspective matters, and which people are worth contacting first.',
  },
  {
    id: 'write_outreach',
    label: 'Write outreach that gets responses',
    blurbTitle: 'Good outreach earns attention before it asks for time',
    blurbBody: 'People respond when a message feels relevant, credible, and human. We will use your startup context to explain why you chose them and help you write personal outreach without hours of research.',
  },
  {
    id: 'prepare_conversation',
    label: 'Prepare for an upcoming conversation',
    blurbTitle: 'A good conversation starts before the call',
    blurbBody: 'The best interviews feel natural, but they are not improvised. We will clarify what you need to learn and prepare prompts that invite honest stories instead of polite opinions.',
  },
  {
    id: 'analyze_notes',
    label: 'Make sense of interview notes',
    blurbTitle: 'A conversation becomes valuable when it changes a decision',
    blurbBody: 'Notes can quickly become a pile of quotes, reactions, and possible signals. We will help separate evidence from interpretation and connect what you learned to the assumptions behind your idea.',
  },
  {
    id: 'find_early_users',
    label: 'Find early users or customers',
    blurbTitle: 'Your first users are more than a number',
    blurbBody: 'The right early users feel the problem strongly enough to try something new—and can teach you why others might follow. We will identify those people and what makes them worth approaching.',
  },
  {
    id: 'exploring',
    label: 'I am just exploring',
    blurbTitle: 'You do not need to have everything figured out',
    blurbBody: 'You can start with a rough idea, an interesting problem, or simple curiosity. We will organize what you know, uncover what you are assuming, and find a useful first conversation.',
  },
];
