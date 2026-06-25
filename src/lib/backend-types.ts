export type ProjectNavItem = {
  id: string;
  name: string;
  slug: string | null;
  project_type: ProjectType;
};

export type ProjectType = 'startup' | 'networking';
export type EntryGoal =
  | 'pressure_test_idea'
  | 'find_interviewees'
  | 'write_outreach'
  | 'prepare_conversation'
  | 'analyze_notes'
  | 'find_early_users'
  | 'exploring';

export type OutreachProjectType =
  | 'idea_validation'
  | 'customer_acquisition'
  | 'beta_users'
  | 'investor'
  | 'partnership'
  | 'recruiting'
  | 'advisor'
  | 'press_creator';

export type OutreachProjectAvailability = 'active' | 'coming_soon' | 'hidden';

export type OutreachProjectTypeConfig = {
  type: OutreachProjectType;
  label: string;
  description: string;
  purpose: string;
  iconKey: string;
  availability: OutreachProjectAvailability;
};

export type OutreachProjectStatus = 'draft' | 'onboarding' | 'active' | 'paused' | 'completed' | 'archived';

export type IdeaValidationBrief = {
  type?: 'idea_validation';
  label?: string;
  desiredOutcome?: string | null;
  learningGoals?: string[];
  targetPeople?: string[];
  assumptionsToTest?: string[];
  conversationBoundaries?: string[];
  outreachGuidance?: string | null;
  starterAsk?: string | null;
};

export type OutreachProjectRecord = {
  id: string;
  startup_project_id: string;
  type: OutreachProjectType;
  name: string;
  status: OutreachProjectStatus;
  brief_json?: IdeaValidationBrief | Record<string, unknown> | null;
  onboarding_state_json?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CreateOutreachProjectPayload = {
  type?: OutreachProjectType;
  name?: string | null;
  skip_onboarding?: boolean;
};

export type UpdateOutreachProjectPayload = {
  name?: string | null;
  status?: OutreachProjectStatus;
  brief_json?: Record<string, unknown> | null;
  onboarding_state_json?: Record<string, unknown> | null;
};

type ProjectRecord = {
  id: string;
  name: string;
  slug: string | null;
  project_type: ProjectType;
  entry_goal?: EntryGoal | null;
  intake_status: string | null;
  is_archived?: boolean | null;
};

export type StartupFoundation = {
  startupName: string;
  summary: string;
  targetUser: string;
  painPoint: string;
  valueProp: string;
  idealPeopleTypes: string[];
  startupStage?: string | null;
  traction?: string[];
  differentiation?: string | null;
  biggestUnknown?: string | null;
  recommendedOutreachProject?: {
    type: 'idea_validation';
    label: 'Idea Validation';
    reason: string;
  } | null;
  activeOutreachProject?: IdeaValidationBrief | null;
  desiredOutcome?: string | null;
  learningGoals?: string[];
  keyAssumptions?: string[];
  messageBoundaries?: string[];
  outreachGuidance?: string | null;
  starterAsk?: string | null;
};

export type NetworkingFoundation = {
  outreachGoal?: string | null;
  recipients?: string | null;
  senderContext?: string | null;
  sharedContext?: string | null;
  desiredOutcome?: string | null;
  requiredMentions?: string[];
  optionalMentions?: string[];
  personalizationStrategy?: string | null;
  tone?: string | null;
  channelFormat?: string | null;
  messageBoundaries?: string[];
  nextSourcingStep?: string | null;
  priorityRecipientTypes?: string[];
  matchRubric?: string | null;
  lowFitSignals?: string[];
};

export type Foundation = Partial<StartupFoundation & NetworkingFoundation> & Record<string, unknown>;

export type LatestProjectPayload = {
  project: ProjectNavItem | null;
};

export type ProjectLookupPayload = {
  project: ProjectRecord;
  foundationExists: boolean;
};

export type WorkspaceSummaryPayload = {
  project: ProjectRecord;
  projects: ProjectNavItem[];
};

export type FoundationViewPayload = {
  project: ProjectRecord;
  foundation: Foundation | null;
  intakeStatus: string;
  conversation: {
    role: 'assistant' | 'user';
    content: string;
    messageType?: string | null;
  }[];
};
