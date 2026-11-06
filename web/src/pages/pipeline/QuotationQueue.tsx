import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { formatDateTime, formatMoney } from '../../lib/labels';
import { Card, EmptyState, Notice, OverdueBadge, PageHeader } from '../../components/ui';

// The office's queue: deals where the customer asked for a quotation and none is recorded yet.
// Prepare the quotation in the Technicon Services ERP, then record its number on the deal.
export default function QuotationQueue() {
  const queue = useLoad(api.opportunities.quotationRequests, []);
  return (
    <div>
      <PageHeader
        title="Quotation requests"
        description="Customers waiting for a quotation, oldest first. Prepare it in the ERP, then record it on the deal."
      />
      {queue.error && <Notice tone="error">{queue.error}</Notice>}
      <Card>
        {queue.data.length === 0 && !queue.loading && <EmptyState>No quotations waiting.</EmptyState>}
        <ul className="divide-y divide-line">
          {queue.data.map((d) => (
            <li key={d.id}>
              <Link to={`/pipeline/${d.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{d.company_name}</span>
                  <span className="block text-xs text-ink-muted truncate">
                    {d.title} · {d.owner_name} · updated {formatDateTime(d.updated_at)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  {d.is_overdue && <OverdueBadge />}
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(d.estimated_value, { compact: true })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
