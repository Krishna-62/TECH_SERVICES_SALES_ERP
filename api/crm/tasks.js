import db from '../db/index.js';
import { oneOf, optionalText, requiredDate, requiredText } from './fields.js';

export const TASK_TYPES = ['call', 'visit', 'demo', 'technical_discussion', 'send_quotation', 'other'];
export const PRIORITIES = ['normal', 'high'];

export function taskFields(body, { defaultType = 'call' } = {}) {
  return {
    task_type: oneOf(body, 'task_type', TASK_TYPES, defaultType),
    title: requiredText(body, 'title', { max: 200 }),
    due_date: requiredDate(body, 'due_date'),
    priority: oneOf(body, 'priority', PRIORITIES, 'normal'),
    notes: optionalText(body, 'notes', { max: 2000 }),
  };
}

// Inserts inside the caller's transaction.
export async function insertTask({ companyId, visitId = null, opportunityId = null, assigneeId, userId, fields }) {
  const info = await db
    .prepare(
      `INSERT INTO task (company_id, visit_id, opportunity_id, assignee_salesperson_id, task_type, title, due_date, priority, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    )
    .run(companyId, visitId, opportunityId, assigneeId, fields.task_type, fields.title, fields.due_date, fields.priority, fields.notes, userId);
  return info.lastInsertRowid;
}
