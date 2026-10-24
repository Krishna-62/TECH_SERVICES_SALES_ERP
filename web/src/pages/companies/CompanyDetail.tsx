import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, CompanyDetail as Company } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import { OUTCOME_LABELS, STAGE_LABELS, TASK_TYPE_LABELS, URGENCY_LABELS, dueLabel, formatDate, formatDateTime, formatMoney } from '../../lib/labels';
import { canWriteCrm } from '../../lib/roles';
import { Badge, Button, Card, CardHeader, EmptyState, Notice, TextField } from '../../components/ui';

export default function CompanyDetail() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const company = useLoad<Company | null>(() => api.companies.get(id), null);
  const writer = canWriteCrm(user?.role);
  const [addingContact, setAddingContact] = useState(false);
  const [contact, setContact] = useState({ name: '', designation: '', phone: '', email: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const c = company.data;

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.companies.addContact(id, contact);
      setContact({ name: '', designation: '', phone: '', email: '' });
      setAddingContact(false);
      await company.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the contact.');
    } finally {
      setBusy(false);
    }
  }

  if (company.error) return <Notice tone="error">{company.error}</Notice>;
  if (!c) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
          <p className="text-sm text-ink-muted mt-1">
            {[c.city, c.industry, c.gstin && `GSTIN ${c.gstin}`].filter(Boolean).join(' · ') || 'No details yet'}
          </p>
          {c.address && <p className="text-sm text-ink-muted">{c.address}</p>}
          <div className="flex flex-wrap gap-x-4 mt-1">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="text-sm font-semibold text-brand">
                {c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="text-sm font-semibold text-brand">
                {c.email}
              </a>
            )}
          </div>
        </div>
        {writer && (
          <Link to={`/visits/new?company=${c.id}`} className="shrink-0 inline-flex items-center justify-center h-11 sm:h-10 px-4 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark">
            + Log a visit here
          </Link>
        )}
      </header>

      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}

      <Card>
        <CardHeader
          title="Contacts"
          action={
            writer && !addingContact ? (
              <Button size="sm" variant="secondary" onClick={() => setAddingContact(true)}>
                + Add
              </Button>
            ) : undefined
          }
        />
        {addingContact && (
          <form onSubmit={addContact} className="p-4 sm:p-5 grid gap-3 sm:grid-cols-2 border-b border-line">
            <TextField label="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoFocus required />
            <TextField label="Designation" value={contact.designation} onChange={(e) => setContact({ ...contact, designation: e.target.value })} />
            <TextField label="Phone" type="tel" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            <TextField label="Email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" size="sm" disabled={busy || !contact.name.trim()}>
                Save contact
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingContact(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {c.contacts.length === 0 && !addingContact && <EmptyState>No contacts yet.</EmptyState>}
        <ul className="divide-y divide-line">
          {c.contacts.map((p) => (
            <li key={p.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{p.name}</span>
                <span className="block text-xs text-ink-muted">{[p.designation, p.email].filter(Boolean).join(' · ')}</span>
              </span>
              {p.phone && (
                <a href={`tel:${p.phone}`} className="text-sm font-semibold text-brand shrink-0">
                  {p.phone}
                </a>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Deals"
          action={
            writer ? (
              <Link to="/pipeline" className="text-sm font-semibold text-brand">
                Pipeline
              </Link>
            ) : undefined
          }
        />
        {c.opportunities.length === 0 && <EmptyState>No deals yet. Open one when you complete a visit with a real need.</EmptyState>}
        <ul className="divide-y divide-line">
          {c.opportunities.map((o) => (
            <li key={o.id}>
              <Link to={`/pipeline/${o.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{o.title}</span>
                  <span className="block text-xs text-ink-muted">
                    {o.owner_name} · {formatMoney(o.won_value ?? o.estimated_value, { compact: true })}
                  </span>
                </span>
                <Badge tone={o.stage === 'won' ? 'ok' : o.stage === 'lost' ? 'muted' : 'brand'}>{STAGE_LABELS[o.stage]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {c.tasks.length > 0 && (
        <Card>
          <CardHeader title="Open follow-ups" />
          <ul className="divide-y divide-line">
            {c.tasks.map((t) => (
              <li key={t.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                <span className="text-sm min-w-0">
                  {t.title}
                  <span className="block text-xs text-ink-muted">
                    {TASK_TYPE_LABELS[t.task_type]} · {t.assignee_name}
                  </span>
                </span>
                <span className="text-xs font-semibold text-ink-muted whitespace-nowrap">{dueLabel(t.due_date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {c.requirements.length > 0 && (
        <Card>
          <CardHeader title="Requirements" />
          <ul className="divide-y divide-line">
            {c.requirements.map((r) => (
              <li key={r.id} className="px-4 sm:px-5 py-3">
                <p className="text-sm font-semibold">{r.description}</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {[
                    r.product_category,
                    r.quantity != null && `${r.quantity} ${r.unit ?? ''}`.trim(),
                    r.budget != null && `₹${r.budget.toLocaleString('en-IN')}`,
                    r.urgency !== 'normal' && URGENCY_LABELS[r.urgency],
                    formatDate(r.created_at),
                    r.salesperson_name,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Visit history" />
        {c.visits.length === 0 && <EmptyState>No visits recorded{user?.role === 'salesperson' ? ' by you' : ''} yet.</EmptyState>}
        <ul className="divide-y divide-line">
          {c.visits.map((v) => (
            <li key={v.id}>
              <Link to={`/visits/${v.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{formatDateTime(v.visited_at)}</span>
                  <span className="block text-xs text-ink-muted truncate">
                    {v.salesperson_name}
                    {v.contact_name && ` · ${v.contact_name}`}
                    {v.notes && ` · ${v.notes}`}
                  </span>
                </span>
                {v.status === 'draft' ? <Badge tone="muted">To finish</Badge> : v.outcome && <Badge>{OUTCOME_LABELS[v.outcome]}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-ink-faint">
        Added by {c.created_by_username} on {formatDate(c.created_at)}
      </p>
    </div>
  );
}
