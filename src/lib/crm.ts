export type CRMStage = 'to_contact' | 'sent' | 'scheduled' | 'completed';
export type CRMOutcome = 'no_response' | 'not_interested' | 'successful_call' | 'partial';
type BoardStatus = 'bookmarked' | 'sent' | 'scheduled' | 'completed';

export const CRM_STAGE_IDS = ['to_contact', 'sent', 'scheduled', 'completed'] as const;
export const BOARD_STATUS_VALUES = ['bookmarked', 'sent', 'scheduled', 'completed'] as const;

export const CRM_STAGES: { id: CRMStage; label: string }[] = [
  { id: 'to_contact', label: 'To Contact' },
  { id: 'sent',       label: 'Sent' },
  { id: 'scheduled',  label: 'Scheduled' },
  { id: 'completed',  label: 'Completed' },
];

// board_status values stored in DB → CRMStage
// null means the person hasn't been explicitly staged yet — treat as to_contact
const DB_TO_STAGE: Record<BoardStatus, CRMStage> = {
  bookmarked: 'to_contact',
  sent:       'sent',
  scheduled:  'scheduled',
  completed:  'completed',
};

// CRMStage → value written to board_status column when explicitly set
const STAGE_TO_DB: Record<CRMStage, BoardStatus> = {
  to_contact: 'bookmarked',
  sent:       'sent',
  scheduled:  'scheduled',
  completed:  'completed',
};

export function boardStatusToStage(boardStatus: string | null): CRMStage {
  if (!boardStatus) return 'to_contact';
  if (BOARD_STATUS_VALUES.includes(boardStatus as BoardStatus)) {
    return DB_TO_STAGE[boardStatus as BoardStatus];
  }
  return 'to_contact';
}

export function stageToBoardStatus(stage: CRMStage): BoardStatus {
  return STAGE_TO_DB[stage];
}

export function shouldClearNoResponseOutcome(stage: CRMStage): boolean {
  return stage === 'sent' || stage === 'scheduled';
}
