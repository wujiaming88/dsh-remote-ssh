// Remote ACP -> copied InputBar seats. No Host stores or inferred capabilities.
export function composerConfiguration(config = {}, t, locked = false) {
  const selectors = ['models', 'reasoning'].flatMap(name => {
    const value = config[name];
    if (!value?.options?.length) return [];
    return [{key: name, configId: value.configId, label: t(name === 'models' ? 'acp.model' : 'acp.reasoning'),
      value: String(value.currentValue ?? ''), disabled: locked,
      options: value.options.map(option => ({id: String(option.value), label: option.name || String(option.value)}))}];
  });
  const modes = config.modes;
  const permission = modes?.availableModes?.length ? {
    label: t('acp.mode'), value: modes.currentModeId, disabled: locked,
    options: modes.availableModes.map(mode => ({id: mode.id, label: mode.name || mode.id})),
  } : null;
  return {selectors, permission};
}
