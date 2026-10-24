import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, TeamInsights, TeamPerformance } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { LOST_REASON_LABELS, STAGE_LABELS, formatDate, formatMoney } from '../../lib/labels';
import { isManagingRole } from '../../lib/roles';
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader } from '../../components/ui';

const RANGES = [7, 30, 90];

function Tile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'ok' | 'danger' }) {
  return (
    <div className="bg-white border border-line rounded-xl shadow-card px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : ''}`}>{value}</div>
      <div className="text-xs text-ink-muted mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-ink-faint mt-0.5">{hint}</div>}
    </div>
  );
}

function monthLabel(ym: string) {
  return new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });
}

export default function Team() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [perf, setPerf] = useState<TeamPerformance | null>(null);
  const [insights, setInsights] = useState<TeamInsights | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    Promise.all([api.team.performance(days), api.team.insights(days)])
      .then(([p, i]) => {
        setPerf(p);
        setInsights(i);
      })
      .catch((err) => setError(err.message));
  }, [days]);

  const t = perf?.totals;
  const maxMonth = Math.max(1, ...(insights?.won_by_month.map((m) => m.won_value) ?? [0]));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <PageHeader title="Team" description="Every salesperson side by side. The rows add up to the team total." />
        {isManagingRole(user?.role) && (
          <Link to="/team/handover" className="shrink-0 inline-flex items-center h-10 px-4 rounded-lg border border-line bg-white text-sm font-semibold hover:bg-canvas">
            Hand over work…
          </Link>
        )}
      </div>

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
        {perf && (
          <span className="self-center text-xs text-ink-faint ml-2">
            {formatDate(perf.from)} – {formatDate(perf.to)}
          </span>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {insights && insights.orphaned.length > 0 && (
        <Notice tone="error">
          {insights.orphaned.map((o) => `${o.name} (${o.open_deals} open deal${o.open_deals === 1 ? '' : 's'})`).join(', ')}{' '}
          {insights.orphaned.length === 1 ? 'has' : 'have'} left but still own{insights.orphaned.length === 1 ? 's' : ''} open deals.{' '}
          {isManagingRole(user?.role) && (
            <Link to={`/team/handover?from=${insights.orphaned[0].salesperson_id}`} className="underline font-semibold">
              Hand them over
            </Link>
          )}
        </Notice>
      )}

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Won" value={formatMoney(t.won_value, { compact: true })} hint={`${t.deals_won} deals · win rate ${t.win_rate ?? '—'}%`} tone="ok" />
          <Tile label="Pipeline" value={formatMoney(t.pipeline_value, { compact: true })} hint={`${t.open_deals} open · weighted ${formatMoney(t.weighted_pipeline, { compact: true })}`} />
          <Tile label="Visits" value={t.visits} hint={`${t.companies_visited} companies · ${t.new_prospects} new`} />
          <Tile label="Overdue follow-ups" value={t.overdue_follow_ups} tone={t.overdue_follow_ups ? 'danger' : undefined} hint="Right now" />
        </div>
      )}

      {perf && (
        <Card>
          <CardHeader title="By salesperson" />
          {/* Phones: one card per person */}
          <ul className="md:hidden divide-y divide-line">
            {perf.salespeople.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{p.name}</span>
                  {!p.is_active && <Badge tone="muted">Left</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-ink-muted">
                  <span>
                    <b className="text-ink">{p.metrics.visits}</b> visits
                  </span>
                  <span>
                    <b className="text-ink">{p.metrics.deals_won}</b> won · {formatMoney(p.metrics.won_value, { compact: true })}
                  </span>
                  <span>
                    <b className="text-ink">{formatMoney(p.metrics.pipeline_value, { compact: true })}</b> open
                  </span>
                  <span>
                    <b className="text-ink">{p.metrics.quotation_requests}</b> quote req.
                  </span>
                  <span>
                    win <b className="text-ink">{p.metrics.win_rate ?? '—'}%</b>
                  </span>
                  <span className={p.metrics.overdue_follow_ups ? 'text-danger font-semibold' : ''}>{p.metrics.overdue_follow_ups} overdue</span>
                </div>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th className="px-5 py-2.5 font-semibold">Salesperson</th>
                  {['Visits', 'Companies', 'New', 'Quote req.', 'Quotes sent', 'Won', 'Won value', 'Win rate', 'Open pipeline', 'Overdue'].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {perf.salespeople.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2.5 font-semibold whitespace-nowrap">
                      {p.name} {!p.is_active && <Badge tone="muted">Left</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-right">{p.metrics.visits}</td>
                    <td className="px-3 py-2.5 text-right">{p.metrics.companies_visited}</td>
                    <td className="px-3 py-2.5 text-right">{p.metrics.new_prospects}</td>
                    <td className="px-3 py-2.5 text-right">{p.metrics.quotation_requests}</td>
                    <td className="px-3 py-2.5 text-right">{p.metrics.quotations_sent}</td>
                    <td className="px-3 py-2.5 text-right">{p.metrics.deals_won}</td>
                    <td className="px-3 py-2.5 text-right">{formatMoney(p.metrics.won_value, { compact: true })}</td>
                    <td className="px-3 py-2.5 text-right">{p.metrics.win_rate === null ? '—' : `${p.metrics.win_rate}%`}</td>
                    <td className="px-3 py-2.5 text-right">{formatMoney(p.metrics.pipeline_value, { compact: true })}</td>
                    <td className={`px-3 py-2.5 text-right ${p.metrics.overdue_follow_ups ? 'text-danger font-semibold' : ''}`}>{p.metrics.overdue_follow_ups}</td>
                  </tr>
                ))}
              </tbody>
              {t && (
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold tabular-nums">
                    <td className="px-5 py-2.5">Team</td>
                    <td className="px-3 py-2.5 text-right">{t.visits}</td>
                    <td className="px-3 py-2.5 text-right">{t.companies_visited}</td>
                    <td className="px-3 py-2.5 text-right">{t.new_prospects}</td>
                    <td className="px-3 py-2.5 text-right">{t.quotation_requests}</td>
                    <td className="px-3 py-2.5 text-right">{t.quotations_sent}</td>
                    <td className="px-3 py-2.5 text-right">{t.deals_won}</td>
                    <td className="px-3 py-2.5 text-right">{formatMoney(t.won_value, { compact: true })}</td>
                    <td className="px-3 py-2.5 text-right">{t.win_rate === null ? '—' : `${t.win_rate}%`}</td>
                    <td className="px-3 py-2.5 text-right">{formatMoney(t.pipeline_value, { compact: true })}</td>
                    <td className="px-3 py-2.5 text-right">{t.overdue_follow_ups}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="px-5 py-2 text-[11px] text-ink-faint">
            Companies visited and new prospects can be less in the team row than the sum: two salespeople can visit the same company.
          </p>
        </Card>
      )}

      {insights && (
        <>
          <Card>
            <CardHeader title="Won, last 6 months" />
            <div className="px-4 sm:px-5 py-4 grid grid-cols-6 gap-2 items-end h-48" role="list">
              {insights.won_by_month.map((m) => (
                <div key={m.month} className="flex flex-col items-center gap-1 h-full justify-end" role="listitem" aria-label={`${monthLabel(m.month)}: ${formatMoney(m.won_value)}, ${m.deals_won} deals`}>
                  <span className="text-[11px] text-ink-muted tabular-nums">{m.won_value ? formatMoney(m.won_value, { compact: true }) : ''}</span>
                  <div className="w-full max-w-12 rounded-t bg-brand" style={{ height: `${Math.max(2, (m.won_value / maxMonth) * 100)}%`, opacity: m.won_value ? 1 : 0.2 }} />
                  <span className="text-xs text-ink-muted">{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {[
              { title: 'By product category', rows: insights.by_category.map((r) => ({ key: r.category, ...r })) },
              { title: 'By city', rows: insights.by_city.map((r) => ({ key: r.city, ...r })) },
            ].map((section) => (
              <Card key={section.title}>
                <CardHeader title={section.title} description="Won in the period · open pipeline now" />
                {section.rows.length === 0 && <EmptyState>Nothing yet.</EmptyState>}
                <ul className="divide-y divide-line">
                  {section.rows.map((r) => (
                    <li key={r.key} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{r.key}</span>
                      <span className="text-right tabular-nums shrink-0">
                        <span className="text-ok font-semibold">{formatMoney(r.won_value, { compact: true })}</span>
                        <span className="text-ink-faint"> · </span>
                        <span>{formatMoney(r.pipeline_value, { compact: true })}</span>
                        <span className="text-ink-faint text-xs"> ({r.open_deals})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Deals going quiet" description={`Open deals with no activity for ${insights.stale_after_days}+ days, biggest first.`} />
            {insights.stale_deals.length === 0 && <EmptyState>Every open deal has had recent activity.</EmptyState>}
            <ul className="divide-y divide-line">
              {insights.stale_deals.map((d) => (
                <li key={d.id}>
                  <Link to={`/pipeline/${d.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold truncate">{d.title}</span>
                      <span className="block text-xs text-ink-muted truncate">
                        {d.company_name} · {d.owner_name} · {STAGE_LABELS[d.stage]}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-semibold tabular-nums">{formatMoney(d.estimated_value, { compact: true })}</span>
                      <span className="block text-xs text-danger">{d.idle_days} days quiet</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {t && t.lost_reasons.length > 0 && (
            <Card>
              <CardHeader title="Why deals were lost" />
              <ul className="divide-y divide-line">
                {t.lost_reasons.map((r) => (
                  <li key={r.reason} className="px-4 sm:px-5 py-2.5 flex justify-between text-sm">
                    <span>{LOST_REASON_LABELS[r.reason]}</span>
                    <span className="font-semibold tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
