import { useEffect, useState } from 'react';
import { api, Performance as Metrics } from '../lib/api';
import { useAuth } from '../lib/auth';
import { LOST_REASON_LABELS, formatDate, formatMoney } from '../lib/labels';
import { Card, CardHeader, Notice, PageHeader, SelectField } from '../components/ui';

const RANGES = [7, 30, 90];

function Tile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'ok' | 'danger' | 'accent' }) {
  return (
    <div className="bg-white border border-line rounded-xl shadow-card px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent-dark' : ''}`}>{value}</div>
      <div className="text-xs text-ink-muted mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-ink-faint mt-0.5">{hint}</div>}
    </div>
  );
}

export default function Performance() {
  const { user } = useAuth();
  const teamView = user?.role !== 'salesperson';
  const [days, setDays] = useState(30);
  const [salespersonId, setSalespersonId] = useState<number | ''>('');
  const [salespeople, setSalespeople] = useState<{ id: number; name: string }[]>([]);
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (teamView) api.directory.salespeople().then(setSalespeople).catch(() => undefined);
  }, [teamView]);

  useEffect(() => {
    setError('');
    api
      .performance({ days, salesperson_id: salespersonId })
      .then(setM)
      .catch((err) => setError(err.message));
  }, [days, salespersonId]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Performance" description={teamView ? (salespersonId ? 'One salesperson.' : 'The whole team.') : 'Your numbers.'} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2" role="tablist" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={days === r}
              onClick={() => setDays(r)}
              className={`h-9 px-3 rounded-full text-sm font-semibold border ${days === r ? 'bg-brand text-white border-brand' : 'bg-white text-ink-muted border-line'}`}
            >
              {r} days
            </button>
          ))}
        </div>
        {teamView && (
          <div className="w-56">
            <SelectField label="Salesperson" value={salespersonId} onChange={(e) => setSalespersonId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Whole team</option>
              {salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </div>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {m && (
        <>
          <p className="text-xs text-ink-faint -mt-2">
            {formatDate(m.from)} – {formatDate(m.to)}
          </p>
          <section>
            <h2 className="text-sm font-semibold text-ink-muted mb-2">Field activity</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile label="Visits" value={m.visits} />
              <Tile label="Companies visited" value={m.companies_visited} />
              <Tile label="New prospects" value={m.new_prospects} hint="First-ever visit to the company" />
              <Tile label="Overdue follow-ups" value={m.overdue_follow_ups} tone={m.overdue_follow_ups ? 'danger' : undefined} hint="Right now" />
            </div>
          </section>
          <section>
            <h2 className="text-sm font-semibold text-ink-muted mb-2">Deals</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile label="Deals opened" value={m.deals_opened} />
              <Tile label="Quotation requests" value={m.quotation_requests} />
              <Tile label="Quotations sent" value={m.quotations_sent} />
              <Tile label="Deals won" value={m.deals_won} tone="ok" hint={formatMoney(m.won_value)} />
              <Tile label="Deals lost" value={m.deals_lost} />
              <Tile label="Deals abandoned" value={m.deals_abandoned} />
              <Tile label="Win rate" value={m.win_rate === null ? '—' : `${m.win_rate}%`} hint="Of deals closed in the period" />
              <Tile label="Days to win" value={m.avg_days_to_win ?? '—'} hint="Average, opened → won" />
            </div>
          </section>
          <section>
            <h2 className="text-sm font-semibold text-ink-muted mb-2">Pipeline now</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile label="Open deals" value={m.open_deals} />
              <Tile label="Pipeline value" value={formatMoney(m.pipeline_value, { compact: true })} />
              <Tile label="Weighted pipeline" value={formatMoney(m.weighted_pipeline, { compact: true })} hint="Order value × win probability" />
              <Tile label="Overdue deals" value={m.overdue_deals} tone={m.overdue_deals ? 'accent' : undefined} hint="Past expected closing date" />
              <Tile label="Stuck deals" value={m.stuck_deals} tone={m.stuck_deals ? 'accent' : undefined} hint="Too long in one stage" />
            </div>
          </section>
          {m.lost_reasons.length > 0 && (
            <Card>
              <CardHeader title="Why deals were lost" />
              <ul className="divide-y divide-line">
                {m.lost_reasons.map((r) => (
                  <li key={r.reason} className="px-4 sm:px-5 py-2.5 flex justify-between text-sm">
                    <span>{LOST_REASON_LABELS[r.reason]}</span>
                    <span className="font-semibold tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p className="text-xs text-ink-faint">
            Won value counts the order amount entered when a deal is marked won — never the quotation total. Quotation requests, sent
            quotations, won and lost deals count toward the deal’s current owner; deals opened toward whoever opened them.
          </p>
        </>
      )}
    </div>
  );
}
