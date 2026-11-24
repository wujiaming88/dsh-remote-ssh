import React from 'react';
import {h} from './shared.js';
import {thoughtSummary} from './thought-model.js';

export function AcpThought({item,t,running=false,showPreview=true,renderFactorySlot}) {
  const [open,setOpen]=React.useState(false);
  const id=React.useId();
  const summary=thoughtSummary(item.text,running);
  const label=t('acp.thought');
  return h('section',{className:'rssh-thought','data-running':running?'':undefined,'data-open':open?'':undefined},
    h('button',{type:'button',className:'rssh-thought-toggle','aria-expanded':open,'aria-controls':id,
      'aria-label':`${label} · ${t(open?'acp.hide':'acp.show')}`,onClick:()=>setOpen(value=>!value)},
      h('svg',{className:'rssh-thought-icon',width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.3,'aria-hidden':true},
        h('path',{d:'M6 13v-2.3C4.2 10 3 8.4 3 6.5a5 5 0 0 1 10 0c0 1.9-1.2 3.5-3 4.2V13M6 15h4M6.2 5.5c0-1.2 1.8-1.2 1.8 0v3M9.8 5.5c0-1.2-1.8-1.2-1.8 0'})),
      h('span',{className:'rssh-thought-title'},label),
      !open&&summary&&(running||showPreview)?h(React.Fragment,null,h('span',{className:'rssh-thought-separator','aria-hidden':true},'·'),
        h('span',{className:'rssh-thought-summary',title:summary},summary)):null,
      h('svg',{className:'rssh-thought-chevron',width:12,height:12,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},
        h('path',{d:'m4 6 4 4 4-4'}))),
    running?h('span',{className:'rssh-thought-sr'},t('acp.running')):null,
    h('div',{id,hidden:!open,className:'rssh-thought-body'},open?renderFactorySlot('conversation.chat.reasoning.content',{text:item.text,running}):null));
}
