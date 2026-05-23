import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Api } from '../api/endpoints';
import { Button, Card, Pill, ProgressBar, Spinner } from '../components/ui';
import type { Week } from '../api/types';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'deadline passed';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return `${days}d ${hours}h remaining`;
}

export default function CurrentWeek() {
  const qc = useQueryClient();
  const week = useQuery({ queryKey: ['currentWeek'], queryFn: Api.currentWeek, retry: false });
  const weekId = week.data?.id;

  const tally = useQuery({
    queryKey: ['capacityTally', weekId],
    queryFn: () => Api.capacityTally(weekId!),
    enabled: !!weekId,
  });
  const progress = useQuery({
    queryKey: ['allocationProgress', weekId],
    queryFn: () => Api.allocationProgress(weekId!),
    enabled: !!weekId,
  });
  const completion = useQuery({
    queryKey: ['completion', weekId],
    queryFn: () => Api.completion(weekId!),
    enabled: !!weekId,
  });

  const invalidateAll = () =>
    qc.invalidateQueries({ predicate: () => true });

  const openWeek = useMutation({ mutationFn: Api.openNextWeek, onSuccess: invalidateAll });
  const prepare = useMutation({
    mutationFn: () => Api.prepareAllocation(weekId!),
    onSuccess: invalidateAll,
  });
  const reminder = useMutation({
    mutationFn: (type: string) => Api.sendReminder(weekId!, type),
    onSuccess: invalidateAll,
  });
  const summary = useMutation({
    mutationFn: () => Api.prepareSummary(weekId!),
    onSuccess: invalidateAll,
  });
  const clearWeek = useMutation({
    mutationFn: () => Api.deleteWeek(weekId!),
    onSuccess: invalidateAll,
  });
  const dmNudge = useMutation({
    mutationFn: () => Api.dmNonCompleters(weekId!),
  });

  if (week.isLoading) return <Spinner />;

  if (!week.data) {
    return (
      <Card title="No active week">
        <p className="mb-4 text-slate-600">
          There is no week yet. Open one to post the capacity poll.
        </p>
        <Button onClick={() => openWeek.mutate()} disabled={openWeek.isPending}>
          Open week &amp; post capacity poll
        </Button>
      </Card>
    );
  }

  const w: Week = week.data;
  const projectedQurans = tally.data
    ? Math.ceil(tally.data.totalJuz / 30)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Week #{w.weekNumber}
          </h1>
          <p className="text-sm text-slate-500">
            {fmtDate(w.startDate)} → {fmtDate(w.deadline)} · {countdown(w.deadline)}
          </p>
        </div>
        <Pill value={w.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Capacity poll">
          {tally.data ? (
            <>
              <div className="space-y-2">
                {tally.data.options.map((o) => {
                  const max = Math.max(
                    1,
                    ...tally.data!.options.map((x) => x.count),
                  );
                  return (
                    <div key={o.label} className="flex items-center gap-3">
                      <span className="w-8 text-sm font-medium text-slate-600">
                        {o.label}
                      </span>
                      <div className="flex-1">
                        <ProgressBar value={o.count} max={max} />
                      </div>
                      <span className="w-6 text-right text-sm text-slate-500">
                        {o.count}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {tally.data.voters} voters · {tally.data.totalJuz} Juz pledged ·{' '}
                <strong>{projectedQurans}</strong> Qurans projected
              </p>
            </>
          ) : (
            <Spinner />
          )}
        </Card>

        <Card title="Progress">
          {progress.data && progress.data.totalSlots > 0 ? (
            <>
              <p className="mb-1 text-sm text-slate-500">
                Juz completed: {progress.data.completedSlots}/
                {progress.data.totalSlots}
              </p>
              <ProgressBar
                value={progress.data.completedSlots}
                max={progress.data.totalSlots}
              />
              <p className="mt-3 text-sm text-slate-500">
                Members done: {completion.data?.completed ?? 0}/
                {progress.data.membersTotal}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              No allocation yet — prepare it from the Allocation page.
            </p>
          )}
        </Card>
      </div>

      <Card title="Actions">
        <div className="flex flex-wrap gap-3">
          {w.status === 'COLLECTING' && (
            <Button onClick={() => prepare.mutate()} disabled={prepare.isPending}>
              Auto-allocate &amp; draft list
            </Button>
          )}
          {(w.status === 'ALLOCATING' || w.status === 'COLLECTING') && (
            <Link to="/allocation">
              <Button variant="secondary">Review allocation →</Button>
            </Link>
          )}
          {w.status === 'IN_PROGRESS' && (
            <>
              <Button
                variant="secondary"
                onClick={() => reminder.mutate('REMINDER_MON')}
                disabled={reminder.isPending}
              >
                Send Mon reminder
              </Button>
              <Button
                variant="secondary"
                onClick={() => reminder.mutate('REMINDER_WED')}
                disabled={reminder.isPending}
              >
                Send Wed reminder
              </Button>
              <Button
                variant="secondary"
                onClick={() => reminder.mutate('REMINDER_THU')}
                disabled={reminder.isPending}
              >
                Send Thu reminder
              </Button>
              <Button onClick={() => summary.mutate()} disabled={summary.isPending}>
                Draft weekly summary
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (
                    confirm(
                      'DM every member who hasn’t voted Yes yet? This sends individual WhatsApp DMs (ban risk) — heavily throttled, runs in the background.',
                    )
                  )
                    dmNudge.mutate();
                }}
                disabled={dmNudge.isPending}
              >
                DM non-completers
              </Button>
            </>
          )}
          {dmNudge.data && (
            <p className="mt-3 text-sm text-emerald-700">
              Started DMing {dmNudge.data.withPhone} of {dmNudge.data.pending}{' '}
              pending member(s) — runs in the background with delays between
              each.
            </p>
          )}
          <Button
            variant="ghost"
            onClick={() => openWeek.mutate()}
            disabled={openWeek.isPending}
          >
            Open next week
          </Button>
        </div>
        {(prepare.isError || reminder.isError || summary.isError || openWeek.isError) && (
          <p className="mt-3 text-sm text-red-600">
            Action failed — check the WhatsApp connection &amp; group settings.
          </p>
        )}

        {/* Testing utility: wipe this week and all its data. */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Button
            variant="danger"
            onClick={() => {
              if (
                confirm(
                  `Clear week #${w.weekNumber} and ALL its votes, allocations, polls and messages? This cannot be undone.`,
                )
              )
                clearWeek.mutate();
            }}
            disabled={clearWeek.isPending}
          >
            {clearWeek.isPending ? 'Clearing…' : 'Clear week (testing)'}
          </Button>
          <span className="ml-3 text-xs text-slate-400">
            Deletes this week so you can start a fresh one. Members are kept.
          </span>
        </div>
      </Card>
    </div>
  );
}
