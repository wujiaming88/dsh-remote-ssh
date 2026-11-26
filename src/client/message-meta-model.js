// Per-turn footer facts: the context usage snapshot at stop and the authoritative
// completion timestamp. Never infer either from the current session or wall clock.
import {formatCompactTokens} from './usage-model.js';

const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function formatTurnTime(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function turnMessageMeta(turn = {}) {
  const used = finiteNonnegative(turn?.usage?.used);
  const endedAt = finiteNonnegative(turn?.endedAt);
  return {
    tokens: used === null ? null : formatCompactTokens(used),
    endedAt,
    time: formatTurnTime(endedAt),
    dateTime: endedAt === null ? null : new Date(endedAt).toISOString(),
  };
}
