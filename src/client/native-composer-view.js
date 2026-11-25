// COPY: DSH 0.2.2-rc.5, dsh-client-ui-conversation/src/client/skeleton/
// InputBar.tsx:437–602 and input/editor/DraftEditor.tsx:36–63 (MIT).
// Full presentation tree, with slot outputs supplied as props. The owner keeps
// remote ACP, retained draft, IME/keymap, file intake and ACK submission logic.
// ADAPT: a controlled textarea replaces Host-owned Lexical/DecoratorPortals;
// no private editor, projection, slot registry, store or other plugin DOM access.
import React from 'react';
import {h} from './shared.js';

export function NativeComposerView({notice, overlay, accessory, attachments, editor,
  add, fileInput, modes, left, controls, activity, activityActive = false, primary, dock,
  cardProps = {}, editorRef, scrollRef, showPlaceholder = false, placeholder}) {
  const ownEditorRef = React.useRef(null);
  const inputRef = editorRef || ownEditorRef;
  // InputBar.tsx:332–344: blank card space focuses the resident editor,
  // without treating overlays/controls as editable space or moving its caret.
  const onCardMouseDown = event => {
    cardProps.onMouseDown?.(event);
    if (editor.readOnly || event.button !== 0 || event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
    if (target.closest('[data-composer-overlay], [data-input-scroll]')) return;
    const control = target.closest('button, a, input, select, textarea, [role="button"], [contenteditable], [tabindex]');
    if (control && control !== event.currentTarget && event.currentTarget.contains(control)) return;
    event.preventDefault();
    inputRef.current?.focus({preventScroll: true});
  };
  return h('div', {className: 'rssh-native-composer-root'},
    notice ? h('div', {className: 'rssh-native-composer-notice', role: 'status'}, notice) : null,
    h('div', {...cardProps, onMouseDown: onCardMouseDown, tabIndex: -1, className: 'rssh-native-composer-card', 'data-composer-card': ''},
      h('div', {className: 'rssh-native-composer-overlayAnchor', 'data-composer-overlay': ''}, overlay),
      accessory ? h('div', {className: 'rssh-native-composer-accessory'}, accessory) : null,
      attachments,
      h('div', {ref: scrollRef, className: 'rssh-native-composer-scroll', 'data-input-scroll': ''},
        h('div', {className: 'rssh-native-composer-grow'},
          h('textarea', {...editor, ref: inputRef, className: 'rssh-native-composer-input', rows: 1}),
          showPlaceholder ? h('div', {className: 'rssh-native-composer-placeholder', 'aria-hidden': true,
            'data-composer-placeholder': ''}, placeholder) : null)),
      h('div', {className: 'rssh-native-composer-row'},
        h('div', {className: 'rssh-native-composer-tools', hidden: activityActive},
          add, fileInput, h('div', {className: 'rssh-native-composer-modes'}, modes), left),
        h('div', {className: 'rssh-native-composer-trailing' + (activityActive ? ' rssh-native-composer-trailingActive' : '')},
          h('div', {className: 'rssh-native-composer-standardControls', hidden: activityActive}, controls),
          activity ? h('div', {className: activityActive ? 'rssh-native-composer-activityExpanded' : 'rssh-native-composer-activity'}, activity) : null,
          primary))),
    h('div', {className: 'rssh-native-composer-dock', 'data-composer-dock': ''}, dock));
}
