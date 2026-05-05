export type ProjectNavItem = {
  id: string;
  name: string;
  slug: string | null;
};

type ProjectRecord = {
  id: string;
  user_id?: string | null;
  name: string;
  slug: string | null;
  intake_status: string | null;
  is_archived?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Foundation = {
  summary: string;
  targetUser: string;
  painPoint: string;
  valueProp: string;
  idealPeopleTypes: string[];
  differentiation?: string | null;
  disqualifiers?: string[];
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
