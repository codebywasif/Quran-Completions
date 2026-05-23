import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '../api/endpoints';
import { Button, Card, Spinner } from '../components/ui';
import type { Member } from '../api/types';

function MemberRow({ member }: { member: Member }) {
  const qc = useQueryClient();
  const [name, setName] = useState(member.displayName);
  const [wid, setWid] = useState(member.whatsappId ?? '');
  const [country, setCountry] = useState(member.country ?? '');

  const refresh = () => qc.invalidateQueries({ queryKey: ['members'] });
  const save = useMutation({
    mutationFn: () =>
      Api.updateMember(member.id, {
        displayName: name,
        whatsappId: wid || undefined,
        country: country || undefined,
        provisional: false,
      }),
    onSuccess: refresh,
  });
  const toggle = useMutation({
    mutationFn: () => Api.updateMember(member.id, { active: !member.active }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => Api.deleteMember(member.id),
    onSuccess: refresh,
  });

  return (
    <tr className={member.provisional ? 'bg-amber-50' : ''}>
      <td className="px-2 py-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-2 py-1">
        <input
          value={wid}
          onChange={(e) => setWid(e.target.value)}
          placeholder="447…"
          className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-2 py-1">
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="w-32 rounded border border-slate-200 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-2 py-1 text-center">
        <input
          type="checkbox"
          checked={member.active}
          onChange={() => toggle.mutate()}
        />
      </td>
      <td className="px-2 py-1 text-right">
        {member.provisional && (
          <span className="mr-2 text-xs font-semibold text-amber-700">
            unconfirmed
          </span>
        )}
        <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>{' '}
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete ${member.displayName}?`)) remove.mutate();
          }}
        >
          ✕
        </Button>
      </td>
    </tr>
  );
}

export default function Members() {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ['members'], queryFn: Api.members });
  const [name, setName] = useState('');
  const [wid, setWid] = useState('');
  const [country, setCountry] = useState('');

  const create = useMutation({
    mutationFn: () =>
      Api.createMember({
        displayName: name,
        whatsappId: wid || undefined,
        country: country || undefined,
      }),
    onSuccess: () => {
      setName('');
      setWid('');
      setCountry('');
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Members</h1>

      <Card title="Add member">
        <div className="flex flex-wrap items-end gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={wid}
            onChange={(e) => setWid(e.target.value)}
            placeholder="WhatsApp number (447…)"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Country"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
            Add
          </Button>
        </div>
        {create.isError && (
          <p className="mt-2 text-sm text-red-600">
            Could not add — the WhatsApp id may already be in use.
          </p>
        )}
      </Card>

      <Card title={`Roster (${members.data?.length ?? 0})`}>
        {members.isLoading ? (
          <Spinner />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">WhatsApp</th>
                <th className="px-2 py-1">Country</th>
                <th className="px-2 py-1 text-center">Active</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {(members.data ?? []).map((m) => (
                <MemberRow key={m.id} member={m} />
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Rows highlighted amber are auto-created from votes and need confirming
          (edit the name, then Save).
        </p>
      </Card>
    </div>
  );
}
