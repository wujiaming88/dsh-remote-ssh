// UI attachment identities are not sent to the Agent. A retry reuses an id only
// when the complete immutable wire payload is unchanged.
export function wireAttachments(attachments) {
  return attachments.map(({ id, ...payload }) => structuredClone(payload));
}
export function submissionSignature(draft, attachments, quotes = []) {
  return JSON.stringify({ text: draft.trim(), attachments: wireAttachments(attachments), quotes: quotes.map(value => value.text) });
}
export function prepareSubmission(draft, attachments, previous, makeId = () => crypto.randomUUID(), quotes = []) {
  const signature = submissionSignature(draft, attachments, quotes);
  if (previous?.signature === signature) return previous;
  const quoted = quotes.map(value => String(value.text || '').replace(/\r\n?/g, '\n').trim()).filter(Boolean)
    .map(value => value.split('\n').map(line => `> ${line}`).join('\n')).join('\n\n');
  const text = [quoted, draft.trim()].filter(Boolean).join('\n\n');
  return { requestId: makeId(), signature, draft, text,
    attachments: wireAttachments(attachments), attachmentIds: attachments.map(file => file.id) };
}
export function acknowledgeSubmission(currentDraft, currentAttachments, submitted, currentQuotes = []) {
  const unchanged = currentDraft === submitted.draft && submissionSignature(currentDraft, currentAttachments, currentQuotes) === submitted.signature;
  const ids = new Set(submitted.attachmentIds);
  return { draft: unchanged ? '' : currentDraft, attachments: currentAttachments.filter(file => !ids.has(file.id)) };
}
