export type CRMStage = 'to_contact' | 'sent' | 'scheduled' | 'completed';
export type CRMOutcome = 'no_response' | 'not_interested' | 'successful_call' | 'partial';

export const CRM_STAGES: { id: CRMStage; label: string }[] = [
  { id: 'to_contact', label: 'To Contact' },
  { id: 'sent',       label: 'Sent' },
  { id: 'scheduled',  label: 'Scheduled' },
  { id: 'completed',  label: 'Completed' },
];

// board_status values stored in DB → CRMStage
// null means the person hasn't been explicitly staged yet — treat as to_contact
const DB_TO_STAGE: Record<string, CRMStage> = {
  bookmarked: 'to_contact',
  sent:       'sent',
  scheduled:  'scheduled',
  completed:  'completed',
};

// CRMStage → value written to board_status column when explicitly set
const STAGE_TO_DB: Record<CRMStage, string> = {
  to_contact: 'bookmarked',
  sent:       'sent',
  scheduled:  'scheduled',
  completed:  'completed',
};

export function boardStatusToStage(boardStatus: string | null): CRMStage {
  if (!boardStatus) return 'to_contact';
  return DB_TO_STAGE[boardStatus] ?? 'to_contact';
}

export function stageToBoardStatus(stage: CRMStage): string {
  return STAGE_TO_DB[stage];
}

export function isBookmarked(boardStatus: string | null): boolean {
  return boardStatus !== null;
}
