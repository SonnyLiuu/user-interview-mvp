export type ProjectNavItem = {
  id: string;
  name: string;
  slug: string | null;
  project_type: ProjectType;
};

export type ProjectType = 'startup' | 'networking';

type ProjectRecord = {
  id: string;
  name: string;
  slug: string | null;
  project_type: ProjectType;
  intake_status: string | null;
  is_archived?: boolean | null;
};

export type StartupFoundation = {
  summary: string;
  targetUser: string;
  painPoint: string;
  valueProp: string;
  idealPeopleTypes: string[];
  differentiation?: string | null;
  biggestUnknown?: string | null;
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
