import React from 'react';
import { createUi } from './ui.js';
export {api,stream,formatError,responseError} from './api.js';

export {NativeIcon} from './native-icons.js';
export const h = React.createElement;
export const ui = createUi(React);
export const NAMESPACE = 'dsh-remote-ssh';
export const locale = {
  t: key => key,
  subscribe: () => () => {},
  getSnapshot: () => 0,
};
export function useT() {
  React.useSyncExternalStore(locale.subscribe, locale.getSnapshot, locale.getSnapshot);
  return locale.t;
}



// One modern JSON contract. Network failures are data so forms retain user input.




export function Select({ label, value, options, onChange, disabled, icon, className = '', align = 'end' }) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find(option => option.id === value);
  return h(ui.Menu, {
    open, items: options, selectedId: value, align,
    onClose: () => setOpen(false),
    onSelect: id => { setOpen(false); onChange(id); },
    anchor: h(ui.Button, { variant: 'ghost', size: 'sm', disabled,
      className: `rssh-selector ${className}`.trim(), 'aria-label': `${label}: ${selected?.label || value || ''}`,
      title: `${label}: ${selected?.label || value || ''}`, onClick: () => setOpen(current => !current) },
    icon, h('span', {className:'rssh-selector-label'}, selected?.label || value || label), h(ui.IconChevronDownOutlineRegular, { size: 14 })),
  });
}
export function FileGlyph({ directory, name }) {
  return directory ? h(ui.IconFolderOpenOutline16, { size: 16 }) : h(ui.FileTypeIcon, { path: name, size: 16 });
}
