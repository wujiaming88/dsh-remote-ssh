// ADAPT: DSH 0.2.2-rc.5 submission-policy.ts:30–38. Capability refusals
// remain explicit in the remote client; never disguise unsupported Steer as Queue.
export function resolveDeliveryMode(preferred, running, gesture = 'enter') {
  if (!running) return 'queue';
  const mode = preferred === 'steer' ? 'steer' : 'queue';
  return gesture === 'accelerated' ? (mode === 'queue' ? 'steer' : 'queue') : mode;
}

// Only these exact chords belong to the composer. Apply before menu arbitration
// as well, so unsupported modifiers never select commands or send messages.
export function composerEnterGesture(event) {
  if (event.key !== 'Enter' || event.isComposing || event.nativeEvent?.isComposing ||
      event.keyCode === 229 || event.nativeEvent?.keyCode === 229 || event.shiftKey ||
      event.altKey || event.getModifierState?.('AltGraph') || event.nativeEvent?.getModifierState?.('AltGraph') ||
      (event.ctrlKey && event.metaKey)) return null;
  return event.ctrlKey || event.metaKey ? 'accelerated' : 'enter';
}

export function deliveryConflicts(pendingKind, mode, running) {
  if (!pendingKind) return false;
  const requestedKind = running ? mode : 'prompt';
  return pendingKind !== requestedKind;
}
