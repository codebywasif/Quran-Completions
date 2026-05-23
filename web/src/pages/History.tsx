import { useQuery } from '@tanstack/react-query';
import { Api } from '../api/endpoints';
import { Card, Pill, Spinner } from '../components/ui';

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function History() {
  const weeks = useQuery({ queryKey: ['weeks'], queryFn: Api.weeks });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">History</h1>
      <Card title={`Weeks (${weeks.data?.length ?? 0})`}>
        {weeks.isLoading ? (
          <Spinner />
        ) : (weeks.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-400">No weeks yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="px-2 py-1">Week</th>
                <th className="px-2 py-1">Starts</th>
                <th className="px-2 py-1">Deadline</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1 text-right">Qurans</th>
              </tr>
            </thead>
            <tbody>
              {(weeks.data ?? []).map((w) => (
                <tr key={w.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium">#{w.weekNumber}</td>
                  <td className="px-2 py-2">{fmt(w.startDate)}</td>
                  <td className="px-2 py-2">{fmt(w.deadline)}</td>
                  <td className="px-2 py-2">
                    <Pill value={w.status} />
                  </td>
                  <td className="px-2 py-2 text-right">{w.quranCount ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
