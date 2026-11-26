// Pure image source model for Markdown image messages. No React or DOM.
// A remote filesystem path (e.g. /tmp/lark-auth-qr.png) is never a browser URL:
// it becomes a scoped output-image request. Plain http(s) stays a remote image;
// every other scheme (file:, javascript:, data:, blob:, mailto:, …) is refused.
import { HTTP_BASE } from '../../lib/protocol.js';
import { text, safeHref } from './ui-pure.js';

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Recursively flatten an inline token's children into plain alt text. */
export function markdownImageAlt(token) {
  if (!token || typeof token !== 'object' || !Array.isArray(token.children)) return '';
  let out = '';
  const visit = nodes => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (node.type === 'text' || node.type === 'code') out += text(node.text);
      else if (Array.isArray(node.children)) visit(node.children);
    }
  };
  visit(token.children);
  return out;
}

/**
 * Classify an image href into {kind:'local'|'remote'|null, src}.
 * - remote: only plain https?: accepted verbatim by safeHref.
 * - local: a non-scheme path (root-relative or relative) resolved through the
 *   scoped output-image route; id + dshSessionId are required, the remaining
 *   request fields are carried verbatim and href is never rewritten.
 * - null: any other scheme, protocol-relative URLs, empty href, or a path with
 *   no usable session request.
 */
export function outputImageSource(request, href) {
  const value = text(href).trim();
  if (!value) return null;
  if (/^https?:/i.test(value)) {
    return safeHref(value) === value ? { kind: 'remote', src: value } : null;
  }
  if (SCHEME.test(value) || value.indexOf('//') === 0) return null;
  if (!request || typeof request !== 'object') return null;
  if (typeof request.id !== 'string' || !request.id || typeof request.dshSessionId !== 'string' || !request.dshSessionId) return null;
  const params = new URLSearchParams({
    id: request.id,
    dshSessionId: request.dshSessionId,
    turnId: request.turnId ?? '',
    generation: request.generation ?? '',
    fromSeq: request.fromSeq ?? '',
    throughSeq: request.throughSeq ?? '',
    sourceSessionId: request.sourceSessionId ?? '',
    href: value,
  });
  return { kind: 'local', src: HTTP_BASE + '/output-image?' + params.toString() };
}
