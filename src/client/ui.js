// Local adaptations of installed DSH controls. See docs/NATIVE_UI.md for sources and boundaries.
import {createNativeControls} from "./native-controls.js";
import {createNativeOverlays} from "./native-overlays.js";
import {NativeIcon} from "./native-icons.js";
import {createNativeTextControls} from "./native-text-controls.js";
import {text} from "./ui-pure.js";

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
    
    
    

    const {Button,Input,SelectField,Checkbox,Tag,StateDot}=createNativeControls(React);
    function Icon(props) {
      const {path,children,...rest}=props;
      const aliases={gauge:'usage',chevron:'chevron-down',folder:'folder-open'};
      return h(NativeIcon,{...rest,name:aliases[props.name]||props.name||'file',
        'aria-hidden':props['aria-label']?undefined:true,role:props['aria-label']?'img':undefined,
        style:{flex:'none',verticalAlign:'middle',...props.style}});
    }
    function icon(name){return props=>h(Icon,{...props,name});}
    function FileTypeIcon(props){
      const path=text(props.path).toLowerCase();
      const name=/\.(png|jpe?g|gif|svg|webp|avif|ico)$/.test(path)?'image':/\.(js|jsx|ts|tsx|py|sh|json|css|html|rs|go|java|c|cpp|h|yaml|yml)$/.test(path)?'file-code':'file';
      return h(Icon,{...props,name});
    }
    const {Menu,Modal}=createNativeOverlays(React,{Button,Icon});

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
    const {TextBlock,ReadBlock,DiffBlock,TerminalBlock,MarkdownText}=createNativeTextControls(React,{Button,Icon,CopyButton});

    Object.assign(exports, { Button: Button, Input: Input, SelectField, Checkbox: Checkbox, Menu: Menu, Modal: Modal, Tag: Tag, StateDot: StateDot,
      IconSendOutlineRegular: icon('send'), IconGaugeOutlineRegular: icon('gauge'), IconChevronDownOutlineRegular: icon('chevron'), IconFolderOpenOutline16: icon('folder'), IconSidebarOutlineRegular: icon('sidebar'), FileTypeIcon: FileTypeIcon,
      CopyButton: CopyButton, TextBlock: TextBlock, MarkdownText: MarkdownText, DiffBlock: DiffBlock, ReadBlock: ReadBlock, TerminalBlock: TerminalBlock });
    return exports;

}
