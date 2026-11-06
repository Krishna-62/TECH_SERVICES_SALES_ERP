import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Contact, Instrument, ReorderPlan, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { daysLabel, formatDate, formatIndianDigits, formatMoney } from '../lib/labels';
import { useLoad } from '../lib/useLoad';
import { Button, Card, CardHeader, EmptyState, Notice, SelectField, TextField } from './ui';

// Who is responsible: a salesperson is always themselves; anyone else chooses.
function useResponsible() {
  const { user } = useAuth();
  const choosing = user?.role !== 'salesperson';
  const [people, setPeople] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (choosing) api.directory.salespeople().then(setPeople).catch(() => undefined);
  }, [choosing]);
  return { choosing, people, canEditRow: (salespersonId: number) => choosing || user?.salesperson_id === salespersonId };
}

function ContactSelect({ contacts, value, onChange }: { contacts: Contact[]; value: string; onChange: (v: string) => void }) {
  return (
    <SelectField label="Contact" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">None</option>
      {contacts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.phone ? ` · ${c.phone}` : ''}
        </option>
      ))}
    </SelectField>
  );
}

function endLabel(date: string | null, today: string) {
  if (!date) return '—';
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return `${formatDate(date)}${days < 0 ? ' (ended)' : days <= 60 ? ` (${daysLabel(days).toLowerCase()})` : ''}`;
}

export default function InstalledBaseCard({ companyId, contacts }: { companyId: number; contacts: Contact[] }) {
  const [params, setParams] = useSearchParams();
  const installDeal = Number(params.get('install_deal')) || null;
  const list = useLoad<Instrument[]>(() => api.installed.forCompany(companyId), []);
  const { choosing, people, canEditRow } = useResponsible();
  const [adding, setAdding] = useState(Boolean(installDeal));
  const empty = { description: '', product_id: null as number | null, serial_number: '', contact_id: '', installed_on: '', warranty_end_date: '', amc_end_date: '', salesperson_id: '' };
  const [form, setForm] = useState(empty);
  const [renewing, setRenewing] = useState<{ id: number; warranty: string; amc: string } | null>(null);
  const [retiring, setRetiring] = useState<{ id: number; reason: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Arriving from a won deal: start from what was sold.
  useEffect(() => {
    if (!installDeal) return;
    api.opportunities
      .get(installDeal)
      .then((d) =>
        setForm((f) => ({
          ...f,
          description: d.products[0]?.name ?? d.title,
          product_id: d.products[0]?.id ?? null,
          contact_id: d.contact_id ? String(d.contact_id) : '',
          installed_on: today,
          salesperson_id: String(d.owner_salesperson_id),
        }))
      )
      .catch(() => undefined);
    // Runs once on arrival.
  }, [installDeal]);

  async function act(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError('');
    try {
      await action();
      after?.();
      await list.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Installed base"
        description="What this customer owns. Warranties and AMCs ending soon become follow-ups."
        action={
          !adding ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              + Add
            </Button>
          ) : undefined
        }
      />
      {error && (
        <div className="px-4 sm:px-5 pt-3">
          <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>
        </div>
      )}
      {adding && (
        <form
          className="p-4 sm:p-5 ts-fgrid ts-g2 !mt-0 border-b border-dashed border-line"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () =>
                api.installed.create({
                  company_id: companyId,
                  description: form.description,
                  product_id: form.product_id,
                  serial_number: form.serial_number || null,
                  contact_id: form.contact_id ? Number(form.contact_id) : null,
                  installed_on: form.installed_on || null,
                  warranty_end_date: form.warranty_end_date || null,
                  amc_end_date: form.amc_end_date || null,
                  notes: null,
                  salesperson_id: form.salesperson_id ? Number(form.salesperson_id) : null,
                  opportunity_id: installDeal,
                }),
              () => {
                setAdding(false);
                setForm(empty);
                if (installDeal) setParams({}, { replace: true });
              }
            );
          }}
        >
          <TextField label="Instrument" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          <TextField label="Serial number" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
          <TextField label="Installed on" type="date" value={form.installed_on} onChange={(e) => setForm({ ...form, installed_on: e.target.value })} />
          <TextField label="Warranty ends" type="date" value={form.warranty_end_date} onChange={(e) => setForm({ ...form, warranty_end_date: e.target.value })} />
          <TextField label="AMC ends" type="date" value={form.amc_end_date} onChange={(e) => setForm({ ...form, amc_end_date: e.target.value })} />
          <ContactSelect contacts={contacts} value={form.contact_id} onChange={(contact_id) => setForm({ ...form, contact_id })} />
          {choosing && (
            <SelectField label="Responsible salesperson" value={form.salesperson_id} onChange={(e) => setForm({ ...form, salesperson_id: e.target.value })} required>
              <option value="">Select…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          )}
          <div className="ts-span2 flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !form.description.trim() || (choosing && !form.salesperson_id)}>
              Save instrument
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {list.data.length === 0 && !adding && !list.loading && <EmptyState>Nothing recorded yet.</EmptyState>}
      <ul className="divide-y divide-dashed divide-line">
        {list.data.map((i) => (
          <li key={i.id} className="px-4 sm:px-5 py-3 flex flex-col gap-2">
            <div>
              <p className="text-sm font-medium break-words">{i.description}</p>
              <p className="text-xs text-ink-muted break-words">
                {[i.serial_number && `S/N ${i.serial_number}`, i.installed_on && `Installed ${formatDate(i.installed_on)}`, i.salesperson_name].filter(Boolean).join(' · ')}
              </p>
              <p className="text-xs mt-0.5">
                Warranty {endLabel(i.warranty_end_date, today)} · AMC {endLabel(i.amc_end_date, today)}
              </p>
            </div>
            {renewing?.id === i.id ? (
              <form
                className="ts-fgrid ts-g3 !mt-0 items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => api.installed.update(i.id, { warranty_end_date: renewing.warranty || null, amc_end_date: renewing.amc || null }), () => setRenewing(null));
                }}
              >
                <TextField label="Warranty ends" type="date" value={renewing.warranty} onChange={(e) => setRenewing({ ...renewing, warranty: e.target.value })} />
                <TextField label="AMC ends" type="date" value={renewing.amc} onChange={(e) => setRenewing({ ...renewing, amc: e.target.value })} />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={busy}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenewing(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : retiring?.id === i.id ? (
              <form
                className="flex flex-col sm:flex-row sm:items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => api.installed.retire(i.id, retiring.reason), () => setRetiring(null));
                }}
              >
                <div className="flex-1">
                  <TextField label="Why is it being retired?" value={retiring.reason} onChange={(e) => setRetiring({ ...retiring, reason: e.target.value })} required autoFocus />
                </div>
                <Button type="submit" size="sm" variant="danger" disabled={busy || !retiring.reason.trim()}>
                  Retire
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRetiring(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              canEditRow(i.salesperson_id) && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setRenewing({ id: i.id, warranty: i.warranty_end_date ?? '', amc: i.amc_end_date ?? '' })}>
                    Update dates
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRetiring({ id: i.id, reason: '' })}>
                    Retire
                  </Button>
                </div>
              )
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReordersCard({ companyId, contacts }: { companyId: number; contacts: Contact[] }) {
  const list = useLoad<ReorderPlan[]>(() => api.reorders.list(companyId), []);
  const { choosing, people } = useResponsible();
  const empty = { item: '', interval_days: '30', last_order_date: '', typical_value: '', contact_id: '', salesperson_id: '' };
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Consumables reorders"
        description="Things they buy again and again. A follow-up appears a week before each is due."
        action={
          !adding ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              + Add
            </Button>
          ) : undefined
        }
      />
      {error && (
        <div className="px-4 sm:px-5 pt-3">
          <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>
        </div>
      )}
      {adding && (
        <form
          className="p-4 sm:p-5 ts-fgrid ts-g2 !mt-0 border-b border-dashed border-line"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api.reorders.create({
                company_id: companyId,
                item: form.item,
                product_id: null,
                interval_days: Number(form.interval_days),
                last_order_date: form.last_order_date || null,
                typical_value: form.typical_value === '' ? null : Number(form.typical_value),
                contact_id: form.contact_id ? Number(form.contact_id) : null,
                salesperson_id: form.salesperson_id ? Number(form.salesperson_id) : null,
              });
              setAdding(false);
              setForm(empty);
              await list.reload();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not save.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField label="Item" placeholder="e.g. HPLC grade solvents" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required />
          <TextField label="Reorders every (days)" inputMode="numeric" value={form.interval_days} onChange={(e) => setForm({ ...form, interval_days: e.target.value.replace(/\D/g, '') })} required />
          <TextField label="Last ordered" type="date" value={form.last_order_date} onChange={(e) => setForm({ ...form, last_order_date: e.target.value })} hint="Leave empty to count from today." />
          <TextField label="Typical order (₹)" inputMode="numeric" value={formatIndianDigits(form.typical_value)} onChange={(e) => setForm({ ...form, typical_value: e.target.value.replace(/\D/g, '') })} />
          <ContactSelect contacts={contacts} value={form.contact_id} onChange={(contact_id) => setForm({ ...form, contact_id })} />
          {choosing && (
            <SelectField label="Responsible salesperson" value={form.salesperson_id} onChange={(e) => setForm({ ...form, salesperson_id: e.target.value })} required>
              <option value="">Select…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          )}
          <div className="ts-span2 flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !form.item.trim() || !Number(form.interval_days) || (choosing && !form.salesperson_id)}>
              Save reorder
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {list.data.length === 0 && !adding && !list.loading && <EmptyState>Nothing recorded yet.</EmptyState>}
      <ul className="divide-y divide-dashed divide-line">
        {list.data.map((r) => (
          <li key={r.id} className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium break-words">{r.item}</span>
              <span className="block text-xs text-ink-muted">
                Every {r.interval_days} days · {r.salesperson_name}
                {r.typical_value != null && ` · about ${formatMoney(r.typical_value, { compact: true })}`}
              </span>
            </span>
            <span className={`shrink-0 ${r.days_left < 0 ? 'ts-st ts-tone-bad' : r.days_left <= 7 ? 'ts-due ts-warn' : 'ts-due'}`}>
              {r.days_left <= 7 ? daysLabel(r.days_left, 'overdue') : formatDate(r.next_due_date)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
