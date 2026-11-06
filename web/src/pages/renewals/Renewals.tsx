import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReorderPlan, Renewal, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { daysLabel, formatDate, formatIndianDigits, formatMoney } from '../../lib/labels';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, TextField } from '../../components/ui';

function RenewalsList({ teamView }: { teamView: boolean }) {
  const [rows, setRows] = useState<Renewal[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.installed.renewals().then(setRows).catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  async function renew(r: Renewal) {
    setBusy(true);
    setError('');
    try {
      await api.installed.update(r.id, r.kind === 'amc' ? { amc_end_date: date } : { warranty_end_date: date });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      <Card>
        {rows?.length === 0 && <EmptyState>No warranties or AMCs ending in the next 90 days.</EmptyState>}
        {rows === null && !error && <EmptyState>Loading…</EmptyState>}
        <ul className="divide-y divide-line">
          {rows?.map((r) => {
            const key = `${r.kind}-${r.id}`;
            return (
              <li key={key} className="px-4 sm:px-5 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <Link to={`/companies/${r.company_id}`} className="block text-sm font-semibold break-words hover:text-brand">
                      {r.description}
                    </Link>
                    <span className="block text-xs text-ink-muted break-words">
                      {r.company_name}
                      {r.serial_number && ` · S/N ${r.serial_number}`}
                      {teamView && ` · ${r.salesperson_name}`}
                    </span>
                    {r.contact_phone && (
                      <a href={`tel:${r.contact_phone}`} className="text-xs font-semibold text-brand">
                        {r.contact_name} · {r.contact_phone}
                      </a>
                    )}
                    {!r.salesperson_is_active && <span className="block text-xs font-semibold text-danger">Responsible person has left. Hand this over.</span>}
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    <Badge tone="neutral">{r.kind === 'amc' ? 'AMC' : 'Warranty'}</Badge>
                    <span className={`text-xs font-semibold ${r.days_left < 0 ? 'text-danger' : r.days_left <= 30 ? 'text-accent-dark' : 'text-ink-muted'}`}>{daysLabel(r.days_left, 'ago')}</span>
                    <span className="text-xs text-ink-faint">{formatDate(r.end_date)}</span>
                  </span>
                </div>
                {editing === key ? (
                  <form
                    className="flex flex-col sm:flex-row sm:items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      renew(r);
                    }}
                  >
                    <div className="sm:w-48">
                      <TextField label="New end date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={busy || !date}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setDate('');
                        setEditing(key);
                      }}
                    >
                      Renewed
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

function ReordersList({ teamView }: { teamView: boolean }) {
  const [rows, setRows] = useState<ReorderPlan[] | null>(null);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<{ id: number; mode: 'ordered' | 'move' | 'stop' } | null>(null);
  const [value, setValue] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.reorders.list().then(setRows).catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  function open(id: number, mode: 'ordered' | 'move' | 'stop') {
    setValue('');
    setDate('');
    setReason('');
    setPanel({ id, mode });
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setPanel(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      <Card>
        {rows?.length === 0 && <EmptyState>No reorders yet. Add one from a company’s page.</EmptyState>}
        {rows === null && !error && <EmptyState>Loading…</EmptyState>}
        <ul className="divide-y divide-line">
          {rows?.map((r) => (
            <li key={r.id} className="px-4 sm:px-5 py-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <Link to={`/companies/${r.company_id}`} className="block text-sm font-semibold break-words hover:text-brand">
                    {r.item}
                  </Link>
                  <span className="block text-xs text-ink-muted break-words">
                    {r.company_name} · every {r.interval_days} days
                    {r.typical_value != null && ` · about ${formatMoney(r.typical_value, { compact: true })}`}
                    {teamView && ` · ${r.salesperson_name}`}
                  </span>
                  {r.last_order_date && <span className="block text-xs text-ink-faint">Last ordered {formatDate(r.last_order_date)}</span>}
                  {r.contact_phone && (
                    <a href={`tel:${r.contact_phone}`} className="text-xs font-semibold text-brand">
                      {r.contact_name} · {r.contact_phone}
                    </a>
                  )}
                </span>
                <span className="flex flex-col items-end shrink-0">
                  <span className={`text-xs font-semibold ${r.days_left < 0 ? 'text-danger' : r.days_left <= 7 ? 'text-accent-dark' : 'text-ink-muted'}`}>{daysLabel(r.days_left, 'overdue')}</span>
                  <span className="text-xs text-ink-faint">{formatDate(r.next_due_date)}</span>
                </span>
              </div>
              {panel?.id !== r.id && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => open(r.id, 'ordered')}>
                    They ordered
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => open(r.id, 'move')}>
                    Move date
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => open(r.id, 'stop')}>
                    Stop
                  </Button>
                </div>
              )}
              {panel?.id === r.id && (
                <form
                  className="flex flex-col sm:flex-row sm:items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (panel.mode === 'ordered') act(() => api.reorders.ordered(r.id, { ordered_on: date || undefined, value: value === '' ? null : Number(value) }));
                    if (panel.mode === 'move') act(() => api.reorders.update(r.id, { next_due_date: date }));
                    if (panel.mode === 'stop') act(() => api.reorders.stop(r.id, reason));
                  }}
                >
                  {panel.mode === 'ordered' && (
                    <>
                      <TextField label="Ordered on" type="date" value={date} onChange={(e) => setDate(e.target.value)} hint="Leave empty for today." />
                      <TextField label="Order value (₹, optional)" inputMode="numeric" value={formatIndianDigits(value)} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} />
                    </>
                  )}
                  {panel.mode === 'move' && <TextField label="Next due" type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />}
                  {panel.mode === 'stop' && (
                    <div className="flex-1">
                      <TextField label="Why stop?" placeholder="e.g. Changed supplier" value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" variant={panel.mode === 'stop' ? 'danger' : 'primary'} disabled={busy || (panel.mode === 'move' && !date) || (panel.mode === 'stop' && !reason.trim())}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// Repeat business: contracts ending, and consumables due. Each also becomes a follow-up automatically.
export default function Renewals() {
  const { user } = useAuth();
  const teamView = user?.role !== 'salesperson';
  const [tab, setTab] = useState<'renewals' | 'reorders'>('renewals');
  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <PageHeader title="Renewals and reorders" description={teamView ? 'Across the team.' : 'Your customers.'} />
      <div className="flex gap-2" role="tablist">
        {(
          [
            ['renewals', 'Warranty and AMC'],
            ['reorders', 'Consumables'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`h-9 px-3 rounded-full text-sm font-semibold border ${tab === value ? 'bg-brand text-white border-brand' : 'bg-white text-ink-muted border-line'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'renewals' ? <RenewalsList teamView={teamView} /> : <ReordersList teamView={teamView} />}
    </div>
  );
}
