import { Router } from 'express';
import db from '../db/index.js';
import { recordAudit } from '../audit/log.js';
import { HttpError, canSeeSalesperson, isManaging, requireCrmWriter, resolveOwner, scopeFilter, sendError } from '../crm/access.js';
import { TODAY_SQL, oneOf, optionalId, optionalText, requiredDate } from '../crm/fields.js';
import { PRIORITIES, TASK_TYPES, insertTask, taskFields } from '../crm/tasks.js';

// Mounted at /api/tasks. Follow-ups stay open until done or cancelled; only managers move a task
// to another salesperson, and every move is audited.
const router = Router();

const TASK_SELECT = `
  SELECT t.id, t.company_id, c.name AS company_name, c.city AS company_city, t.visit_id,
         t.assignee_salesperson_id, sp.name AS assignee_name, t.task_type, t.title, t.due_date, t.priority,
         t.status, t.notes, t.outcome_notes, t.completed_at, t.created_at,
         (t.status = 'open' AND t.due_date < ${TODAY_SQL}) AS is_overdue
  FROM task t
  JOIN company c ON c.id = t.company_id
  JOIN salesperson sp ON sp.id = t.assignee_salesperson_id`;

async function loadVisibleTask(user, id) {
  const task = await db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);
  if (!task || !canSeeSalesperson(user, task.assignee_salesperson_id)) throw new HttpError(404, 'Task not found');
  return task;
}

router.get('/', async (req, res) => {
  try {
    const params = [];
    let where = 'WHERE TRUE';
    where += scopeFilter(req.user, 't.assignee_salesperson_id', params);
    const status = req.query.status ?? 'open';
    if (['open', 'done', 'cancelled'].includes(status)) {
      where += ' AND t.status = ?';
      params.push(status);
    }
    if (req.query.due === 'overdue') where += ` AND t.due_date < ${TODAY_SQL}`;
    else if (req.query.due === 'today') where += ` AND t.due_date = ${TODAY_SQL}`;
    else if (req.query.due === 'upcoming') where += ` AND t.due_date > ${TODAY_SQL}`;
    if (req.query.assignee_id) {
      where += ' AND t.assignee_salesperson_id = ?';
      params.push(Number(req.query.assignee_id));
    }
    if (req.query.company_id) {
      where += ' AND t.company_id = ?';
      params.push(Number(req.query.company_id));
    }
    params.push(Math.min(Math.max(Number(req.query.limit) || 100, 1), 300));
    const order = status === 'open' ? 't.due_date ASC, t.priority DESC, t.id' : 't.completed_at DESC, t.id DESC';
    res.json(await db.prepare(`${TASK_SELECT} ${where} ORDER BY ${order} LIMIT ?`).all(...params));
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    res.json(await loadVisibleTask(req.user, Number(req.params.id)));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/', requireCrmWriter, async (req, res) => {
  try {
    const companyId = optionalId(req.body, 'company_id');
    if (!companyId) throw new HttpError(400, 'company_id is required');
    const company = await db.prepare(`SELECT id FROM company WHERE id = ? AND archived_at IS NULL`).get(companyId);
    if (!company) throw new HttpError(400, 'Company not found.');
    const assigneeId = await resolveOwner(req.user, req.body.assignee_salesperson_id);
    const fields = taskFields(req.body);
    const id = await db.transaction(() => insertTask({ companyId, assigneeId, userId: req.user.id, fields }));
    res.status(201).json(await loadVisibleTask(req.user, id));
  } catch (err) {
    sendError(res, err);
  }
});

// Reschedule or edit. Changing the assignee is a manager action and is audited.
router.put('/:id', requireCrmWriter, async (req, res) => {
  try {
    const task = await loadVisibleTask(req.user, Number(req.params.id));
    if (task.status !== 'open') throw new HttpError(409, 'Only open tasks can be changed.');
    const next = {
      title: req.body.title !== undefined ? optionalText(req.body, 'title', { max: 200 }) : task.title,
      due_date: req.body.due_date !== undefined ? requiredDate(req.body, 'due_date') : task.due_date,
      task_type: req.body.task_type !== undefined ? oneOf(req.body, 'task_type', TASK_TYPES) : task.task_type,
      priority: req.body.priority !== undefined ? oneOf(req.body, 'priority', PRIORITIES) : task.priority,
      notes: req.body.notes !== undefined ? optionalText(req.body, 'notes', { max: 2000 }) : task.notes,
      assignee: task.assignee_salesperson_id,
    };
    if (!next.title) throw new HttpError(400, 'title is required');
    const requestedAssignee = optionalId(req.body, 'assignee_salesperson_id');
    if (requestedAssignee && requestedAssignee !== task.assignee_salesperson_id) {
      if (!isManaging(req.user)) throw new HttpError(403, 'Only a manager can reassign a task.');
      next.assignee = await resolveOwner(req.user, requestedAssignee);
    }

    await db.transaction(async () => {
      await db
        .prepare(
          `UPDATE task SET title = ?, due_date = ?, task_type = ?, priority = ?, notes = ?, assignee_salesperson_id = ?, updated_at = NOW()
           WHERE id = ? AND status = 'open'`
        )
        .run(next.title, next.due_date, next.task_type, next.priority, next.notes, next.assignee, task.id);
      if (next.assignee !== task.assignee_salesperson_id) {
        const to = await db.prepare(`SELECT name FROM salesperson WHERE id = ?`).get(next.assignee);
        await recordAudit({
          actorUserId: req.user.id,
          action: 'task.reassigned',
          entityType: 'task',
          entityId: task.id,
          summary: `Moved "${task.title}" (${task.company_name}) from ${task.assignee_name} to ${to.name}`,
          before: { assignee_salesperson_id: task.assignee_salesperson_id },
          after: { assignee_salesperson_id: next.assignee },
        });
      }
    });
    res.json(await loadVisibleTask(req.user, task.id));
  } catch (err) {
    sendError(res, err);
  }
});

async function close(req, res, status) {
  try {
    const task = await loadVisibleTask(req.user, Number(req.params.id));
    if (task.status !== 'open') throw new HttpError(409, `This task is already ${task.status}.`);
    const outcomeNotes = optionalText(req.body, status === 'done' ? 'outcome_notes' : 'reason', { max: 2000 });
    if (status === 'cancelled' && !outcomeNotes) throw new HttpError(400, 'Say why the task is being cancelled (reason).');
    const done = await db
      .prepare(
        `UPDATE task SET status = ?, outcome_notes = ?, completed_at = NOW(), completed_by = ?, updated_at = NOW()
         WHERE id = ? AND status = 'open'`
      )
      .run(status, outcomeNotes, req.user.id, task.id);
    if (done.changes !== 1) throw new HttpError(409, 'This task was already closed.');
    res.json(await loadVisibleTask(req.user, task.id));
  } catch (err) {
    sendError(res, err);
  }
}

router.post('/:id/complete', requireCrmWriter, (req, res) => close(req, res, 'done'));
router.post('/:id/cancel', requireCrmWriter, (req, res) => close(req, res, 'cancelled'));

export default router;
