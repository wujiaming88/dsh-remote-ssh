import React from 'react';
import {h,ui,useT,NativeIcon} from './shared.js';
import {composerControls} from './composer-controls-model.js';

export function PermissionIcon() { return h(NativeIcon,{name:'permission',size:14}); }
export function AttachmentButton({disabled,onClick}) { const t=useT(); return h(ui.Button,{variant:'ghost',className:'rssh-composer-add',disabled,onClick,title:t('acp.addAttachment'),'aria-label':t('acp.addAttachment')},h(NativeIcon,{name:'add',size:16})); }

function StopIcon(){return h(NativeIcon,{name:'stop',size:16});}
function SendIcon(){return h(NativeIcon,{name:'send',size:16});}
function Spinner(){return h(ui.StateDot,{state:'ongoing',size:16});}
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
