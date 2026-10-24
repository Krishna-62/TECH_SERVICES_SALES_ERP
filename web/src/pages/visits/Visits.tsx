import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Visit } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { OUTCOME_LABELS, formatDateTime } from '../../lib/labels';
import { canWriteCrm } from '../../lib/roles';
import { Badge, Card, EmptyState, Notice, PageHeader } from '../../components/ui';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'To finish' },
  { value: 'completed', label: 'Completed' },
];

export default function Visits() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [error, setError] = useState('');
  const teamView = user?.role !== 'salesperson';

  useEffect(() => {
    setVisits(null);
    api.visits
      .list({ status, limit: 100 })
      .then(setVisits)
      .catch((err) => setError(err.message));
  }, [status]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Visits" description={teamView ? 'Every salesperson’s visits, newest first.' : 'Your visits, newest first.'} />
        {canWriteCrm(user?.role) && (
          <Link to="/visits/new" className="shrink-0 inline-flex items-center h-10 px-4 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark">
            + Log visit
          </Link>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2 mb-4" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={status === f.value}
            onClick={() => setStatus(f.value)}
            className={`h-9 px-3 rounded-full text-sm font-semibold border ${status === f.value ? 'bg-brand text-white border-brand' : 'bg-white text-ink-muted border-line'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <Card>
        {visits?.length === 0 && <EmptyState>No visits yet.</EmptyState>}
        {visits === null && <EmptyState>Loading…</EmptyState>}
        <ul className="divide-y divide-line">
          {visits?.map((v) => (
            <li key={v.id}>
              <Link to={`/visits/${v.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{v.company_name}</span>
                  <span className="block text-xs text-ink-muted truncate">
                    {formatDateTime(v.visited_at)}
                    {v.contact_name && ` · ${v.contact_name}`}
                    {teamView && ` · ${v.salesperson_name}`}
                  </span>
                </span>
                {v.status === 'draft' ? <Badge tone="muted">To finish</Badge> : v.outcome && <Badge>{OUTCOME_LABELS[v.outcome]}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
