import { Router } from 'express';
import db from '../db/index.js';
import { visibleSalespersonIds } from '../auth/roles.js';
import { HttpError, sendError } from '../crm/access.js';
import { TODAY_SQL } from '../crm/fields.js';
import { computeMetrics } from '../crm/metrics.js';

// Mounted at /api/performance. Salespeople get their own numbers; everyone else the team's, or
// one salesperson's with ?salesperson_id=. The per-salesperson comparison is Phase 4.
const router = Router();

const DATE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', async (req, res) => {
  try {
    const today = (await db.prepare(`SELECT ${TODAY_SQL}::text AS d`).get()).d;
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    let from = req.query.from;
    let to = req.query.to;
    if (from || to) {
      if (!DATE.test(from ?? '') || !DATE.test(to ?? '')) throw new HttpError(400, 'from and to must both be dates (YYYY-MM-DD)');
      if (from > to) throw new HttpError(400, 'from must be on or before to');
    } else {
      to = today;
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (days - 1));
      from = d.toISOString().slice(0, 10);
    }

    let salespersonIds = visibleSalespersonIds(req.user);
    if (req.query.salesperson_id) {
      const requested = Number(req.query.salesperson_id);
      // Asking for someone you can't see silently narrows to nothing visible.
      salespersonIds = salespersonIds === null || salespersonIds.includes(requested) ? [requested] : [];
    }
    res.json(await computeMetrics({ salespersonIds, from, to }));
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
