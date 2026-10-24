import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, CompanySummary } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { canWriteCrm } from '../../lib/roles';
import CompanyPicker from '../../components/CompanyPicker';
import { Button, Card, EmptyState, Notice, PageHeader, TextField } from '../../components/ui';

export default function Companies() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CompanySummary[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.companies
        .search(q.trim())
        .then(setRows)
        .catch((err) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Companies" description="Shared by the whole team — search before adding a new one." />
        {canWriteCrm(user?.role) && !adding && (
          <Button className="shrink-0" onClick={() => setAdding(true)}>
            + Add
          </Button>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      {adding ? (
        <Card className="p-4 sm:p-5">
          <CompanyPicker allowCreate onSelect={(c) => navigate(`/companies/${c.id}`)} />
          <Button variant="ghost" className="mt-3" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </Card>
      ) : (
        <>
          <div className="mb-4 max-w-md">
            <TextField label="Search" type="search" placeholder="Name, city or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Card>
            {rows?.length === 0 && <EmptyState>{q ? 'No matching companies.' : 'No companies yet.'}</EmptyState>}
            <ul className="divide-y divide-line">
              {rows?.map((c) => (
                <li key={c.id}>
                  <Link to={`/companies/${c.id}`} className="block px-4 sm:px-5 py-3 hover:bg-canvas">
                    <span className="block text-sm font-semibold">{c.name}</span>
                    <span className="block text-xs text-ink-muted">{[c.city, c.phone].filter(Boolean).join(' · ') || '—'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
