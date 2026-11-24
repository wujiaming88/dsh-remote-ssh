// Owned DSH-theme controls; only the Host React instance is supplied.
import {text, splitLines, stripTerminal, inlineTokens, parseMarkdown, diffLines, limitLines, menuPosition} from "./ui-pure.js";

export function createUi(React) {
    'use strict';
    
    var h = React.createElement;
    var Fragment = React.Fragment;
    var exports = {};

    
    function classes(base, extra) { return base + (extra ? ' ' + extra : ''); }
    function omit(props, keys) {
      var result = {};
      Object.keys(props || {}).forEach(function (key) { if (keys.indexOf(key) === -1) result[key] = props[key]; });
      return result;
    }
    function label(labels, key, fallback, value) {
      var result = labels && labels[key];
      return typeof result === 'function' ? result(value) : (result == null ? fallback : result);
    }
    
    function restoreFocus(node) { if (node && node.isConnected && typeof node.focus === 'function') node.focus({ preventScroll: true }); }
    
    

    function Button(props) {
      var nativeProps = omit(props, ['children', 'variant', 'size', 'loading', 'icon', 'iconOnly', 'block']);
      nativeProps.className = classes('rsui-button', props.className);
      nativeProps.type = props.type || 'button';
      nativeProps.disabled = !!(props.disabled || props.loading);
      nativeProps['data-variant'] = props.variant || 'outline';
      nativeProps['data-size'] = props.size || 'md';
      if (props.loading) nativeProps['aria-busy'] = true;
      if (props.block) nativeProps.style = Object.assign({ width: '100%' }, props.style);
      return h(Fragment, null, h('button', nativeProps, props.loading ? h(StateDot, { state: 'ongoing' }) : props.icon, props.children));
    }
    function Input(props) {
      var nativeProps = omit(props, ['size', 'error', 'prefix', 'suffix']);
      nativeProps.className = classes('rsui-input', props.className);
      nativeProps.type = props.type || 'text';
      if (props.error) nativeProps['aria-invalid'] = true;
      if (typeof props.size === 'number') nativeProps.size = props.size;
      return h(Fragment, null, h('input', nativeProps));
    }
    function Checkbox(props) {
      var inputProps = omit(props, ['label', 'children', 'className', 'style', 'onChange']);
      inputProps.type = 'checkbox';
      inputProps.className = 'rsui-check-input';
      inputProps.onChange = function (event) { if (props.onChange) props.onChange(event.target.checked); };
      return h('label', { className: classes('rsui-check', props.className), style: props.style },
        h('input', inputProps), props.label == null ? props.children : h('span', null, props.label));
    }
    
    
    
    function Tag(props) { return h(Fragment, null, h('span', Object.assign({}, omit(props, ['tone']), { className: classes('rsui-tag', props.className), 'data-tone': props.tone || 'neutral' }), props.children)); }
    function StateDot(props) {
      return h(Fragment, null, h('span', { className: classes('rsui-dot', props.className), style: props.style, 'data-state': props.state || 'idle', 'aria-hidden': props.label ? undefined : true, role: props.label ? 'img' : undefined, 'aria-label': props.label, title: props.title }));
    }

    // Original, stroke-based SVG geometry; no font icons or third-party artwork.
    var paths = {
      send: ['M3 4 21 12 3 20 6 12 3 4Z', 'M6 12h10'],
      gauge: ['M4 18a9 9 0 1 1 16 0', 'M12 13l5-6', 'M5 13h1M7 7l1 1M12 4v1M18 13h1', 'M10.5 16h3'],
      chevron: ['m6 9 6 6 6-6'],
      folder: ['M3 7V5h6l2 2h9v4', 'M3 8v12h16l3-9H7l-4 9'],
      sidebar: ['M3 4h18v16H3V4Z', 'M9 4v16M5.5 8h1M5.5 12h1'],
      file: ['M5 3h9l5 5v13H5V3Z', 'M14 3v6h5'],
      code: ['m9 11-3 3 3 3m6-6 3 3-3 3m-2-7-2 10'],
      image: ['M4 4h16v16H4V4Z', 'm4 17 4-5 4 4 3-3 5 5', 'M8 8h.01'],
      close: ['m6 6 12 12M18 6 6 18'],
      copy: ['M9 8h11v13H9V8Z', 'M15 5V3H4v13h2'],
      check: ['m5 12 4 4L19 6']
    };
    function Icon(props) {
      var name = props.name || 'file';
      var nativeProps = omit(props, ['name', 'size', 'path', 'children']);
      nativeProps.width = props.size || 16; nativeProps.height = props.size || 16;
      nativeProps.viewBox = '0 0 24 24'; nativeProps.fill = 'none'; nativeProps.stroke = 'currentColor';
      nativeProps.strokeWidth = 1.6; nativeProps.strokeLinecap = 'round'; nativeProps.strokeLinejoin = 'round';
      nativeProps.focusable = false; nativeProps['aria-hidden'] = nativeProps['aria-label'] ? undefined : true;
      if (nativeProps['aria-label']) nativeProps.role = 'img';
      nativeProps.style = Object.assign({ flex: 'none', verticalAlign: 'middle' }, props.style);
      return h('svg', nativeProps, (paths[name] || paths.file).map(function (d, i) { return h('path', { key: i, d: d }); }));
    }
    function icon(name) { return function (props) { return h(Icon, Object.assign({}, props, { name: name })); }; }
    function FileTypeIcon(props) {
      var path = text(props.path).toLowerCase();
      var name = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/.test(path) ? 'image' : /\.(js|jsx|ts|tsx|py|sh|json|css|html|rs|go|java|c|cpp|h|yaml|yml)$/.test(path) ? 'code' : 'file';
      return h(Icon, Object.assign({}, props, { name: name }));
    }

    
    function Modal(props) {
      var dialogRef = React.useRef(null);
      var closeRef = React.useRef(props.onClose); closeRef.current = props.onClose;
      var uid = React.useId();
      React.useLayoutEffect(function () {
        var dialog = dialogRef.current;
        if (!props.open || !dialog) return;
        var previous = dialog.ownerDocument.activeElement;
        // Native dialog supplies top-layer stacking, inert background, and focus trap.
        dialog.showModal();
        var preferred = dialog.querySelector('[data-modal-autofocus="true"]:not(:disabled),[autofocus]:not(:disabled)');
        if (preferred) preferred.focus();
        return function () { if (dialog.open) dialog.close(); restoreFocus(previous); };
      }, [!!props.open]);
      if (!props.open) return null;
      return h(Fragment, null, h('dialog', {
        ref: dialogRef, className: classes('rsui-modal', props.className), style: props.style,
        'aria-labelledby': props.title ? uid + '-title' : undefined,
        'aria-label': props['aria-label'] || (!props.title ? props.closeLabel : undefined),
        'aria-describedby': props.description ? uid + '-description' : undefined,
        onCancel: function (event) { event.preventDefault(); if (closeRef.current) closeRef.current(); },
        onClick: function (event) {
          if (event.target !== dialogRef.current || props.closeOnBackdrop === false) return;
          var rect = dialogRef.current.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            if (closeRef.current) closeRef.current();
          }
        }
      },
      h('div', { className: 'rsui-modal-head' }, h('h2', { className: 'rsui-modal-title', id: uid + '-title' }, props.title),
        h(Button, { variant: 'ghost', size: 'sm', 'aria-label': props.closeLabel || 'Close', title: props.closeLabel || 'Close', onClick: function () { if (closeRef.current) closeRef.current(); } }, h(Icon, { name: 'close' }))),
      props.description ? h('p', { className: 'rsui-modal-description', id: uid + '-description' }, props.description) : null,
      props.children != null ? h('div', { className: 'rsui-modal-body' }, props.children) : null,
      props.footer != null ? h('div', { className: 'rsui-modal-footer' }, props.footer) : null));
    }

    
    
    function Menu(props) {
      var anchorRef = React.useRef(null), panelRef = React.useRef(null), focusedAnchor = React.useRef(null);
      var current = React.useRef(props); current.current = props;
      var suppressToggle = React.useRef(false);
      var uid = React.useId();
      var search = React.useRef({ text: '', time: 0 });
      function close(restore) {
        if (current.current.onClose) current.current.onClose();
        if (restore) restoreFocus(focusedAnchor.current || anchorRef.current);
      }
      function candidates() {
        return panelRef.current ? Array.from(panelRef.current.querySelectorAll('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled),[role="menuitemcheckbox"]:not(:disabled),button:not(:disabled),a[href]')).filter(function (node) { return !node.hidden && node.getAttribute('aria-disabled') !== 'true'; }) : [];
      }
      React.useLayoutEffect(function () {
        var panel = panelRef.current, anchor = anchorRef.current;
        if (!props.open || !panel || !anchor) return;
        var win = panel.ownerDocument.defaultView;
        
        suppressToggle.current = false;
        function onToggle(event) { if (event.newState === 'closed' && !suppressToggle.current) close(false); }
        function position() {
          var rect = anchor.getBoundingClientRect();
          var size = panel.getBoundingClientRect();
          var point = menuPosition(rect, size, { width: win.innerWidth, height: win.innerHeight }, current.current.align);
          panel.style.left = point.left + 'px'; panel.style.top = point.top + 'px';
        }
        function outside(event) { if (!anchor.contains(event.target) && !panel.contains(event.target)) close(false); }
        panel.addEventListener('beforetoggle', onToggle);
        panel.showPopover();
        // Manual popovers avoid light-dismiss racing the controlled trigger's click.
        // This listener only checks containment in our own two refs.
        panel.ownerDocument.addEventListener('pointerdown', outside);
        position();
        var options = candidates();
        var selected = options.filter(function (node) { return node.getAttribute('aria-checked') === 'true'; })[0];
        if (props.autoFocus !== false) {
          if (selected || options[0]) (selected || options[0]).focus({ preventScroll: true });
          else panel.focus({ preventScroll: true });
        }
        win.addEventListener('resize', position);
        win.addEventListener('scroll', position, true);
        var observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(position) : null;
        if (observer) { observer.observe(anchor); observer.observe(panel); }
        return function () {
          suppressToggle.current = true;
          panel.removeEventListener('beforetoggle', onToggle);
          if (panel.matches(':popover-open')) panel.hidePopover();
          panel.ownerDocument.removeEventListener('pointerdown', outside);
          win.removeEventListener('resize', position); win.removeEventListener('scroll', position, true);
          if (observer) observer.disconnect();
        };
      }, [!!props.open]);
      function onKeyDown(event) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
        // Informational popovers retain normal Tab/Shift+Tab and disclosure-key
        // navigation rather than behaving as action menus.
        if (current.current.role === 'dialog') return;
        if (event.key === 'Tab') { close(true); return; }
        var nodes = candidates();
        if (!nodes.length) return;
        var index = nodes.indexOf(panelRef.current.ownerDocument.activeElement), next = -1;
        if (event.key === 'ArrowDown') next = (index + 1) % nodes.length;
        if (event.key === 'ArrowUp') next = (index - 1 + nodes.length) % nodes.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = nodes.length - 1;
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
          var now = Date.now();
          search.current.text = (now - search.current.time < 600 ? search.current.text : '') + event.key.toLowerCase();
          search.current.time = now;
          for (var i = 1; i <= nodes.length; i++) { var n = (index + i) % nodes.length; if (text(nodes[n].textContent).trim().toLowerCase().indexOf(search.current.text) === 0) { next = n; break; } }
        }
        if (next >= 0) { event.preventDefault(); nodes[next].focus({ preventScroll: true }); }
      }
      var items = Array.isArray(props.items) ? props.items : null;
      var triggerId = React.isValidElement(props.anchor) && props.anchor.props.id || uid + '-trigger';
      var trigger = React.isValidElement(props.anchor) ? React.cloneElement(props.anchor, {
        id: triggerId, 'aria-haspopup': props.role || 'menu', 'aria-controls': uid, 'aria-expanded': !!props.open
      }) : props.anchor;
      return h(Fragment, null, h('span', {
        className: 'rsui-menu-anchor', ref: anchorRef, tabIndex: -1,
        onFocusCapture: function (event) { if (!panelRef.current || !panelRef.current.contains(event.target)) focusedAnchor.current = event.target; },
        onBlurCapture: function (event) {
          if (current.current.role === 'dialog' && current.current.open && !anchorRef.current?.contains(event.relatedTarget)) close(false);
        }
      }, trigger,
      h('div', { ref: panelRef, id: uid, popover: 'manual', hidden: !props.open, role: props.role || 'menu', tabIndex: -1,
        'aria-label': props['aria-label'], 'aria-labelledby': props['aria-label'] || !React.isValidElement(props.anchor) ? undefined : triggerId,
        className: classes('rsui-menu', props.className), onKeyDown: onKeyDown,
        style: props.style }, items ? items.map(function (item, index) {
          if (!item) return null;
          if (item.type === 'separator' || item.separator) return h('hr', { key: item.id || index, className: 'rsui-menu-separator', role: 'separator' });
          var selectable = props.selectedId !== undefined;
          return h('button', { key: item.id == null ? index : item.id, type: 'button', className: 'rsui-menu-item',
            role: selectable ? 'menuitemradio' : 'menuitem', disabled: !!item.disabled,
            'aria-checked': selectable ? props.selectedId === item.id : undefined,
            onClick: function (event) { if (item.onClick) item.onClick(event); if (!event.defaultPrevented) { if (props.onSelect) props.onSelect(item.id); close(true); } }
          }, item.icon || null, h('span', { className: 'rsui-menu-label' }, item.label,
            item.description || item.detail ? h('span', { className: 'rsui-menu-detail' }, item.description || item.detail) : null),
          selectable ? h('span', { className: 'rsui-menu-check', 'aria-hidden': true }, props.selectedId === item.id ? h(Icon, { name: 'check' }) : null) : null);
        }) : props.children)));
    }

    // Owned safe text controls: no private renderer/module imports.
    function CopyButton(props) {
      var pair = React.useState('idle'), state = pair[0], setState = pair[1];
      var mounted = React.useRef(false), timer = React.useRef(null), operation = React.useRef(0);
      React.useEffect(function () { mounted.current = true; return function () { mounted.current = false; operation.current++; if (timer.current != null) clearTimeout(timer.current); }; }, []);
      React.useEffect(function () { operation.current++; setState('idle'); if (timer.current != null) clearTimeout(timer.current); }, [props.text]);
      function copy() {
        var generation = ++operation.current;
        if (timer.current != null) clearTimeout(timer.current);
        if (!window.navigator.clipboard || typeof window.navigator.clipboard.writeText !== 'function') { setState('failed'); return; }
        setState('busy');
        Promise.resolve().then(function () { return window.navigator.clipboard.writeText(text(props.text)); }).then(function () {
          if (!mounted.current || generation !== operation.current) return;
          setState('copied'); timer.current = setTimeout(function () { if (mounted.current) setState('idle'); }, 2000);
        }, function () { if (mounted.current && generation === operation.current) setState('failed'); });
      }
      var caption = label(props.labels, state === 'copied' ? 'copied' : 'copy', state === 'copied' ? 'Copied' : 'Copy');
      var buttonProps = omit(props, ['text', 'labels', 'iconOnly', 'children']);
      Object.assign(buttonProps, { size: 'sm', variant: 'ghost', className: classes('rsui-text-action', props.className), onClick: copy,
        disabled: !!props.disabled || state === 'busy', 'data-icon-only': !!props.iconOnly,
        'aria-label': state === 'copied' ? caption : props['aria-label'] || caption,
        title: state === 'copied' ? caption : props.title || caption });
      return h(Fragment, null,
        h(Button, buttonProps, h(Icon, { name: state === 'copied' ? 'check' : 'copy', size: 16 }), props.iconOnly ? null : caption),
        state === 'copied' ? h('span', { className: 'rsui-copy-feedback', role: 'status' }, caption) : null,
        state === 'failed' ? h('span', { className: 'rsui-copy-error', role: 'alert' }, label(props.labels, 'copyFailed', 'Copy unavailable; select the text and copy manually.')) : null);
    }
    function TextBlock(props) {
      var expandedPair = React.useState(false), expanded = expandedPair[0];
      var wrapPair = React.useState(!!props.wrap), wrap = wrapPair[0];
      var rows = props.rows || [], max = limitLines(props.maxLines), shown = expanded ? rows : rows.slice(0, max);
      var labels = props.labels || {}, hidden = Math.max(0, rows.length - shown.length);
      var canExpand = rows.length > max;
      var uid = React.useId();
      var caption = expanded ? label(labels, 'collapse', 'Collapse') : label(labels, 'expand', 'Show ' + hidden + ' more lines', hidden);
      var wrapCaption = label(labels, wrap ? 'unwrapLabel' : 'wrapLabel', wrap ? 'Unwrap' : 'Wrap');
      return h('section', { className: classes('rsui-block', props.className), 'aria-label': text(props.label) || undefined }, h('div', { className: 'rsui-block-banner' }, h('span', { className: 'rsui-block-label' }, props.label || label(labels, 'codeLabel', 'Code')),
          props.status ? h('span', { className: 'rsui-block-status', role: 'status' }, props.status) : null,
          props.allowWrap === false ? null : h(Button, { variant: 'ghost', size: 'sm', className: 'rsui-text-action', iconOnly: true, 'data-icon-only': true,
            title: wrapCaption, 'aria-label': wrapCaption, 'aria-pressed': wrap, 'aria-controls': uid, onClick: function () { wrapPair[1](!wrap); } },
            h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', focusable: false, 'aria-hidden': true },
              h('path', { d: wrap ? 'M4 6h16M4 11h12a4 4 0 0 1 0 8h-4m3-3-3 3 3 3M4 16h3' : 'M4 6h16M4 12h16M4 18h16' }))),
          h(CopyButton, { text: props.copyText == null ? rows.map(function (row) { return row.text; }).join('\n') : props.copyText, labels: labels, iconOnly: true })),
        props.before,
        h('pre', { className: 'rsui-block-pre', 'data-wrap': wrap, id: uid, tabIndex: 0 }, h('code', null, shown.map(function (row, index) {
          return h('span', { key: index, className: 'rsui-block-line', 'data-kind': row.kind },
            props.diff ? h('span', { className: 'rsui-block-number', 'aria-hidden': true }, row.oldNumber == null ? '' : row.oldNumber) : null,
            props.numbers ? h('span', { className: 'rsui-block-number', 'aria-hidden': true }, row.number == null ? '' : row.number) : null,
            props.diff ? h('span', { className: 'rsui-block-sign', 'aria-hidden': true }, row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : ' ') : null,
            h('span', { className: 'rsui-block-line-text' }, text(row.text)));
        }))),
        canExpand || props.totalLines != null ? h('div', { className: 'rsui-block-footer' },
          props.totalLines != null ? h('span', { className: 'rsui-block-status' }, typeof labels.window === 'function' ? labels.window(shown.length, props.totalLines) : shown.length + ' / ' + props.totalLines) : null,
          canExpand ? h(Button, { variant: 'ghost', size: 'sm', 'aria-expanded': expanded, 'aria-controls': uid,
            'aria-label': expanded ? label(labels, 'collapseAria', text(caption)) : label(labels, 'expandAria', text(caption), hidden),
            onClick: function () { expandedPair[1](!expanded); } }, caption) : null) : null,
        props.after);
    }
    function ReadBlock(props) {
      var rows = Array.isArray(props.lines) ? props.lines.map(function (line, index) { return typeof line === 'object' && line ? { number: line.number == null ? index + 1 : line.number, text: text(line.text) } : { number: index + 1, text: text(line) }; }) : splitLines(props.text).map(function (line, index) { return { number: index + 1, text: line }; });
      return h(TextBlock, Object.assign({}, props, { rows: rows, numbers: true, copyText: props.copyText == null && !Array.isArray(props.lines) && typeof props.text === 'string' ? props.text : props.copyText,
        totalLines: props.totalLines == null ? rows.length : props.totalLines }));
    }
    function DiffBlock(props) {
      var diffs = Array.isArray(props.diffs) ? props.diffs : [];
      return h(Fragment, null, diffs.map(function (diff, index) {
        var rows = diffLines(diff.oldText, diff.newText);
        var removed = rows.filter(function (row) { return row.kind === 'remove'; }).length;
        var added = rows.filter(function (row) { return row.kind === 'add'; }).length;
        return h(TextBlock, { key: text(diff.path) + ':' + index, className: props.className, label: diff.path || label(props.labels, 'codeLabel', 'Code'), labels: props.labels, maxLines: props.maxLines, rows: rows, numbers: true, diff: true, copyText: text(diff.newText), status: '+' + added + ' / −' + removed });
      }));
    }
    function TerminalBlock(props) {
      var labels = props.labels || {}, output = stripTerminal(props.output), command = stripTerminal(props.command), status = '';
      if (props.running) status = label(labels, 'running', 'Running');
      else if (props.signal) status = label(labels, 'signal', 'Signal: ' + props.signal, props.signal);
      else if (props.exitCode != null) status = label(labels, 'exitCode', 'Exit code: ' + props.exitCode, props.exitCode);
      else status = label(labels, 'noExitCode', 'No exit code');
      var rows = splitLines(output).map(function (line) { return { text: line }; });
      // Status is only the supplied exit/signal/running state, never inferred from output.
      return h(TextBlock, { rows: rows, copyText: output, labels: labels, wrap: true, allowWrap: false, label: props.label || label(labels, 'commandLine', 'Terminal', 1), maxLines: props.maxLines, status: status, className: props.className,
        before: h(Fragment, null, command ? h('pre', { className: 'rsui-terminal-command' }, command) : null,
          props.cwd ? h('div', { className: 'rsui-terminal-meta' }, props.cwd) : null),
        after: !rows.length ? h('div', { className: 'rsui-terminal-meta' }, label(labels, 'noOutput', 'No output')) : null });
    }
    function renderInline(tokens) {
      return tokens.map(function (token, index) {
        if (token.type === 'text') return token.text;
        if (token.type === 'code') return h('code', { key: index }, token.text);
        if (token.type === 'link') return h('a', { key: index, href: token.href, title: token.title, target: /^https?:/i.test(token.href) ? '_blank' : undefined, rel: /^https?:/i.test(token.href) ? 'noopener noreferrer' : undefined }, renderInline(token.children));
        return h(token.type, { key: index }, renderInline(token.children));
      });
    }
    function renderBlocks(blocks, labels) {
      return blocks.map(function (block, index) {
        if (block.type === 'paragraph') return h('p', { key: index }, renderInline(inlineTokens(block.text)));
        if (block.type === 'heading') return h('h' + block.level, { key: index }, renderInline(inlineTokens(block.text)));
        if (block.type === 'hr') return h('hr', { key: index });
        if (block.type === 'quote') return h('blockquote', { key: index }, renderBlocks(block.children, labels));
        if (block.type === 'code') {
          var codeLabels = labels && labels.code || {}, toolbar = codeLabels.toolbarLabels || {};
          return h(TextBlock, { key: index, label: block.language || toolbar.codeLabel, copyText: block.text, rows: splitLines(block.text).map(function (line) { return { text: line }; }), maxLines: Number.MAX_SAFE_INTEGER, labels: Object.assign({}, toolbar, { copy: codeLabels.copyLabel, copied: codeLabels.copiedLabel, copyFailed: codeLabels.copyFailedLabel }) });
        }
        if (block.type === 'list') return h(block.ordered ? 'ol' : 'ul', { key: index, start: block.ordered ? block.start : undefined, 'data-loose': !!block.loose }, block.items.map(function (item, n) {
          return h('li', { key: n }, item.checked == null ? null : h('input', { className: 'rsui-markdown-task', type: 'checkbox', checked: item.checked, disabled: true, 'aria-label': item.children[0] && item.children[0].text || undefined }), renderBlocks(item.children, labels));
        }));
        if (block.type === 'table') return h('div', { key: index, className: 'rsui-markdown-table', tabIndex: 0 }, h('table', null,
          h('thead', null, h('tr', null, block.headers.map(function (cell, n) { return h('th', { key: n, scope: 'col', style: { textAlign: block.align[n] || 'left' } }, renderInline(inlineTokens(cell))); }))),
          h('tbody', null, block.rows.map(function (row, n) { return h('tr', { key: n }, block.headers.map(function (_, column) { return h('td', { key: column, style: { textAlign: block.align[column] || 'left' } }, renderInline(inlineTokens(row[column] || ''))); })); }))));
        return null;
      });
    }
    
    function MarkdownText(props) {
      var blocks = React.useMemo(function () { return parseMarkdown(props.text); }, [props.text]);
      return h('div', { className: classes('rsui-markdown', props.className), style: props.style }, renderBlocks(blocks, props.labels));
    }

    Object.assign(exports, { Button: Button, Input: Input, Checkbox: Checkbox, Menu: Menu, Modal: Modal, Tag: Tag, StateDot: StateDot,
      IconSendOutlineRegular: icon('send'), IconGaugeOutlineRegular: icon('gauge'), IconChevronDownOutlineRegular: icon('chevron'), IconFolderOpenOutline16: icon('folder'), IconSidebarOutlineRegular: icon('sidebar'), FileTypeIcon: FileTypeIcon,
      CopyButton: CopyButton, TextBlock: TextBlock, MarkdownText: MarkdownText, DiffBlock: DiffBlock, ReadBlock: ReadBlock, TerminalBlock: TerminalBlock });
    return exports;

}
