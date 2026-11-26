// Per-turn footer facts: the context usage snapshot at stop and the authoritative
// completion timestamp. Never infer either from the current session or wall clock.
import {formatCompactTokens,formatPercentage,formatTokens} from './usage-model.js';

const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const firstNumber = (...values) => values.map(finiteNonnegative).find(value => value !== null) ?? null;

export function normalizeTurnUsage(response, model = null) {
  const usage = response?.usage && typeof response.usage === 'object' ? response.usage : null;
  const quota = response?._meta?.quota && typeof response._meta.quota === 'object' ? response._meta.quota : null;
  const counter = quota?.token_count && typeof quota.token_count === 'object' ? quota.token_count : null;
  const source = usage || counter;
  if (!source) return null;
  const input = firstNumber(source.inputTokens, source.input_tokens, source.uncachedInputTokens, source.uncached_input_tokens);
  const cacheRead = firstNumber(source.cachedReadTokens, source.cached_read_input_tokens, source.cachedInputTokens, source.cached_input_tokens);
  const cacheWrite = firstNumber(source.cachedWriteTokens, source.cache_creation_input_tokens, source.cached_write_tokens);
  const output = firstNumber(source.outputTokens, source.output_tokens);
  let total = firstNumber(source.totalTokens, source.total_tokens);
  if (total === null) {
    const values = [input, cacheRead, cacheWrite, output];
    if (values.every(value => value === null)) return null;
    total = values.reduce((sum, value) => sum + (value ?? 0), 0);
  }
  const denominator = (input ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0);
  const cacheHit = denominator > 0 && cacheRead !== null ? cacheRead / denominator * 100 : null;
  const modelUsage = Array.isArray(quota?.model_usage) ? quota.model_usage : [];
  const quotaModel = typeof modelUsage[0]?.model === 'string' ? modelUsage[0].model : null;
  return { total, input, cacheRead, cacheWrite, output, cacheHit, model: model || quotaModel };
}

export function turnUsageText(usage) {
  if (!usage || usage.total === null) return null;
  return `${formatTokens(usage.total)} tok`;
}

export function turnUsageRows(usage, labels) {
  if (!usage) return [];
  const tok = value => value === null ? '—' : `${formatTokens(value)} tok`;
  return [
    [labels.model, usage.model || '—'],
    [labels.cacheHit, usage.cacheHit === null ? '—' : formatPercentage(usage.cacheHit)],
    [labels.input, tok(usage.input)],
    [labels.cacheRead, tok(usage.cacheRead)],
    [labels.cacheWrite, tok(usage.cacheWrite)],
    [labels.output, tok(usage.output)],
  ];
}

export function formatTurnTime(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function turnMessageMeta(turn = {}) {
  const tokens = turn?.tokens && typeof turn.tokens === 'object' ? turn.tokens : null;
  const total = finiteNonnegative(tokens?.total);
  const endedAt = finiteNonnegative(turn?.endedAt);
  return {
    usage: total === null ? null : tokens,
    tokens: total === null ? null : formatCompactTokens(total),
    endedAt,
    time: formatTurnTime(endedAt),
    dateTime: endedAt === null ? null : new Date(endedAt).toISOString(),
  };
}
