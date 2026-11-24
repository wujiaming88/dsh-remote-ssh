import {HTTP_BASE} from '../../lib/protocol.js';
// Modern JSON and NDJSON protocol. No React or UI dependencies.
export function formatError(result, fallback = 'Request failed') {
  return typeof result?.error === 'string' ? result.error : result?.error?.message || result?.message || fallback;
}

export function responseError(result) {
  return Object.assign(new Error(formatError(result)), { code: result?.code || result?.error?.code || 'request_failed', result });
}

export async function api(method, args = {}, signal) {
  try {
    const response = await fetch(`${HTTP_BASE}/api/${method}`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
      body: JSON.stringify(args),
    });
    const value = await response.json().catch(()=>null);
    if (!response.ok || value?.ok !== true) {
      return { ...value?.error, ok: false,
        code: value?.error?.code || `http_${response.status}`,
        error: value?.error?.message || `HTTP ${response.status}` };
    }
    return value;
  } catch (error) {
    return { ok: false, code: error.name === 'AbortError' ? 'cancelled' : 'network_error', error: error.message };
  }
}

export async function stream(method, args, signal, onEvent) {
  const response = await fetch(`${HTTP_BASE}/api/${method}`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify(args),
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('ndjson') || !response.body) {
    let failure;
    try { failure = await response.json(); } catch { failure = { error: `HTTP ${response.status}` }; }
    throw responseError({...failure,code:failure?.code||failure?.error?.code||`http_${response.status}`});
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch=event=>{
    if(event?.type==='error'&&(!Number.isSafeInteger(event.seq)||event.seq<1))throw responseError(event);
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) dispatch(JSON.parse(line));
      }
      if (buffer.length > 4 * 1024 * 1024) throw new Error('ACP event exceeds the client frame limit');
      if (done) { if (buffer.trim()) dispatch(JSON.parse(buffer)); break; }
    }
  } finally {
    try { await reader.cancel(); } catch {}
    reader.releaseLock();
  }
}
