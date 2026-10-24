import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, CompanySummary, Opportunity, Stage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { LOST_REASON_LABELS, OPEN_STAGES, STAGE_LABELS, formatDate, formatMoney, localDate } from '../../lib/labels';
import { canWriteCrm } from '../../lib/roles';
import CompanyPicker from '../../components/CompanyPicker';
import { Badge, Button, Card, CardHeader, EmptyState, Notice, PageHeader, TextField } from '../../components/ui';

type View = 'open' | 'won' | 'lost';

function DealCard({ deal, teamView }: { deal: Opportunity; teamView: boolean }) {
  const late = deal.expected_close_date && deal.expected_close_date < localDate() && !deal.closed_at;
  return (
    <Link to={`/pipeline/${deal.id}`} className="block rounded-lg border border-line bg-white p-3 hover:border-brand/40 shadow-card">
      <div className="text-sm font-semibold leading-snug">{deal.title}</div>
      <div className="text-xs text-ink-muted mt-0.5 truncate">{deal.company_name}</div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-sm font-semibold tabular-nums">{formatMoney(deal.won_value ?? deal.estimated_value, { compact: true })}</span>
        {deal.expected_close_date && !deal.closed_at && (
          <span className={`text-xs ${late ? 'text-danger font-semibold' : 'text-ink-faint'}`}>{formatDate(deal.expected_close_date)}</span>
        )}
      </div>
      {teamView && <div className="text-xs text-ink-faint mt-1">{deal.owner_name}</div>}
    </Link>
  );
}

export default function Pipeline() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('open');
  const [deals, setDeals] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage | ''>('');
  const [creating, setCreating] = useState(false);
  const teamView = user?.role !== 'salesperson';

  useEffect(() => {
    setDeals(null);
    api.opportunities
      .list({ status: view })
      .then(setDeals)
      .catch((err) => setError(err.message));
  }, [view]);

  const byStage = (stage: Stage) => (deals ?? []).filter((d) => d.stage === stage);
  const total = (list: Opportunity[]) => list.reduce((sum, d) => sum + (d.estimated_value ?? 0), 0);
  const openTotal = total(deals ?? []);
  const weighted = (deals ?? []).reduce((sum, d) => sum + ((d.estimated_value ?? 0) * d.probability) / 100, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Pipeline" description={teamView ? 'Every open deal across the team.' : 'Your deals.'} />
        {canWriteCrm(user?.role) && !creating && (
          <Button className="shrink-0" onClick={() => setCreating(true)}>
            + New deal
          </Button>
        )}
      </div>
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      {creating && <NewDeal onCancel={() => setCreating(false)} />}

      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {(['open', 'won', 'lost'] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`h-9 px-3 rounded-full text-sm font-semibold border ${view === v ? 'bg-brand text-white border-brand' : 'bg-white text-ink-muted border-line'}`}
          >
            {v === 'open' ? 'Open' : v === 'won' ? 'Won' : 'Lost'}
          </button>
        ))}
        {view === 'open' && deals && (
          <span className="text-sm text-ink-muted ml-auto">
            {deals.length} deals · {formatMoney(openTotal, { compact: true })} · weighted {formatMoney(weighted, { compact: true })}
          </span>
        )}
      </div>

      {deals === null && <p className="text-sm text-ink-faint">Loading…</p>}

      {view === 'open' && deals && (
        <>
          {/* Phones: one stage at a time */}
          <div className="lg:hidden flex flex-col gap-3">
            <select
              aria-label="Stage"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as Stage | '')}
              className="h-11 rounded-lg border border-line bg-white px-3"
            >
              <option value="">All stages ({deals.length})</option>
              {OPEN_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]} ({byStage(s).length})
                </option>
              ))}
            </select>
            {(stageFilter ? byStage(stageFilter) : deals).map((d) => (
              <div key={d.id}>
                {!stageFilter && <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-1">{STAGE_LABELS[d.stage]}</div>}
                <DealCard deal={d} teamView={teamView} />
              </div>
            ))}
            {deals.length === 0 && (
              <Card>
                <EmptyState>No open deals. Open one from a visit or with “New deal”.</EmptyState>
              </Card>
            )}
          </div>

          {/* Desktop: board */}
          <div className="hidden lg:grid grid-cols-6 gap-3 items-start">
            {OPEN_STAGES.map((s) => {
              const list = byStage(s);
              return (
                <section key={s} className="rounded-xl bg-white/60 border border-line p-2 min-h-[8rem]">
                  <header className="px-1 pb-2">
                    <div className="text-xs font-semibold text-ink-muted">{STAGE_LABELS[s]}</div>
                    <div className="text-xs text-ink-faint">
                      {list.length} · {formatMoney(total(list), { compact: true })}
                    </div>
                  </header>
                  <div className="flex flex-col gap-2">
                    {list.map((d) => (
                      <DealCard key={d.id} deal={d} teamView={teamView} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {view !== 'open' && deals && (
        <Card>
          {deals.length === 0 && <EmptyState>Nothing {view} yet.</EmptyState>}
          <ul className="divide-y divide-line">
            {deals.map((d) => (
              <li key={d.id}>
                <Link to={`/pipeline/${d.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{d.title}</span>
                    <span className="block text-xs text-ink-muted truncate">
                      {d.company_name}
                      {teamView && ` · ${d.owner_name}`}
                      {d.closed_at && ` · ${formatDate(d.closed_at)}`}
                      {d.lost_reason && ` · ${LOST_REASON_LABELS[d.lost_reason]}`}
                    </span>
                  </span>
                  {d.stage === 'won' ? <Badge tone="ok">{formatMoney(d.won_value, { compact: true })}</Badge> : <Badge tone="muted">Lost</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function NewDeal({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanySummary | null>(null);
  const [form, setForm] = useState({ title: '', estimated_value: '', expected_close_date: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setBusy(true);
    setError('');
    try {
      const deal = await api.opportunities.create({
        company_id: company.id,
        title: form.title,
        estimated_value: form.estimated_value === '' ? null : Number(form.estimated_value),
        expected_close_date: form.expected_close_date || null,
      });
      navigate(`/pipeline/${deal.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the deal.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="New deal" />
      <div className="p-4 sm:p-5 flex flex-col gap-4">
        {error && <Notice tone="error">{error}</Notice>}
        {!company ? (
          <CompanyPicker onSelect={setCompany} allowCreate />
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3 flex items-center justify-between rounded-lg bg-canvas px-3 py-2">
              <span className="text-sm font-semibold">{company.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setCompany(null)}>
                Change
              </Button>
            </div>
            <TextField label="What's the deal?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
            <TextField label="Estimated value (₹)" inputMode="decimal" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
            <TextField label="Expected to close" type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
            <div className="sm:col-span-3 flex gap-2">
              <Button type="submit" disabled={busy || !form.title.trim()}>
                Open deal
              </Button>
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {!company && (
          <div>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
