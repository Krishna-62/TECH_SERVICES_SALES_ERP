import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, Outcome, RequirementInput, TaskType, Urgency, VisitDetail as Visit } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  OUTCOME_HELP,
  OUTCOME_LABELS,
  OUTCOME_NEEDS_FOLLOW_UP,
  OUTCOME_NEEDS_REQUIREMENT,
  TASK_TYPE_LABELS,
  URGENCY_LABELS,
  dueLabel,
  formatDate,
  formatDateTime,
  localDate,
} from '../../lib/labels';
import { canWriteCrm } from '../../lib/roles';
import { Badge, Button, Card, CardHeader, Notice, SelectField, TextAreaField, TextField } from '../../components/ui';

type RequirementDraft = Omit<RequirementInput, 'quantity' | 'budget'> & { quantity: string; budget: string };
type FollowUpDraft = { task_type: TaskType; title: string; due_date: string; priority: 'normal' | 'high' };
interface CompletionDraft {
  outcome: Outcome | '';
  notes: string;
  requirements: RequirementDraft[];
  followUp: FollowUpDraft;
  wantsFollowUp: boolean;
}

const EMPTY_REQUIREMENT: RequirementDraft = { description: '', product_category: '', quantity: '', unit: '', budget: '', urgency: 'normal', purchase_timeline: '', decision_maker: '' };

function defaultFollowUp(outcome: Outcome | '', companyName: string): FollowUpDraft {
  if (outcome === 'quotation_requested') return { task_type: 'send_quotation', title: `Send quotation to ${companyName}`, due_date: localDate(2), priority: 'high' };
  if (outcome === 'no_meeting') return { task_type: 'visit', title: `Revisit ${companyName}`, due_date: localDate(3), priority: 'normal' };
  return { task_type: 'call', title: `Follow up with ${companyName}`, due_date: localDate(3), priority: 'normal' };
}

// The half-filled completion form survives a refresh or an accidental back on this device.
const storageKey = (id: number) => `visit-completion-${id}`;
function loadDraft(id: number): CompletionDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as CompletionDraft) : null;
  } catch {
    return null;
  }
}
function saveDraft(id: number, draft: CompletionDraft) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode); the form still works.
  }
}
function clearDraft(id: number) {
  try {
    localStorage.removeItem(storageKey(id));
  } catch {
    // ignore
  }
}

export default function VisitDetail() {
  const { id } = useParams();
  const visitId = Number(id);
  const { user } = useAuth();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.visits.get(visitId).then(setVisit).catch((err) => setLoadError(err.message));
  }, [visitId]);

  if (loadError) return <Notice tone="error">{loadError}</Notice>;
  if (!visit) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <header>
        <Link to={`/companies/${visit.company_id}`} className="text-2xl font-bold tracking-tight hover:text-brand">
          {visit.company_name}
        </Link>
        <p className="text-sm text-ink-muted mt-1">
          {formatDateTime(visit.visited_at)} · {visit.salesperson_name}
          {visit.contact_name && ` · with ${visit.contact_name}${visit.contact_designation ? ` (${visit.contact_designation})` : ''}`}
        </p>
        {visit.contact_phone && (
          <a href={`tel:${visit.contact_phone}`} className="text-sm font-semibold text-brand">
            Call {visit.contact_phone}
          </a>
        )}
      </header>

      {visit.status === 'draft' && canWriteCrm(user?.role) ? (
        <CompleteVisitForm visit={visit} onCompleted={setVisit} />
      ) : (
        <CompletedVisit visit={visit} />
      )}
    </div>
  );
}

function CompletedVisit({ visit }: { visit: Visit }) {
  return (
    <>
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          {visit.outcome ? <Badge tone="brand">{OUTCOME_LABELS[visit.outcome]}</Badge> : <Badge tone="muted">Not finished</Badge>}
          {visit.completed_at && <span className="text-xs text-ink-faint">Completed {formatDateTime(visit.completed_at)}</span>}
        </div>
        {visit.notes && <p className="text-sm mt-3 whitespace-pre-wrap">{visit.notes}</p>}
      </Card>
      {visit.requirements.length > 0 && (
        <Card>
          <CardHeader title="Requirements" />
          <ul className="divide-y divide-line">
            {visit.requirements.map((r) => (
              <li key={r.id} className="px-4 sm:px-5 py-3">
                <p className="text-sm font-semibold">{r.description}</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {[
                    r.product_category,
                    r.quantity != null && `${r.quantity} ${r.unit ?? ''}`.trim(),
                    r.budget != null && `Budget ₹${r.budget.toLocaleString('en-IN')}`,
                    r.purchase_timeline && `Buying: ${r.purchase_timeline}`,
                    r.decision_maker && `Decides: ${r.decision_maker}`,
                    r.urgency !== 'normal' && URGENCY_LABELS[r.urgency],
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {r.specification && <p className="text-xs text-ink-muted mt-1 whitespace-pre-wrap">{r.specification}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {visit.tasks.length > 0 && (
        <Card>
          <CardHeader title="Next steps" />
          <ul className="divide-y divide-line">
            {visit.tasks.map((t) => (
              <li key={t.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                <span className="text-sm">
                  {t.title} <span className="text-ink-muted">· {TASK_TYPE_LABELS[t.task_type]}</span>
                </span>
                <span className="text-xs text-ink-muted whitespace-nowrap">{t.status === 'open' ? dueLabel(t.due_date) : t.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function CompleteVisitForm({ visit, onCompleted }: { visit: Visit; onCompleted: (v: Visit) => void }) {
  const [draft, setDraft] = useState<CompletionDraft>(
    () =>
      loadDraft(visit.id) ?? {
        outcome: '',
        notes: visit.notes ?? '',
        requirements: [{ ...EMPTY_REQUIREMENT }],
        followUp: defaultFollowUp('', visit.company_name),
        wantsFollowUp: false,
      }
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => saveDraft(visit.id, draft), [visit.id, draft]);

  const needsRequirement = draft.outcome !== '' && OUTCOME_NEEDS_REQUIREMENT.includes(draft.outcome);
  const needsFollowUp = draft.outcome !== '' && OUTCOME_NEEDS_FOLLOW_UP.includes(draft.outcome);
  const showFollowUp = needsFollowUp || draft.wantsFollowUp;

  function chooseOutcome(outcome: Outcome) {
    setDraft((d) => ({ ...d, outcome, followUp: defaultFollowUp(outcome, visit.company_name) }));
  }
  function setRequirement(i: number, patch: Partial<RequirementDraft>) {
    setDraft((d) => ({ ...d, requirements: d.requirements.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  }

  async function saveNotes() {
    setError('');
    setNotice('');
    try {
      await api.visits.update(visit.id, { notes: draft.notes });
      setNotice('Notes saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  async function complete(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.outcome) return;
    setBusy(true);
    setError('');
    const requirements: RequirementInput[] = draft.requirements
      .filter((r) => r.description.trim())
      .map((r) => ({
        ...r,
        quantity: r.quantity === '' ? null : Number(r.quantity),
        budget: r.budget === '' ? null : Number(r.budget),
        urgency: r.urgency as Urgency,
      }));
    try {
      const done = await api.visits.complete(visit.id, {
        outcome: draft.outcome,
        notes: draft.notes,
        requirements: needsRequirement || requirements.length ? requirements : [],
        follow_up: showFollowUp ? draft.followUp : null,
      });
      clearDraft(visit.id);
      onCompleted(done);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the visit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={complete} className="flex flex-col gap-5">
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}

      <Card className="p-4 sm:p-5 flex flex-col gap-3">
        <TextAreaField label="Meeting notes" rows={4} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="What was discussed?" />
        <div>
          <Button size="sm" variant="secondary" onClick={saveNotes}>
            Save notes for later
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="How did it go?" />
        <div className="p-4 sm:p-5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Visit outcome">
          {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={draft.outcome === o}
              aria-label={`${OUTCOME_LABELS[o]}: ${OUTCOME_HELP[o]}`}
              onClick={() => chooseOutcome(o)}
              className={`text-left rounded-lg border px-3 py-3 transition-colors ${
                draft.outcome === o ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line bg-white hover:bg-canvas'
              }`}
            >
              <div className="text-sm font-semibold">{OUTCOME_LABELS[o]}</div>
              <div className="text-xs text-ink-muted">{OUTCOME_HELP[o]}</div>
            </button>
          ))}
        </div>
      </Card>

      {draft.outcome !== '' && draft.outcome !== 'no_meeting' && (
        <Card>
          <CardHeader title={needsRequirement ? 'What does the customer need?' : 'Requirements (optional)'} />
          <div className="p-4 sm:p-5 flex flex-col gap-5">
            {draft.requirements.map((r, i) => (
              <div key={i} className={`flex flex-col gap-3 ${i > 0 ? 'pt-5 border-t border-line' : ''}`}>
                <TextAreaField
                  label={`Requirement${draft.requirements.length > 1 ? ` ${i + 1}` : ''}`}
                  rows={2}
                  placeholder='e.g. 2" SS316 ball valves for the new line'
                  value={r.description}
                  onChange={(e) => setRequirement(i, { description: e.target.value })}
                />
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  <TextField label="Product category" value={r.product_category ?? ''} onChange={(e) => setRequirement(i, { product_category: e.target.value })} />
                  <TextField label="Quantity" inputMode="decimal" value={r.quantity} onChange={(e) => setRequirement(i, { quantity: e.target.value })} />
                  <TextField label="Unit" placeholder="Nos" value={r.unit ?? ''} onChange={(e) => setRequirement(i, { unit: e.target.value })} />
                  <SelectField label="Urgency" value={r.urgency} onChange={(e) => setRequirement(i, { urgency: e.target.value as Urgency })}>
                    {(Object.keys(URGENCY_LABELS) as Urgency[]).map((u) => (
                      <option key={u} value={u}>
                        {URGENCY_LABELS[u]}
                      </option>
                    ))}
                  </SelectField>
                  <TextField label="Budget (₹)" inputMode="decimal" value={r.budget} onChange={(e) => setRequirement(i, { budget: e.target.value })} />
                  <TextField label="Buying when" placeholder="e.g. this quarter" value={r.purchase_timeline ?? ''} onChange={(e) => setRequirement(i, { purchase_timeline: e.target.value })} />
                  <TextField label="Decision maker" value={r.decision_maker ?? ''} onChange={(e) => setRequirement(i, { decision_maker: e.target.value })} />
                  <TextField label="Specification" value={r.specification ?? ''} onChange={(e) => setRequirement(i, { specification: e.target.value })} />
                </div>
                {draft.requirements.length > 1 && (
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => setDraft((d) => ({ ...d, requirements: d.requirements.filter((_, j) => j !== i) }))}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
            <div>
              <Button size="sm" variant="secondary" onClick={() => setDraft((d) => ({ ...d, requirements: [...d.requirements, { ...EMPTY_REQUIREMENT }] }))}>
                + Another requirement
              </Button>
            </div>
          </div>
        </Card>
      )}

      {draft.outcome !== '' && (
        <Card>
          <CardHeader title={needsFollowUp ? 'Next follow-up' : 'Next follow-up (optional)'} />
          <div className="p-4 sm:p-5 flex flex-col gap-3">
            {!needsFollowUp && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={draft.wantsFollowUp} onChange={(e) => setDraft({ ...draft, wantsFollowUp: e.target.checked })} />
                Schedule a follow-up anyway
              </label>
            )}
            {showFollowUp && (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="What" value={draft.followUp.title} onChange={(e) => setDraft({ ...draft, followUp: { ...draft.followUp, title: e.target.value } })} />
                <SelectField label="Type" value={draft.followUp.task_type} onChange={(e) => setDraft({ ...draft, followUp: { ...draft.followUp, task_type: e.target.value as TaskType } })}>
                  {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((t) => (
                    <option key={t} value={t}>
                      {TASK_TYPE_LABELS[t]}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="When"
                  type="date"
                  min={localDate()}
                  value={draft.followUp.due_date}
                  onChange={(e) => setDraft({ ...draft, followUp: { ...draft.followUp, due_date: e.target.value } })}
                  hint={draft.followUp.due_date ? formatDate(draft.followUp.due_date) : undefined}
                />
                <SelectField label="Priority" value={draft.followUp.priority} onChange={(e) => setDraft({ ...draft, followUp: { ...draft.followUp, priority: e.target.value as 'normal' | 'high' } })}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </SelectField>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="sticky bottom-20 lg:bottom-4 z-10">
        <Button type="submit" className="w-full h-12 shadow-lg" disabled={busy || !draft.outcome}>
          {busy ? 'Saving…' : draft.outcome ? 'Complete visit' : 'Choose how it went to complete'}
        </Button>
      </div>
    </form>
  );
}
