import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '../api/endpoints';
import { Button, Card, Pill, ProgressBar, Spinner } from '../components/ui';

export default function Allocation() {
  const qc = useQueryClient();
  const week = useQuery({ queryKey: ['currentWeek'], queryFn: Api.currentWeek, retry: false });
  const weekId = week.data?.id;
  // Locked once the list has been sent to the group.
  const locked =
    week.data?.status === 'IN_PROGRESS' || week.data?.status === 'COMPLETED';

  const grid = useQuery({
    queryKey: ['allocationGrid', weekId],
    queryFn: () => Api.allocationGrid(weekId!),
    enabled: !!weekId,
    // Live-refresh so completion ticks appear as members vote "Yes".
    refetchInterval: locked ? 5000 : false,
  });
  const completion = useQuery({
    queryKey: ['completion', weekId],
    queryFn: () => Api.completion(weekId!),
    enabled: !!weekId && locked,
    refetchInterval: locked ? 5000 : false,
  });
  const members = useQuery({ queryKey: ['members'], queryFn: Api.members });

  const invalidate = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        ['allocationGrid', 'allocationProgress', 'currentWeek', 'outbox', 'completion'].includes(
          q.queryKey[0] as string,
        ),
    });

  const prepare = useMutation({
    mutationFn: () => Api.prepareAllocation(weekId!),
    onSuccess: invalidate,
  });
  const approve = useMutation({
    mutationFn: () => Api.approveAllocation(weekId!),
    onSuccess: invalidate,
  });
  const reassign = useMutation({
    mutationFn: (v: { allocationId: string; memberId: string }) =>
      Api.reassign(weekId!, v.allocationId, v.memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['allocationGrid', weekId] }),
  });

  if (week.isLoading) return <Spinner />;
  if (!week.data) return <Card title="Allocation"><p>No active week.</p></Card>;

  const activeMembers = (members.data ?? []).filter((m) => m.active || m.provisional);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Allocation · Week #{week.data.weekNumber}</h1>
        <Pill value={week.data.status} />
      </div>

      {/* Action bar — only before the list is sent. */}
      {!locked ? (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => prepare.mutate()} disabled={prepare.isPending}>
              {prepare.isPending ? 'Allocating…' : 'Auto-allocate'}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (confirm('Send the allocation list and completion poll to the group? This locks the allocations.'))
                  approve.mutate();
              }}
              disabled={approve.isPending || (grid.data?.length ?? 0) === 0}
            >
              {approve.isPending ? 'Sending…' : 'Approve & send to group'}
            </Button>
            {prepare.data && 'generate' in (prepare.data as object) && (
              <span className="text-sm text-slate-500">
                {(prepare.data as { generate: { totalJuz: number; quranCount: number } }).generate.totalJuz}{' '}
                Juz ·{' '}
                {(prepare.data as { generate: { quranCount: number } }).generate.quranCount}{' '}
                Qurans
              </span>
            )}
          </div>
          {Boolean(
            prepare.data &&
              (prepare.data as { generate?: { warnings?: string[] } }).generate?.warnings?.length,
          ) && (
            <ul className="mt-3 list-disc pl-5 text-sm text-amber-700">
              {(prepare.data as { generate: { warnings: string[] } }).generate.warnings.map(
                (w, i) => (
                  <li key={i}>{w}</li>
                ),
              )}
            </ul>
          )}
          {approve.isError && (
            <p className="mt-3 text-sm text-red-600">
              Send failed — check the WhatsApp connection &amp; group in Settings.
            </p>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-600">
            ✅ Allocation sent to the group and <strong>locked</strong>. Watching the
            completion poll — a tick appears next to a person’s Juz when they vote
            “Yes”.
          </p>
          {completion.data && (
            <div className="mt-3">
              <p className="mb-1 text-sm text-slate-500">
                Members completed: {completion.data.completed}/
                {completion.data.completed + completion.data.pending}
              </p>
              <ProgressBar
                value={completion.data.completed}
                max={completion.data.completed + completion.data.pending}
              />
            </div>
          )}
        </Card>
      )}

      {grid.isLoading && <Spinner />}
      {grid.data && grid.data.length === 0 && (
        <Card><p className="text-slate-500">No allocations yet — click Auto-allocate.</p></Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {(grid.data ?? []).map((quran) => (
          <Card key={quran.quranNumber} title={`Quran ${quran.quranNumber}`}>
            <div className="space-y-1">
              {quran.juz.map((j) => {
                const done = j.status === 'COMPLETED';
                return (
                  <div
                    key={j.allocationId}
                    className="flex items-center gap-2 text-sm"
                  >
                    {/* Completion tick in front of each allocation. */}
                    <span
                      className={`w-4 text-center ${done ? 'text-emerald-600' : 'text-slate-300'}`}
                      title={done ? 'Completed' : 'Not yet'}
                    >
                      {done ? '✓' : '○'}
                    </span>
                    <span className="w-6 text-right font-medium text-slate-400">
                      {j.juzNumber}
                    </span>
                    {locked ? (
                      <span
                        className={`flex-1 ${done ? 'text-emerald-700' : 'text-slate-700'}`}
                      >
                        {j.memberName}
                      </span>
                    ) : (
                      <select
                        value={j.memberId}
                        onChange={(e) =>
                          reassign.mutate({
                            allocationId: j.allocationId,
                            memberId: e.target.value,
                          })
                        }
                        className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
                      >
                        {activeMembers.some((m) => m.id === j.memberId) ? null : (
                          <option value={j.memberId}>{j.memberName}</option>
                        )}
                        {activeMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
