// Local-only intake. Uploads are performed by the submission owner, never here.
export const MAX_ATTACHMENTS = 16;
export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_BINARY_BYTES = 256 * 1024 * 1024;

const imageMime = /^image\/(png|jpeg|webp|gif)$/;
const textExtension = /\.(md|txt|json|ya?ml|csv|[cm]?jsx?|tsx?|py|go|rs|java|sh|sql|css|html)$/i;
const fail = code => { throw Object.assign(new Error(code), {code}); };
const encoder = new TextEncoder();

function describeFile(file) {
  // A Blob brand check works for real File/Blob objects (including Node File)
  // without trusting a spoofed name/size/arrayBuffer object or reading bytes.
  try {
    if (!file || file.isDirectory === true || file.kind === 'directory' ||
        /^(inode\/directory|application\/x-directory)$/.test(file.type)) fail('attachmentInvalidFile');
    Blob.prototype.slice.call(file, 0, 0);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || typeof file.type !== 'string' ||
        typeof file.arrayBuffer !== 'function' || typeof file.text !== 'function' ||
        (file.name !== undefined && (typeof file.name !== 'string' || !file.name))) fail('attachmentInvalidFile');
  } catch { fail('attachmentInvalidFile'); }
  const name = file.name ?? 'attachment';
  const kind = imageMime.test(file.type) ? 'image' :
    /^text\//.test(file.type) || textExtension.test(name) ? 'text' : 'file_upload';
  return {file, name, kind, size: file.size, mimeType: file.type || (kind === 'text' ? 'text/plain' : 'application/octet-stream')};
}

function checkTotals(totals) {
  if (totals.text > MAX_TEXT_BYTES) fail('attachmentTextTooLarge');
  if (totals.image > MAX_IMAGE_BYTES) fail('attachmentImageTooLarge');
  if (totals.binary > MAX_BINARY_BYTES) fail('attachmentBatchTooLarge');
}

export async function prepareFileAttachments(files, existingAttachments, capabilities, {makeId = () => crypto.randomUUID()} = {}) {
  const selected = Array.from(files), existing = Array.from(existingAttachments);
  if (selected.length + existing.length > MAX_ATTACHMENTS) fail('attachmentCountExceeded');
  const descriptors = selected.map(describeFile);
  const totals = {text: 0, image: 0, binary: 0};
  for (const attachment of existing) {
    if (typeof attachment.text === 'string') totals.text += encoder.encode(attachment.text).length;
    if (attachment.type === 'image' && attachment.data) totals.image += atob(attachment.data).length;
    if (attachment.type === 'file_upload') totals.binary += attachment.size;
  }
  // Reject metadata/capability violations before reading text or image content.
  for (const item of descriptors) {
    if (item.kind === 'image') {
      if (!capabilities?.promptCapabilities?.image) fail('attachmentUnsupported');
      totals.image += item.size;
    } else if (item.kind === 'text') {
      // Each source file is bounded before reading; the aggregate uses decoded
      // UTF-8 bytes, matching the existing text flow (including BOM removal).
      if (item.size > MAX_TEXT_BYTES) fail('attachmentTextTooLarge');
    } else {
      if (item.size > MAX_FILE_BYTES) fail('attachmentFileTooLarge');
      totals.binary += item.size;
    }
  }
  checkTotals(totals);
  const prepared = [];
  for (const {file, name, kind, size, mimeType} of descriptors) {
    if (kind === 'file_upload') {
      prepared.push({type: 'file_upload', name, mimeType, size, file});
      continue;
    }
    try {
      if (kind === 'image') {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        totals.image += bytes.length - size;
        prepared.push({type: 'image', name, mimeType, data: btoa(binary)});
      } else {
        // Preserve the existing browser .text() decoding/extension behavior.
        const text = await file.text();
        totals.text += encoder.encode(text).length;
        prepared.push({name, mimeType, text});
      }
    } catch { fail('attachmentReadFailed'); }
    checkTotals(totals);
  }
  // No partial results or mutations of the existing draft on any failure.
  return prepared.map(attachment => {
    const id = makeId();
    return attachment.type === 'file_upload' ? {id, uploadId: id, ...attachment} : {id, ...attachment};
  });
}
