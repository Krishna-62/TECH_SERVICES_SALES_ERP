import { Router } from 'express';
import db from '../db/index.js';
import { recordAudit } from '../audit/log.js';
import { normalizeCompanyName, phoneKey } from '../crm/normalize.js';
import { requireCrmWriter, scopeFilter, sendError } from '../crm/access.js';
import { optionalEmail, optionalText, requiredText } from '../crm/fields.js';

// Mounted at /api/companies (signed-in users). The registry itself is shared — everyone must be
// able to find an existing company — but the visits, tasks and requirements shown on a company
// are limited to what the user may see.
const router = Router();

const SIMILARITY_THRESHOLD = 0.4;
const PHONE_KEY_SQL = `right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 10)`;

function companyFields(body, { partial }) {
  const fields = {
    name: partial && body.name === undefined ? undefined : requiredText(body, 'name', { max: 200 }),
    city: body.city === undefined && partial ? undefined : optionalText(body, 'city', { max: 100 }),
    address: body.address === undefined && partial ? undefined : optionalText(body, 'address', { max: 500 }),
    phone: body.phone === undefined && partial ? undefined : optionalText(body, 'phone', { max: 30 }),
    email: body.email === undefined && partial ? undefined : optionalEmail(body, 'email'),
    gstin: body.gstin === undefined && partial ? undefined : optionalText(body, 'gstin', { max: 20 }),
    industry: body.industry === undefined && partial ? undefined : optionalText(body, 'industry', { max: 100 }),
  };
  if (fields.gstin) fields.gstin = fields.gstin.toUpperCase();
  return fields;
}

function contactFields(body) {
  return {
    name: requiredText(body, 'name', { max: 120 }),
    designation: optionalText(body, 'designation', { max: 120 }),
    phone: optionalText(body, 'phone', { max: 30 }),
    email: optionalEmail(body, 'email'),
  };
}

// Possible duplicates of a company being created or renamed: similar normalized names, or the
// same phone number. `exact` is a same-name, same-city match, which the database also forbids.
export async function findDuplicates({ name, city, phone, excludeId = null }) {
  const normalized = normalizeCompanyName(name);
  const phone10 = phoneKey(phone);
  const params = [normalized, normalized, SIMILARITY_THRESHOLD, phone10, phone10];
  let exclude = '';
  if (excludeId) {
    params.push(excludeId);
    exclude = 'AND c.id <> ?';
  }
  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.city, c.phone, c.normalized_name,
              round(similarity(c.normalized_name, ?)::numeric, 2)::float AS score
       FROM company c
       WHERE c.archived_at IS NULL
         AND (similarity(c.normalized_name, ?) >= ?
              OR (?::text IS NOT NULL AND ${PHONE_KEY_SQL} = ?))
         ${exclude}
       ORDER BY score DESC, c.name
       LIMIT 5`
    )
    .all(...params);
  const cityKey = (city ?? '').trim().toLowerCase();
  return rows.map(({ normalized_name, ...row }) => ({
    ...row,
    exact: normalized_name === normalized && (row.city ?? '').trim().toLowerCase() === cityKey,
    same_phone: phone10 !== null && phoneKey(row.phone) === phone10,
  }));
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

router.get('/', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    if (!q) {
      const rows = await db
        .prepare(`SELECT c.id, c.name, c.city, c.phone FROM company c WHERE c.archived_at IS NULL ORDER BY c.name LIMIT ?`)
        .all(limit);
      return res.json(rows);
    }
    const normalized = normalizeCompanyName(q);
    const digits = q.replace(/\D/g, '');
    const rows = await db
      .prepare(
        `SELECT c.id, c.name, c.city, c.phone
         FROM company c
         WHERE c.archived_at IS NULL
           AND (c.normalized_name % ? OR c.name ILIKE ? OR c.city ILIKE ?
                OR (length(?) >= 4 AND ${PHONE_KEY_SQL} LIKE ?))
         ORDER BY (c.name ILIKE ?) DESC, similarity(c.normalized_name, ?) DESC, c.name
         LIMIT ?`
      )
      .all(normalized, `%${escapeLike(q)}%`, `${escapeLike(q)}%`, digits, `%${digits}%`, `${escapeLike(q)}%`, normalized, limit);
    res.json(rows);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/check-duplicates', async (req, res) => {
  try {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    if (!name) return res.json([]);
    res.json(
      await findDuplicates({
        name,
        city: typeof req.query.city === 'string' ? req.query.city : null,
        phone: typeof req.query.phone === 'string' ? req.query.phone : null,
        excludeId: Number(req.query.exclude_id) || null,
      })
    );
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const company = await db
      .prepare(
        `SELECT c.*, u.username AS created_by_username
         FROM company c JOIN app_user u ON u.id = c.created_by
         WHERE c.id = ? AND c.archived_at IS NULL`
      )
      .get(id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const contacts = await db
      .prepare(
        `SELECT id, name, designation, phone, email, created_at FROM company_contact
         WHERE company_id = ? AND archived_at IS NULL ORDER BY name`
      )
      .all(id);

    const visitParams = [id];
    const visitScope = scopeFilter(req.user, 'v.salesperson_id', visitParams);
    const visits = await db
      .prepare(
        `SELECT v.id, v.visited_at, v.status, v.outcome, v.notes, sp.name AS salesperson_name, cc.name AS contact_name
         FROM visit v
         JOIN salesperson sp ON sp.id = v.salesperson_id
         LEFT JOIN company_contact cc ON cc.id = v.contact_id
         WHERE v.company_id = ?${visitScope}
         ORDER BY v.visited_at DESC LIMIT 50`
      )
      .all(...visitParams);

    const taskParams = [id];
    const taskScope = scopeFilter(req.user, 't.assignee_salesperson_id', taskParams);
    const tasks = await db
      .prepare(
        `SELECT t.id, t.title, t.task_type, t.due_date, t.priority, t.status, sp.name AS assignee_name
         FROM task t JOIN salesperson sp ON sp.id = t.assignee_salesperson_id
         WHERE t.company_id = ? AND t.status = 'open'${taskScope}
         ORDER BY t.due_date`
      )
      .all(...taskParams);

    const reqParams = [id];
    const reqScope = scopeFilter(req.user, 'r.salesperson_id', reqParams);
    const requirements = await db
      .prepare(
        `SELECT r.id, r.product_category, r.description, r.specification, r.quantity, r.unit, r.budget, r.urgency,
                r.purchase_timeline, r.decision_maker, r.created_at, r.visit_id, sp.name AS salesperson_name
         FROM requirement r JOIN salesperson sp ON sp.id = r.salesperson_id
         WHERE r.company_id = ?${reqScope}
         ORDER BY r.created_at DESC LIMIT 50`
      )
      .all(...reqParams);

    const oppParams = [id];
    const oppScope = scopeFilter(req.user, 'o.owner_salesperson_id', oppParams);
    const opportunities = await db
      .prepare(
        `SELECT o.id, o.title, o.stage, o.estimated_value, o.won_value, o.expected_close_date, o.closed_at, sp.name AS owner_name
         FROM opportunity o JOIN salesperson sp ON sp.id = o.owner_salesperson_id
         WHERE o.company_id = ?${oppScope}
         ORDER BY (o.stage NOT IN ('won', 'lost')) DESC, o.updated_at DESC`
      )
      .all(...oppParams);

    res.json({ ...company, contacts, visits, tasks, requirements, opportunities });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/', requireCrmWriter, async (req, res) => {
  try {
    const fields = companyFields(req.body, { partial: false });
    const duplicates = await findDuplicates(fields);
    const exact = duplicates.find((d) => d.exact);
    if (exact) {
      return res.status(409).json({ error: `"${exact.name}"${exact.city ? ` in ${exact.city}` : ''} already exists.`, duplicates });
    }
    if (duplicates.length && req.body.confirm_new !== true) {
      return res.status(409).json({ error: 'Similar companies already exist. Use one of them, or confirm this is a new company.', duplicates, requires_confirmation: true });
    }
    const contact = req.body.contact && req.body.contact.name ? contactFields(req.body.contact) : null;

    const created = await db.transaction(async () => {
      const info = await db
        .prepare(
          `INSERT INTO company (name, normalized_name, city, address, phone, email, gstin, industry, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
        )
        .run(fields.name, normalizeCompanyName(fields.name), fields.city, fields.address, fields.phone, fields.email, fields.gstin, fields.industry, req.user.id);
      const companyId = info.lastInsertRowid;
      let contactId = null;
      if (contact) {
        const c = await db
          .prepare(`INSERT INTO company_contact (company_id, name, designation, phone, email, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`)
          .run(companyId, contact.name, contact.designation, contact.phone, contact.email, req.user.id);
        contactId = c.lastInsertRowid;
      }
      await recordAudit({
        actorUserId: req.user.id,
        action: 'company.created',
        entityType: 'company',
        entityId: companyId,
        summary: `Registered company ${fields.name}${fields.city ? ` (${fields.city})` : ''}${duplicates.length ? ' after confirming it is not a duplicate' : ''}`,
        after: { ...fields, contact },
      });
      const row = await db.prepare(`SELECT * FROM company WHERE id = ?`).get(companyId);
      return { ...row, primary_contact_id: contactId };
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A company with this name already exists in this city.' });
    sendError(res, err);
  }
});

router.put('/:id', requireCrmWriter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.prepare(`SELECT * FROM company WHERE id = ? AND archived_at IS NULL`).get(id);
    if (!existing) return res.status(404).json({ error: 'Company not found' });
    const changes = companyFields(req.body, { partial: true });
    const merged = { ...existing };
    for (const [key, value] of Object.entries(changes)) if (value !== undefined) merged[key] = value;

    const updated = await db.transaction(async () => {
      await db
        .prepare(
          `UPDATE company SET name = ?, normalized_name = ?, city = ?, address = ?, phone = ?, email = ?, gstin = ?, industry = ?, updated_at = NOW()
           WHERE id = ?`
        )
        .run(merged.name, normalizeCompanyName(merged.name), merged.city, merged.address, merged.phone, merged.email, merged.gstin, merged.industry, id);
      const pick = ({ name, city, address, phone, email, gstin, industry }) => ({ name, city, address, phone, email, gstin, industry });
      await recordAudit({
        actorUserId: req.user.id,
        action: 'company.updated',
        entityType: 'company',
        entityId: id,
        summary: `Updated company ${merged.name}`,
        before: pick(existing),
        after: pick(merged),
      });
      return db.prepare(`SELECT * FROM company WHERE id = ?`).get(id);
    });
    res.json(updated);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A company with this name already exists in this city.' });
    sendError(res, err);
  }
});

router.post('/:id/contacts', requireCrmWriter, async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const company = await db.prepare(`SELECT id, name FROM company WHERE id = ? AND archived_at IS NULL`).get(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const fields = contactFields(req.body);
    const created = await db.transaction(async () => {
      const info = await db
        .prepare(`INSERT INTO company_contact (company_id, name, designation, phone, email, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`)
        .run(companyId, fields.name, fields.designation, fields.phone, fields.email, req.user.id);
      await recordAudit({
        actorUserId: req.user.id,
        action: 'contact.created',
        entityType: 'company_contact',
        entityId: info.lastInsertRowid,
        summary: `Added contact ${fields.name} at ${company.name}`,
        after: fields,
      });
      return db.prepare(`SELECT * FROM company_contact WHERE id = ?`).get(info.lastInsertRowid);
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

export const contactsRouter = Router();

contactsRouter.put('/:id', requireCrmWriter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.prepare(`SELECT * FROM company_contact WHERE id = ? AND archived_at IS NULL`).get(id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    const fields = contactFields({ ...existing, ...req.body });
    const updated = await db.transaction(async () => {
      await db
        .prepare(`UPDATE company_contact SET name = ?, designation = ?, phone = ?, email = ?, updated_at = NOW() WHERE id = ?`)
        .run(fields.name, fields.designation, fields.phone, fields.email, id);
      const pick = ({ name, designation, phone, email }) => ({ name, designation, phone, email });
      await recordAudit({
        actorUserId: req.user.id,
        action: 'contact.updated',
        entityType: 'company_contact',
        entityId: id,
        summary: `Updated contact ${fields.name}`,
        before: pick(existing),
        after: fields,
      });
      return db.prepare(`SELECT * FROM company_contact WHERE id = ?`).get(id);
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// Contacts who left the customer are archived, not deleted: past visits still name them.
contactsRouter.post('/:id/archive', requireCrmWriter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.prepare(`SELECT * FROM company_contact WHERE id = ? AND archived_at IS NULL`).get(id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    await db.transaction(async () => {
      await db.prepare(`UPDATE company_contact SET archived_at = NOW(), updated_at = NOW() WHERE id = ?`).run(id);
      await recordAudit({
        actorUserId: req.user.id,
        action: 'contact.archived',
        entityType: 'company_contact',
        entityId: id,
        summary: `Archived contact ${existing.name}`,
      });
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
