import crypto from 'node:crypto';
import { Router } from 'express';
import db from '../db/index.js';

// Read-only data for the Technicon Sales app, over a shared key instead of a login: no ERP login is
// both safe and useful here, because admin can change everything and staff see only their own
// quotations. Everything here is GET, and only the columns the sales app needs: no costs, margins,
// notes or line prices. With ERP_INTEGRATION_KEY unset, every route answers 404.
const router = Router();

function requireKey(req, res, next) {
  const key = process.env.ERP_INTEGRATION_KEY;
  if (!key || key.length < 32) return res.status(404).json({ error: 'Not found' });
  const sent = (req.get('authorization') ?? '').replace(/^Bearer /, '');
  const a = crypto.createHash('sha256').update(sent).digest();
  const b = crypto.createHash('sha256').update(key).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Invalid key' });
  next();
}

router.use(requireKey);

// One page at a time, by id, so a sync never asks the database for everything at once.
function page(req) {
  const afterId = Math.max(0, parseInt(req.query.after_id, 10) || 0);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  return { afterId, limit };
}

function listRoute(path, select) {
  router.get(path, async (req, res) => {
    try {
      const { afterId, limit } = page(req);
      res.json(await db.prepare(select).all(afterId, limit));
    } catch (err) {
      console.error(`Integration ${path} failed:`, err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });
}

listRoute(
  '/customers',
  `SELECT id, name, address, state, gstin, contact_person, phone, email FROM company
   WHERE id > ? AND COALESCE(is_supplier, 0) = 0 AND COALESCE(company_type, '') <> 'supplier'
   ORDER BY id LIMIT ?`
);

listRoute('/products', `SELECT id, part_no, description, make, key_features FROM product WHERE id > ? ORDER BY id LIMIT ?`);

listRoute('/quotations', `SELECT id, number, date, status, total, company_id FROM quotation WHERE id > ? ORDER BY id LIMIT ?`);

// Customers' purchase orders only: a row with a supplier is what the company itself ordered.
listRoute('/orders', `SELECT id, number, date, quotation_id, client_po_ref, status FROM purchase_order WHERE id > ? AND supplier_id IS NULL ORDER BY id LIMIT ?`);

export default router;
