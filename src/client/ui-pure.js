// Safe presentation transforms. No React, DOM, or Host dependencies.
export function fileParentTarget(directory, previewPath) {
  if (previewPath) return directory;
  if (!directory || directory === '.') return null;
  const parts = directory.split('/').filter(Boolean); parts.pop();
  return directory.startsWith('/') ? '/' + parts.join('/') : parts.join('/') || '.';
}
export function text(value) { return value == null ? '' : String(value); }

export function menuPosition(anchor, panel, viewport, align) {
  var margin = 8, gap = 4;
  var width = Math.min(panel.width, Math.max(0, viewport.width - margin * 2));
  var height = Math.min(panel.height, Math.max(0, viewport.height - margin * 2));
  var left = align === 'end' ? anchor.right - width : anchor.left;
  var top = anchor.bottom + gap;
  if (top + height > viewport.height - margin && anchor.top - gap - height >= margin) top = anchor.top - gap - height;
  return { left: Math.max(margin, Math.min(left, viewport.width - width - margin)), top: Math.max(margin, Math.min(top, viewport.height - height - margin)) };
}

export function safeHref(value) {
  var href = text(value).trim();
  if (!href || /[\u0000-\u0020\u007f\\]/.test(href)) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^[^/?#]*:/.test(href) || href.indexOf('//') === 0) return null;
  return href;
}

export function splitLines(value) { var s = text(value).replace(/\r\n?/g, '\n'); return s ? s.split('\n') : []; }

export function stripTerminal(value) {
  return text(value).replace(/(?:\x1b\]|\u009d)[\s\S]*?(?:\x07|\x1b\\|\u009c|$)/g, '')
    .replace(/(?:\x1b[P^_]|[\u0090\u009e\u009f])[\s\S]*?(?:\x1b\\|\u009c|$)/g, '')
    .replace(/(?:\x1b\[|\u009b)[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b[@-_]/g, '')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '');
}

export function inlineTokens(value, depth) {
  var source = text(value), out = [], plain = '', index = 0, work = 0;
  depth = depth || 0;
  if (depth > 12) return [{ type: 'text', text: source }];
  function flush() { if (plain) { out.push({ type: 'text', text: plain }); plain = ''; } }
  while (index < source.length) {
    var rest = source.slice(index, index + 4096), match;
    // Bound attempts on pathological/unclosed delimiter runs. Preserve the
    // remaining source literally instead of blocking the chat while parsing.
    if (work > 65536) { plain += source.slice(index); break; }
    if (source[index] === '\\' && /[\\`*_{}\[\]()#+.!~>|-]/.test(source[index + 1] || '')) { plain += source[index + 1]; index += 2; continue; }
    if ((match = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest))) { flush(); out.push({ type: 'code', text: match[2].replace(/\n/g, ' ') }); index += match[0].length; continue; }
    if ((match = /^(!?)\[([^\]\n]*)\]\(\s*(?:<([^>\n]*)>|([^\s)]*(?:\([^)]*\)[^\s)]*)?))(?:\s+["']([^\n]*?)["'])?\s*\)/.exec(rest))) {
      var href = safeHref(match[3] || match[4]);
      if (href) { flush(); out.push({ type: 'link', href: href, title: match[5], children: inlineTokens(match[2] || href, depth + 1), image: !!match[1] }); index += match[0].length; continue; }
    }
    if ((match = /^(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/.exec(rest))) { flush(); out.push({ type: match[1] === '~~' ? 'del' : 'strong', children: inlineTokens(match[2], depth + 1) }); index += match[0].length; continue; }
    if ((match = /^(\*|_)(?=\S)([^\n]*?\S)\1/.exec(rest)) && (index === 0 || !/[\p{L}\p{N}]/u.test(source[index - 1]))) { flush(); out.push({ type: 'em', children: inlineTokens(match[2], depth + 1) }); index += match[0].length; continue; }
    if (/[`\[!*_~]/.test(source[index])) work += rest.length;
    plain += source[index++];
  }
  flush(); return out;
}

export function tableCells(line) {
  var s = text(line).trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, ''), cells = [], cell = '', code = 0;
  for (var i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cell += '|'; i++; }
    else if (s[i] === '`') {
      var end = i + 1; while (s[end] === '`') end++;
      var count = end - i;
      if (!code) code = count; else if (code === count) code = 0;
      cell += s.slice(i, end); i = end - 1;
    }
    else if (s[i] === '|' && !code) { cells.push(cell.trim()); cell = ''; }
    else cell += s[i];
  }
  cells.push(cell.trim()); return cells;
}

export function tableDivider(line) {
  if (text(line).indexOf('|') === -1) return null;
  var cells = tableCells(line);
  return cells.length && cells.every(function (cell) { return /^:?-{3,}:?$/.test(cell); }) ? cells.map(function (cell) { return cell[0] === ':' && cell.slice(-1) === ':' ? 'center' : cell.slice(-1) === ':' ? 'right' : 'left'; }) : null;
}

export function parseMarkdown(value, depth) {
  var lines = splitLines(value), blocks = [], i = 0;
  depth = depth || 0;
  if (depth > 12) return [{ type: 'paragraph', text: text(value) }];
  function isStart(n) {
    return /^\s*$/.test(lines[n]) || /^ {0,3}(?:#{1,6}\s|`{3,}|~{3,}|>|(?:[-+*]|\d+[.)])\s)/.test(lines[n]) || /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(lines[n]) || (n + 1 < lines.length && tableDivider(lines[n + 1]));
  }
  while (i < lines.length) {
    var line = lines[i], match, start, gathered;
    if (!line.trim()) { i++; continue; }
    if ((match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line))) {
      var marker = match[1], language = match[2].trim().split(/\s/)[0]; gathered = []; i++;
      var end = new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}\\s*$');
      while (i < lines.length && !end.test(lines[i])) gathered.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ type: 'code', text: gathered.join('\n'), language: language }); continue;
    }
    if ((match = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line))) { blocks.push({ type: 'heading', level: match[1].length, text: match[2] }); i++; continue; }
    if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }
    if (/^ {0,3}>/.test(line)) {
      gathered = []; while (i < lines.length && /^ {0,3}>/.test(lines[i])) gathered.push(lines[i++].replace(/^ {0,3}> ?/, ''));
      blocks.push({ type: 'quote', children: parseMarkdown(gathered.join('\n'), depth + 1) }); continue;
    }
    var align = i + 1 < lines.length ? tableDivider(lines[i + 1]) : null;
    if (align && line.indexOf('|') !== -1 && tableCells(line).length === align.length) {
      var headers = tableCells(line), rows = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') !== -1) rows.push(tableCells(lines[i++]));
      blocks.push({ type: 'table', headers: headers, align: align, rows: rows }); continue;
    }
    if ((match = /^( {0,3})([-+*]|\d+[.)])\s+(.*)$/.exec(line))) {
      var ordered = /^\d/.test(match[2]), indent = match[1].length, items = [], loose = false; start = ordered ? parseInt(match[2], 10) : 1;
      while (i < lines.length) {
        var item = /^( *)([-+*]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!item || item[1].length !== indent || /^\d/.test(item[2]) !== ordered) break;
        var continuationIndent = item[1].length + item[2].length + 1;
        gathered = [item[3]]; i++;
        while (i < lines.length) {
          if (!lines[i].trim()) {
            var next = i + 1; while (next < lines.length && !lines[next].trim()) next++;
            var nextItem = next < lines.length && /^( *)([-+*]|\d+[.)])\s+/.exec(lines[next]);
            if (nextItem && nextItem[1].length === indent && /^\d/.test(nextItem[2]) === ordered) { loose = true; i = next; break; }
            if (next < lines.length && /^\s+\S/.test(lines[next]) && lines[next].search(/\S/) > indent) { loose = true; gathered.push(''); i = next; continue; }
            break;
          }
          var spaces = lines[i].search(/\S/);
          if (spaces <= indent) break;
          gathered.push(lines[i++].slice(Math.min(spaces, continuationIndent)));
        }
        var task = /^\[([ xX])\]\s+(.*)$/.exec(gathered[0]);
        if (task) gathered[0] = task[2];
        items.push({ checked: task ? task[1] !== ' ' : null, children: parseMarkdown(gathered.join('\n'), depth + 1) });
      }
      blocks.push({ type: 'list', ordered: ordered, start: start, loose: loose, items: items }); continue;
    }
    gathered = [line]; i++;
    while (i < lines.length && !isStart(i)) gathered.push(lines[i++]);
    blocks.push({ type: 'paragraph', text: gathered.join('\n') });
  }
  return blocks;
}

export function diffLines(oldText, newText) {
  var before = splitLines(oldText), after = splitLines(newText), prefix = 0, suffix = 0, out = [];
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  var i;
  for (i = 0; i < prefix; i++) out.push({ kind: 'context', text: before[i], oldNumber: i + 1, number: i + 1 });
  var oldEnd = before.length - suffix, newEnd = after.length - suffix;
  var oldLength = oldEnd - prefix, newLength = newEnd - prefix;
  // Keep unchanged interior lines aligned in ordinary edits. Bound the matrix;
  // huge replacements fall back to complete removal/addition, never truncation.
  if (oldLength && newLength && (oldLength + 1) * (newLength + 1) <= 262144) {
    var width = newLength + 1, matrix = new Uint32Array((oldLength + 1) * width), a, b;
    for (a = oldLength - 1; a >= 0; a--) {
      for (b = newLength - 1; b >= 0; b--) {
        matrix[a * width + b] = before[prefix + a] === after[prefix + b]
          ? 1 + matrix[(a + 1) * width + b + 1]
          : Math.max(matrix[(a + 1) * width + b], matrix[a * width + b + 1]);
      }
    }
    a = 0; b = 0;
    while (a < oldLength || b < newLength) {
      if (a < oldLength && b < newLength && before[prefix + a] === after[prefix + b]) {
        out.push({ kind: 'context', text: before[prefix + a], oldNumber: prefix + a + 1, number: prefix + b + 1 }); a++; b++;
      } else if (a < oldLength && (b === newLength || matrix[(a + 1) * width + b] >= matrix[a * width + b + 1])) {
        out.push({ kind: 'remove', text: before[prefix + a], oldNumber: prefix + a + 1, number: null }); a++;
      } else {
        out.push({ kind: 'add', text: after[prefix + b], oldNumber: null, number: prefix + b + 1 }); b++;
      }
    }
  } else {
    for (i = prefix; i < oldEnd; i++) out.push({ kind: 'remove', text: before[i], oldNumber: i + 1, number: null });
    for (i = prefix; i < newEnd; i++) out.push({ kind: 'add', text: after[i], oldNumber: null, number: i + 1 });
  }
  for (i = 0; i < suffix; i++) out.push({ kind: 'context', text: after[after.length - suffix + i], oldNumber: before.length - suffix + i + 1, number: after.length - suffix + i + 1 });
  return out;
}

export function limitLines(value) { var n = Number(value); return Number.isFinite(n) && n > 0 ? Math.max(1, Math.floor(n)) : 20; }
