import db from '../db/index.js';

// Pipeline stages in order, with the default win probability used for the weighted forecast.
export const STAGES = [
  { key: 'new_prospect', probability: 10 },
  { key: 'visit_completed', probability: 20 },
  { key: 'qualified', probability: 30 },
  { key: 'quotation_requested', probability: 40 },
  { key: 'quotation_sent', probability: 50 },
  { key: 'negotiation', probability: 70 },
  { key: 'won', probability: 100 },
  { key: 'lost', probability: 0 },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const OPEN_STAGES = STAGE_KEYS.filter((s) => s !== 'won' && s !== 'lost');
export const LOST_REASONS = ['price', 'competitor', 'no_budget', 'no_requirement', 'timing', 'product_fit', 'no_response', 'other'];
export const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'rejected'];

export function stageOrder(stage) {
  return STAGE_KEYS.indexOf(stage);
}

export function defaultProbability(stage) {
  return STAGES.find((s) => s.key === stage).probability;
}

export function isOpen(stage) {
  return OPEN_STAGES.includes(stage);
}

export async function recordHistory({ opportunityId, changeType, from = null, to, note = null, userId }) {
  await db
    .prepare(
      `INSERT INTO opportunity_history (opportunity_id, change_type, from_value, to_value, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(opportunityId, changeType, from, to, note, userId);
}

// Moves an open deal forward to `stage` if it is currently earlier in the pipeline — used when
// something that happened (a quotation request, a quotation sent) implies the deal progressed.
// Never moves a deal backwards and never touches a closed deal. Runs in the caller's transaction.
export async function advanceIfBehind({ opportunity, stage, userId, note }) {
  if (!isOpen(opportunity.stage) || stageOrder(opportunity.stage) >= stageOrder(stage)) return false;
  await db
    .prepare(`UPDATE opportunity SET stage = ?, probability = ?, updated_at = NOW() WHERE id = ?`)
    .run(stage, defaultProbability(stage), opportunity.id);
  await recordHistory({ opportunityId: opportunity.id, changeType: 'stage', from: opportunity.stage, to: stage, note, userId });
  return true;
}
