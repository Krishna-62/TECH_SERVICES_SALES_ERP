import type { Outcome, TaskType, Urgency } from './api';

export const OUTCOME_LABELS: Record<Outcome, string> = {
  interested: 'Interested',
  follow_up_needed: 'Needs follow-up',
  quotation_requested: 'Wants a quotation',
  not_interested: 'Not interested',
  no_meeting: "Couldn't meet",
};

export const OUTCOME_HELP: Record<Outcome, string> = {
  interested: 'Has a real need — capture it',
  follow_up_needed: 'Promising, needs another conversation',
  quotation_requested: 'Asked us for a price',
  not_interested: 'No need right now',
  no_meeting: 'Contact unavailable — try again',
};

// Mirrors the API rules in api/routes/visits.js.
export const OUTCOME_NEEDS_REQUIREMENT: Outcome[] = ['interested', 'follow_up_needed', 'quotation_requested'];
export const OUTCOME_NEEDS_FOLLOW_UP: Outcome[] = ['interested', 'follow_up_needed', 'quotation_requested', 'no_meeting'];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call: 'Call',
  visit: 'Visit',
  demo: 'Product demo',
  technical_discussion: 'Technical discussion',
  send_quotation: 'Send quotation',
  other: 'Other',
};

export const URGENCY_LABELS: Record<Urgency, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

// YYYY-MM-DD for today (+ offset) in the device's time zone.
export function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(value: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function dueLabel(dueDate: string, today = localDate()) {
  if (dueDate === today) return 'Today';
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${-days} days overdue`;
  if (days < 7) return new Date(`${dueDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' });
  return formatDate(dueDate);
}
