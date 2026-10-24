import { useState } from 'react';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { Card, EmptyState, Notice, PageHeader, SelectField } from '../../components/ui';

const FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'app_user', label: 'User accounts' },
  { value: 'salesperson', label: 'Salespeople' },
];

export default function AuditLog() {
  const [entityType, setEntityType] = useState('');
  const log = useLoad(() => api.audit.list({ limit: 200 }), []);
  const rows = entityType ? log.data.filter((r) => r.entity_type === entityType) : log.data;

  return (
    <div>
      <PageHeader title="Audit log" description="Every account, salesperson and ownership change, newest first. Entries can't be edited or deleted." />
      {log.error && <Notice tone="error">{log.error}</Notice>}
      <div className="max-w-xs mb-4">
        <SelectField label="Show" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </SelectField>
      </div>
      <Card>
        {rows.length === 0 && !log.loading && <EmptyState>Nothing recorded yet.</EmptyState>}
        <ol className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
              <time className="text-xs text-ink-faint sm:w-40 shrink-0 tabular-nums" dateTime={r.at}>
                {new Date(r.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
              <div className="min-w-0">
                <p className="text-sm">{r.summary ?? r.action}</p>
                <p className="text-xs text-ink-faint">
                  {r.action} · by {r.actor_username ?? 'system'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
