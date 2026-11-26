// COPY/ADAPTATION: DSH 0.2.2-rc.5 ui-chat MessageItem/UserContent,
// AssistantMarkdown and MessageIconActions. See docs/NATIVE_UI.md and MIT notice.
// These are props-only view seats, not imports of Host Session stores. The ACP
// adapter owns identity, streaming, attachments, source notices and copy text.
// Missing timestamps/fork capabilities are omitted, never synthesized. The
// existing safe Markdown/CopyButton implementations supply their content slots.
import React from 'react';
import {h,ui,NativeIcon} from './shared.js';
import {turnUsageRows,turnUsageText} from './message-meta-model.js';
import {dismissUsagePopover} from './usage.js';

export function NativeMessageActions({clock,children}) {
  return h('div',{className:'rssh-native-message-actions','data-clock':clock},children);
}
export function NativeMessageCopy({text,labels,iconOnly=true}) {
  return h(ui.CopyButton,{text,labels,iconOnly,
    className:iconOnly?'rssh-native-message-action':'rssh-native-message-extra'});
}
export function NativeMessageUsage({tokens,usage,label,title,hint,labels,t}) {
  const [open,setOpen]=React.useState(false);
  const reading=tokens===null?'—':tokens;
  const total=turnUsageText(usage);
  const content=[h(NativeIcon,{key:'icon',name:'stats',size:14,'aria-hidden':true}),h('span',{key:'text'},`${label} ${reading} tok`)];
  if(!usage)return h('span',{className:'rssh-native-message-meta rssh-native-message-usage',title:hint,'aria-label':`${title}: ${reading} tok`},content);
  const trigger=h('button',{type:'button',className:'rssh-native-message-meta rssh-native-message-usage rssh-turn-usage-trigger',
    title:hint,'aria-label':`${title}: ${total}`,'aria-haspopup':'dialog','aria-expanded':open,
    onKeyDown:event=>dismissUsagePopover(event,open,()=>setOpen(false)),
    onClick:()=>setOpen(value=>!value)},content);
  const rows=turnUsageRows(usage,labels);
  return h(ui.Menu,{open,onClose:()=>setOpen(false),autoFocus:false,role:'dialog',align:'end',
    className:'rssh-turn-usage-panel','aria-label':title,anchor:trigger},
    h('section',{className:'rssh-turn-usage-card'},
      h('div',{className:'rssh-turn-usage-header'},
        h('span',{className:'rssh-turn-usage-icon'},h(NativeIcon,{name:'stats',size:16,'aria-hidden':true})),
        h('span',{className:'rssh-turn-usage-heading'},title),
        h('span',{className:'rssh-turn-usage-total'},total)),
      h('dl',{className:'rssh-turn-usage-rows'},rows.map(([name,value],index)=>h('div',{className:'rssh-turn-usage-row',key:index},
        h('dt',null,name),h('dd',null,value))))));
}
export function NativeMessageTime({time,dateTime,label}) {
  if(!time)return null;
  return h('time',{className:'rssh-native-message-meta rssh-native-message-time',dateTime,
    title:label,'aria-label':label?`${label} ${time}`:undefined},time);
}
export function NativeUserMessage({label,text,attachments,delivery,source,actions,latest=false,pending=false}) {
  return h('article',{className:'rssh-message rssh-native-user','aria-label':label,
    'data-actions-reveal':latest?'always':'hover','data-pending-steering':pending?'':undefined},
    source,
    h('div',{className:'rssh-native-user-stack'},
      attachments,
      text?h('div',{className:'rssh-native-user-bubble','data-message-bubble':'','data-text-interaction-source':''},text):null,
      delivery?h('span',{className:'rssh-message-delivery'},delivery):null),
    actions);
}
export function NativeAssistantMessage({label,streaming=false,source,body,actions,interrupted}) {
  return h('article',{className:'rssh-message rssh-native-assistant','aria-label':label,
    'data-streaming':streaming?'':undefined,'data-actions-reveal':'hover'},
    source,
    h('div',{className:'rssh-native-assistant-body'},body,
      interrupted?h('span',{className:'rssh-native-assistant-stopped'},interrupted):null),
    actions?h('div',{className:'rssh-native-assistant-footer'},actions):null);
}
