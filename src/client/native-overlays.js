import {text, menuPosition} from './ui-pure.js';

/**
 * DSH 0.2.2-rc.5 published frontend, transcribed from the formatted release:
 * native.js zp (17793), Zu (17673), Ed (17691), db (18335).
 * COPY: Menu surface/material/viewport/itemWrap/icon/label/check DOM; Modal
 * content/header/title/description/body/footer DOM. CSS carries the corresponding
 * native values under owned names. This is NOT an instance/import of a Host control.
 * ADAPTATION: the native Portal, global focus manager, CSS anchor positioning and
 * detached backing are not portable. Keep this plugin's HTML dialog/manual popover
 * boundaries and existing ui.js controller, including its informational-card mode.
 * All DOM reads/writes are limited to our refs (plus owner-document focus/listeners).
 */
export function createNativeOverlays(React, {Button, Icon}) {
  const h = React.createElement;
  const Fragment = React.Fragment;
  function classes(base, extra) { return base + (extra ? ' ' + extra : ''); }
  function restoreFocus(node) {
    if (node && node.isConnected && typeof node.focus === 'function') node.focus({preventScroll: true});
  }

  function Modal(props) {
    const dialogRef = React.useRef(null);
    const closeRef = React.useRef(props.onClose); closeRef.current = props.onClose;
    const uid = React.useId();
    React.useLayoutEffect(function () {
      const dialog = dialogRef.current;
      if (!props.open || !dialog) return;
      const previous = dialog.ownerDocument.activeElement;
      // Boundary adaptation: browser top layer supplies stacking, inertness and
      // focus trapping instead of native db's Portal + lb global focus manager.
      dialog.showModal();
      const preferred = dialog.querySelector('[data-modal-autofocus="true"]:not(:disabled),[autofocus]:not(:disabled)');
      if (preferred) preferred.focus();
      return function () { if (dialog.open) dialog.close(); restoreFocus(previous); };
    }, [!!props.open]);
    if (!props.open) return null;
    return h(Fragment, null, h('dialog', {
      ref: dialogRef, className: classes('rssh-native-modal', props.className), style: props.style,
      'aria-labelledby': props.title ? uid + '-title' : undefined,
      'aria-label': props['aria-label'] || (!props.title ? props.closeLabel : undefined),
      'aria-describedby': props.description ? uid + '-description' : undefined,
      onCancel: function (event) { event.preventDefault(); if (closeRef.current) closeRef.current(); },
      onClick: function (event) {
        if (event.target !== dialogRef.current || props.closeOnBackdrop === false) return;
        const rect = dialogRef.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
          if (closeRef.current) closeRef.current();
        }
      }
    },
    h('div', {className: 'rssh-native-modal-content'},
      h('div', {className: 'rssh-native-modal-header'},
        h('h2', {className: 'rssh-native-modal-title', id: uid + '-title'}, props.title),
        // COPY: db uses a plain 28px close button, not the shared Button primitive.
        // Keep Button in the injection API for compatibility; no Host import needed.
        h('button', {type: 'button', className: 'rssh-native-modal-close',
          'aria-label': props.closeLabel || 'Close', title: props.closeLabel || 'Close',
          onClick: function () { if (closeRef.current) closeRef.current(); }
        }, h(Icon, {name: 'close', size: 14}))),
      props.description ? h('p', {className: 'rssh-native-modal-description', id: uid + '-description'}, props.description) : null,
      props.children != null ? h('div', {className: 'rssh-native-modal-body'}, props.children) : null),
    props.footer != null ? h('div', {className: 'rssh-native-modal-footer'}, props.footer) : null));
  }

  function Menu(props) {
    const anchorRef = React.useRef(null), panelRef = React.useRef(null), focusedAnchor = React.useRef(null);
    const current = React.useRef(props); current.current = props;
    const suppressToggle = React.useRef(false);
    const uid = React.useId();
    const search = React.useRef({text: '', time: 0});
    function close(restore) {
      if (current.current.onClose) current.current.onClose();
      if (restore) restoreFocus(focusedAnchor.current || anchorRef.current);
    }
    function candidates() {
      return panelRef.current ? Array.from(panelRef.current.querySelectorAll('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled),[role="menuitemcheckbox"]:not(:disabled),button:not(:disabled),a[href]')).filter(function (node) { return !node.hidden && node.getAttribute('aria-disabled') !== 'true'; }) : [];
    }
    React.useLayoutEffect(function () {
      const panel = panelRef.current, anchor = anchorRef.current;
      if (!props.open || !panel || !anchor) return;
      const win = panel.ownerDocument.defaultView;
      suppressToggle.current = false;
      function onToggle(event) { if (event.newState === 'closed' && !suppressToggle.current) close(false); }
      function position() {
        const rect = anchor.getBoundingClientRect();
        const size = panel.getBoundingClientRect();
        const point = menuPosition(rect, size, {width: win.innerWidth, height: win.innerHeight}, current.current.align);
        panel.style.left = point.left + 'px'; panel.style.top = point.top + 'px';
      }
      function outside(event) { if (!anchor.contains(event.target) && !panel.contains(event.target)) close(false); }
      panel.addEventListener('beforetoggle', onToggle);
      panel.showPopover();
      // Boundary adaptation: manual popover avoids light-dismiss racing the
      // controlled trigger click; containment is checked only against our refs.
      panel.ownerDocument.addEventListener('pointerdown', outside);
      position();
      const options = candidates();
      const selected = options.filter(function (node) { return node.getAttribute('aria-checked') === 'true'; })[0];
      if (props.autoFocus !== false) {
        if (selected || options[0]) (selected || options[0]).focus({preventScroll: true});
        else panel.focus({preventScroll: true});
      }
      win.addEventListener('resize', position);
      win.addEventListener('scroll', position, true);
      const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(position) : null;
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
      // Preserve informational cards' normal Tab/Shift+Tab and disclosure keys.
      if (current.current.role === 'dialog') return;
      if (event.key === 'Tab') { close(true); return; }
      const nodes = candidates();
      if (!nodes.length) return;
      const index = nodes.indexOf(panelRef.current.ownerDocument.activeElement);
      let next = -1;
      if (event.key === 'ArrowDown') next = (index + 1) % nodes.length;
      if (event.key === 'ArrowUp') next = (index - 1 + nodes.length) % nodes.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = nodes.length - 1;
      if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
        const now = Date.now();
        search.current.text = (now - search.current.time < 600 ? search.current.text : '') + event.key.toLowerCase();
        search.current.time = now;
        for (let i = 1; i <= nodes.length; i++) {
          const n = (index + i) % nodes.length;
          if (text(nodes[n].textContent).trim().toLowerCase().indexOf(search.current.text) === 0) { next = n; break; }
        }
      }
      if (next >= 0) { event.preventDefault(); nodes[next].focus({preventScroll: true}); }
    }
    const items = Array.isArray(props.items) ? props.items : null;
    const triggerId = React.isValidElement(props.anchor) && props.anchor.props.id || uid + '-trigger';
    const trigger = React.isValidElement(props.anchor) ? React.cloneElement(props.anchor, {
      id: triggerId, 'aria-haspopup': props.role || 'menu', 'aria-controls': uid, 'aria-expanded': !!props.open
    }) : props.anchor;
    return h(Fragment, null, h('span', {
      className: 'rssh-native-menu-anchor', ref: anchorRef, tabIndex: -1,
      onFocusCapture: function (event) { if (!panelRef.current || !panelRef.current.contains(event.target)) focusedAnchor.current = event.target; },
      onBlurCapture: function (event) {
        if (current.current.role === 'dialog' && current.current.open && !anchorRef.current?.contains(event.relatedTarget)) close(false);
      }
    }, trigger,
    h('div', {ref: panelRef, id: uid, popover: 'manual', hidden: !props.open, role: props.role || 'menu', tabIndex: -1,
      'aria-label': props['aria-label'], 'aria-labelledby': props['aria-label'] || !React.isValidElement(props.anchor) ? undefined : triggerId,
      className: classes('rssh-native-menu', props.className), onKeyDown: onKeyDown, style: props.style,
      'data-menu-material': 'translucent'},
      // COPY: Ed surface's material child. Its detached native backing is omitted;
      // neither this layer nor the panel is portaled outside the plugin subtree.
      h('div', {'aria-hidden': true, className: 'rssh-native-menu-material'}),
      h('div', {className: 'rssh-native-menu-viewport', role: 'presentation'}, items ? items.map(function (item, index) {
        if (!item) return null;
        if (item.type === 'separator' || item.separator) return h('div', {key: item.id || index, className: 'rssh-native-menu-separator', role: 'separator'});
        const selectable = props.selectedId !== undefined;
        const selected = selectable && props.selectedId === item.id;
        return h('div', {key: item.id == null ? index : item.id, className: 'rssh-native-menu-item-wrap'},
          h('button', {type: 'button', className: classes('rssh-native-menu-item', selected ? 'rssh-native-menu-selected' : ''),
            role: selectable ? 'menuitemradio' : 'menuitem', disabled: !!item.disabled,
            'aria-checked': selectable ? selected : undefined,
            onClick: function (event) {
              // Native disabled button semantics plus an explicit controller guard.
              if (item.disabled) return;
              if (item.onClick) item.onClick(event);
              if (!event.defaultPrevented) { if (props.onSelect) props.onSelect(item.id); close(true); }
            }
          }, item.icon ? h('span', {className: 'rssh-native-menu-item-icon', 'aria-hidden': true}, item.icon) : null,
          h('span', {className: 'rssh-native-menu-item-label'}, item.label,
            // Compatibility adaptation: old Menu supports description/detail;
            // native Zu does not, so retain it with native caption typography.
            item.description || item.detail ? h('span', {className: 'rssh-native-menu-detail'}, item.description || item.detail) : null),
          selected ? h(Icon, {name: 'check', size: 14, className: 'rssh-native-menu-check', 'aria-hidden': true}) : null));
      }) : props.children))));
  }

  return {Menu, Modal};
}
