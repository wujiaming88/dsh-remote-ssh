import React from 'react';
import {h} from './shared.js';

export function FlowIcon({kind='tool'}) {
  const paths={tool:'m5 4-3 4 3 4m6-8 3 4-3 4M9 2 7 14',agent:'M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M1 14v-2a5 5 0 0 1 10 0v2m1-11a3 3 0 0 1 0 6m1 2a4 4 0 0 1 2 3',state:'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2m-3 6 2 2 4-4',plan:'m2 4 1 1 2-2m2 1h7M2 8h3m2 0h7M2 12h3m2 0h7',message:'M2 2h12v9H6l-4 3V2',native:'M5 2H2v12h3m6-12h3v12h-3M7 5 5 8l2 3m2-6 2 3-2 3'};
  return h('svg',{className:'rssh-flow-icon',width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.3,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:paths[kind]||paths.tool}));
}

// Owned native-style disclosure. Its body function is invoked only while expanded.
// Keep this component keyed by projected item identity, never by incoming chunk count.
export function ownedDisclosure({title,summary,icon,running=false,failed=false,status,children,defaultOpen=false,open:controlledOpen,onOpenChange,className='',secondary=false}) {
  const [localOpen,setOpen]=React.useState(defaultOpen);
  const open=controlledOpen===undefined?localOpen:controlledOpen;
  const id=React.useId();
  function toggle() {
    const next=!open;
    if(controlledOpen===undefined)setOpen(next);
    if(onOpenChange)onOpenChange(next);
  }
  return h('section',{className:'rssh-flow '+className,'data-running':running?'':undefined,'data-failed':failed?'':undefined,'data-open':open?'':undefined,'data-secondary':secondary?'':undefined},
    h('button',{type:'button',className:'rssh-flow-toggle','aria-expanded':open,'aria-controls':id,onClick:toggle},
      icon||h(FlowIcon),h('span',{className:'rssh-flow-title'},title),
      summary?h(React.Fragment,null,h('span',{className:'rssh-flow-separator','aria-hidden':true}),h('span',{className:'rssh-flow-summary',title:summary},summary)):null,
      failed&&status?h('span',{className:'rssh-flow-failure'},status):null,
      h('svg',{className:'rssh-flow-chevron',width:12,height:12,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},h('path',{d:'m4 6 4 4 4-4'}))),
    status&&!failed?h('span',{className:'rssh-flow-sr',role:running?'status':undefined},status):null,
    h('div',{id,hidden:!open,className:'rssh-flow-body'},open?(typeof children==='function'?children():children):null));
}
