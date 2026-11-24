import React from 'react';
import {h,ui,useT} from './shared.js';
import {composerControls} from './composer-controls-model.js';

function StopIcon() {
  return h('svg',{viewBox:'0 0 16 16',width:16,height:16,'aria-hidden':true},
    h('rect',{x:3,y:3,width:10,height:10,rx:3,fill:'currentColor'}));
}
function SendIcon() {
  return h('svg',{viewBox:'0 0 16 16',width:16,height:16,fill:'none','aria-hidden':true},
    h('path',{d:'M8 13.5V2.5M3 7.5l5-5 5 5',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round'}));
}
function Spinner() {
  return h('svg',{className:'rssh-composer-spinner',viewBox:'0 0 16 16',width:16,height:16,'aria-hidden':true},
    h('circle',{cx:8,cy:8,r:6,fill:'none',stroke:'currentColor',strokeOpacity:0.35,strokeWidth:2}),
    h('path',{d:'M8 2a6 6 0 0 1 6 6',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round'}));
}
export function ComposerControls(props) {
  const t=useT(), controls=composerControls(props);
  const keepFocus=event=>{if(event.button===0)event.preventDefault();};
  const stopLabel=t(controls.stopping?'acp.stopping':'acp.stop');
  return h(React.Fragment,null,
    controls.independentStop?h(ui.Button,{variant:'primary',className:'ra-acp-send',disabled:!!props.busy,
      title:stopLabel,'aria-label':stopLabel,'aria-busy':controls.stopping,onMouseDown:keepFocus,onClick:props.onStop},
      h(controls.stopping?Spinner:StopIcon)):null,
    h(ui.Button,{variant:'primary',className:'ra-acp-send',disabled:controls.primaryDisabled,
      title:t(controls.label),'aria-label':t(controls.label),'aria-busy':props.sending||controls.primaryStops&&controls.stopping,
      'data-pending':props.sending||controls.primaryStops&&controls.stopping?'':undefined,
      onMouseDown:keepFocus,onClick:controls.primaryStops?props.onStop:props.onSend},
      h(controls.primaryStops?(controls.stopping?Spinner:StopIcon):props.sending?Spinner:SendIcon)));
}
