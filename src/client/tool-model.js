import {acpContentText,acpNormalizeExit} from './presentation.js';

export function fullPayloadText(value) {
  if(typeof value==='string')return value;
  try {return JSON.stringify(value,null,2)??String(value);}catch {return String(value);}
}
export function rawDetailEntries(payload={}) {
  const entries=[];
  for(const key of ['rawInput','rawOutput','native','sessionUpdate','nativeMeta','content','diffs','terminals','attachments','event']) {
    if(payload[key]!==undefined&&payload[key]!==null&&payload[key]!=='')entries.push({key,value:payload[key]});
  }
  if(payload.output!==undefined&&payload.output!==null&&payload.output!=='')entries.push({key:'output',value:payload.output});
  const identity=Object.fromEntries(['agentId','sessionId','taskId','toolUseId','toolCallId','turnId','parentToolCallId'].filter(key=>payload[key]!=null).map(key=>[key,payload[key]]));
  if(Object.keys(identity).length)entries.push({key:'identity',value:identity});
  if(payload.subagent)entries.push({key:'subagent',value:payload.subagent});
  return entries;
}
const firstLine=value=>String(value||'').split(/\r?\n/,1)[0].trim();
export function processRowSummary(summary,showProcessSummary,failed,error) {
  if(failed&&error)return firstLine(error);
  return showProcessSummary===false?undefined:firstLine(summary);
}
export function toolFlowModel(tool={}) {
  const content=Array.isArray(tool.content)?tool.content:[];
  const diffs=Array.isArray(tool.diffs)&&tool.diffs.length?tool.diffs:content.filter(block=>block?.type==='diff');
  const terminals=Array.isArray(tool.terminals)&&tool.terminals.length?tool.terminals:content.filter(block=>block?.type==='terminal');
  const locations=Array.isArray(tool.locations)?tool.locations:[];
  const raw=tool.rawInput;
  const command=typeof raw==='string'?raw:raw&&typeof raw==='object'&&!raw.truncated?String(raw.command||raw.cmd||raw.command_line||raw.commandLine||''):'';
  const contentOutput=acpContentText(content.filter(block=>block?.type!=='diff'&&block?.type!=='terminal'));
  const suppliedOutput=typeof tool.output==='string'?tool.output:tool.output!=null?fullPayloadText(tool.output):'';
  const output=suppliedOutput||contentOutput;
  const textOutputs=[...new Set([suppliedOutput,contentOutput].filter(Boolean))];
  const name=String(tool.name||tool.title||''),kind=String(tool.kind||'').toLowerCase();
  // Retain a primary kind for compatibility; toolBodyParts exposes every supplied
  // result section, rather than silently hiding mixed output behind diagnostics.
  const body=diffs.length?'diff':terminals.length||kind==='execute'?'terminal':kind==='read'?'read':'generic';
  const terminal=terminals[0]||{};
  const explicitExit=terminal.exitStatus??tool.exitStatus??terminal.exitCode??tool.exitCode;
  const exit=explicitExit===undefined?{exitCode:undefined,signal:undefined,running:['pending','in_progress'].includes(tool.status)}:acpNormalizeExit(explicitExit);
  const terminalFailure=terminals.find(value=>{
    const status=value.exitStatus??value.exitCode;
    if(status==null)return false;
    const result=acpNormalizeExit(status);return result.exitCode!==undefined&&result.exitCode!==0||!!result.signal;
  });
  const failed=tool.status==='failed'||(exit.exitCode!==undefined&&exit.exitCode!==0)||!!exit.signal||!!terminalFailure;
  const running=!failed&&['pending','in_progress'].includes(tool.status);
  const resolvedCommand=String(terminal.command||command);
  const resolvedOutput=typeof terminal.output==='string'?terminal.output:output;
  const suppliedTitle=String(tool.title||tool.name||'');
  const description=typeof tool.description==='string'?tool.description:
    raw&&!raw.truncated&&typeof raw.description==='string'?raw.description:'';
  // Use an actual supplied description, never a guessed interpretation of shell text.
  const title=description&&(!suppliedTitle.trim()||suppliedTitle.trim()===resolvedCommand.trim())?description:suppliedTitle;
  const preview=firstLine(description&&firstLine(description)!==firstLine(title)?description:
    locations[0]?.path||resolvedCommand||tool.summary||resolvedOutput);
  // ACP adapters often use the command/path as the title too. Show it only once.
  const summary=preview===firstLine(title)?'':preview;
  return {title,summary,body,diffs,terminals,locations,command:resolvedCommand,cwd:String(terminal.cwd||tool.cwd||''),
    output:resolvedOutput,textOutput:output,textOutputs,kind,exit,failed,running,name,
    error:firstLine(tool.errorMessage||tool.error||terminalFailure?.output|| (failed?resolvedOutput:''))};
}

export function toolBodyParts(model) {
  const parts=[];
  if(model.diffs.length)parts.push({kind:'diff',diffs:model.diffs});
  if(model.terminals.length){
    model.terminals.forEach((terminal,index)=>{
      const supplied=terminal.exitStatus??terminal.exitCode;
      const exit=supplied==null?(index===0?model.exit:{exitCode:undefined,signal:undefined,running:model.running}):acpNormalizeExit(supplied);
      parts.push({kind:'terminal',command:String(terminal.command||(index===0?model.command:'')),cwd:String(terminal.cwd||(index===0?model.cwd:'')),
        output:typeof terminal.output==='string'?terminal.output:index===0?model.textOutput:'',...exit});
    });
  } else if(model.body==='terminal'||model.kind==='execute')parts.push({kind:'terminal',command:model.command,cwd:model.cwd,output:model.output,...model.exit});
  for(const text of model.textOutputs||[model.textOutput]){
    if(text&&!parts.some(part=>part.kind==='terminal'&&part.output===text))parts.push({kind:model.body==='read'?'read':'text',text,label:model.locations[0]?.path||model.name});
  }
  return parts;
}
