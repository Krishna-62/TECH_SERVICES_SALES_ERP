import { useEffect, useState } from 'react';
import { api, CompanySummary, Task, TaskType } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { TASK_TYPE_LABELS, formatDateTime, localDate } from '../../lib/labels';
import { canWriteCrm, isManagingRole } from '../../lib/roles';
import CompanyPicker from '../../components/CompanyPicker';
import TaskItem from '../../components/TaskItem';
import { Badge, Button, Card, CardHeader, EmptyState, Notice, PageHeader, SelectField, TextField } from '../../components/ui';

export default function Tasks() {
  const { user } = useAuth();
  const [view, setView] = useState<'open' | 'done'>('open');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const writer = canWriteCrm(user?.role);
  const teamView = user?.role !== 'salesperson';
  const today = localDate();

  function load() {
    api.tasks
      .list({ status: view })
      .then(setTasks)
      .catch((err) => setError(err.message));
  }
  useEffect(() => {
    setTasks(null);
    load();
    // Reload when switching between open and done.
  }, [view]);

  const groups =
    view === 'open' && tasks
      ? [
          { title: 'Overdue', items: tasks.filter((t) => t.due_date < today) },
          { title: 'Today', items: tasks.filter((t) => t.due_date === today) },
          { title: 'Upcoming', items: tasks.filter((t) => t.due_date > today) },
        ]
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Follow-ups" description={teamView ? 'Open actions across the team.' : 'Your open actions.'} />
        {writer && !adding && (
          <Button className="shrink-0" onClick={() => setAdding(true)}>
            + Add
          </Button>
        )}
      </div>
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      {adding && (
        <NewTask
          onDone={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="flex gap-2" role="tablist">
        {(['open', 'done'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`h-9 px-3 rounded-full text-sm font-semibold border ${view === v ? 'bg-brand text-white border-brand' : 'bg-white text-ink-muted border-line'}`}
          >
            {v === 'open' ? 'Open' : 'Done'}
          </button>
        ))}
      </div>

      {tasks === null && <p className="text-sm text-ink-faint">Loading…</p>}
      {tasks?.length === 0 && (
        <Card>
          <EmptyState>{view === 'open' ? 'Nothing open. Nice.' : 'Nothing completed yet.'}</EmptyState>
        </Card>
      )}

      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} action={<Badge>{g.items.length}</Badge>} />
            <ul className="divide-y divide-line">
              {g.items.map((t) => (
                <TaskItem key={t.id} task={t} today={today} showAssignee={teamView} canAct={writer} onChanged={load} onError={setError} />
              ))}
            </ul>
          </Card>
        ))}

      {view === 'done' && tasks && tasks.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {tasks.map((t) => (
              <li key={t.id} className="px-4 sm:px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm min-w-0">
                    <span className={t.status === 'cancelled' ? 'line-through text-ink-faint' : ''}>{t.title}</span>
                    <span className="block text-xs text-ink-muted">
                      {t.company_name} · {TASK_TYPE_LABELS[t.task_type]}
                      {teamView && ` · ${t.assignee_name}`}
                    </span>
                    {t.outcome_notes && <span className="block text-xs text-ink-muted mt-1">“{t.outcome_notes}”</span>}
                  </span>
                  <span className="text-xs text-ink-faint whitespace-nowrap">{t.completed_at && formatDateTime(t.completed_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function NewTask({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { user } = useAuth();
  const managing = isManagingRole(user?.role);
  const [company, setCompany] = useState<CompanySummary | null>(null);
  const [form, setForm] = useState({ title: '', task_type: 'call' as TaskType, due_date: localDate(1), priority: 'normal' as 'normal' | 'high' });
  const [assignee, setAssignee] = useState<number | ''>(user?.salesperson_id ?? '');
  const [salespeople, setSalespeople] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (managing) api.directory.salespeople().then(setSalespeople).catch(() => undefined);
  }, [managing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setBusy(true);
    setError('');
    try {
      await api.tasks.create({ ...form, company_id: company.id, assignee_salesperson_id: managing && assignee ? Number(assignee) : undefined });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the follow-up.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="New follow-up" />
      <div className="p-4 sm:p-5 flex flex-col gap-4">
        {error && <Notice tone="error">{error}</Notice>}
        {!company ? (
          <CompanyPicker onSelect={setCompany} allowCreate={false} />
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center justify-between rounded-lg bg-canvas px-3 py-2">
              <span className="text-sm font-semibold">{company.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setCompany(null)}>
                Change
              </Button>
            </div>
            <TextField label="What" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
            <SelectField label="Type" value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value as TaskType })}>
              {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((t) => (
                <option key={t} value={t}>
                  {TASK_TYPE_LABELS[t]}
                </option>
              ))}
            </SelectField>
            <TextField label="When" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
            <SelectField label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as 'normal' | 'high' })}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </SelectField>
            {managing && (
              <SelectField label="Assign to" value={assignee} onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Select…</option>
                {salespeople.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            )}
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" disabled={busy || !form.title.trim() || (managing && !assignee)}>
                Add follow-up
              </Button>
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {!company && (
          <div>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
