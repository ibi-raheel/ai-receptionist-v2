import { logger } from '../utils/logger.js';

const leads = new Map();

export function processLeadCapture(callId, args) {
  const existing = leads.get(callId) || {};
  const merged = { ...existing, ...args, updatedAt: new Date().toISOString() };

  if (!existing.createdAt) {
    merged.createdAt = new Date().toISOString();
  }

  leads.set(callId, merged);
  logger.info({ callId, lead: merged }, 'Lead captured/updated');

  return { status: 'success', message: 'Lead information saved.' };
}

export function getLead(callId) {
  return leads.get(callId) || null;
}

export function deleteLead(callId) {
  leads.delete(callId);
}
