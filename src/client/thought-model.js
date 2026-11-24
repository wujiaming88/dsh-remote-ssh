// Match the native reasoning preview cadence: update only after a paragraph's
// first line completes, avoiding a continually reflowing half-written summary.
export function thoughtSummary(rawText, running = false) {
  const text = String(rawText || '').replace(/\r\n?/g, '\n');
  // Completion uses the same last completed paragraph as streaming; do not
  // jump back to the first paragraph when the activity marker disappears.
  // A separator itself completes the first line of the preceding paragraph.
  const paragraphs = text.split(/\n(?:[\t ]*\n)+/);
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const newline = paragraphs[i].indexOf('\n');
    if (newline !== -1 || i < paragraphs.length - 1) {
      const line = paragraphs[i].split('\n', 1)[0].replaceAll('**', '').trim();
      if (line) return line;
    }
  }
  return running ? '' : text.split('\n', 1)[0].replaceAll('**', '').trim();
}
export function thoughtIsStreaming(item, items, running) {
  return !!running && item?.type === 'thought' && item.streaming !== false && item.inherited !== true && items.at(-1)?.key === item.key;
}
