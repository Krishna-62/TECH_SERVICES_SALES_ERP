import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TenderRow, api } from '../../lib/api';
import { BID_STATUS_LABELS, EMD_STATUS_LABELS, daysLabel, formatDate, formatMoney } from '../../lib/labels';
import { useAuth } from '../../lib/auth';
import { Badge, Card, EmptyState, Notice, PageHeader } from '../../components/ui';

const VIEWS = [
  ['open', 'To submit'],
  ['submitted', 'Submitted'],
  ['emd', 'EMD to recover'],
  ['all', 'All'],
] as const;

type View = (typeof VIEWS)[number][0];

// Bid deadlines, and deposits that should be coming back.
export default function Tenders() {
  const { user } = useAuth();
  const teamView = user?.role !== 'salesperson';
  const [view, setView] = useState<View>('open');
  const [rows, setRows] = useState<TenderRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    setError('');
    api.tenders.list(view).then(setRows).catch((err) => setError(err.message));
  }, [view]);

  const emdTotal = rows?.reduce((sum, t) => sum + (t.emd_amount ?? 0), 0) ?? 0;

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <PageHeader title="Tenders" description="Add tender details from the deal page of any deal marked as a tender." />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2" role="tablist">
        {VIEWS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
            className={`h-9 px-3 rounded-full text-sm font-semibold border ${view === value ? 'bg-brand text-white border-brand' : 'bg-white text-ink-muted border-line'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'emd' && rows && rows.length > 0 && (
        <p className="text-sm">
          <b>{formatMoney(emdTotal)}</b> in deposits should be coming back. Mark each one refunded or forfeited when it’s settled.
        </p>
      )}
      <Card>
        {rows?.length === 0 && (
          <EmptyState>{view === 'open' ? 'No bids waiting to be submitted.' : view === 'emd' ? 'No deposits waiting to come back.' : 'Nothing here yet.'}</EmptyState>
        )}
        {rows === null && !error && <EmptyState>Loading…</EmptyState>}
        <ul className="divide-y divide-line">
          {rows?.map((t) => (
            <li key={t.opportunity_id}>
              <Link to={`/pipeline/${t.opportunity_id}`} className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold break-words">{t.deal_title}</span>
                  <span className="block text-xs text-ink-muted break-words">
                    {t.company_name} · {t.tender_number}
                    {t.issuing_authority && ` · ${t.issuing_authority}`}
                    {teamView && ` · ${t.owner_name}`}
                  </span>
                  <span className="block text-xs text-ink-muted mt-0.5">
                    Due {formatDate(t.bid_due_date)} · EMD {EMD_STATUS_LABELS[t.emd_status].toLowerCase()}
                    {t.emd_amount != null && ` ${formatMoney(t.emd_amount, { compact: true })}`}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <Badge tone={t.bid_status === 'won' ? 'ok' : t.bid_status === 'lost' || t.bid_status === 'cancelled' ? 'muted' : 'brand'}>{BID_STATUS_LABELS[t.bid_status]}</Badge>
                  {t.bid_status === 'preparing' && <span className={`text-xs font-semibold ${t.is_late || t.days_left < 3 ? 'text-danger' : 'text-accent-dark'}`}>{daysLabel(t.days_left)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
