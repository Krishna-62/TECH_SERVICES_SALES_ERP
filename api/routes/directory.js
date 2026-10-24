import { Router } from 'express';
import db from '../db/index.js';
import { scopeFilter, sendError } from '../crm/access.js';

// Mounted at /api/salespeople: active salespeople for pickers ("record on behalf of", "assign
// to"). Salespeople only get themselves. Managing the register is /api/admin/salespeople.
const router = Router();

router.get('/', async (req, res) => {
  try {
    const params = [];
    const scope = scopeFilter(req.user, 'sp.id', params);
    res.json(
      await db
        .prepare(`SELECT sp.id, sp.name, sp.employee_code FROM salesperson sp WHERE sp.is_active${scope} ORDER BY sp.name`)
        .all(...params)
    );
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
