import React from 'react';
import {h,useT,NativeIcon} from './shared.js';
import {composerControls} from './composer-controls-model.js';

export function PermissionIcon() { return h(NativeIcon,{name:'permission',size:14}); }
// COPY: InputBar.tsx native button faces; the + still opens remote file intake,
// not the Host command menu. Submission mode remains composerControls-owned.
export function AttachmentButton({disabled,onClick}) { const t=useT(); return h('button',{type:'button',className:'rssh-native-composer-add',disabled,onClick,title:t('acp.addAttachment'),'aria-label':t('acp.addAttachment')},h(NativeIcon,{name:'composer-add',weight:'medium',size:14})); }

function StopIcon(){return h(NativeIcon,{name:'composer-stop',size:16});}
function SendIcon(){return h(NativeIcon,{name:'composer-send',size:16});}
function Spinner(){return h(NativeIcon,{name:'composer-sending',size:16,className:'rssh-native-composer-sendingSpinner'});}
export function ComposerControls(props) {
  const t=useT(), controls=composerControls(props);
  const keepFocus=event=>{if(event.button===0)event.preventDefault();};
  const stopLabel=t(controls.stopping?'acp.stopping':'acp.stop');
  return h(React.Fragment,null,
    controls.independentStop?h('button',{type:'button',className:'rssh-native-composer-primary',disabled:!!props.busy,
      title:stopLabel,'aria-label':stopLabel,'aria-busy':controls.stopping,onMouseDown:keepFocus,onClick:props.onStop},
      h(controls.stopping?Spinner:StopIcon)):null,
    h('button',{type:'button',className:'rssh-native-composer-primary',disabled:controls.primaryDisabled,
      title:t(controls.label),'aria-label':t(controls.label),'aria-busy':props.sending||controls.primaryStops&&controls.stopping,
      'data-sending':props.sending||controls.primaryStops&&controls.stopping?'':undefined,
      onMouseDown:keepFocus,onClick:controls.primaryStops?props.onStop:props.onSend},
      h(controls.primaryStops?(controls.stopping?Spinner:StopIcon):props.sending?Spinner:SendIcon)));
}
