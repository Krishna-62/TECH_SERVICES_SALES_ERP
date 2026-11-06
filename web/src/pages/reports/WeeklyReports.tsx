import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReportRecipient, ReportSummary, WeeklyReport, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatDateTime, formatMoney } from '../../lib/labels';
import { isAdminRole, isManagingRole } from '../../lib/roles';
import { Badge, Button, Card, CardHeader, EmptyState, Notice, PageHeader, SelectField, TextField } from '../../components/ui';

function change(now: number, before: number, format: (n: number) => string) {
  if (now === before) return 'Same as the week before';
  return `${now > before ? 'Up' : 'Down'} from ${format(before)} the week before`;
}

function Tile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'ok' | 'accent' }) {
  return (
    <div className="bg-white border border-line rounded-xl shadow-card px-4 py-3 break-inside-avoid">
      <div className={`text-2xl font-bold tabular-nums ${tone === 'ok' ? 'text-ok' : tone === 'accent' ? 'text-accent-dark' : ''}`}>{value}</div>
      <div className="text-xs text-ink-muted mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-ink-faint mt-0.5">{hint}</div>}
    </div>
  );
}

function DealList({ title, rows, line }: { title: string; rows: { id: number; title: string; company_name: string; owner_name: string }[]; line: (index: number) => string }) {
  if (rows.length === 0) return null;
  return (
    <Card className="break-inside-avoid">
      <CardHeader title={title} />
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.id}>
            <Link to={`/pipeline/${r.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 hover:bg-canvas">
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate">{r.title}</span>
                <span className="block text-xs text-ink-muted truncate">
                  {r.company_name} · {r.owner_name}
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums shrink-0">{line(i)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EmailList() {
  const [rows, setRows] = useState<ReportRecipient[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const load = () => api.reports.recipients().then(setRows).catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <Card className="print:hidden">
      <CardHeader title="Who gets it by email" description="MD and admin can change this list." />
      {error && (
        <div className="px-4 sm:px-5 pt-3">
          <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>
        </div>
      )}
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
            <span className={`min-w-0 break-all ${r.is_active ? '' : 'text-ink-faint line-through'}`}>{r.email}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                api.reports
                  .updateRecipient(r.id, !r.is_active)
                  .then(load)
                  .catch((err) => setError(err.message))
              }
            >
              {r.is_active ? 'Remove' : 'Add back'}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="px-4 sm:px-5 py-3 border-t border-line flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            await api.reports.addRecipient(email);
            setEmail('');
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add that address.');
          }
        }}
      >
        <div className="flex-1 min-w-0">
          <TextField label="Add an email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" disabled={!email.trim()}>
          Add
        </Button>
      </form>
    </Card>
  );
}

// Last week at a glance: made automatically each Monday morning, and kept.
export default function WeeklyReports() {
  const { user } = useAuth();
  const [list, setList] = useState<ReportSummary[] | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadList() {
    const result = await api.reports.list();
    setList(result.reports);
    setEmailConfigured(result.email_configured);
    setSelected((current) => current ?? result.reports[0]?.id ?? null);
  }

  useEffect(() => {
    loadList().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setReport(null);
    api.reports.get(selected).then(setReport).catch((err) => setError(err.message));
  }, [selected]);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      await api.reports.generate();
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the report.');
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.reports.email(selected);
      setNotice(`Sent to ${result.sent} address${result.sent === 1 ? '' : 'es'}.`);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email.');
    } finally {
      setBusy(false);
    }
  }

  const d = report?.data;
  const t = d?.totals;
  const p = d?.previous;
  const summary = list?.find((r) => r.id === selected);

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div>
        <PageHeader title="Weekly report" description="Made each Monday morning for the week before. The figures are kept as they stood that day." />
      </div>
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}

      {list?.length === 0 && (
        <Card>
          <EmptyState>The first report arrives next Monday morning.</EmptyState>
          {isManagingRole(user?.role) && (
            <div className="pb-5 text-center">
              <Button disabled={busy} onClick={generate}>
                Make last week’s now
              </Button>
            </div>
          )}
        </Card>
      )}

      {list && list.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="w-56">
            <SelectField label="Week" value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value))}>
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatDate(r.week_start)} to {formatDate(r.week_end)}
                </option>
              ))}
            </SelectField>
          </div>
          <Button variant="secondary" onClick={() => window.print()}>
            Print or save as PDF
          </Button>
          {isAdminRole(user?.role) && emailConfigured && (
            <Button variant="secondary" disabled={busy} onClick={sendEmail}>
              Email it now
            </Button>
          )}
        </div>
      )}

      {summary?.email_error && (
        <Notice tone="error">The email didn’t send: {summary.email_error}</Notice>
      )}
      {summary?.emailed_at && <p className="text-xs text-ink-faint -mt-2 print:hidden">Emailed {formatDateTime(summary.emailed_at)}</p>}

      {report && d && t && p && (
        <>
          <h2 className="hidden print:block text-lg font-bold">
            Technicon weekly sales report: {formatDate(report.week_start)} to {formatDate(report.week_end)}
          </h2>
          <section>
            <h2 className="text-sm font-semibold text-ink-muted mb-2">Last week</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile label="Orders won" value={formatMoney(t.won_value, { compact: true })} hint={`${t.deals_won} deals. ${change(t.won_value, p.won_value, (n) => formatMoney(n, { compact: true }))}`} tone="ok" />
              <Tile label="Visits" value={t.visits} hint={change(t.visits, p.visits, String)} />
              <Tile label="New deals" value={t.deals_opened} hint={change(t.deals_opened, p.deals_opened, String)} />
              <Tile label="Lost or abandoned" value={t.deals_lost + t.deals_abandoned} hint={`${t.deals_lost} lost, ${t.deals_abandoned} abandoned`} />
            </div>
          </section>
          <section>
            <h2 className="text-sm font-semibold text-ink-muted mb-2">Where things stood that morning</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile label="Open pipeline" value={formatMoney(t.pipeline_value, { compact: true })} hint={`${t.open_deals} deals, weighted ${formatMoney(t.weighted_pipeline, { compact: true })}`} />
              <Tile label="Expected this month" value={formatMoney(d.forecast_this_month.commit, { compact: true })} hint={`Commit. Best case ${formatMoney(d.forecast_this_month.best_case, { compact: true })}`} />
              <Tile label="Past closing date" value={t.overdue_deals} tone={t.overdue_deals ? 'accent' : undefined} />
              <Tile label="Stuck deals" value={t.stuck_deals} tone={t.stuck_deals ? 'accent' : undefined} />
              <Tile label="Overdue follow-ups" value={t.overdue_follow_ups} tone={t.overdue_follow_ups ? 'accent' : undefined} />
              <Tile label="Renewals in 30 days" value={d.renewals_30_days} />
              <Tile label="EMD to recover" value={formatMoney(d.emd_to_recover, { compact: true })} />
              <Tile label="Companies to approve" value={d.companies_pending} />
            </div>
          </section>

          <Card className="break-inside-avoid">
            <CardHeader title="By salesperson" />
            <ul className="divide-y divide-line">
              {d.salespeople.map((s) => (
                <li key={s.id} className="px-4 sm:px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold truncate">{s.name}</span>
                    <span className="tabular-nums shrink-0">
                      <b className="text-ok">{formatMoney(s.won_value, { compact: true })}</b>
                      <span className="text-ink-muted"> won ({s.deals_won})</span>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-muted">
                    <span>{s.visits} visits</span>
                    <span>{formatMoney(s.pipeline_value, { compact: true })} open ({s.open_deals})</span>
                    <span className={s.overdue_deals ? 'text-accent-dark font-semibold' : ''}>{s.overdue_deals} overdue</span>
                    <span className={s.stuck_deals ? 'text-accent-dark font-semibold' : ''}>{s.stuck_deals} stuck</span>
                    <span className={s.overdue_follow_ups ? 'text-accent-dark font-semibold' : ''}>{s.overdue_follow_ups} late follow-ups</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <DealList title="Biggest wins" rows={d.wins} line={(i) => formatMoney(d.wins[i].value, { compact: true })} />
          <DealList title="Closing this week" rows={d.closing} line={(i) => `${formatMoney(d.closing[i].value, { compact: true })} · ${d.closing[i].probability}%`} />
          <DealList title="Biggest deals needing attention" rows={d.at_risk} line={(i) => formatMoney(d.at_risk[i].value, { compact: true })} />
          {d.tenders.length > 0 && (
            <Card className="break-inside-avoid">
              <CardHeader title="Tenders due this week" />
              <ul className="divide-y divide-line">
                {d.tenders.map((r) => (
                  <li key={r.id}>
                    <Link to={`/pipeline/${r.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{r.tender_number}</span>
                        <span className="block text-xs text-ink-muted truncate">
                          {r.company_name} · {r.owner_name}
                        </span>
                      </span>
                      <Badge>{formatDate(r.date)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {isAdminRole(user?.role) && (
        <>
          <EmailList />
          {!emailConfigured && <p className="text-xs text-ink-faint print:hidden">Email isn’t set up on the server yet, so reports stay in the app until it is.</p>}
        </>
      )}
    </div>
  );
}
