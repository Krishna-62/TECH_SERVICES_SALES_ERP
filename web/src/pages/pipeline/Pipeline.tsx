import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, CompanySummary, DealFilters, NamedOption, Opportunity, Stage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { LOST_REASON_LABELS, OPEN_STAGES, STAGE_LABELS, formatDate, formatMoney } from '../../lib/labels';
import { canWriteCrm, isManagingRole } from '../../lib/roles';
import BulkBar, { bulkMessage } from '../../components/BulkBar';
import CompanyPicker from '../../components/CompanyPicker';
import DealFields, { DealDraft, EMPTY_DEAL_DRAFT, dealDraftComplete, draftToInput } from '../../components/DealFields';
import { Badge, Button, Card, CardHeader, EmptyState, Notice, OverdueBadge, PageHeader, SelectField, StuckBadge, TextField } from '../../components/ui';

type View = 'open' | 'won' | 'lost' | 'abandoned';

function DealCard({ deal, teamView, selected, onToggle }: { deal: Opportunity; teamView: boolean; selected?: boolean; onToggle?: () => void }) {
  const body = (
    <>
      <div className="text-sm font-semibold leading-snug">{deal.title}</div>
      <div className="text-xs text-ink-muted mt-0.5 truncate">{deal.company_name}</div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-sm font-semibold tabular-nums">{formatMoney(deal.won_value ?? deal.estimated_value, { compact: true })}</span>
        {deal.expected_close_date && !deal.closed_at && (
          <span className={`text-xs ${deal.is_overdue ? 'text-accent-dark font-semibold' : 'text-ink-faint'}`}>{formatDate(deal.expected_close_date)}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
        {deal.is_overdue && <OverdueBadge />}
        {deal.is_stuck && <StuckBadge days={deal.days_in_stage} />}
        <span className="text-xs text-ink-faint">{deal.probability}%</span>
        {teamView && <span className="text-xs text-ink-faint">{deal.owner_name}</span>}
      </div>
    </>
  );
  if (onToggle) {
    return (
      <label className={`flex items-start gap-2 rounded-lg border bg-white p-3 shadow-card cursor-pointer ${selected ? 'border-brand ring-1 ring-brand' : 'border-line'}`}>
        <input type="checkbox" className="h-5 w-5 mt-0.5 shrink-0" checked={Boolean(selected)} onChange={onToggle} />
        <span className="min-w-0 flex-1 block">{body}</span>
      </label>
    );
  }
  return (
    <Link to={`/pipeline/${deal.id}`} className="block rounded-lg border border-line bg-white p-3 hover:border-brand/40 shadow-card">
      {body}
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
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [stuckOnly, setStuckOnly] = useState(false);
  const [oemId, setOemId] = useState<number | ''>('');
  const [segmentId, setSegmentId] = useState<number | ''>('');
  const [ownerId, setOwnerId] = useState<number | ''>('');
  const [oems, setOems] = useState<NamedOption[]>([]);
  const [segments, setSegments] = useState<NamedOption[]>([]);
  const [people, setPeople] = useState<{ id: number; name: string }[]>([]);
  const [notice, setNotice] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [newDate, setNewDate] = useState('');
  const [newStage, setNewStage] = useState<Stage | ''>('');
  const [newOwner, setNewOwner] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const managing = isManagingRole(user?.role);
  const filters: DealFilters = { status: view, overdue: view === 'open' && overdueOnly ? 1 : '', stuck: view === 'open' && stuckOnly ? 1 : '', oem_id: oemId, segment_id: segmentId, owner_id: ownerId };

  useEffect(() => {
    api.catalogue.oems().then(setOems).catch(() => undefined);
    api.catalogue.segments().then(setSegments).catch(() => undefined);
    if (teamView) api.directory.salespeople(true).then(setPeople).catch(() => undefined);
  }, [teamView]);

  function loadDeals() {
    return api.opportunities
      .list(filters)
      .then(setDeals)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    setDeals(null);
    setSelecting(false);
    setSelected(new Set());
    void loadDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, overdueOnly, stuckOnly, oemId, segmentId, ownerId]);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function applyBulk(change: { expected_close_date?: string; stage?: Stage; to_salesperson_id?: number; reason?: string }) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.opportunities.bulk({ ids: [...selected], ...change });
      setNotice(bulkMessage(result));
      setNewDate('');
      setNewStage('');
      setNewOwner('');
      setReason('');
      setSelected(new Set());
      await loadDeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t go through.');
    } finally {
      setBusy(false);
    }
  }

  const cardProps = (d: Opportunity) => (selecting ? { selected: selected.has(d.id), onToggle: () => toggle(d.id) } : {});

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
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      {creating && <NewDeal onCancel={() => setCreating(false)} />}

      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {(['open', 'won', 'lost', 'abandoned'] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`h-9 px-3 rounded-full text-sm font-semibold border ${view === v ? 'bg-brand text-white border-brand' : 'bg-white text-ink-muted border-line'}`}
          >
            {v === 'open' ? 'Open' : v === 'won' ? 'Won' : v === 'lost' ? 'Lost' : 'Abandoned'}
          </button>
        ))}
        {view === 'open' && (
          <button
            type="button"
            aria-pressed={overdueOnly}
            onClick={() => setOverdueOnly(!overdueOnly)}
            className={`h-9 px-3 rounded-full text-sm font-semibold border ${overdueOnly ? 'bg-accent text-white border-accent' : 'bg-white text-accent-dark border-accent/40'}`}
          >
            Overdue
          </button>
        )}
        {view === 'open' && (
          <button
            type="button"
            aria-pressed={stuckOnly}
            onClick={() => setStuckOnly(!stuckOnly)}
            className={`h-9 px-3 rounded-full text-sm font-semibold border ${stuckOnly ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-amber-800 border-amber-400/60'}`}
          >
            Stuck
          </button>
        )}
        {view === 'open' && deals && (
          <span className="text-sm text-ink-muted ml-auto">
            {deals.length} deals · {formatMoney(openTotal, { compact: true })} · weighted {formatMoney(weighted, { compact: true })}
          </span>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 items-end">
        <SelectField label="OEM" value={oemId} onChange={(e) => setOemId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">All</option>
          {oems.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Market segment" value={segmentId} onChange={(e) => setSegmentId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">All</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        {teamView && (
          <SelectField label="Salesperson" value={ownerId} onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        )}
        <a
          href={api.opportunities.exportUrl(filters)}
          download
          className="inline-flex items-center justify-center h-11 sm:h-10 px-4 rounded-lg border border-line bg-white text-sm font-semibold hover:bg-canvas"
        >
          Download Excel
        </a>
        {canWriteCrm(user?.role) && view === 'open' && !selecting && (deals?.length ?? 0) > 1 && (
          <Button variant="secondary" onClick={() => setSelecting(true)}>
            Select several
          </Button>
        )}
      </div>

      {deals === null && !error && <p className="text-sm text-ink-faint">Loading…</p>}

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
                <DealCard deal={d} teamView={teamView} {...cardProps(d)} />
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
                      <DealCard key={d.id} deal={d} teamView={teamView} {...cardProps(d)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {selecting && view === 'open' && deals && (
        <BulkBar
          count={selected.size}
          total={deals.length}
          onSelectAll={() => setSelected(new Set(deals.map((d) => d.id)))}
          onClear={() => {
            setSelecting(false);
            setSelected(new Set());
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-end gap-2">
              <TextField label="New closing date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <Button variant="secondary" disabled={busy || !newDate} onClick={() => applyBulk({ expected_close_date: newDate })}>
                Change
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <SelectField label="Move to stage" value={newStage} onChange={(e) => setNewStage(e.target.value as Stage | '')}>
                <option value="">Select…</option>
                {OPEN_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </SelectField>
              <Button variant="secondary" disabled={busy || !newStage} onClick={() => newStage && applyBulk({ stage: newStage })}>
                Move
              </Button>
            </div>
            {managing && (
              <div className="flex flex-wrap items-end gap-2">
                <SelectField label="Transfer to" value={newOwner} onChange={(e) => setNewOwner(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
                <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button variant="secondary" disabled={busy || !newOwner || !reason.trim()} onClick={() => applyBulk({ to_salesperson_id: Number(newOwner), reason })}>
                  Transfer
                </Button>
              </div>
            )}
          </div>
        </BulkBar>
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
                      {d.close_reason && ` · ${d.close_reason}`}
                    </span>
                  </span>
                  {d.stage === 'won' ? <Badge tone="ok">{formatMoney(d.won_value, { compact: true })}</Badge> : <Badge tone="muted">{STAGE_LABELS[d.stage]}</Badge>}
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
  const [form, setForm] = useState<DealDraft>(EMPTY_DEAL_DRAFT);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setBusy(true);
    setError('');
    try {
      const deal = await api.opportunities.create({ company_id: company.id, ...draftToInput(form) });
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
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2">
              <span className="text-sm font-semibold">{company.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setCompany(null)}>
                Change
              </Button>
            </div>
            {company.approval_status !== 'approved' ? (
              <Notice tone="error">
                {company.name} is waiting for a manager’s approval. You can log visits against it now; a deal can be opened once it is approved.
              </Notice>
            ) : (
              <DealFields companyId={company.id} value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || company.approval_status !== 'approved' || !dealDraftComplete(form)}>
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
