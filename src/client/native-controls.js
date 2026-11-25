// Local source adaptation of DeepSeek Harness 0.2.2-rc.5 UI primitives.
// Source: installed frontend index-Ciz7DZxv.js, SHA256
// 65411dabad4de33466b12643cf30376d3d41ea1b7ce10ce329e97c89992d308b.
// Original symbols: Button Pi, Input DH, Checkbox cb, Tag Ep, StateDot zd.
// This is copied implementation, NOT a runtime import or an official native slot.
// Adaptations: plugin-prefixed classes; legacy outline/neutral defaults; loading,
// block, input error, label/title and event pass-through contracts. Input retains
// the original wrapper/icon/input structure; className styles its wrapper.

import {NativeIcon} from './native-icons.js';

const join = (...values) => values.filter(Boolean).join(' ');

export function buttonControlProps({variant = 'outline', size = 'md', loading = false,
  disabled = false, block, iconOnly, className, style, icon, children, ...props}) {
  return {...props, type: props.type || 'button',
    className: join('rssh-native-button', `rssh-native-button-${variant}`, `rssh-native-button-${size}`, className),
    disabled: !!(disabled || loading), 'aria-busy': loading ? true : props['aria-busy'],
    'data-variant': variant, 'data-size': size,
    style: block ? {width: '100%', ...style} : style};
}

export function inputControlProps({icon, prefix, suffix, className, error, size, ...props}) {
  return {...props, type: props.type || 'text', className: 'rssh-native-input',
    size: typeof size === 'number' ? size : undefined,
    'aria-invalid': error ? true : props['aria-invalid']};
}

export function stateDotSize(state, size) {
  return size ?? (state === 'ongoing' ? 14 : 10);
}

// Original uH/h7 synchronize native spinner animation phases. Return a cleanup
// for the effect lifecycle: this DSH release embeds React 18, not ref cleanups.
function synchronizeSpinner(node) {
  if (!node) return;
  const sync = () => {
    for (const animation of node.getAnimations?.({subtree: true}) ?? []) animation.startTime = 0;
  };
  sync();
  node.addEventListener('animationstart', sync);
  return () => node.removeEventListener('animationstart', sync);
}

export function createNativeControls(React) {
  const h = React.createElement;
  const Button = React.forwardRef(function Button(props, ref) {
    const icon = props.loading ? h(StateDot, {state: 'ongoing'}) : props.icon;
    return h('button', {...buttonControlProps(props), ref},
      icon != null ? h('span', {className: 'rssh-native-button-icon'}, icon) : null, props.children);
  });
  const Input = React.forwardRef(function Input(props, ref) {
    const icon = props.icon ?? props.prefix;
    return h('span', {className: join('rssh-native-input-wrap', props.className)},
      icon != null ? h('span', {className: 'rssh-native-input-icon'}, icon) : null,
      h('input', {...inputControlProps(props), ref}),
      props.suffix != null ? h('span', {className: 'rssh-native-input-icon'}, props.suffix) : null);
  });
  // No standalone Select primitive is published in this baseline. Adapt Input's
  // copied shell, retaining native HTML select semantics and real change events.
  const SelectField = React.forwardRef(function SelectField({className, children, ...props}, ref) {
    return h('span', {className: join('rssh-native-input-wrap rssh-native-select-wrap', className)},
      h('select', {...props, ref, className: 'rssh-native-input rssh-native-select',
        style: {cursor: props.disabled ? 'default' : 'pointer', ...props.style}}, children),
      h('span', {className: 'rssh-native-input-icon rssh-native-select-chevron'},
        h(NativeIcon, {name: 'chevron-down', size: 14})));
  });
  function Checkbox({checked, onChange, label, children, disabled = false, title,
    className, style, modalAutofocus = false, ...props}) {
    return h('label', {className: join('rssh-native-checkbox', className), title, style},
      h('input', {...props, type: 'checkbox', checked, disabled,
        'data-modal-autofocus': modalAutofocus || props['data-modal-autofocus'] || undefined,
        onChange: event => onChange?.(event.target.checked)}),
      h('span', null, label == null ? children : label));
  }
  function Tag({tone = 'neutral', className, children, ...props}) {
    return h('span', {...props, className: join('rssh-native-tag', className), 'data-tone': tone}, children);
  }
  function StateDot({state = 'idle', size, className, style, label, title, appearance = 'dot'}) {
    const pixels = stateDotSize(state, size);
    const spinnerRef = React.useRef(null);
    React.useLayoutEffect(() => state === 'ongoing' ? synchronizeSpinner(spinnerRef.current) : undefined, [state]);
    const accessible = {'aria-hidden': label ? undefined : true, 'aria-label': label,
      role: label ? 'img' : undefined};
    // Existing plugin callsites use dot appearance. The copied step shell is also
    // supported; the completed step uses the native check geometry below.
    return state === 'ongoing'
      ? h('svg', {...accessible, ref: spinnerRef, title,
        className: join('rssh-native-spinner', className), 'data-state': 'ongoing',
        width: pixels, height: pixels, viewBox: '0 0 24 24', style},
        h('g', {className: 'rssh-native-spinner-motion'},
          h('circle', {className: 'rssh-native-spinner-track', cx: '12', cy: '12', r: '9.5'}),
          h('circle', {className: 'rssh-native-spinner-arc', cx: '12', cy: '12', r: '9.5'})))
      : h('span', {...accessible, title,
        className: join(appearance === 'step' ? 'rssh-native-step' : 'rssh-native-dot', className),
        'data-state': state, style: {width: pixels, height: pixels, ...style}},
        appearance === 'step' && state === 'done' ? h(NativeIcon, {name: 'check', size: pixels - 2}) : null);
  }
  return {Button, Input, SelectField, Checkbox, Tag, StateDot};
}
