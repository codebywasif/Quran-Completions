import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '../api/endpoints';
import { Button, Card, Pill, Spinner } from '../components/ui';
import type { OutboxMessage } from '../api/types';

function OutboxRow({ msg }: { msg: OutboxMessage }) {
  const qc = useQueryClient();
  const [content, setContent] = useState(msg.content);
  const editable = msg.status !== 'SENT' && msg.status !== 'CANCELLED';

  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => ['outbox', 'currentWeek'].includes(q.queryKey[0] as string) });

  const save = useMutation({ mutationFn: () => Api.updateOutbox(msg.id, content), onSuccess: invalidate });
  const approve = useMutation({ mutationFn: () => Api.approveOutbox(msg.id), onSuccess: invalidate });
  const send = useMutation({ mutationFn: () => Api.sendOutbox(msg.id), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: () => Api.cancelOutbox(msg.id), onSuccess: invalidate });

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">
          {msg.type.replace(/_/g, ' ')}
        </span>
        <Pill value={msg.status} />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        readOnly={!editable}
        rows={Math.min(14, Math.max(3, content.split('\n').length))}
        className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
      />
      {msg.error && <p className="mt-1 text-xs text-red-600">{msg.error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {editable && content !== msg.content && (
          <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
            Save edit
          </Button>
        )}
        {(msg.status === 'PENDING_APPROVAL' || msg.status === 'DRAFT') && (
          <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
            Approve &amp; send
          </Button>
        )}
        {(msg.status === 'SCHEDULED' || msg.status === 'FAILED') && (
          <Button onClick={() => send.mutate()} disabled={send.isPending}>
            {msg.status === 'FAILED' ? 'Retry send' : 'Send now'}
          </Button>
        )}
        {editable && (
          <Button variant="ghost" onClick={() => cancel.mutate()}>
            Cancel
          </Button>
        )}
        {msg.sentAt && (
          <span className="self-center text-xs text-slate-400">
            sent {new Date(msg.sentAt).toLocaleString()}
          </span>
        )}
      </div>
      {(approve.isError || send.isError) && (
        <p className="mt-2 text-xs text-red-600">
          Send failed — check WhatsApp connection &amp; group settings.
        </p>
      )}
    </div>
  );
}

export default function Outbox() {
  const week = useQuery({ queryKey: ['currentWeek'], queryFn: Api.currentWeek, retry: false });
  const weekId = week.data?.id;
  const outbox = useQuery({
    queryKey: ['outbox', weekId],
    queryFn: () => Api.outbox(weekId),
    enabled: !!weekId,
  });

  if (week.isLoading) return <Spinner />;
  if (!week.data) return <Card title="Messages"><p>No active week.</p></Card>;

  const messages = outbox.data ?? [];
  const pending = messages.filter((m) => m.status === 'PENDING_APPROVAL' || m.status === 'DRAFT' || m.status === 'FAILED');
  const others = messages.filter((m) => !pending.includes(m));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Messages · Week #{week.data.weekNumber}</h1>

      <Card title={`Needs attention (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing waiting for approval.</p>
        ) : (
          <div className="space-y-4">
            {pending.map((m) => (
              <OutboxRow key={m.id} msg={m} />
            ))}
          </div>
        )}
      </Card>

      <Card title="History">
        {others.length === 0 ? (
          <p className="text-sm text-slate-400">No sent messages yet.</p>
        ) : (
          <div className="space-y-4">
            {others.map((m) => (
              <OutboxRow key={m.id} msg={m} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
