import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '../api/endpoints';
import { Button, Card, Pill, Spinner } from '../components/ui';

export default function Connection() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['waStatus'],
    queryFn: Api.waStatus,
    refetchInterval: 4000,
  });
  const qr = useQuery({
    queryKey: ['waQr'],
    queryFn: Api.waQr,
    refetchInterval: 4000,
    enabled: status.data?.status === 'QR',
  });
  const settings = useQuery({ queryKey: ['settings'], queryFn: Api.settings });
  const groups = useQuery({
    queryKey: ['waGroups'],
    queryFn: Api.waGroups,
    enabled: false,
  });

  const setGroup = useMutation({
    mutationFn: (groupChatId: string) => Api.updateSettings({ groupChatId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const isReady = status.data?.status === 'READY';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">WhatsApp connection</h1>
        {status.data && <Pill value={status.data.status} />}
      </div>

      <Card title="Session">
        {status.isLoading && <Spinner />}
        {status.data?.status === 'QR' && (
          <div>
            <p className="mb-3 text-sm text-slate-600">
              Open WhatsApp on the bot phone → Linked devices → Link a device, and
              scan this code:
            </p>
            {qr.data?.dataUrl ? (
              <img
                src={qr.data.dataUrl}
                alt="WhatsApp QR"
                className="h-64 w-64 rounded border border-slate-200"
              />
            ) : (
              <Spinner label="Waiting for QR…" />
            )}
          </div>
        )}
        {isReady && (
          <p className="text-sm text-emerald-700">
            Connected{status.data?.me ? ` as ${status.data.me}` : ''}.
          </p>
        )}
        {status.data && !isReady && status.data.status !== 'QR' && (
          <p className="text-sm text-slate-500">
            Status: {status.data.status}
            {status.data.error ? ` — ${status.data.error}` : ''}
          </p>
        )}
      </Card>

      <Card
        title="Group"
        actions={
          <Button
            variant="secondary"
            onClick={() => groups.refetch()}
            disabled={!isReady}
          >
            Load groups
          </Button>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          Current group:{' '}
          <span className="font-mono text-xs">
            {settings.data?.groupChatId ?? '(none set)'}
          </span>
        </p>
        {!isReady && (
          <p className="text-sm text-slate-400">
            Connect the session first to list groups.
          </p>
        )}
        {groups.data && (
          <ul className="divide-y divide-slate-100">
            {groups.data.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-2">
                <span className="text-sm">
                  {g.name}{' '}
                  <span className="text-xs text-slate-400">
                    ({g.participantCount})
                  </span>
                </span>
                <Button variant="ghost" onClick={() => setGroup.mutate(g.id)}>
                  Use this group
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
