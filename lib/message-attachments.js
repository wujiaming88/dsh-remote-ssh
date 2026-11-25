import { error } from './ssh.js';
import { HTTP_BASE } from './protocol.js';
import { remoteMessageId, parseRemoteMessageId } from './remote-turn-recorder.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const unavailable = (reason, status = 'unavailable') => ({ ok: true, status, reason, attachments: [] });

/** Read only native message references. Never infer ownership from an attachment digest. */
export function createMessageAttachments({ record, query, recorder, approvedFork = () => null, attachments }) {
  async function locate(args) {
    if (typeof args.id !== 'string' || !args.id || typeof args.dshSessionId !== 'string' || !args.dshSessionId
        || typeof args.turnId !== 'string' || !args.turnId || args.turnId.length > 1024) throw error('invalid_message_identity', 'ACP, DSH Session and turn identities are required');
    const found = await record(args);
    if (found.state.dshSessionId !== args.dshSessionId) throw error('binding_mismatch', 'Message belongs to another DSH Session');
    if (!query?.inspectSession || !query?.readEvent) return { missing: unavailable('native_query_unavailable') };
    await recorder.waitForSession(args.dshSessionId);
    const ownId = remoteMessageId(args.dshSessionId, args.id, args.turnId);
    const proof = approvedFork(args.dshSessionId);
    const entry = await query.inspectSession(args.dshSessionId, session => {
      const state = recorder.stateOf(session);
      if (state.messages[ownId]) return { id: ownId, seq: state.messages[ownId].seq };
      // A copied message can only be read from the child's native log, under its
      // already committed fork proof and exact inherited prefix. Never read the parent.
      if (!proof || proof.childDshSessionId !== args.dshSessionId || proof.childId !== args.id) return null;
      const lineage = [proof, ...(proof.ancestors || [])];
      for (const [id, value] of Object.entries(state.messages)) {
        const identity = parseRemoteMessageId(id);
        if (identity?.[2] === args.turnId && identity[3] === '' && value.seq < session.inheritedEventCount
            && lineage.some(parent => parent.sourceDshSessionId === identity[0] && parent.sourceId === identity[1] && value.seq <= parent.nativeBoundary)) return { id, seq: value.seq };
      }
      return null;
    });
    if (!entry) {
      const pending = found.session?.activeTurn?.id === args.turnId || found.session?.turnQueue?.some(turn => turn.id === args.turnId);
      return { missing: unavailable('native_message_unavailable', pending ? 'pending' : 'unavailable') };
    }
    const result = await query.readEvent({ sessionId: args.dshSessionId, seq: entry.seq, before: 0, after: 0 });
    const event = result.target;
    if (String(result.session?.id) !== args.dshSessionId || event?.seq !== entry.seq || event.type !== 'user/message'
        || event.data?.id !== entry.id || event.data.source?.kind !== 'user' || !Array.isArray(event.data.content)) throw error('message_attachment_mismatch', 'Native attachment message membership could not be verified');
    return { blocks: event.data.content.filter(block => block?.type === 'image' || block?.type === 'file') };
  }
  function imageRef(block) {
    const ref = block?.type === 'image' && block.attachment;
    return ref && typeof ref.attachmentId === 'string' && IMAGE_TYPES.has(ref.mediaType)
      && ['bytes', 'width', 'height'].every(key => Number.isSafeInteger(ref[key]) && ref[key] > 0) ? ref : null;
  }
  return {
    async list(args) {
      const located = await locate(args);
      if (located.missing) return located.missing;
      const images = [];
      for (const [index, block] of located.blocks.entries()) {
        if (block.type !== 'image') continue;
        const ref = imageRef(block);
        if (!ref) { images.push({ type: 'image', index, name: 'image', status: 'unavailable', reason: 'invalid_image_reference' }); continue; }
        const url = HTTP_BASE + '/message-image?' + new URLSearchParams({ id: args.id, dshSessionId: args.dshSessionId, turnId: args.turnId, index: String(index) });
        images.push({ type: 'image', index, name: ref.name || 'image', mimeType: ref.mediaType, width: ref.width, height: ref.height, bytes: ref.bytes, status: 'available', url, thumbnailUrl: url });
      }
      const available = images.some(image => image.status === 'available');
      return { ok: true, status: available ? 'available' : 'unavailable', attachments: images, ...(available ? {} : { reason: 'native_images_unavailable' }) };
    },
    async read(args, signal) {
      if (!Number.isSafeInteger(args.index) || args.index < 0 || args.index >= 16) throw error('invalid_attachment_index', 'A message attachment index is required');
      const located = await locate(args);
      const ref = imageRef(located.blocks?.[args.index]);
      if (!ref) throw error(located.missing?.reason || 'image_not_found', 'This message image is unavailable');
      if (!attachments?.readImage) throw error('native_attachment_unavailable', 'The DSH attachment reader is unavailable');
      const result = await attachments.readImage(ref, signal);
      return { data: result.data, mimeType: ref.mediaType, name: ref.name || 'image' };
    },
  };
}

/** Re-admit every asset request, including reads after a previously authorized list. */
export function messageImageHandler({ authorize, images }) {
  return async (req, res) => {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    req.on('aborted', cancel);
    try {
      if (req.method !== 'GET') throw Object.assign(error('method_not_allowed', 'GET required'), { status: 405 });
      const url = new URL(req.url, 'http://dsh.invalid');
      const rawIndex = url.searchParams.get('index');
      const args = { id: url.searchParams.get('id'), dshSessionId: url.searchParams.get('dshSessionId'), turnId: url.searchParams.get('turnId'), index: /^(0|[1-9]\d*)$/.test(rawIndex || '') ? Number(rawIndex) : NaN };
      const permitted = authorize(req, 'messageAttachments', args);
      const result = await images.read(args, abort.signal);
      if (!permitted()) throw Object.assign(error('remote_access_denied', 'Session access was revoked'), { status: 403 });
      res.writeHead(200, { 'content-type': result.mimeType, 'content-length': result.data.byteLength, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'content-disposition': "inline; filename*=UTF-8''" + encodeURIComponent(result.name) });
      res.end(Buffer.from(result.data));
    } catch (e) {
      if (!res.headersSent) res.writeHead(e.status || 404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify({ ok: false, error: { code: e.code || 'image_unavailable', message: 'Message image is unavailable' } }));
    } finally { req.removeListener('aborted', cancel); }
  };
}
