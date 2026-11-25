// View adaptations of installed DSH 0.2.2-rc.5, NOT native component imports.
// index-Ciz7DZxv.js SHA256:
// 65411dabad4de33466b12643cf30376d3d41ea1b7ce10ce329e97c89992d308b.
// Reference (formatted): TerminalBlock ZB 19364-19374; toolbar Rp 19378-19381;
// ReadBlock GB 19418-19432; DiffBlock rW 19487-19502; CodeBlock Zb
// 19975-20017; MarkdownText Bp 20427-20432. DOM/CSS are copied/adapted.
// Keep the plugin safe parser, complete diffLines, terminal stripping, localized
// labels and robust CopyButton. No private highlighting/provider state, raw HTML,
// ANSI colors, native Markdown extensions, copy interception or native services.
// Intentional compatibility: diff keeps both line-number gutters/new-text copy;
// terminal unknown exit is never rendered as success; terminal remains wrapped.
import {text, splitLines, stripTerminal, inlineTokens, parseMarkdown, diffLines, limitLines} from './ui-pure.js';

const classes = (...values) => values.filter(Boolean).join(' ');
export function textControlLabel(labels, key, fallback, value) {
  const result = labels?.[key];
  return typeof result === 'function' ? result(value) : result == null ? fallback : result;
}

// Native read/diff/terminal previews retain head AND tail; expansion never loses
// a row. Hidden count stays stable while expanded so Collapse remains available.
export function textControlWindow(rows, maxLines, expanded) {
  const max = limitLines(maxLines), hidden = Math.max(0, rows.length - max);
  const head = Math.ceil(max / 2), tail = max - head;
  return {hidden, head: hidden && !expanded ? rows.slice(0, head) : rows,
    tail: hidden && !expanded && tail ? rows.slice(-tail) : []};
}
export function textControlStatus(window, totalLines, labels = {}, status) {
  if (status) return status;
  if (totalLines == null) return undefined;
  const visible = window.head.length + window.tail.length;
  return typeof labels.window === 'function' ? labels.window(visible, totalLines) : visible + ' / ' + totalLines;
}
export function readControlRows(props) {
  return Array.isArray(props.lines) ? props.lines.map((line, index) =>
    typeof line === 'object' && line ? {number: line.number == null ? index + 1 : line.number, text: text(line.text)}
      : {number: index + 1, text: text(line)})
    : splitLines(props.text).map((line, index) => ({number: index + 1, text: line}));
}
export function terminalControlState(props) {
  const labels = props.labels || {};
  const status = props.running ? textControlLabel(labels, 'running', 'Running')
    : props.signal ? textControlLabel(labels, 'signal', 'Signal: ' + props.signal, props.signal)
      : props.exitCode != null ? textControlLabel(labels, 'exitCode', 'Exit code: ' + props.exitCode, props.exitCode)
        : textControlLabel(labels, 'noExitCode', 'No exit code');
  return {output: stripTerminal(props.output), command: stripTerminal(props.command), status,
    failed: !props.running && (!!props.signal || props.exitCode != null && props.exitCode !== 0)};
}

export function createNativeTextControls(React, {Button, Icon, CopyButton}) {
  const h = React.createElement;
  function Expansion({window, expanded, setExpanded, labels, className, id}) {
    if (!window.hidden) return null;
    const caption = expanded ? textControlLabel(labels, 'collapse', 'Collapse')
      : textControlLabel(labels, 'expand', 'Show ' + window.hidden + ' more lines', window.hidden);
    return h('button', {type: 'button', className, 'aria-expanded': expanded, 'aria-controls': id,
      'aria-label': textControlLabel(labels, expanded ? 'collapseAria' : 'expandAria', text(caption), window.hidden),
      onClick: () => setExpanded(value => !value)}, caption);
  }
  // Rp toolbar structure, with the plugin copy lifecycle instead of private Mp.
  function Header({lang, title, status, labels, copyText, wrapped, onWrap, id}) {
    const wrapLabel = textControlLabel(labels, wrapped ? 'unwrapLabel' : 'wrapLabel', wrapped ? 'Unwrap' : 'Wrap');
    return h('div', {className: 'rssh-native-text-header', 'data-code-block-banner': true},
      h('div', {className: 'rssh-native-text-heading'},
        h('span', {className: 'rssh-native-text-language'}, lang || textControlLabel(labels, 'codeLabel', 'Code')),
        title != null ? h('span', {className: 'rssh-native-text-title', title}, title) : null),
      h('div', {className: 'rssh-native-text-actions'},
        status ? h('span', {className: 'rssh-native-text-status', role: 'status'}, status) : null,
        onWrap ? h('button', {type: 'button', className: 'rssh-native-text-action', title: wrapLabel,
          'aria-label': wrapLabel, 'aria-pressed': wrapped, 'aria-controls': id, onClick: onWrap},
          h(Icon, {name: wrapped ? 'wrap' : 'nowrap', size: 14})) : null,
        h(CopyButton, {text: copyText, labels, iconOnly: true, className: 'rssh-native-text-action'})));
  }
  function TextBlock(props) {
    const [expanded, setExpanded] = React.useState(false);
    const [wrapped, setWrapped] = React.useState(!!props.wrap);
    const id = React.useId(), rows = props.rows || [], labels = props.labels || {};
    const window = textControlWindow(rows, props.maxLines, expanded);
    const read = !!props.numbers, diff = !!props.diff;
    const copyText = props.copyText == null ? rows.map(row => row.text).join('\n') : props.copyText;
    const status = textControlStatus(window, props.totalLines, labels, props.status);
    const gutter = `${rows.reduce((max, row) => Math.max(max, String(row.number ?? '').length, String(row.oldNumber ?? '').length), 3)}ch`;
    function rowView(row, index) {
      if (!read) return text(row.text);
      return h('div', {key: index, className: classes('rssh-native-read-line', diff && 'rssh-native-diff-line',
        diff && 'rssh-native-diff-' + (row.kind === 'remove' ? 'del' : row.kind || 'context')), 'data-kind': row.kind},
        diff ? h('span', {className: 'rssh-native-read-gutter', 'aria-hidden': true}, row.oldNumber ?? '') : null,
        h('span', {className: 'rssh-native-read-gutter', 'aria-hidden': true}, row.number ?? ''),
        h('span', {className: 'rssh-native-read-content', style: diff ? {color: 'inherit'} : undefined}, text(row.text)));
    }
    const expand = h(Expansion, {window, expanded, setExpanded, labels, id,
      className: diff ? 'rssh-native-diff-expand' : 'rssh-native-read-expand'});
    const header = h(Header, {lang: props.lang, title: props.label, status, labels, copyText, wrapped, id,
      onWrap: props.allowWrap === false ? undefined : () => setWrapped(value => !value)});
    // Numbered data uses GB's card/body/line/gutter/content; ordinary code uses
    // Zb's banner/content/pre/code. Only the parser/highlighter pipeline differs.
    return h('section', {className: classes(read ? 'rssh-native-text-card rssh-native-read-block' : 'rssh-native-code-block rssh-native-code-card',
      diff && 'rssh-native-diff-block', props.className), 'aria-label': text(props.label) || textControlLabel(labels, 'codeLabel', 'Code'),
      'data-read': read && !diff ? '' : undefined, 'data-diff': diff ? '' : undefined,
      'data-code-wrap': wrapped, style: {'--rssh-native-read-gutter': read ? gutter : '0ch'}},
      read ? header : h('div', {className: 'rssh-native-code-banner-wrap'}, header), props.before,
      read ? h('div', {id, tabIndex: 0, className: diff ? 'rssh-native-diff-body' : 'rssh-native-text-body'},
        window.head.map(rowView), expand, window.tail.map((row, index) => rowView(row, window.head.length + window.hidden + index)))
        : h('div', {id, className: 'rssh-native-code-content', 'data-code-block-content': true},
          h('pre', {className: 'rssh-native-code-plain', tabIndex: 0}, h('code', null, window.head.map(row => text(row.text)).join('\n'))),
          expand,
          window.tail.length ? h('pre', {className: 'rssh-native-code-plain', tabIndex: 0}, h('code', null, window.tail.map(row => text(row.text)).join('\n'))) : null),
      props.after);
  }
  function ReadBlock(props) {
    const rows = readControlRows(props);
    return h(TextBlock, {...props, rows, numbers: true,
      copyText: props.copyText == null && !Array.isArray(props.lines) && typeof props.text === 'string' ? props.text : props.copyText,
      totalLines: props.totalLines == null ? rows.length : props.totalLines});
  }
  function DiffBlock(props) {
    return h(React.Fragment, null, (Array.isArray(props.diffs) ? props.diffs : []).map((diff, index) => {
      const rows = diffLines(diff.oldText, diff.newText);
      const added = rows.filter(row => row.kind === 'add').length, removed = rows.filter(row => row.kind === 'remove').length;
      return h(TextBlock, {key: text(diff.path) + ':' + index, className: props.className,
        label: diff.path || textControlLabel(props.labels, 'codeLabel', 'Code'), labels: props.labels,
        maxLines: props.maxLines, rows, numbers: true, diff: true, copyText: text(diff.newText), status: '+' + added + ' / −' + removed});
    }));
  }
  function TerminalBlock(props) {
    const [expanded, setExpanded] = React.useState(false), id = React.useId();
    const {output, command, status, failed} = terminalControlState(props), labels = props.labels || {};
    const rows = splitLines(output), window = textControlWindow(rows, props.maxLines, expanded);
    const commands = splitLines(command);
    function outputRows(values, start = 0) { return values.map((line, index) => h('div', {key: start + index, className: 'rssh-native-terminal-line'}, line)); }
    return h('section', {className: classes('rssh-native-terminal-block', props.className), 'data-terminal': '',
      'data-running': props.running ? '' : undefined, 'data-body': '', 'aria-label': props.label || textControlLabel(labels, 'commandLine', 'Terminal', 1),
      style: {'--rssh-native-terminal-line-whitespace': 'pre-wrap'}},
      h('div', {className: 'rssh-native-terminal-header'},
        h('div', {className: 'rssh-native-terminal-prompt'},
          (commands.length ? commands : ['']).map((line, index) => h('div', {key: index, className: 'rssh-native-terminal-prompt-line'},
            h('span', {className: 'rssh-native-terminal-cwd'}, index === 0 && props.cwd ? props.cwd : '$'),
            h('span', {className: 'rssh-native-terminal-command rssh-native-command-text', tabIndex: 0,
              'aria-label': textControlLabel(labels, 'commandLine', 'Command line ' + (index + 1), index + 1)}, line)))),
        h('span', {className: failed ? 'rssh-native-terminal-status' : 'rssh-native-text-status', role: 'status'}, status),
        h(CopyButton, {text: output, labels, className: 'rssh-native-terminal-copy'})),
      rows.length ? h('div', {id, tabIndex: 0, className: 'rssh-native-terminal-output'},
        outputRows(window.head), h(Expansion, {window, expanded, setExpanded, labels, id, className: 'rssh-native-terminal-expand'}),
        outputRows(window.tail, window.head.length + window.hidden))
        : h('div', {className: 'rssh-native-terminal-empty'}, textControlLabel(labels, 'noOutput', 'No output')));
  }
  function renderInline(tokens) {
    return tokens.map((token, index) => {
      if (token.type === 'text') return token.text;
      if (token.type === 'code') return h('code', {key: index}, token.text);
      if (token.type === 'link') return h('a', {key: index, href: token.href, title: token.title,
        target: /^https?:/i.test(token.href) ? '_blank' : undefined,
        rel: /^https?:/i.test(token.href) ? 'noopener noreferrer' : undefined}, renderInline(token.children));
      return h(token.type, {key: index}, renderInline(token.children));
    });
  }
  function renderBlocks(blocks, labels) {
    return blocks.map((block, index) => {
      if (block.type === 'paragraph') return h('p', {key: index}, renderInline(inlineTokens(block.text)));
      if (block.type === 'heading') return h('h' + block.level, {key: index}, renderInline(inlineTokens(block.text)));
      if (block.type === 'hr') return h('hr', {key: index});
      if (block.type === 'quote') return h('blockquote', {key: index}, renderBlocks(block.children, labels));
      if (block.type === 'code') {
        const codeLabels = labels?.code || {}, toolbar = codeLabels.toolbarLabels || {};
        return h(TextBlock, {key: index, lang: block.language, copyText: block.text,
          rows: splitLines(block.text).map(line => ({text: line})), maxLines: Number.MAX_SAFE_INTEGER,
          labels: {...toolbar, copy: codeLabels.copyLabel, copied: codeLabels.copiedLabel, copyFailed: codeLabels.copyFailedLabel}});
      }
      if (block.type === 'list') return h(block.ordered ? 'ol' : 'ul', {key: index, start: block.ordered ? block.start : undefined, 'data-loose': !!block.loose},
        block.items.map((item, n) => h('li', {key: n}, item.checked == null ? null
          : h('input', {type: 'checkbox', checked: item.checked, disabled: true, 'aria-label': item.children[0]?.text || undefined}), renderBlocks(item.children, labels))));
      if (block.type === 'table') return h('div', {key: index, className: 'rssh-native-markdown-table-scroll', tabIndex: 0}, h('table', null,
        h('thead', null, h('tr', null, block.headers.map((cell, n) => h('th', {key: n, scope: 'col', style: {textAlign: block.align[n] || 'left'}}, renderInline(inlineTokens(cell)))))),
        h('tbody', null, block.rows.map((row, n) => h('tr', {key: n}, block.headers.map((_, column) => h('td', {key: column, style: {textAlign: block.align[column] || 'left'}}, renderInline(inlineTokens(row[column] || '')))))))));
      return null;
    });
  }
  function MarkdownText(props) {
    const blocks = React.useMemo(() => parseMarkdown(props.text), [props.text]);
    return h('div', {className: classes('rssh-native-markdown', props.className), style: props.style}, renderBlocks(blocks, props.labels));
  }
  return {TextBlock, ReadBlock, DiffBlock, TerminalBlock, MarkdownText};
}
