import React from "react";
import {ui, h} from "./shared.js";
import {acpNativeName, acpContentText, acpNormalizeExit, acpNativeState, acpSubagentFromTool, acpItemId, acpChildrenFor, acpQuestionField, acpQuestionAnswersValid} from "./presentation.js";
import {ownedDisclosure as Disclosure,FlowIcon} from './disclosure.js';
import {toolFlowModel,rawDetailEntries,fullPayloadText,processRowSummary} from './tool-model.js';
import {AcpThought} from './thought.js';
import {thoughtIsStreaming} from './thought-model.js';
const UiButton=ui.Button, UiInput=ui.Input;
function AcpMarkdown(props) { return h(ui.MarkdownText, {text:props.text,labels:props.labels}); }
function payloadItem(props,type,payload) {
  return props.item || {type,key:props.itemKey||props._key,[type==='tool'?'tool':'subagent']:payload,sessionId:props.sessionId};
}
function nested(props,item) {
  var id=acpItemId(item);
  return h(AcpNestedChildren,{...props,items:acpChildrenFor(item,props.childMap,props.ancestors),ancestors:(props.ancestors||[]).concat(id)});
}

// One secondary raw disclosure per event. Full existing objects are retained;
// unlike the former event-name preview, unknown native fields are never dropped.
export function AcpNativeDetails(props) {
  var [open,setOpen]=React.useState(false);
  var payload=props.payload||{native:props.native,nativeMeta:props.nativeMeta};
  var entries=rawDetailEntries(payload);
  if(!entries.length)return null;
  return h('details',{className:'rssh-flow-raw',open,onToggle:event=>setOpen(event.currentTarget.open)},
    h('summary',null,props.t('acp.rawDetails')),
    open?h('div',{className:'rssh-flow-raw-body'},entries.map(entry=>h('section',{key:entry.key},
      h('div',{className:'rssh-flow-raw-label'},entry.key),
      h('pre',{className:'rssh-flow-raw-text'},fullPayloadText(entry.value))))):null);
}
export function AcpSourceFallback({item,fallback,t}) {
  if(!fallback)return null;
  return h('div',{className:'rssh-flow-source'},
    [t?t('acp.sourceFallback'):null,fallback.reason, fallback.sessionId&&'session: '+fallback.sessionId,
      fallback.parentToolCallId&&'parent: '+fallback.parentToolCallId,
      fallback.rootSessionId&&'root: '+fallback.rootSessionId].filter(Boolean).join(' · '));
}
export function AcpSubagentMeta(props) {
  var sub=props.subagent||{},t=props.t;
  var ids=['agentId','sessionId','taskId','toolUseId'].filter(key=>sub[key]);
  return h('div',{className:'rssh-flow-agent-meta'},
    sub.description?h('div',null,String(sub.description)):null,
    ids.length?h('div',{className:'rssh-flow-source'},ids.map(key=>key+': '+String(sub[key])).join(' · ')):null,
    sub.background?h('div',{className:'rssh-flow-source'},t('acp.subagentBackground')):null,
    sub.outputFile?h('div',null,h('code',null,String(sub.outputFile)),props.onOpenOutput?h(UiButton,{variant:'ghost',size:'sm',onClick:()=>props.onOpenOutput(String(sub.outputFile),String(sub.title||''))},t('acp.subagentOpenOutput')):null):null);
}
export function AcpSubagentCard(props) {
  var sub=props.subagent||{},t=props.t,item=payloadItem(props,'subagent',sub);
  var state=acpNativeState(sub.state??sub.status),summary=acpContentText(sub.summary||sub.content||sub.message||'');
  var failed=state.key==='acp.toolFailed';
  return h(React.Fragment,null,h(Disclosure,{className:'rssh-subagent-flow',icon:h(FlowIcon,{kind:'agent'}),
    title:String(sub.title||t('acp.subagent')),summary:processRowSummary(sub.description||summary,props.showProcessSummary,failed,acpContentText(sub.errorMessage||sub.error||(failed?summary:''))),
    running:state.dot==='ongoing',failed,status:t(state.key),children:()=>h(React.Fragment,null,
      h(AcpSubagentMeta,props),summary?h(AcpMarkdown,{text:summary,labels:props.labels.markdown}):null,
      h(AcpNativeDetails,{t,payload:sub}),nested(props,item))}),h(AcpSourceFallback,{item,t,fallback:props.sourceFallback}));
}
export function AcpStateCard(props) {
  var item=props.item||{},t=props.t,state=acpNativeState(item.state),error=acpContentText(item.errorMessage||item.error);
  return h(React.Fragment,null,h(Disclosure,{secondary:true,icon:h(FlowIcon,{kind:'state'}),title:t('acp.state'),
    summary:error||item.stopReason||t(state.key),failed:state.key==='acp.toolFailed'||!!error,running:state.dot==='ongoing',status:t(state.key),
    children:()=>h(React.Fragment,null,error?h('div',{className:'ra-acp-error',role:'alert'},error):null,
      item.stopReason?h('div',null,t('acp.stopReason')+': '+String(item.stopReason)):null,
      h(AcpNativeDetails,{t,payload:item}),nested(props,item))}),h(AcpSourceFallback,{item,t,fallback:props.sourceFallback}));
}
export function AcpSessionMessageCard(props) {
  var item=props.item||{},t=props.t,content=item.text||acpContentText(item.content);
  return h(React.Fragment,null,h(Disclosure,{icon:h(FlowIcon,{kind:'message'}),title:t('acp.sessionMessage'),
    summary:[item.sender,item.recipient].filter(Boolean).join(' → '),children:()=>h(React.Fragment,null,
      content?h(AcpMarkdown,{text:String(content),labels:props.labels.markdown}):null,
      h(AcpNativeDetails,{t,payload:item}),nested(props,item))}),h(AcpSourceFallback,{item,t,fallback:props.sourceFallback}));
}
export function AcpTerminalEventCard(props) {
  var item=props.item||{},t=props.t,exit=acpNormalizeExit(item.exitStatus);
  var failed=exit.exitCode!==undefined&&exit.exitCode!==0||!!exit.signal;
  return h(React.Fragment,null,h(Disclosure,{icon:h(FlowIcon),title:t('acp.terminalEvent'),summary:String(item.command||item.cwd||item.terminalId||''),
    running:exit.running,failed,status:t(failed?'acp.failed':exit.running?'acp.running':'acp.done'),children:()=>h(React.Fragment,null,
      h(ui.TerminalBlock,{command:String(item.command||''),cwd:String(item.cwd||''),output:String(item.output??''),...exit,labels:props.labels.terminal,maxLines:Number.MAX_SAFE_INTEGER}),
      h(AcpNativeDetails,{t,payload:item}),nested(props,item))}),h(AcpSourceFallback,{item,t,fallback:props.sourceFallback}));
}
export function AcpNativeEventCard(props) {
  var item=props.item||{},t=props.t;
  return h(React.Fragment,null,h(Disclosure,{secondary:true,icon:h(FlowIcon,{kind:'native'}),title:t('acp.nativeEventFallback'),
    summary:acpNativeName(item.native)||String(item.label||item.event?.type||''),children:()=>h(React.Fragment,null,
      h(AcpNativeDetails,{t,payload:item}),nested(props,item))}),h(AcpSourceFallback,{item,t,fallback:props.sourceFallback}));
}
function compactionSummaryText(summary) {
  if (!Array.isArray(summary)) return '';
  return summary.filter(function (b) { return b && b.type === 'text' && b.text; }).map(function (b) { return b.text; }).join('');
}
export function AcpCompactionCard(props) {
  var item=props.item||{},t=props.t;
  var summary=String(item.summaryText||compactionSummaryText(item.summary)||item.error||item.status||'');
  var running=/running|in_progress|started/.test(String(item.status||''));
  var failed=!!item.error||String(item.status||'')==='failed';
  return h(React.Fragment,null,h(Disclosure,{secondary:true,icon:h(FlowIcon,{kind:'state'}),title:t('acp.compaction'),
    summary:summary,running,failed,status:t(failed?'acp.toolFailed':running?'acp.running':undefined),
    children:()=>h(React.Fragment,null,summary?h(AcpMarkdown,{text:summary,labels:props.labels.markdown}):null,
      h(AcpNativeDetails,{t,payload:item}),nested(props,item))}),h(AcpSourceFallback,{item,t,fallback:props.sourceFallback}));
}
export function AcpNoticeCard(props) {
  var item=props.item||{},t=props.t;
  var title=String(item.title||''),desc=String(item.description||'');
  var tone=item.severity==='error'?'error':item.severity==='warning'?'warning':'info';
  return h('div',{className:'rssh-flow-notice','data-tone':tone,role:item.severity==='error'?'alert':'status'},
    h(FlowIcon,{kind:'message'}),h('span',{className:'rssh-flow-notice-body'},
      title?h('strong',null,title+': '):null,h('span',null,desc)),
    h(AcpSourceFallback,{item,t,fallback:props.sourceFallback}));
}
export function AcpNestedChildren(props) {
  var items=props.items||[];
  if(!items.length)return null;
  return h('div',{className:'rssh-flow-children'},items.map(item=>h(AcpNestedItem,{...props,key:item.key||acpItemId(item),item})));
}
export function AcpNestedItem(props) {
  var item=props.item;
  if(!item)return null;
  var common={...props,sourceFallback:props.fallbacks?.[acpItemId(item)]};
  switch(item.type) {
    case 'tool':return h(AcpToolCard,{...common,tool:item.tool});
    case 'subagent':return h(AcpSubagentCard,{...common,subagent:item.subagent});
    case 'state':return h(AcpStateCard,common);
    case 'plan':return h(AcpPlanCard,{...common,...item});
    case 'session_message':return h(AcpSessionMessageCard,common);
    case 'terminal_event':return h(AcpTerminalEventCard,common);
    case 'native_event':return h(AcpNativeEventCard,common);
    case 'compaction':return h(AcpCompactionCard,common);
    case 'notice':return h(AcpNoticeCard,common);
    case 'thought':return h(React.Fragment,null,h(AcpThought,{...common,running:thoughtIsStreaming(item,props.transcriptItems||[item],props.running)}),h(AcpNativeDetails,{t:props.t,payload:item}),nested(props,item));
    case 'assistant': case 'user':return h('div',{className:'rssh-flow-text'},h(AcpMarkdown,{text:String(item.text||acpContentText(item.content)),labels:props.labels.markdown}),
      h(AcpNativeDetails,{t:props.t,payload:item}),nested(props,item));
    default:return h('div',{className:'rssh-flow-text',role:item.type==='error'?'alert':undefined},
      item.text||item.message||item.content?h(AcpMarkdown,{text:String(item.text||item.message||acpContentText(item.content)),labels:props.labels.markdown}):null,
      h(AcpNativeDetails,{t:props.t,payload:{event:item}}),nested(props,item));
  }
}
function AcpToolBody({model,labels}) {
  switch(model.body) {
    case 'diff':return h(ui.DiffBlock,{diffs:model.diffs.map(d=>({path:String(d.path||''),oldText:d.oldText==null?null:String(d.oldText),newText:String(d.newText||'')})),labels:labels.diff,maxLines:Number.MAX_SAFE_INTEGER});
    case 'terminal':return h(ui.TerminalBlock,{command:model.command,cwd:model.cwd,output:model.output,...model.exit,labels:labels.terminal,maxLines:Number.MAX_SAFE_INTEGER});
    case 'read':return model.output?h(ui.ReadBlock,{label:model.locations[0]?.path||model.name,lines:model.output.split('\n').map((text,i)=>({number:i+1,text})),totalLines:model.output.split('\n').length,labels:labels.read,maxLines:Number.MAX_SAFE_INTEGER}):null;
    default:return model.output?h('div',{className:'rssh-flow-result'},h(AcpMarkdown,{text:model.output,labels:labels.markdown})):null;
  }
}
export function AcpToolCard(props) {
  var tool=props.tool||{},t=props.t,model=toolFlowModel(tool),item=payloadItem(props,'tool',tool);
  var sub=tool.subagent&&typeof tool.subagent==='object'?acpSubagentFromTool(tool):null;
  var status=t(model.failed?'acp.toolFailed':model.running?'acp.toolRunning':tool.status==='completed'?'acp.toolDone':'acp.toolPending');
  return h(React.Fragment,null,h(Disclosure,{className:'rssh-tool-flow',icon:h(FlowIcon,{kind:sub?'agent':'tool'}),title:model.title||t('acp.tool'),
    summary:processRowSummary(model.summary,props.showProcessSummary,model.failed,model.error),running:model.running,failed:model.failed,status,children:()=>h(React.Fragment,null,
      sub?h(AcpSubagentMeta,{...props,subagent:sub}):null,
      model.locations.length?h('div',{className:'rssh-flow-locations'},model.locations.map((loc,i)=>h(UiButton,{key:JSON.stringify([loc.path,loc.line,i]),variant:'ghost',size:'sm',
        onClick:()=>props.onOpenOutput?.(String(loc.path||''))},String(loc.path||'')+(loc.line==null?'':':'+loc.line)))):null,
      h(AcpToolBody,{model,labels:props.labels}),h(AcpNativeDetails,{t,payload:tool}),nested(props,item))}),
      h(AcpSourceFallback,{item,t,fallback:props.sourceFallback}));
}
export function AcpPlanCard(props) {
  var entries=Array.isArray(props.entries)?props.entries:[],t=props.t,item=props.item||props;
  var active=entries.filter(entry=>entry.status==='in_progress'),done=entries.filter(entry=>entry.status==='completed');
  var summary=active[0]?.content||String(props.content||'')||(entries.length?done.length+'/'+entries.length:'');
  return h(React.Fragment,null,h(Disclosure,{secondary:true,icon:h(FlowIcon,{kind:'plan'}),title:t('acp.plan'),summary:String(summary),running:active.length>0,status:active.length?t('acp.running'):undefined,
    children:()=>h(React.Fragment,null,entries.length?entries.map((entry,i)=>h('div',{key:entry.id||i,className:'rssh-flow-plan-row'},
      h(ui.StateDot,{state:entry.status==='completed'?'done':entry.status==='in_progress'?'ongoing':'idle'}),h('span',null,String(entry.content||'')))):h('div',null,String(props.content||'')),
      h(AcpNativeDetails,{t,payload:item}),nested(props,item))}),h(AcpSourceFallback,{item,t,fallback:props.sourceFallback}));
}

export function AcpElicitationCard(props) {
  var t = props.t;
  var request = props.request || {};
  var schema = request.requestedSchema || request.schema || {};
  var fields = {};
  Object.keys(schema.properties || {}).forEach(function (key) { fields[key] = acpQuestionField(schema.properties[key]); });
  var required = Array.isArray(schema.required) ? schema.required : [];
  var [answers, setAnswers] = React.useState(function () {
    var initial = {};
    Object.keys(fields).forEach(function (key) {
      if (fields[key].default !== undefined) initial[key] = fields[key].default;
      else if (fields[key].type === "boolean") initial[key] = false;
      else if (fields[key].type === "array") initial[key] = [];
    });
    return initial;
  });
  function setValue(key, value) { setAnswers(function (old) { return Object.assign({}, old, { [key]: value }); }); }
  var unsupported = Object.keys(fields).some(function (key) {
    var field = fields[key];
    return ["string", "number", "integer", "boolean", "array"].indexOf(field.type) < 0 ||
      (field.type === "array" && !(field.items && Array.isArray(field.items.enum)));
  });
  var missing = !acpQuestionAnswersValid(schema, answers);
  return h("section", { className: "ra-acp-perm", role: "group", "aria-label": request.message || t("acp.question") },
    h("div", { className: "ra-acp-perm-head" }, request.message || t("acp.question")),
    unsupported ? h("p", { role: "alert" }, t("acp.unsupportedQuestion")) : Object.keys(fields).map(function (key) {
      var field = fields[key];
      var title = String(field.title || key) + (required.indexOf(key) >= 0 ? " *" : "");
      var value = answers[key];
      var input;
      if (field.type === "boolean") {
        input = h("input", { type: "checkbox", checked: value === true, disabled: props.busy,
          onChange: function (e) { setValue(key, e.target.checked); } });
      } else if (Array.isArray(field.enum)) {
        input = h("select", { value: value == null ? "" : String(value), disabled: props.busy,
          onChange: function (e) { setValue(key, field.enum.find(function (v) { return String(v) === e.target.value; })); } },
          h("option", { value: "", disabled: true }, t("acp.chooseAnswer")),
          field.enum.map(function (v, index) { return h("option", { key: String(v), value: String(v), title: field.enumDescriptions && field.enumDescriptions[index] || "" }, field.enumNames && field.enumNames[index] || String(v)); }));
      } else if (field.type === "array") {
        input = h("span", { className: "ra-acp-question-options" }, field.items.enum.map(function (choice, index) {
          return h("label", { key: String(choice) }, h("input", { type: "checkbox", disabled: props.busy,
            checked: Array.isArray(value) && value.indexOf(choice) >= 0,
            onChange: function (e) { var list = Array.isArray(value) ? value.filter(function (v) { return v !== choice; }) : [];
              if (e.target.checked) list.push(choice); setValue(key, list); }
          }), h("span", null, field.items.enumNames && field.items.enumNames[index] || String(choice)),
            field.items.enumDescriptions && field.items.enumDescriptions[index] ? h("small", null, field.items.enumDescriptions[index]) : null);
        }));
      } else {
        input = h(UiInput, { value: value == null ? "" : String(value), disabled: props.busy,
          type: field.type === "number" || field.type === "integer" ? "number" : field.format === "password" ? "password" : "text",
          onChange: function (e) { var raw = e.target.value;
            setValue(key, field.type === "number" || field.type === "integer" ? (raw === "" ? undefined : Number(raw)) : raw); }
        });
      }
      return h("label", { key: key, className: "ra-acp-question-field" }, h("span", null, title),
        field.description ? h("span", { className: "ra-acp-role" }, String(field.description)) : null, input);
    }),
    h("div", { className: "ra-acp-perm-opts" },
      h(UiButton, { variant: "primary", size: "sm", disabled: props.busy || missing || unsupported,
        onClick: function () { props.onAnswer(request, { action: "accept", content: answers }); } }, t("acp.answerQuestion")),
      h(UiButton, { variant: "outline", size: "sm", disabled: props.busy,
        onClick: function () { props.onAnswer(request, { action: "decline" }); } }, t("acp.declineQuestion")))
  );
}

export function AcpPermissionCard(props) {
  var t = props.t;
  var permission = props.permission || {};
  var tool = permission.tool || {};
  var options = Array.isArray(permission.options) ? permission.options : [];
  var label = String(tool.title || tool.name || t("acp.tool"));
  var locations = Array.isArray(tool.locations) ? tool.locations : [];
  // Inline HITL group, not a modal. RunningTail owns the polite waiting announcement.
  return h("div", { className: "ra-acp-perm", role: "group", "aria-label": t("acp.permissionTitle") },
    h("div", { className: "ra-acp-perm-head" },
      h(ui.Tag, { tone: "warning" }, t("acp.permissionTitle")),
      h("span", null, label),
      h(ui.StateDot, { state: "warning" })
    ),
    locations.length ? h("div", { className: "ra-acp-locations" },
      locations.map(function (loc, i) {
        return h("span", { key: JSON.stringify([loc.path, loc.line, i]), className: "ra-acp-loc" },
          String(loc.path || "") + (loc.line == null ? "" : ":" + loc.line));
      })
    ) : null,
    h("div", { className: "ra-acp-role" }, t("acp.permissionDesc", { tool: label })),
    h("div", { className: "ra-acp-perm-opts" },
      options.map(function (option, i) {
        var optionId = String(option.optionId || "");
        return h(UiButton, {
          key: option.optionId || i,
          variant: option.kind === "allow_once" ? "primary" : "outline",
          size: "sm", disabled: !!props.busy,
          onClick: function () { props.onAnswer(permission, optionId); }
        }, String(option.name || optionId));
      }),
      h(UiButton, {
        variant: "outline", size: "sm", disabled: !!props.busy,
        onClick: function () { props.onDismiss(permission); }
      }, t("acp.dismiss"))
    ),
    h(AcpNativeDetails, { t: t, native: permission.native, nativeMeta: permission.nativeMeta })
  );
}

