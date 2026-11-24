const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const label = value => typeof value === 'string' && value.trim() ? value : null;
function selectedLabel(group, value) {
  return label(group?.options?.find(option => String(option.value) === String(value))?.name) || label(value);
}

// ACP usage.used is current context, not cumulative input/output tokens.
// usage.cost is cumulative session cost, not this turn's invoice.
export function usageDetails(state) {
  const usage = state.usage || {}, config = state.config || {}, binding = state.binding || {};
  const used = nonnegative(usage.used), capacity = nonnegative(usage.size);
  const percent = used !== null && capacity !== null && capacity > 0 ? used / capacity * 100 : null;
  const amount = nonnegative(usage.cost?.amount);
  const modeId = config.modes?.currentModeId || config.mode;
  return {
    agent: label(binding.agentLabel) || label(binding.agent),
    model: selectedLabel(config.models, config.models?.currentValue ?? config.model),
    modelId: label(config.models?.currentValue ?? config.model),
    reasoning: selectedLabel(config.reasoning, config.reasoning?.currentValue ?? config.reasoningEffort),
    mode: label(config.modes?.availableModes?.find(mode => mode.id === modeId)?.name) || label(modeId),
    used, capacity: capacity > 0 ? capacity : null,
    remaining: percent === null ? null : Math.max(0, capacity - used), percent,
    barPercent: percent === null ? 0 : Math.min(100, percent),
    tone: percent >= 100 ? 'error' : percent >= 90 ? 'warning' : 'normal',
    cost: amount === null ? null : { amount, currency: label(usage.cost.currency) },
    status: state.permissions?.length || state.elicitations?.length ? 'waiting'
      : state.running ? 'running' : binding.status === 'error' ? 'error' : 'ready',
    connected: state.connected === true,
    pendingTurns: nonnegative(binding.pendingTurns),
  };
}
export function formatTokens(value) {
  return nonnegative(value) === null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}
export function formatCompactTokens(value) {
  if (nonnegative(value) === null) return '—';
  if (value < 1000) return formatTokens(value);
  const divisor = value >= 1e9 ? 1e9 : value >= 1e6 ? 1e6 : 1e3;
  const unit = divisor === 1e9 ? 'G' : divisor === 1e6 ? 'M' : 'K';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value / divisor) + unit;
}
export function usageSummary(details) {
  if (details.used !== null) return { kind: 'context', value: `${formatCompactTokens(details.used)} tok` };
  return null;
}
export function formatPercentage(value) {
  return nonnegative(value) === null ? '—' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;
}
export function formatCost(cost) {
  if (!cost || nonnegative(cost.amount) === null) return '—';
  const precision = cost.amount > 0 && cost.amount < 0.000001 ? 10 : 6;
  const amount = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: precision }).format(cost.amount);
  return cost.currency ? `${amount} ${cost.currency}` : amount;
}
// Session statistics are the ACP facts we can count: settled turns and session age.
export function sessionStats(state) {
  const turns = Object.values(state.turns || {});
  const started = nonnegative(state.binding?.startedAt);
  const created = nonnegative(state.binding?.createdAt);
  const startedAt = started !== null && started > 0 ? started : created !== null && created > 0 ? created : null;
  return {
    completed: turns.filter(turn => turn.status === 'completed').length,
    running: turns.filter(turn => turn.status === 'running').length,
    startedAt,
  };
}
export function formatElapsed(ms) {
  if (nonnegative(ms) === null) return '—';
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  return `${minutes}m ${total % 60}s`;
}
