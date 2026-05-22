export type ProjectNavItem = {
  id: string;
  name: string;
  slug: string | null;
};

type ProjectRecord = {
  id: string;
  name: string;
  slug: string | null;
  intake_status: string | null;
  is_archived?: boolean | null;
};

export type Foundation = {
  summary: string;
  targetUser: string;
  painPoint: string;
  valueProp: string;
  idealPeopleTypes: string[];
  differentiation?: string | null;
  disqualifiers?: string[];
  biggestUnknown?: string | null;
  nextResearchAction?: string | null;
};

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
