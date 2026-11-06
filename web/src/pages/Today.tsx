import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Task, TodayData } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/useLoad';
import { OUTCOME_LABELS, STAGE_LABELS, daysLabel, formatDate, formatDateTime, formatMoney } from '../lib/labels';
import { canWriteCrm } from '../lib/roles';
import TaskItem from '../components/TaskItem';
import { Badge, Card, CardHeader, Notice, OverdueBadge, StuckBadge } from '../components/ui';

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'danger' }) {
  return (
    <div className="bg-white border border-line rounded-xl shadow-card px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${tone === 'danger' && value > 0 ? 'text-danger' : ''}`}>{value}</div>
      <div className="text-xs text-ink-muted mt-0.5">{label}</div>
    </div>
  );
}

function TaskSection({ title, tasks, data, ...rest }: { title: string; tasks: Task[]; data: TodayData } & Omit<React.ComponentProps<typeof TaskItem>, 'task' | 'today'>) {
  if (tasks.length === 0) return null;
  return (
    <Card>
      <CardHeader title={title} action={<Badge>{tasks.length}</Badge>} />
      <ul className="divide-y divide-line">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} today={data.today} {...rest} />
        ))}
      </ul>
    </Card>
  );
}

export default function Today() {
  const { user } = useAuth();
  const today = useLoad<TodayData | null>(api.today, null);
  const [error, setError] = useState('');
  const writer = canWriteCrm(user?.role);
  const teamView = user?.role !== 'salesperson';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const data = today.data;
  const nothingDue = data && data.overdue.length + data.due_today.length + data.upcoming.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-2xl font-bold tracking-tight mt-0.5">
            {greeting}, {user?.username}
          </h1>
          {teamView && <p className="text-sm text-ink-muted mt-1">Showing the whole team.</p>}
        </div>
        {writer && (
          <Link
            to="/visits/new"
            className="inline-flex items-center justify-center h-12 sm:h-10 px-5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark"
          >
            + Log a visit
          </Link>
        )}
      </header>

      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      {today.error && <Notice tone="error">{today.error}</Notice>}
      {user?.role === 'salesperson' && !user.salesperson_id && (
        <Notice tone="error">Your login isn't linked to a salesperson record yet. Ask your administrator.</Notice>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat value={data.stats.visits_this_week} label="Visits this week" />
            <Stat value={data.stats.companies_visited_30d} label="Companies visited (30 days)" />
            <Stat value={data.stats.quotation_requests_30d} label="Quotation requests (30 days)" />
            <Stat value={data.stats.overdue_follow_ups} label="Overdue follow-ups" tone="danger" />
          </div>

          {data.draft_visits.length > 0 && (
            <Card className="border-amber-300">
              <CardHeader title="Visits to finish" description="Record the outcome and next step while it's fresh." />
              <ul className="divide-y divide-line">
                {data.draft_visits.map((v) => (
                  <li key={v.id}>
                    <Link to={v.local_uuid ? `/visits/local/${v.local_uuid}` : `/visits/${v.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{v.company_name}</span>
                        <span className="block text-xs text-ink-muted">
                          Started {formatDateTime(v.visited_at)}
                          {teamView && ` · ${v.salesperson_name}`}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-brand shrink-0">Finish →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.erp_orders.length > 0 && (
            <Card className="border-ok/40">
              <CardHeader title="Orders received" description="The customer’s order is in the ERP, but the deal is still open. Mark it won." />
              <ul className="divide-y divide-line">
                {data.erp_orders.map((o) => (
                  <li key={o.id}>
                    <Link to={`/pipeline/${o.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{o.title}</span>
                        <span className="block text-xs text-ink-muted truncate">
                          {o.company_name}
                          {teamView && ` · ${o.owner_name}`}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-ok shrink-0">{o.order_number}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.tenders_due.length > 0 && (
            <Card className="border-accent/40">
              <CardHeader title="Tenders due" description="Bids not yet submitted, due within a week." action={<Link to="/tenders" className="text-sm font-semibold text-brand">All tenders</Link>} />
              <ul className="divide-y divide-line">
                {data.tenders_due.map((t) => (
                  <li key={t.opportunity_id}>
                    <Link to={`/pipeline/${t.opportunity_id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{t.title}</span>
                        <span className="block text-xs text-ink-muted truncate">
                          {t.company_name} · {t.tender_number}
                          {teamView && ` · ${t.owner_name}`}
                        </span>
                      </span>
                      <span className={`text-xs font-semibold shrink-0 ${t.days_left < 3 ? 'text-danger' : 'text-accent-dark'}`}>{daysLabel(t.days_left)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.overdue_deals.length > 0 && (
            <Card className="border-accent/40">
              <CardHeader title="Overdue deals" description="Past their expected closing date. Update the date or close them." action={<Badge>{data.overdue_deals.length}</Badge>} />
              <ul className="divide-y divide-line">
                {data.overdue_deals.map((d) => (
                  <li key={d.id}>
                    <Link to={`/pipeline/${d.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{d.title}</span>
                        <span className="block text-xs text-ink-muted truncate">
                          {d.company_name}
                          {teamView && ` · ${d.owner_name}`} · was due {formatDate(d.expected_close_date)}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        <OverdueBadge />
                        <span className="text-xs font-semibold tabular-nums">{formatMoney(d.estimated_value, { compact: true })}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.stuck_deals.length > 0 && (
            <Card className="border-amber-300">
              <CardHeader title="Stuck deals" description="In the same stage for too long. Move them on, or close them." action={<Badge>{data.stuck_deals.length}</Badge>} />
              <ul className="divide-y divide-line">
                {data.stuck_deals.map((d) => (
                  <li key={d.id}>
                    <Link to={`/pipeline/${d.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{d.title}</span>
                        <span className="block text-xs text-ink-muted truncate">
                          {d.company_name}
                          {teamView && ` · ${d.owner_name}`} · {STAGE_LABELS[d.stage]}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        <StuckBadge days={d.days_in_stage} />
                        <span className="text-xs font-semibold tabular-nums">{formatMoney(d.estimated_value, { compact: true })}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <TaskSection title="Overdue follow-ups" tasks={data.overdue} data={data} showAssignee={teamView} canAct={writer} onChanged={today.reload} onError={setError} />
          <TaskSection title="Due today" tasks={data.due_today} data={data} showAssignee={teamView} canAct={writer} onChanged={today.reload} onError={setError} />
          <TaskSection title="Next 7 days" tasks={data.upcoming} data={data} showAssignee={teamView} canAct={writer} onChanged={today.reload} onError={setError} />
          {nothingDue && (
            <Card className="p-5">
              <p className="text-sm text-ink-muted">No follow-ups due this week.</p>
            </Card>
          )}

          {data.recent_visits.length > 0 && (
            <Card>
              <CardHeader title="Recent visits" action={<Link to="/visits" className="text-sm font-semibold text-brand">All visits</Link>} />
              <ul className="divide-y divide-line">
                {data.recent_visits.map((v) => (
                  <li key={v.id}>
                    <Link to={`/visits/${v.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{v.company_name}</span>
                        <span className="block text-xs text-ink-muted">
                          {formatDateTime(v.visited_at)}
                          {teamView && ` · ${v.salesperson_name}`}
                        </span>
                      </span>
                      <Badge>{OUTCOME_LABELS[v.outcome]}</Badge>
                    </Link>
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
