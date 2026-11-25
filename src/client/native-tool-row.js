// COPY/ADAPT: installed DSH 0.2.2-rc.5 ToolRow.tsx + DisclosureRow dH
// (native.js 17349–17355), TextShimmer V2 (17340–17348). See native-tool-row.css.
// The native row is a div role=button, NOT a button containing a file button.
// OwnedDisclosure retains state, lazy mounting and reading/scroll ownership.
import React from 'react';
import {h,NativeIcon} from './shared.js';

export function nativeToolFileTarget({summary,path,pathLabel,failed,onOpenOutput}) {
  return !failed && typeof path==='string' && path!=='' && summary===pathLabel && typeof onOpenOutput==='function' ? path : undefined;
}
export function nativeToolRowKeyDown(event,toggle) {
  if(event.target!==event.currentTarget)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle(event);}
}
export function nativeToolFileKeyDown(event) {
  if(event.key==='Enter'||event.key===' ')event.stopPropagation();
}

export function NativeToolRow({title,summary,icon,running,failed,status,open,id,trigger,toggle,hidden,path,pathLabel,onOpenOutput,compact=false}) {
  const target=nativeToolFileTarget({summary,path,pathLabel,failed,onOpenOutput});
  // The decorative duplicate contains only text, never a second interactive link.
  function content(decoration=false) {
    return h('span',{className:'rssh-native-tool-content'+(decoration?' rssh-native-tool-highlight':'')},
      h('span',{className:'rssh-native-tool-title',title:decoration?undefined:title},title),
      summary?h(React.Fragment,null,
        h('span',{className:'rssh-native-tool-sep','data-shimmer-decoration':true,'aria-hidden':true}),
        !decoration&&target!==undefined?h('button',{type:'button',className:'rssh-native-tool-file-link',title:summary,
          onClick:event=>{event.stopPropagation();onOpenOutput(target);},onKeyDown:nativeToolFileKeyDown},summary)
          :h('span',{className:'rssh-native-tool-summary'+(failed?' rssh-native-tool-error-summary':''),title:decoration?undefined:summary},summary)):null);
  }
  return h('div',{className:'rssh-native-tool-header','data-disclosure-header':true,hidden},
    status?h('span',{className:'rssh-flow-sr'},status):null,
    h('div',{ref:trigger,className:'rssh-native-tool-row',role:'button',tabIndex:0,'aria-expanded':open,'aria-controls':id,
      'data-disclosure-row':true,'data-expandable':true,'data-compact':compact?'':undefined,onClick:toggle,onKeyDown:event=>nativeToolRowKeyDown(event,toggle)},
      h('span',{className:'rssh-native-tool-leading','aria-hidden':true},
        open?h(NativeIcon,{name:'chevron-up',size:14}):h(React.Fragment,null,
          h('span',{className:'rssh-native-tool-icon-idle'},icon),
          h(NativeIcon,{name:'chevron-down',size:14,className:'rssh-native-tool-chevron-hover'}))),
      h('span',{className:'rssh-native-tool-shimmer','data-shimmer':running||undefined},content(),
        running?h('span',{className:'rssh-native-tool-decoration','aria-hidden':true,inert:''},
          h('span',{className:'rssh-native-tool-sweep'},content(true))):null)));
}
