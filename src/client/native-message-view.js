// COPY/ADAPTATION: DSH 0.2.2-rc.5 ui-chat MessageItem/UserContent,
// AssistantMarkdown and MessageIconActions. See docs/NATIVE_UI.md and MIT notice.
// These are props-only view seats, not imports of Host Session stores. The ACP
// adapter owns identity, streaming, attachments, source notices and copy text.
// Missing timestamps/fork capabilities are omitted, never synthesized. The
// existing safe Markdown/CopyButton implementations supply their content slots.
import {h,ui,NativeIcon} from './shared.js';

export function NativeMessageActions({clock,children}) {
  return h('div',{className:'rssh-native-message-actions','data-clock':clock},children);
}
export function NativeMessageCopy({text,labels,iconOnly=true}) {
  return h(ui.CopyButton,{text,labels,iconOnly,
    className:iconOnly?'rssh-native-message-action':'rssh-native-message-extra'});
}
export function NativeMessageUsage({tokens,label,hint}) {
  const reading=tokens===null?'—':tokens;
  return h('span',{className:'rssh-native-message-meta rssh-native-message-usage',title:hint,
    'aria-label':`${label}: ${reading} tok`},
    h(NativeIcon,{name:'stats',size:14,'aria-hidden':true}),
    h('span',null,`${label} ${reading} tok`));
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
