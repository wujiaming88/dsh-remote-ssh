// DSH message-quotes ultimately emits ordinary Markdown blockquotes. The
// remote pane replaces the native composer, so bridge the native insertQuote
// action into the remote draft instead of the hidden native editor.

export function quoteMarkdown(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  if (!normalized.trim()) return null;
  return normalized.split('\n').map(line => `> ${line}`).join('\n');
}

export function makeQuote(text) {
  const value = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!value) return null;
  const summary = value.replace(/\s+/g, ' ').slice(0, 120);
  const id = globalThis.crypto?.randomUUID?.() || `quote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {id, text: value, summary};
}

export function insertQuoteIntoDraft(draft, text, start, end) {
  const quote = quoteMarkdown(text);
  if (quote === null) return null;
  const value = String(draft ?? '');
  const from = Math.max(0, Math.min(Number.isSafeInteger(start) ? start : value.length, value.length));
  const to = Math.max(from, Math.min(Number.isSafeInteger(end) ? end : from, value.length));
  const before = value.slice(0, from), after = value.slice(to);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  const tail = after.startsWith('\n') ? '\n' : '\n\n';
  const inserted = lead + quote + tail;
  return { draft: before + inserted + after, caret: before.length + inserted.length };
}

/** Replace one InputActions.insertQuote until the returned disposer runs. */
export function installQuoteBridge(inputActions, onInsert) {
  if (!inputActions || typeof inputActions.insertQuote !== 'function' || typeof onInsert !== 'function') return () => {};
  const original = inputActions.insertQuote;
  const replacement = function insertQuote(text) {
    const result = onInsert(text);
    return result === undefined ? original.call(this, text) : result;
  };
  try { inputActions.insertQuote = replacement; } catch { return () => {}; }
  return () => { if (inputActions.insertQuote === replacement) inputActions.insertQuote = original; };
}
