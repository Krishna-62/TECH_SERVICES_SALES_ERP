import { Router } from 'express';
import db from '../db/index.js';
import { sendError } from '../crm/access.js';
import { TODAY_SQL } from '../crm/fields.js';
import { computeMetrics } from '../crm/metrics.js';
import { parsePeriod } from '../crm/period.js';

// Mounted at /api/team for roles that see the whole team (managers, MD, admin, office). The
// per-salesperson rows use the same computeMetrics() as each person's own dashboard, so the rows
// add up to the team total and match what each salesperson sees.
const router = Router();

// A deal with no stage change, visit, follow-up or quotation activity for this long needs a look.
export const STALE_AFTER_DAYS = 21;

export function requireTeamView(req, res, next) {
  if (req.user.role === 'salesperson') return res.status(403).json({ error: 'Team views are for managers.' });
  next();
}

router.use(requireTeamView);

router.get('/performance', async (req, res) => {
  try {
    const { from, to } = await parsePeriod(req.query);
    const people = await db
      .prepare(
        `SELECT sp.id, sp.name, sp.employee_code, sp.is_active
         FROM salesperson sp
         -- Inactive salespeople are listed while anything still counts toward them, so the rows
         -- always add up to the team total.
         WHERE sp.is_active
            OR EXISTS (SELECT 1 FROM opportunity o WHERE (o.owner_salesperson_id = sp.id OR o.original_owner_salesperson_id = sp.id)
                       AND (o.stage NOT IN ('won', 'lost') OR o.closed_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')
                            OR o.created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')))
            OR EXISTS (SELECT 1 FROM visit v WHERE v.salesperson_id = sp.id
                       AND v.visited_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata'))
            OR EXISTS (SELECT 1 FROM task t WHERE t.assignee_salesperson_id = sp.id AND t.status = 'open')
         ORDER BY sp.is_active DESC, sp.name`
      )
      .all(from, from, from);
    const [totals, ...rows] = await Promise.all([
      computeMetrics({ salespersonIds: null, from, to }),
      ...people.map((p) => computeMetrics({ salespersonIds: [p.id], from, to })),
    ]);
    res.json({ from, to, totals, salespeople: people.map((p, i) => ({ ...p, metrics: rows[i] })) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/insights', async (req, res) => {
  try {
    const { from, to } = await parsePeriod(req.query);
    const range = `o.closed_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND o.closed_at < ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`;

    // Last six calendar months (India time), including empty months.
    const wonByMonth = await db
      .prepare(
        `WITH months AS (
           SELECT generate_series(date_trunc('month', ${TODAY_SQL}::timestamp) - interval '5 months',
                                  date_trunc('month', ${TODAY_SQL}::timestamp), interval '1 month') AS m)
         SELECT to_char(months.m, 'YYYY-MM') AS month,
                COUNT(o.id)::int AS deals_won,
                COALESCE(SUM(o.won_value), 0)::float AS won_value
         FROM months
         LEFT JOIN opportunity o ON o.stage = 'won'
           AND o.closed_at >= (months.m AT TIME ZONE 'Asia/Kolkata')
           AND o.closed_at < ((months.m + interval '1 month') AT TIME ZONE 'Asia/Kolkata')
         GROUP BY months.m ORDER BY months.m`
      )
      .all();

    // A deal's product category is that of its first requirement.
    const byCategory = await db
      .prepare(
        `SELECT COALESCE(cat.product_category, 'Not specified') AS category,
                COUNT(*) FILTER (WHERE o.stage = 'won' AND ${range})::int AS deals_won,
                COALESCE(SUM(o.won_value) FILTER (WHERE o.stage = 'won' AND ${range}), 0)::float AS won_value,
                COUNT(*) FILTER (WHERE o.stage NOT IN ('won', 'lost'))::int AS open_deals,
                COALESCE(SUM(o.estimated_value) FILTER (WHERE o.stage NOT IN ('won', 'lost')), 0)::float AS pipeline_value
         FROM opportunity o
         LEFT JOIN LATERAL (SELECT r.product_category FROM requirement r WHERE r.opportunity_id = o.id ORDER BY r.id LIMIT 1) cat ON TRUE
         GROUP BY 1
         HAVING COUNT(*) FILTER (WHERE o.stage = 'won' AND ${range}) > 0 OR COUNT(*) FILTER (WHERE o.stage NOT IN ('won', 'lost')) > 0
         ORDER BY won_value DESC, pipeline_value DESC`
      )
      .all(from, to, from, to, from, to);

    const byCity = await db
      .prepare(
        `SELECT COALESCE(NULLIF(btrim(c.city), ''), 'Not specified') AS city,
                COUNT(*) FILTER (WHERE o.stage = 'won' AND ${range})::int AS deals_won,
                COALESCE(SUM(o.won_value) FILTER (WHERE o.stage = 'won' AND ${range}), 0)::float AS won_value,
                COUNT(*) FILTER (WHERE o.stage NOT IN ('won', 'lost'))::int AS open_deals,
                COALESCE(SUM(o.estimated_value) FILTER (WHERE o.stage NOT IN ('won', 'lost')), 0)::float AS pipeline_value
         FROM opportunity o JOIN company c ON c.id = o.company_id
         GROUP BY 1
         HAVING COUNT(*) FILTER (WHERE o.stage = 'won' AND ${range}) > 0 OR COUNT(*) FILTER (WHERE o.stage NOT IN ('won', 'lost')) > 0
         ORDER BY won_value DESC, pipeline_value DESC`
      )
      .all(from, to, from, to, from, to);

    const staleDeals = await db
      .prepare(
        `SELECT o.id, o.title, o.stage, o.estimated_value, c.name AS company_name, sp.name AS owner_name, act.last_activity,
                (${TODAY_SQL} - (act.last_activity AT TIME ZONE 'Asia/Kolkata')::date) AS idle_days
         FROM opportunity o
         JOIN company c ON c.id = o.company_id
         JOIN salesperson sp ON sp.id = o.owner_salesperson_id
         CROSS JOIN LATERAL (
           SELECT GREATEST(
             o.updated_at,
             (SELECT MAX(h.changed_at) FROM opportunity_history h WHERE h.opportunity_id = o.id),
             (SELECT MAX(v.visited_at) FROM visit v WHERE v.opportunity_id = o.id),
             (SELECT MAX(GREATEST(t.created_at, t.completed_at)) FROM task t WHERE t.opportunity_id = o.id),
             (SELECT MAX(q.updated_at) FROM quotation_link q WHERE q.opportunity_id = o.id)
           ) AS last_activity) act
         WHERE o.stage NOT IN ('won', 'lost')
           AND act.last_activity < NOW() - make_interval(days => ?)
         ORDER BY o.estimated_value DESC NULLS LAST
         LIMIT 25`
      )
      .all(STALE_AFTER_DAYS);

    // Open deals whose owner has left (salesperson record or login deactivated) — hand them over.
    const orphaned = await db
      .prepare(
        `SELECT sp.id AS salesperson_id, sp.name, COUNT(o.id)::int AS open_deals
         FROM salesperson sp
         JOIN opportunity o ON o.owner_salesperson_id = sp.id AND o.stage NOT IN ('won', 'lost')
         LEFT JOIN app_user u ON u.salesperson_id = sp.id
         WHERE NOT sp.is_active OR (u.id IS NOT NULL AND NOT u.is_active)
         GROUP BY sp.id, sp.name ORDER BY open_deals DESC`
      )
      .all();

    res.json({ from, to, won_by_month: wonByMonth, by_category: byCategory, by_city: byCity, stale_deals: staleDeals, stale_after_days: STALE_AFTER_DAYS, orphaned });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
