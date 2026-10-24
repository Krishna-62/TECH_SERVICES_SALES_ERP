import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Task } from '../lib/api';
import { TASK_TYPE_LABELS, dueLabel } from '../lib/labels';
import { Button, TextField } from './ui';

// One open follow-up with quick actions: mark done (with an optional note) or move the date.
export default function TaskItem({
  task,
  today,
  showAssignee = false,
  canAct,
  onChanged,
  onError,
}: {
  task: Task;
  today?: string;
  showAssignee?: boolean;
  canAct: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'done' | 'reschedule'>('idle');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(task.due_date);
  const [busy, setBusy] = useState(false);
  const overdue = task.is_overdue;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setMode('idle');
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 sm:px-5 py-3">
      <div className="flex items-start gap-3">
        <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${overdue ? 'bg-danger' : task.priority === 'high' ? 'bg-amber-500' : 'bg-brand'}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug">{task.title}</p>
          <p className="text-xs text-ink-muted mt-0.5">
            <Link to={`/companies/${task.company_id}`} className="hover:text-brand">
              {task.company_name}
            </Link>
            {' · '}
            {TASK_TYPE_LABELS[task.task_type]}
            {showAssignee && ` · ${task.assignee_name}`}
          </p>
        </div>
        <span className={`text-xs font-semibold whitespace-nowrap ${overdue ? 'text-danger' : 'text-ink-muted'}`}>{dueLabel(task.due_date, today)}</span>
      </div>

      {canAct && mode === 'idle' && (
        <div className="mt-2 ml-5 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMode('done')}>
            Done
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode('reschedule')}>
            Reschedule
          </Button>
        </div>
      )}
      {mode === 'done' && (
        <form
          className="mt-3 ml-5 flex flex-col sm:flex-row sm:items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => api.tasks.complete(task.id, note || undefined));
          }}
        >
          <div className="flex-1">
            <TextField label="What happened? (optional)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              Mark done
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {mode === 'reschedule' && (
        <form
          className="mt-3 ml-5 flex flex-col sm:flex-row sm:items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => api.tasks.update(task.id, { due_date: date }));
          }}
        >
          <div className="sm:w-48">
            <TextField label="New date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !date}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
