import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '../api/endpoints';
import { Button, Card, Spinner } from '../components/ui';
import type { OutboxType } from '../api/types';

const TEMPLATE_TYPES: (OutboxType | 'REMINDER_DM')[] = [
  'CAPACITY_POLL',
  'ALLOCATION',
  'COMPLETION_POLL',
  'REMINDER_MON',
  'REMINDER_WED',
  'REMINDER_THU',
  'REMINDER_DM',
  'SUMMARY',
];

export default function Settings() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: Api.settings });

  const [timezone, setTimezone] = useState('');
  const [timesTable, setTimesTable] = useState('');
  const [fivePlus, setFivePlus] = useState(5);
  const [countries, setCountries] = useState('');
  const [keywords, setKeywords] = useState('');
  const [templates, setTemplates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings.data) {
      setTimezone(settings.data.timezone);
      setTimesTable(settings.data.timesTable);
      setFivePlus(settings.data.fivePlusValue);
      setCountries(
        settings.data.countriesOverride != null
          ? String(settings.data.countriesOverride)
          : '',
      );
      setKeywords((settings.data.completionKeywords ?? []).join(', '));
      setTemplates(settings.data.templates ?? {});
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      Api.updateSettings({
        timezone,
        timesTable,
        fivePlusValue: fivePlus,
        countriesOverride: countries.trim() === '' ? null : Number(countries),
        completionKeywords: keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        templates,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  if (settings.isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card title="General">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Timezone (IANA)">
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="“5+” expands to (Juz)">
            <input
              type="number"
              value={fivePlus}
              onChange={(e) => setFivePlus(Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Countries count override (blank = auto)">
            <input
              value={countries}
              onChange={(e) => setCountries(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Completion reply keywords (comma-separated)">
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <Field label="Country/time deadline table">
          <textarea
            value={timesTable}
            onChange={(e) => setTimesTable(e.target.value)}
            rows={9}
            className="input font-mono text-xs"
          />
        </Field>
      </Card>

      <Card title="Message templates (blank = built-in default)">
        <p className="mb-3 text-xs text-slate-400">
          Placeholders: {'{timesTable} {quranLists} {quranCount} {peopleCount}'}{' '}
          {'{countriesCount} {deadlineShort} {weekNumber}'} · REMINDER DM also
          uses {'{name}'}
        </p>
        <div className="space-y-3">
          {TEMPLATE_TYPES.map((t) => (
            <Field key={t} label={t.replace(/_/g, ' ')}>
              <textarea
                value={templates[t] ?? ''}
                onChange={(e) =>
                  setTemplates((prev) => ({ ...prev, [t]: e.target.value }))
                }
                rows={
                  t === 'ALLOCATION' || t === 'SUMMARY' || t === 'REMINDER_DM'
                    ? 6
                    : 2
                }
                placeholder="(using built-in default)"
                className="input font-mono text-xs"
              />
            </Field>
          ))}
        </div>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save settings'}
      </Button>
      {save.isSuccess && (
        <span className="ml-3 text-sm text-emerald-600">Saved.</span>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
