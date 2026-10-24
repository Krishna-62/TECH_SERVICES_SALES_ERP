import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, LostReason, OpportunityDetail, QuotationStatus, Stage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import {
  LOST_REASON_LABELS,
  OPEN_STAGES,
  OUTCOME_LABELS,
  QUOTATION_STATUS_LABELS,
  STAGE_LABELS,
  TASK_TYPE_LABELS,
  dueLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  localDate,
} from '../../lib/labels';
import { canRecordQuotations, canWriteCrm, isManagingRole } from '../../lib/roles';
import { Badge, Button, Card, CardHeader, EmptyState, Notice, SelectField, TextAreaField, TextField } from '../../components/ui';

type Panel = 'move' | 'won' | 'lost' | 'reopen' | 'edit' | null;

export default function DealDetail() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const deal = useLoad<OpportunityDetail | null>(() => api.opportunities.get(id), null);
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const d = deal.data;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      setPanel(null);
      await deal.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (deal.error) return <Notice tone="error">{deal.error}</Notice>;
  if (!d) return <p className="text-sm text-ink-faint">Loading…</p>;

  const open = !d.closed_at;
  const writer = canWriteCrm(user?.role);
  const stageIndex = OPEN_STAGES.indexOf(d.stage);

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <header>
        <Link to={`/companies/${d.company_id}`} className="text-sm font-semibold text-brand">
          {d.company_name}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-0.5">{d.title}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge tone={d.stage === 'won' ? 'ok' : d.stage === 'lost' ? 'muted' : 'brand'}>{STAGE_LABELS[d.stage]}</Badge>
          <span className="text-sm font-semibold tabular-nums">
            {d.stage === 'won' ? formatMoney(d.won_value) : formatMoney(d.estimated_value)}
          </span>
          {open && <span className="text-xs text-ink-faint">{d.probability}% likely</span>}
          {open && d.expected_close_date && (
            <span className={`text-xs ${d.expected_close_date < localDate() ? 'text-danger font-semibold' : 'text-ink-faint'}`}>
              closes {formatDate(d.expected_close_date)}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted mt-1">
          Owner: {d.owner_name}
          {d.original_owner_salesperson_id !== d.owner_salesperson_id && ` (opened by ${d.original_owner_name})`}
        </p>
        {d.stage === 'lost' && d.lost_reason && (
          <p className="text-sm mt-2">
            Lost: {LOST_REASON_LABELS[d.lost_reason]}
            {d.lost_reason_notes && ` — ${d.lost_reason_notes}`}
          </p>
        )}
      </header>

      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}

      {/* Stage stepper */}
      <ol className="grid grid-cols-6 gap-1" aria-label="Pipeline stage">
        {OPEN_STAGES.map((s, i) => {
          const done = d.stage === 'won' || (open && i <= stageIndex);
          return (
            <li key={s} className="flex flex-col gap-1">
              <span className={`h-1.5 rounded-full ${done ? 'bg-brand' : 'bg-line'}`} />
              <span className={`text-[10px] leading-tight ${s === d.stage ? 'font-semibold text-ink' : 'text-ink-faint'}`}>{STAGE_LABELS[s]}</span>
            </li>
          );
        })}
      </ol>

      {writer && (
        <div className="flex flex-wrap gap-2">
          {open ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setPanel('move')}>
                Move stage
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setPanel('won')}>
                Mark won
              </Button>
              <Button size="sm" variant="danger" onClick={() => setPanel('lost')}>
                Mark lost
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPanel('edit')}>
                Edit details
              </Button>
            </>
          ) : (
            isManagingRole(user?.role) && (
              <Button size="sm" variant="secondary" onClick={() => setPanel('reopen')}>
                Reopen deal
              </Button>
            )
          )}
        </div>
      )}

      {panel && (
        <Card className="p-4 sm:p-5">
          {(panel === 'move' || panel === 'reopen') && (
            <MoveForm
              current={d.stage}
              reopen={panel === 'reopen'}
              hasQuotation={d.quotation_count > 0}
              busy={busy}
              onCancel={() => setPanel(null)}
              onSubmit={(stage, note) => run(() => api.opportunities.moveStage(d.id, { stage, note }), `Moved to ${STAGE_LABELS[stage]}.`)}
            />
          )}
          {panel === 'won' && (
            <WonForm
              suggested={d.quotations.find((q) => q.status === 'accepted')?.amount ?? d.estimated_value}
              busy={busy}
              onCancel={() => setPanel(null)}
              onSubmit={(won_value, note) => run(() => api.opportunities.moveStage(d.id, { stage: 'won', won_value, note }), 'Deal won.')}
            />
          )}
          {panel === 'lost' && (
            <LostForm
              busy={busy}
              onCancel={() => setPanel(null)}
              onSubmit={(lost_reason, lost_reason_notes) =>
                run(() => api.opportunities.moveStage(d.id, { stage: 'lost', lost_reason, lost_reason_notes }), 'Deal marked lost.')
              }
            />
          )}
          {panel === 'edit' && (
            <EditForm deal={d} busy={busy} onCancel={() => setPanel(null)} onSubmit={(data) => run(() => api.opportunities.update(d.id, data), 'Deal updated.')} />
          )}
        </Card>
      )}

      <Quotations deal={d} canRecord={canRecordQuotations(user?.role)} onChanged={deal.reload} onError={setError} />

      {d.requirements.length > 0 && (
        <Card>
          <CardHeader title="Requirements" />
          <ul className="divide-y divide-line">
            {d.requirements.map((r) => (
              <li key={r.id} className="px-4 sm:px-5 py-3">
                <p className="text-sm font-semibold">{r.description}</p>
                <p className="text-xs text-ink-muted">
                  {[r.product_category, r.quantity != null && `${r.quantity} ${r.unit ?? ''}`.trim(), r.budget != null && `Budget ${formatMoney(r.budget)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d.tasks.length > 0 && (
        <Card>
          <CardHeader title="Follow-ups" />
          <ul className="divide-y divide-line">
            {d.tasks.map((t) => (
              <li key={t.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                <span className={`text-sm ${t.status !== 'open' ? 'text-ink-faint line-through' : ''}`}>
                  {t.title} <span className="text-ink-muted no-underline">· {TASK_TYPE_LABELS[t.task_type]}</span>
                </span>
                <span className="text-xs text-ink-muted whitespace-nowrap">{t.status === 'open' ? dueLabel(t.due_date) : t.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d.visits.length > 0 && (
        <Card>
          <CardHeader title="Visits" />
          <ul className="divide-y divide-line">
            {d.visits.map((v) => (
              <li key={v.id}>
                <Link to={`/visits/${v.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                  <span className="text-sm">
                    {formatDateTime(v.visited_at)} <span className="text-ink-muted">· {v.salesperson_name}</span>
                  </span>
                  {v.outcome && <Badge>{OUTCOME_LABELS[v.outcome]}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="History" />
        <ol className="px-4 sm:px-5 py-3 flex flex-col gap-3">
          {d.history.map((h) => (
            <li key={h.id} className="text-sm">
              <span className="font-semibold">
                {h.change_type === 'created'
                  ? `Opened at ${STAGE_LABELS[h.to_value as Stage] ?? h.to_value}`
                  : h.change_type === 'owner'
                    ? `Transferred to ${h.to_value}`
                    : `${STAGE_LABELS[h.from_value as Stage] ?? h.from_value} → ${STAGE_LABELS[h.to_value as Stage] ?? h.to_value}`}
              </span>
              <span className="block text-xs text-ink-muted">
                {formatDateTime(h.changed_at)} · {h.changed_by_username}
                {h.note && ` · ${h.note}`}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function MoveForm({
  current,
  reopen,
  hasQuotation,
  busy,
  onCancel,
  onSubmit,
}: {
  current: Stage;
  reopen: boolean;
  hasQuotation: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (stage: Stage, note: string) => void;
}) {
  const options = OPEN_STAGES.filter((s) => s !== current);
  const [stage, setStage] = useState<Stage>(options[0]);
  const [note, setNote] = useState('');
  const needsQuote = (stage === 'quotation_sent' || stage === 'negotiation') && !hasQuotation;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(stage, note);
      }}
    >
      <SelectField label={reopen ? 'Reopen at' : 'Move to'} value={stage} onChange={(e) => setStage(e.target.value as Stage)} hint={needsQuote ? 'Needs a recorded quotation first.' : undefined}>
        {options.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </SelectField>
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="sm:col-span-2 flex gap-2">
        <Button type="submit" size="sm" disabled={busy || needsQuote}>
          {reopen ? 'Reopen' : 'Move'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function WonForm({ suggested, busy, onCancel, onSubmit }: { suggested: number | null; busy: boolean; onCancel: () => void; onSubmit: (value: number, note: string) => void }) {
  const [value, setValue] = useState(suggested ? String(suggested) : '');
  const [note, setNote] = useState('');
  const amount = Number(value);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(amount, note);
      }}
    >
      <TextField label="Order value (₹)" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} hint={amount > 0 ? formatMoney(amount) : 'The amount the customer ordered'} required />
      <TextField label="Note (optional)" placeholder="e.g. PO number" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="sm:col-span-2 flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !(amount > 0)}>
          Mark won
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LostForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (reason: LostReason, notes: string) => void }) {
  const [reason, setReason] = useState<LostReason | ''>('');
  const [notes, setNotes] = useState('');
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) onSubmit(reason, notes);
      }}
    >
      <SelectField label="Why was it lost?" value={reason} onChange={(e) => setReason(e.target.value as LostReason)} required>
        <option value="">Select…</option>
        {(Object.keys(LOST_REASON_LABELS) as LostReason[]).map((r) => (
          <option key={r} value={r}>
            {LOST_REASON_LABELS[r]}
          </option>
        ))}
      </SelectField>
      <TextField label={reason === 'other' ? 'Details (required)' : 'Details (optional)'} placeholder="e.g. competitor name, price gap" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="sm:col-span-2 flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={busy || !reason || (reason === 'other' && !notes.trim())}>
          Mark lost
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  deal,
  busy,
  onCancel,
  onSubmit,
}: {
  deal: OpportunityDetail;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (data: { title: string; estimated_value: number | null; expected_close_date: string | null; probability: number; notes: string | null }) => void;
}) {
  const [form, setForm] = useState({
    title: deal.title,
    estimated_value: deal.estimated_value != null ? String(deal.estimated_value) : '',
    expected_close_date: deal.expected_close_date ?? '',
    probability: String(deal.probability),
    notes: deal.notes ?? '',
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title: form.title,
          estimated_value: form.estimated_value === '' ? null : Number(form.estimated_value),
          expected_close_date: form.expected_close_date || null,
          probability: Number(form.probability),
          notes: form.notes || null,
        });
      }}
    >
      <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      <TextField label="Estimated value (₹)" inputMode="decimal" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
      <TextField label="Expected to close" type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
      <TextField label="Probability (%)" inputMode="numeric" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} />
      <div className="sm:col-span-2">
        <TextAreaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !form.title.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Quotations({ deal, canRecord, onChanged, onError }: { deal: OpportunityDetail; canRecord: boolean; onChanged: () => void; onError: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ quotation_number: '', quotation_date: localDate(), amount: '', status: 'sent' as QuotationStatus });
  const [busy, setBusy] = useState(false);
  const open = !deal.closed_at;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onChanged();
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Quotations"
        description={deal.stage === 'quotation_requested' && deal.quotations.length === 0 ? 'Waiting for the office to prepare the quotation in the ERP.' : undefined}
        action={
          canRecord && open && !adding ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              + Record
            </Button>
          ) : undefined
        }
      />
      {adding && (
        <form
          className="p-4 sm:p-5 grid gap-3 sm:grid-cols-4 border-b border-line"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(() =>
              api.opportunities.addQuotation(deal.id, {
                quotation_number: form.quotation_number,
                quotation_date: form.quotation_date || null,
                amount: form.amount === '' ? null : Number(form.amount),
                status: form.status,
              })
            );
            if (ok) {
              setAdding(false);
              setForm({ quotation_number: '', quotation_date: localDate(), amount: '', status: 'sent' });
            }
          }}
        >
          <TextField label="ERP quotation no." placeholder="QTN-…" value={form.quotation_number} onChange={(e) => setForm({ ...form, quotation_number: e.target.value })} required />
          <TextField label="Date" type="date" value={form.quotation_date} onChange={(e) => setForm({ ...form, quotation_date: e.target.value })} />
          <TextField label="Amount (₹)" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <SelectField label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as QuotationStatus })}>
            {(Object.keys(QUOTATION_STATUS_LABELS) as QuotationStatus[]).map((s) => (
              <option key={s} value={s}>
                {QUOTATION_STATUS_LABELS[s]}
              </option>
            ))}
          </SelectField>
          <div className="sm:col-span-4 flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !form.quotation_number.trim()}>
              Save quotation
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {deal.quotations.length === 0 && !adding && <EmptyState>No quotation recorded yet.</EmptyState>}
      <ul className="divide-y divide-line">
        {deal.quotations.map((q) => (
          <li key={q.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <span className="text-sm">
              <span className="font-semibold">{q.quotation_number}</span>
              <span className="text-ink-muted">
                {q.quotation_date && ` · ${formatDate(q.quotation_date)}`} · {formatMoney(q.amount)}
              </span>
            </span>
            {canRecord ? (
              <select
                aria-label={`Status of ${q.quotation_number}`}
                value={q.status}
                disabled={busy}
                onChange={(e) => act(() => api.opportunities.updateQuotation(q.id, { status: e.target.value as QuotationStatus }))}
                className="h-9 rounded-lg border border-line bg-white px-2 text-sm"
              >
                {(Object.keys(QUOTATION_STATUS_LABELS) as QuotationStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {QUOTATION_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            ) : (
              <Badge>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
