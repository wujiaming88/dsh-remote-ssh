import { error } from './ssh.js';

/** Convert exact admitted ACP prompt blocks through DSH's public durable-attachment service. */
export function nativeContentConverter(attachments) {
  return async blocks => {
    const parts = [];
    for (const block of blocks) {
      if (block.type === 'text') { parts.push({ type: 'text', text: block.text }); continue; }
      if (block.type === 'image') {
        if (!attachments) throw error('native_attachment_unavailable', 'The DSH image attachment store is unavailable');
        parts.push({ type: 'image', mediaType: block.mimeType, data: block.data }); continue;
      }
      if (block.type === 'resource' && typeof block.resource?.text === 'string') {
        if (!attachments) throw error('native_attachment_unavailable', 'The DSH file attachment store is unavailable');
        let name = 'attachment.txt';
        try { name = decodeURIComponent(new URL(block.resource.uri).pathname.split('/').pop()) || name; } catch {}
        const attachment = await attachments.admitEncodedFile({ name, data: Buffer.from(block.resource.text, 'utf8').toString('base64') });
        parts.push({ type: 'file', attachment }); continue;
      }
      throw error('native_content_unsupported', 'This attachment cannot be durably represented in the native DSH Session; send its explicit text or image content instead');
    }
    return attachments ? attachments.admitPromptContent(parts) : parts;
  };
}
