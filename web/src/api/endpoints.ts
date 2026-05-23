import { api } from './client';
import type {
  AllocationGridQuran,
  AllocationProgress,
  CapacityTally,
  CompletionTally,
  Member,
  OutboxMessage,
  Settings,
  WaGroup,
  WaState,
  Week,
  WeekStatus,
} from './types';

/** Thin typed facade over the REST API. */
export const Api = {
  login: (username: string, password: string) =>
    api
      .post<{ token: string; username: string }>('/auth/login', {
        username,
        password,
      })
      .then((r) => r.data),

  // WhatsApp
  waStatus: () => api.get<WaState>('/wa/status').then((r) => r.data),
  waQr: () =>
    api
      .get<{ dataUrl: string | null }>('/wa/qr')
      .then((r) => r.data),
  waGroups: () => api.get<WaGroup[]>('/wa/groups').then((r) => r.data),

  // Weeks
  weeks: () => api.get<Week[]>('/weeks').then((r) => r.data),
  currentWeek: () => api.get<Week>('/weeks/current').then((r) => r.data),
  transitionWeek: (id: string, status: WeekStatus) =>
    api.post<Week>(`/weeks/${id}/transition`, { status }).then((r) => r.data),
  deleteWeek: (id: string) => api.delete(`/weeks/${id}`).then((r) => r.data),

  // Capacity + requests
  capacityTally: (w: string) =>
    api.get<CapacityTally>(`/weeks/${w}/votes/tally`).then((r) => r.data),
  votes: (w: string) =>
    api
      .get<{ memberId: string; juzCount: number; rawLabel: string | null; member: { displayName: string } }[]>(
        `/weeks/${w}/votes`,
      )
      .then((r) => r.data),
  upsertVote: (w: string, memberId: string, label: string) =>
    api.put(`/weeks/${w}/votes`, { memberId, label }).then((r) => r.data),
  requests: (w: string) =>
    api
      .get<{ memberId: string; requestedJuz: number[]; note: string | null; member: { displayName: string } }[]>(
        `/weeks/${w}/requests`,
      )
      .then((r) => r.data),
  upsertRequest: (w: string, memberId: string, requestedJuz: number[], note?: string) =>
    api
      .put(`/weeks/${w}/requests`, { memberId, requestedJuz, note })
      .then((r) => r.data),

  // Allocation
  allocationGrid: (w: string) =>
    api.get<AllocationGridQuran[]>(`/weeks/${w}/allocation`).then((r) => r.data),
  allocationProgress: (w: string) =>
    api
      .get<AllocationProgress>(`/weeks/${w}/allocation/progress`)
      .then((r) => r.data),
  reassign: (w: string, allocationId: string, memberId: string) =>
    api
      .put(`/weeks/${w}/allocation/${allocationId}`, { memberId })
      .then((r) => r.data),

  // Completion
  completion: (w: string) =>
    api.get<CompletionTally>(`/weeks/${w}/completion`).then((r) => r.data),
  setCompletion: (w: string, memberId: string, completed: boolean) =>
    api
      .put<CompletionTally>(`/weeks/${w}/completion`, { memberId, completed })
      .then((r) => r.data),

  // Cycle orchestration
  openNextWeek: () => api.post('/cycle/open-next-week').then((r) => r.data),
  prepareAllocation: (w: string) =>
    api.post(`/weeks/${w}/prepare-allocation`).then((r) => r.data),
  approveAllocation: (w: string) =>
    api.post(`/weeks/${w}/approve-allocation`).then((r) => r.data),
  sendReminder: (w: string, type: string) =>
    api.post(`/weeks/${w}/send-reminder`, { type }).then((r) => r.data),
  dmNonCompleters: (w: string) =>
    api
      .post<{ pending: number; withPhone: number }>(
        `/weeks/${w}/dm-non-completers`,
      )
      .then((r) => r.data),
  prepareSummary: (w: string) =>
    api.post(`/weeks/${w}/prepare-summary`).then((r) => r.data),
  approveSummary: (w: string) =>
    api.post(`/weeks/${w}/approve-summary`).then((r) => r.data),

  // Outbox
  outbox: (weekId?: string) =>
    api
      .get<OutboxMessage[]>('/outbox', { params: weekId ? { weekId } : {} })
      .then((r) => r.data),
  approveOutbox: (id: string) =>
    api.post(`/outbox/${id}/approve`).then((r) => r.data),
  sendOutbox: (id: string) => api.post(`/outbox/${id}/send`).then((r) => r.data),
  cancelOutbox: (id: string) =>
    api.post(`/outbox/${id}/cancel`).then((r) => r.data),
  updateOutbox: (id: string, content: string) =>
    api.put(`/outbox/${id}`, { content }).then((r) => r.data),

  // Members
  members: () => api.get<Member[]>('/members').then((r) => r.data),
  provisionalMembers: () =>
    api.get<Member[]>('/members/provisional').then((r) => r.data),
  createMember: (data: Partial<Member>) =>
    api.post<Member>('/members', data).then((r) => r.data),
  updateMember: (id: string, data: Partial<Member>) =>
    api.put<Member>(`/members/${id}`, data).then((r) => r.data),
  deleteMember: (id: string) =>
    api.delete(`/members/${id}`).then((r) => r.data),

  // Settings
  settings: () => api.get<Settings>('/settings').then((r) => r.data),
  updateSettings: (data: Partial<Settings>) =>
    api.put<Settings>('/settings', data).then((r) => r.data),
};
