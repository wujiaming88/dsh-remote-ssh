// Queue snapshots are authoritative. Preserve their order, occurrence identity,
// literal text and truncation flag; never infer consumption from a click or stream end.
export function queueRows(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item || typeof item.requestId !== 'string' || !item.requestId || seen.has(item.requestId)) return false;
    seen.add(item.requestId); return true;
  });
}
export function queuePresentation(count, collapsed = true, busy = false) {
  const expanded = !collapsed || !!busy;
  return {visible: count > 0, header: count > 1, expanded, listVisible: count === 1 || expanded};
}
export function queueAttachment(file = {}) {
  if (!file || typeof file !== 'object') file = {};
  const name = typeof file.name === 'string' && file.name ? file.name :
    typeof file.remotePath === 'string' ? file.remotePath.split('/').pop() : '';
  const bytes = file.size ?? file.bytes;
  const size = Number.isFinite(bytes) && bytes >= 0 ?
    bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB` : '';
  // Queue records carry metadata, NOT an authorized image resource. Do not use
  // remotePath, URL, previewUrl or mimeType as an image URL.
  return {name, size, image: file.type === 'image'};
}


/** Map a failed promote attempt to a concrete, non-destructive explanation. */
export function queueSendNowFailureKey(value) {
  const code = typeof value?.code === 'string' ? value.code : '';
  if (['queue_awaiting_turn', 'promptRequired', 'steering_not_injected', 'queue_not_injected', 'no_active_turn'].includes(code)) return 'acp.queueSendNowNoTurn';
  if (code === 'queue_already_started') return 'acp.queueSendNowAlreadyStarted';
  if (code === 'steering_unknown') return 'acp.queueSendNowUnknown';
  if (code === 'queue_promotion_in_progress') return 'acp.queueSendNowBusy';
  if (code === 'steer_content_unsupported') return 'acp.queueSendNowContentUnsupported';
  if (code === 'steering_unsupported') return 'acp.queueSendNowUnsupported';
  return 'acp.queueSendNowFailed';
}
