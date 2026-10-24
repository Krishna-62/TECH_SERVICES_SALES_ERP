import { Router } from 'express';
import db from '../db/index.js';
import { recordAudit } from '../audit/log.js';
import {
  HttpError,
  canSeeSalesperson,
  isManaging,
  requireCrmWriter,
  requireQuotationRole,
  resolveOwner,
  scopeFilter,
  sendError,
} from '../crm/access.js';
import { oneOf, optionalDate, optionalId, optionalNumber, optionalText, requiredText } from '../crm/fields.js';
import {
  LOST_REASONS,
  QUOTATION_STATUSES,
  STAGE_KEYS,
  advanceIfBehind,
  defaultProbability,
  isOpen,
  recordHistory,
} from '../crm/pipeline.js';

// Mounted at /api/opportunities. Deals move through the pipeline; every stage change is kept in
// opportunity_history and closing/reopening is also written to the audit log.
const router = Router();

const OPPORTUNITY_SELECT = `
  SELECT o.id, o.company_id, c.name AS company_name, c.city AS company_city, o.title,
         o.owner_salesperson_id, sp.name AS owner_name,
         o.original_owner_salesperson_id, osp.name AS original_owner_name,
         o.stage, o.estimated_value, o.probability, o.expected_close_date, o.source_visit_id, o.notes,
         o.won_value, o.lost_reason, o.lost_reason_notes, o.closed_at, o.created_at, o.updated_at,
         (SELECT COUNT(*)::int FROM quotation_link q WHERE q.opportunity_id = o.id) AS quotation_count
  FROM opportunity o
  JOIN company c ON c.id = o.company_id
  JOIN salesperson sp ON sp.id = o.owner_salesperson_id
  JOIN salesperson osp ON osp.id = o.original_owner_salesperson_id`;

export async function loadVisibleOpportunity(user, id) {
  const opp = await db.prepare(`${OPPORTUNITY_SELECT} WHERE o.id = ?`).get(id);
  if (!opp || !canSeeSalesperson(user, opp.owner_salesperson_id)) throw new HttpError(404, 'Opportunity not found');
  return opp;
}

function quotationFields(body, { partial }) {
  const fields = {};
  if (!partial || body.quotation_number !== undefined) fields.quotation_number = requiredText(body, 'quotation_number', { max: 50 });
  if (!partial || body.quotation_date !== undefined) fields.quotation_date = optionalDate(body, 'quotation_date');
  if (!partial || body.amount !== undefined) fields.amount = optionalNumber(body, 'amount');
  if (!partial || body.status !== undefined) fields.status = oneOf(body, 'status', QUOTATION_STATUSES, 'sent');
  if (!partial || body.erp_quotation_id !== undefined) fields.erp_quotation_id = optionalId(body, 'erp_quotation_id');
  return fields;
}

router.get('/', async (req, res) => {
  try {
    const params = [];
    let where = 'WHERE TRUE';
    where += scopeFilter(req.user, 'o.owner_salesperson_id', params);
    const status = req.query.status ?? 'open';
    if (status === 'open') where += ` AND o.stage NOT IN ('won', 'lost')`;
    else if (status === 'won' || status === 'lost') {
      where += ' AND o.stage = ?';
      params.push(status);
    }
    if (STAGE_KEYS.includes(req.query.stage)) {
      where += ' AND o.stage = ?';
      params.push(req.query.stage);
    }
    for (const [key, column] of [
      ['owner_id', 'o.owner_salesperson_id'],
      ['company_id', 'o.company_id'],
    ]) {
      if (req.query[key]) {
        where += ` AND ${column} = ?`;
        params.push(Number(req.query[key]));
      }
    }
    params.push(Math.min(Math.max(Number(req.query.limit) || 200, 1), 500));
    const order = status === 'open' ? 'o.expected_close_date ASC NULLS LAST, o.updated_at DESC' : 'o.closed_at DESC NULLS LAST, o.updated_at DESC';
    res.json(await db.prepare(`${OPPORTUNITY_SELECT} ${where} ORDER BY ${order} LIMIT ?`).all(...params));
  } catch (err) {
    sendError(res, err);
  }
});

// The office's queue: deals waiting for a quotation to be prepared.
router.get('/quotation-requests', async (req, res) => {
  try {
    const params = [];
    const scope = scopeFilter(req.user, 'o.owner_salesperson_id', params);
    res.json(
      await db
        .prepare(
          `${OPPORTUNITY_SELECT},
           LATERAL (SELECT MAX(h.changed_at) AS requested_at FROM opportunity_history h
                    WHERE h.opportunity_id = o.id AND h.to_value = 'quotation_requested') req
           WHERE o.stage = 'quotation_requested'
             AND NOT EXISTS (SELECT 1 FROM quotation_link q WHERE q.opportunity_id = o.id)${scope}
           ORDER BY req.requested_at ASC NULLS LAST`
        )
        .all(...params)
    );
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const opp = await loadVisibleOpportunity(req.user, Number(req.params.id));
    const [history, quotations, requirements, tasks, visits] = await Promise.all([
      db
        .prepare(
          `SELECT h.id, h.change_type, h.from_value, h.to_value, h.note, h.changed_at, u.username AS changed_by_username
           FROM opportunity_history h JOIN app_user u ON u.id = h.changed_by
           WHERE h.opportunity_id = ? ORDER BY h.changed_at DESC, h.id DESC`
        )
        .all(opp.id),
      db.prepare(`SELECT * FROM quotation_link WHERE opportunity_id = ? ORDER BY created_at DESC`).all(opp.id),
      db.prepare(`SELECT * FROM requirement WHERE opportunity_id = ? ORDER BY created_at DESC`).all(opp.id),
      db
        .prepare(
          `SELECT t.id, t.title, t.task_type, t.due_date, t.status, t.priority, sp.name AS assignee_name
           FROM task t JOIN salesperson sp ON sp.id = t.assignee_salesperson_id
           WHERE t.opportunity_id = ? ORDER BY (t.status = 'open') DESC, t.due_date`
        )
        .all(opp.id),
      db
        .prepare(
          `SELECT v.id, v.visited_at, v.status, v.outcome, sp.name AS salesperson_name
           FROM visit v JOIN salesperson sp ON sp.id = v.salesperson_id
           WHERE v.opportunity_id = ? ORDER BY v.visited_at DESC`
        )
        .all(opp.id),
    ]);
    res.json({ ...opp, history, quotations, requirements, tasks, visits });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/', requireCrmWriter, async (req, res) => {
  try {
    const companyId = optionalId(req.body, 'company_id');
    if (!companyId) throw new HttpError(400, 'company_id is required');
    const company = await db.prepare(`SELECT id, name FROM company WHERE id = ? AND archived_at IS NULL`).get(companyId);
    if (!company) throw new HttpError(400, 'Company not found.');
    const ownerId = await resolveOwner(req.user, req.body.owner_salesperson_id);
    const stage = oneOf(req.body, 'stage', ['new_prospect', 'visit_completed', 'qualified'], 'new_prospect');
    const fields = {
      title: requiredText(req.body, 'title', { max: 200 }),
      estimated_value: optionalNumber(req.body, 'estimated_value'),
      expected_close_date: optionalDate(req.body, 'expected_close_date'),
      notes: optionalText(req.body, 'notes', { max: 5000 }),
    };
    const id = await db.transaction(async () => {
      const newId = await insertOpportunity({ companyId, ownerId, stage, fields, sourceVisitId: null, userId: req.user.id });
      await recordAudit({
        actorUserId: req.user.id,
        action: 'opportunity.created',
        entityType: 'opportunity',
        entityId: newId,
        summary: `Opened deal "${fields.title}" with ${company.name}`,
      });
      return newId;
    });
    res.status(201).json(await loadVisibleOpportunity(req.user, id));
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/:id', requireCrmWriter, async (req, res) => {
  try {
    const opp = await loadVisibleOpportunity(req.user, Number(req.params.id));
    if (!isOpen(opp.stage)) throw new HttpError(409, 'Closed deals cannot be edited. Reopen it first.');
    const next = {
      title: req.body.title !== undefined ? requiredText(req.body, 'title', { max: 200 }) : opp.title,
      estimated_value: req.body.estimated_value !== undefined ? optionalNumber(req.body, 'estimated_value') : opp.estimated_value,
      expected_close_date: req.body.expected_close_date !== undefined ? optionalDate(req.body, 'expected_close_date') : opp.expected_close_date,
      notes: req.body.notes !== undefined ? optionalText(req.body, 'notes', { max: 5000 }) : opp.notes,
      probability: opp.probability,
    };
    if (req.body.probability !== undefined) {
      const p = Number(req.body.probability);
      if (!Number.isInteger(p) || p < 0 || p > 100) throw new HttpError(400, 'probability must be a whole number from 0 to 100');
      next.probability = p;
    }
    await db
      .prepare(
        `UPDATE opportunity SET title = ?, estimated_value = ?, expected_close_date = ?, notes = ?, probability = ?, updated_at = NOW()
         WHERE id = ?`
      )
      .run(next.title, next.estimated_value, next.expected_close_date, next.notes, next.probability, opp.id);
    res.json(await loadVisibleOpportunity(req.user, opp.id));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/stage', requireCrmWriter, async (req, res) => {
  try {
    const opp = await loadVisibleOpportunity(req.user, Number(req.params.id));
    const stage = oneOf(req.body, 'stage', STAGE_KEYS);
    const note = optionalText(req.body, 'note', { max: 1000 });
    if (stage === opp.stage) throw new HttpError(409, 'The deal is already at that stage.');

    const reopening = !isOpen(opp.stage);
    if (reopening && !isManaging(req.user)) throw new HttpError(403, 'Only a manager can reopen a closed deal.');
    if (reopening && !isOpen(stage)) throw new HttpError(400, 'Reopen the deal to an open stage first.');
    if (['quotation_sent', 'negotiation'].includes(stage) && opp.quotation_count === 0) {
      throw new HttpError(400, 'Record the quotation first — the office or a manager adds it on this deal.');
    }

    let wonValue = null;
    let lostReason = null;
    let lostNotes = null;
    if (stage === 'won') {
      wonValue = optionalNumber(req.body, 'won_value');
      if (!wonValue || wonValue <= 0) throw new HttpError(400, 'Enter the won value (the order amount).');
    }
    if (stage === 'lost') {
      lostReason = oneOf(req.body, 'lost_reason', LOST_REASONS);
      lostNotes = optionalText(req.body, 'lost_reason_notes', { max: 1000 });
      if (lostReason === 'other' && !lostNotes) throw new HttpError(400, 'Say why the deal was lost.');
    }

    await db.transaction(async () => {
      await db
        .prepare(
          `UPDATE opportunity
           SET stage = ?, probability = ?, won_value = ?, lost_reason = ?, lost_reason_notes = ?,
               closed_at = CASE WHEN ? IN ('won', 'lost') THEN NOW() ELSE NULL END, updated_at = NOW()
           WHERE id = ?`
        )
        .run(stage, defaultProbability(stage), wonValue, lostReason, lostNotes, stage, opp.id);
      await recordHistory({ opportunityId: opp.id, changeType: 'stage', from: opp.stage, to: stage, note: note ?? lostNotes, userId: req.user.id });
      if (stage === 'won' || stage === 'lost' || reopening) {
        await recordAudit({
          actorUserId: req.user.id,
          action: reopening ? 'opportunity.reopened' : `opportunity.${stage}`,
          entityType: 'opportunity',
          entityId: opp.id,
          summary: reopening
            ? `Reopened "${opp.title}" (${opp.company_name}) from ${opp.stage} to ${stage}`
            : stage === 'won'
              ? `Won "${opp.title}" (${opp.company_name}) for ₹${wonValue.toLocaleString('en-IN')}`
              : `Lost "${opp.title}" (${opp.company_name}): ${lostReason.replace(/_/g, ' ')}`,
          before: { stage: opp.stage, won_value: opp.won_value, lost_reason: opp.lost_reason },
          after: { stage, won_value: wonValue, lost_reason: lostReason },
        });
      }
    });
    res.json(await loadVisibleOpportunity(req.user, opp.id));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/quotations', requireQuotationRole, async (req, res) => {
  try {
    const opp = await loadVisibleOpportunity(req.user, Number(req.params.id));
    if (!isOpen(opp.stage)) throw new HttpError(409, 'This deal is closed.');
    const fields = quotationFields(req.body, { partial: false });
    const linkId = await db.transaction(async () => {
      const info = await db
        .prepare(
          `INSERT INTO quotation_link (opportunity_id, quotation_number, quotation_date, amount, status, erp_quotation_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
        )
        .run(opp.id, fields.quotation_number, fields.quotation_date, fields.amount, fields.status, fields.erp_quotation_id, req.user.id);
      if (fields.status !== 'draft') {
        await advanceIfBehind({ opportunity: opp, stage: 'quotation_sent', userId: req.user.id, note: `Quotation ${fields.quotation_number} recorded` });
      }
      await recordAudit({
        actorUserId: req.user.id,
        action: 'quotation.linked',
        entityType: 'opportunity',
        entityId: opp.id,
        summary: `Recorded quotation ${fields.quotation_number}${fields.amount != null ? ` for ₹${fields.amount.toLocaleString('en-IN')}` : ''} on "${opp.title}"`,
        after: fields,
      });
      return info.lastInsertRowid;
    });
    res.status(201).json(await db.prepare(`SELECT * FROM quotation_link WHERE id = ?`).get(linkId));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That quotation is already recorded.' });
    sendError(res, err);
  }
});

export const quotationLinksRouter = Router();

quotationLinksRouter.put('/:id', requireQuotationRole, async (req, res) => {
  try {
    const link = await db.prepare(`SELECT * FROM quotation_link WHERE id = ?`).get(Number(req.params.id));
    if (!link) throw new HttpError(404, 'Quotation not found');
    const opp = await loadVisibleOpportunity(req.user, link.opportunity_id);
    const changes = quotationFields(req.body, { partial: true });
    const next = { ...link, ...changes };
    await db.transaction(async () => {
      await db
        .prepare(
          `UPDATE quotation_link SET quotation_number = ?, quotation_date = ?, amount = ?, status = ?, erp_quotation_id = ?, updated_at = NOW()
           WHERE id = ?`
        )
        .run(next.quotation_number, next.quotation_date, next.amount, next.status, next.erp_quotation_id, link.id);
      if (next.status !== 'draft') {
        await advanceIfBehind({ opportunity: opp, stage: 'quotation_sent', userId: req.user.id, note: `Quotation ${next.quotation_number} ${next.status}` });
      }
      const pick = ({ quotation_number, quotation_date, amount, status }) => ({ quotation_number, quotation_date, amount, status });
      await recordAudit({
        actorUserId: req.user.id,
        action: 'quotation.updated',
        entityType: 'opportunity',
        entityId: opp.id,
        summary: `Updated quotation ${next.quotation_number} on "${opp.title}"${changes.status && changes.status !== link.status ? `: ${link.status} → ${changes.status}` : ''}`,
        before: pick(link),
        after: pick(next),
      });
    });
    res.json(await db.prepare(`SELECT * FROM quotation_link WHERE id = ?`).get(link.id));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That quotation number is already recorded on this deal.' });
    sendError(res, err);
  }
});

// Inserts a deal and its "created" history row, inside the caller's transaction.
export async function insertOpportunity({ companyId, ownerId, stage, fields, sourceVisitId, userId }) {
  const info = await db
    .prepare(
      `INSERT INTO opportunity (company_id, title, owner_salesperson_id, original_owner_salesperson_id, stage, estimated_value,
                                probability, expected_close_date, source_visit_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    )
    .run(
      companyId,
      fields.title,
      ownerId,
      ownerId,
      stage,
      fields.estimated_value ?? null,
      defaultProbability(stage),
      fields.expected_close_date ?? null,
      sourceVisitId,
      fields.notes ?? null,
      userId
    );
  await recordHistory({ opportunityId: info.lastInsertRowid, changeType: 'created', to: stage, userId });
  return info.lastInsertRowid;
}

export default router;
