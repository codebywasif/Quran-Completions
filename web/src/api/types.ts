export type WeekStatus =
  | 'COLLECTING'
  | 'ALLOCATING'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export type OutboxStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PENDING_APPROVAL'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export type OutboxType =
  | 'CAPACITY_POLL'
  | 'ALLOCATION'
  | 'COMPLETION_POLL'
  | 'REMINDER_MON'
  | 'REMINDER_WED'
  | 'REMINDER_THU'
  | 'SUMMARY';

export interface Member {
  id: string;
  displayName: string;
  whatsappId: string | null;
  lidId: string | null;
  aliases: string[];
  country: string | null;
  active: boolean;
  provisional: boolean;
}

export interface Week {
  id: string;
  weekNumber: number;
  startDate: string;
  deadline: string;
  status: WeekStatus;
  quranCount: number | null;
}

export interface CapacityTally {
  options: { label: string; count: number }[];
  voters: number;
  totalJuz: number;
}

export interface AllocationGridQuran {
  quranNumber: number;
  juz: {
    allocationId: string;
    juzNumber: number;
    memberId: string;
    memberName: string;
    status: 'PENDING' | 'COMPLETED';
  }[];
}

export interface AllocationProgress {
  totalSlots: number;
  completedSlots: number;
  membersTotal: number;
  membersCompleted: number;
}

export interface CompletionTally {
  completed: number;
  pending: number;
  members: {
    memberId: string;
    memberName: string;
    allocatedJuz: number;
    completed: boolean;
    source: 'POLL' | 'REPLY' | 'MANUAL' | null;
  }[];
}

export interface OutboxMessage {
  id: string;
  weekId: string;
  type: OutboxType;
  status: OutboxStatus;
  content: string;
  scheduledFor: string | null;
  sentAt: string | null;
  requiresApproval: boolean;
  error: string | null;
  createdAt: string;
}

export interface WaState {
  status: string;
  me: string | null;
  hasQr: boolean;
  error: string | null;
}

export interface WaGroup {
  id: string;
  name: string;
  participantCount: number;
}

export interface Settings {
  id: string;
  groupChatId: string | null;
  timezone: string;
  timesTable: string;
  templates: Record<string, string>;
  fivePlusValue: number;
  countriesOverride: number | null;
  completionKeywords: string[];
}
