// UI attachment identities are not sent to the Agent. A retry reuses an id only
// when the complete immutable wire payload is unchanged.
export function wireAttachments(attachments) {
  return attachments.map(({ id, ...payload }) => structuredClone(payload));
}
export function submissionSignature(draft, attachments) {
  return JSON.stringify({ text: draft.trim(), attachments: wireAttachments(attachments) });
}
export function prepareSubmission(draft, attachments, previous, makeId = () => crypto.randomUUID()) {
  const signature = submissionSignature(draft, attachments);
  if (previous?.signature === signature) return previous;
  return { requestId: makeId(), signature, draft, text: draft.trim(),
    attachments: wireAttachments(attachments), attachmentIds: attachments.map(file => file.id) };
}
export function acknowledgeSubmission(currentDraft, currentAttachments, submitted) {
  const unchanged = currentDraft === submitted.draft && submissionSignature(currentDraft, currentAttachments) === submitted.signature;
  const ids = new Set(submitted.attachmentIds);
  return { draft: unchanged ? '' : currentDraft, attachments: currentAttachments.filter(file => !ids.has(file.id)) };
}
