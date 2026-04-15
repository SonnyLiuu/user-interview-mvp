export type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
  messageType?: string | null;
};

export type ProjectNavItem = {
  id: string;
  name: string;
  slug: string | null;
};

export type ProjectRecord = {
  id: string;
  user_id?: string | null;
  name: string;
  slug: string | null;
  intake_status: string | null;
  is_archived?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BriefAssumption = {
  assumption: string;
  status: 'unvalidated' | 'strengthened' | 'weakened';
  evidence: string[];
};

export type RecommendedConversation = {
  persona_type: string;
  why: string;
  what_to_learn: string;
  urgency: 'high' | 'medium' | 'low';
};

export type ProjectBrief = {
  id: string;
  project_id: string;
  idea_summary: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  most_promising_avenues: string[] | null;
  recommended_conversations: RecommendedConversation[] | null;
  assumptions: BriefAssumption[] | null;
  debrief_count_at_generation?: number | null;
  generated_at?: string | null;
  is_current?: boolean | null;
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
  brief: ProjectBrief | null;
  intakeStatus: string;
  conversation: ChatMessage[];
};

export type BriefPayload = {
  brief: ProjectBrief | null;
  status: string;
};
