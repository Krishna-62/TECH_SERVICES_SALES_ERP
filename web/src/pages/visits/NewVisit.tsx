import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, CompanyDetail, CompanySummary } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isManagingRole } from '../../lib/roles';
import CompanyPicker from '../../components/CompanyPicker';
import { Button, Card, CardHeader, Notice, PageHeader, SelectField, TextField } from '../../components/ui';

// Step 1: pick (or register) the company. Step 2: who you're meeting. Then the draft visit is
// created and the salesperson finishes it after the meeting on the visit page.
export default function NewVisit() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [contactChoice, setContactChoice] = useState<string>('');
  const [newContact, setNewContact] = useState({ name: '', designation: '', phone: '' });
  const [salespeople, setSalespeople] = useState<{ id: number; name: string }[]>([]);
  const [salespersonId, setSalespersonId] = useState<number | ''>(user?.salesperson_id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One id per attempt: a double-tap or a retry after a timeout returns the same visit.
  const clientUuid = useMemo(() => crypto.randomUUID(), []);
  const managing = isManagingRole(user?.role);

  async function selectCompany(c: CompanySummary & { primary_contact_id?: number | null }) {
    setError('');
    try {
      const detail = await api.companies.get(c.id);
      setCompany(detail);
      const preset = c.primary_contact_id ?? (detail.contacts.length === 1 ? detail.contacts[0].id : null);
      setContactChoice(preset ? String(preset) : detail.contacts.length ? '' : 'new');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the company.');
    }
  }

  useEffect(() => {
    const preselected = Number(params.get('company'));
    if (preselected) selectCompany({ id: preselected, name: '', city: null, phone: null });
    if (managing) api.directory.salespeople().then(setSalespeople).catch(() => undefined);
    // Runs once on open.
  }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setBusy(true);
    setError('');
    try {
      const visit = await api.visits.create({
        company_id: company.id,
        client_uuid: clientUuid,
        salesperson_id: managing && salespersonId ? Number(salespersonId) : undefined,
        ...(contactChoice === 'new'
          ? newContact.name.trim()
            ? { contact: newContact }
            : {}
          : contactChoice
            ? { contact_id: Number(contactChoice) }
            : {}),
      });
      navigate(`/visits/${visit.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the visit.');
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Log a visit" description="Start it when you arrive; finish it with the outcome after the meeting." />
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}

      {!company ? (
        <Card className="p-4 sm:p-5">
          <CompanyPicker onSelect={selectCompany} allowCreate />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={company.name}
            description={[company.city, company.phone].filter(Boolean).join(' · ') || undefined}
            action={
              <Button size="sm" variant="ghost" onClick={() => setCompany(null)}>
                Change
              </Button>
            }
          />
          <form onSubmit={start} className="p-4 sm:p-5 flex flex-col gap-4">
            <SelectField label="Meeting with" value={contactChoice} onChange={(e) => setContactChoice(e.target.value)}>
              <option value="">Not decided yet</option>
              {company.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.designation ? ` — ${c.designation}` : ''}
                </option>
              ))}
              <option value="new">+ Someone new</option>
            </SelectField>

            {contactChoice === 'new' && (
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField label="Name" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} autoFocus />
                <TextField label="Designation" value={newContact.designation} onChange={(e) => setNewContact({ ...newContact, designation: e.target.value })} />
                <TextField label="Phone" type="tel" inputMode="tel" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
              </div>
            )}

            {managing && (
              <SelectField
                label="Salesperson"
                value={salespersonId}
                onChange={(e) => setSalespersonId(e.target.value ? Number(e.target.value) : '')}
                hint="Whose visit is this?"
              >
                <option value="">Select…</option>
                {salespeople.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            )}

            <Button type="submit" disabled={busy || (managing && !salespersonId) || (contactChoice === 'new' && !newContact.name.trim())} className="h-12">
              {busy ? 'Starting…' : 'Start visit'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
