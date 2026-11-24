import React from 'react';
import {h} from './shared.js';

export function FlowIcon({kind='tool'}) {
  const paths={tool:'m5 4-3 4 3 4m6-8 3 4-3 4M9 2 7 14',agent:'M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M1 14v-2a5 5 0 0 1 10 0v2m1-11a3 3 0 0 1 0 6m1 2a4 4 0 0 1 2 3',state:'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2m-3 6 2 2 4-4',plan:'m2 4 1 1 2-2m2 1h7M2 8h3m2 0h7M2 12h3m2 0h7',message:'M2 2h12v9H6l-4 3V2',native:'M5 2H2v12h3m6-12h3v12h-3M7 5 5 8l2 3m2-6 2 3-2 3'};
  return h('svg',{className:'rssh-flow-icon',width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.3,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:paths[kind]||paths.tool}));
}

// The affordance stays visible without hover; the category icon is secondary.
export function DisclosureLeading({icon}) {
  return h('span',{className:'rssh-disclosure-leading','aria-hidden':true},
    h('span',{className:'rssh-disclosure-icon'},icon),
    h('svg',{className:'rssh-disclosure-chevron',width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5},
      h('path',{d:'m4 6 4 4 4-4'})));
}

// Synchronous and local: the viewport captures the trigger before React changes layout.
export function requestReadingIntent(anchor,afterLayout=false) {
  if(anchor)anchor.dispatchEvent(new CustomEvent('rssh:reading-intent',{bubbles:true,detail:{anchor,afterLayout}}));
}

// Initially lazy, then keep the body mounted even when hidden. Stable item keys and
// the owning group's stable container preserve child expansion and form state.
export function ownedDisclosure({title,summary,icon,running=false,failed=false,status,children,defaultOpen=false,open:controlledOpen,onOpenChange,onRead,className='',secondary=false,scrollBody=false}) {
  const [localOpen,setOpen]=React.useState(defaultOpen);
  const open=controlledOpen===undefined?localOpen:controlledOpen;
  const [mounted,setMounted]=React.useState(open);
  const id=React.useId(),trigger=React.useRef(null);
  React.useLayoutEffect(()=>{if(open)setMounted(true);requestReadingIntent(trigger.current,true);},[open]);
  function read(event) { if(event.isTrusted)onRead?.(event); }
  function toggle(event) {
    requestReadingIntent(event.currentTarget);
    const next=!open;
    if(controlledOpen===undefined)setOpen(next);
    if(onOpenChange)onOpenChange(next);
  }
  return h('section',{className:'rssh-flow '+className,'data-running':running?'':undefined,'data-failed':failed?'':undefined,'data-open':open?'':undefined,'data-summary':summary?'':undefined,'data-secondary':secondary?'':undefined,
    onKeyDown:event=>{if(open&&event.key==='Tab')read(event);}},
    h('button',{ref:trigger,type:'button',className:'rssh-flow-toggle','aria-expanded':open,'aria-controls':id,onClick:toggle},
      h(DisclosureLeading,{icon:icon||h(FlowIcon)}),h('span',{className:'rssh-flow-title',title},title),
      summary?h(React.Fragment,null,h('span',{className:'rssh-flow-separator','aria-hidden':true}),h('span',{className:'rssh-flow-summary',title:summary},summary)):null,
      status?h('span',{className:failed?'rssh-flow-failure':'rssh-flow-status','data-active':running?'':undefined},status):running?h('span',{className:'rssh-flow-active-mark','aria-hidden':true}):null),
    h('div',{id,hidden:!open,className:'rssh-flow-body',
      onPointerDown:event=>{if(event.button===0)read(event);},onClick:read,onKeyDown:read},
      open||mounted?(typeof children==='function'?children():children):null));
}
