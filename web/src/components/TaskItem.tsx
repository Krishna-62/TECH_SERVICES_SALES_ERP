import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Task } from '../lib/api';
import { TASK_TYPE_LABELS, dueLabel, localDate, whatsappLink, whatsappMessage } from '../lib/labels';
import { Button, PHONE_TOUCH, TextField } from './ui';

// One open follow-up with quick actions: mark done (with an optional note) or move the date.
export default function TaskItem({
  task,
  today,
  showAssignee = false,
  canAct,
  onChanged,
  onError,
  selected,
  onToggle,
}: {
  task: Task;
  today?: string;
  showAssignee?: boolean;
  canAct: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
  // Present while choosing several: a tick box takes the place of the actions.
  selected?: boolean;
  onToggle?: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'done' | 'reschedule' | 'log'>('idle');
  const [channel, setChannel] = useState<'call' | 'whatsapp'>('call');
  const [nextDate, setNextDate] = useState('');
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
        {onToggle && (
          <label className="shrink-0 -m-3 p-3 cursor-pointer">
            <input type="checkbox" className="ts-chk block mt-0.5" checked={Boolean(selected)} onChange={onToggle} aria-label={`Select ${task.title}`} />
          </label>
        )}
        <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${overdue ? 'bg-danger' : task.priority === 'high' ? 'bg-warn' : 'bg-brand'}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{task.title}</p>
          <p className="text-xs text-ink-muted mt-0.5">
            <Link to={`/companies/${task.company_id}`} className="hover:text-brand">
              {task.company_name}
            </Link>
            {' · '}
            {TASK_TYPE_LABELS[task.task_type]}
            {showAssignee && ` · ${task.assignee_name}`}
          </p>
        </div>
        <span className={`text-xs font-medium whitespace-nowrap ${overdue ? 'text-danger' : 'text-ink-muted'}`}>{dueLabel(task.due_date, today)}</span>
      </div>

      {task.id < 0 && <p className="mt-2 ml-5 text-xs font-medium text-accent-dark">Waiting to send</p>}
      {canAct && !onToggle && task.id > 0 && mode === 'idle' && (
        <div className="mt-2 ml-5 flex flex-wrap gap-2">
          {task.contact_phone && (
            <>
              <a
                href={`tel:${task.contact_phone}`}
                onClick={() => {
                  setChannel('call');
                  setNote('');
                  setNextDate('');
                  setMode('log');
                }}
                className={`ts-btn ts-dark ts-xs justify-center ${PHONE_TOUCH}`}
              >
                Call
              </a>
              <a
                href={whatsappLink(task.contact_phone, whatsappMessage(task))}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => {
                  setChannel('whatsapp');
                  setNote('');
                  setNextDate(localDate(3));
                  setMode('log');
                }}
                className={`ts-btn ts-ghost ts-xs justify-center ${PHONE_TOUCH}`}
              >
                WhatsApp
              </a>
            </>
          )}
          <Button size="sm" variant="secondary" onClick={() => setMode('done')}>
            Done
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode('reschedule')}>
            Reschedule
          </Button>
        </div>
      )}
      {mode === 'log' && (
        <form className="mt-3 ml-5 flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
          <p className="text-sm font-medium">
            {channel === 'call' ? 'How did the call go' : 'Did you send the message'}
            {task.contact_name ? ` ${channel === 'call' ? 'with' : 'to'} ${task.contact_name}` : ''}?
          </p>
          <div className="ts-fgrid ts-g2 !mt-0">
            <TextField label="What happened? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <TextField label="Next follow-up" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} hint={channel === 'call' ? 'If no answer and empty: tomorrow.' : 'Empty: no further follow-up.'} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => act(() => api.tasks.log(task, { channel, result: 'reached', notes: note || undefined, next_due_date: nextDate || undefined }))}>
              {channel === 'call' ? 'Spoke to them' : 'Message sent'}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => api.tasks.log(task, { channel, result: 'no_answer', notes: note || undefined, next_due_date: nextDate || undefined }))}>
              {channel === 'call' ? 'No answer' : 'Couldn’t send'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {mode === 'done' && (
        <form
          className="mt-3 ml-5 flex flex-col sm:flex-row sm:items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => api.tasks.markDone(task, note || undefined));
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
            act(() => api.tasks.reschedule(task, date));
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
