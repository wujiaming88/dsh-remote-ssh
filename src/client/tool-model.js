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
  const output=typeof tool.output==='string'?tool.output:tool.output!=null?fullPayloadText(tool.output):acpContentText(content.filter(block=>block?.type!=='diff'&&block?.type!=='terminal'));
  const name=String(tool.name||tool.title||''),kind=String(tool.kind||'').toLowerCase();
  // Structured results win; exactly one main result renderer is selected.
  const body=diffs.length?'diff':terminals.length||kind==='execute'?'terminal':kind==='read'?'read':'generic';
  const terminal=terminals[0]||{};
  const explicitExit=terminal.exitStatus??tool.exitStatus??terminal.exitCode??tool.exitCode;
  const exit=explicitExit===undefined?{exitCode:undefined,signal:undefined,running:['pending','in_progress'].includes(tool.status)}:acpNormalizeExit(explicitExit);
  const failed=tool.status==='failed'||(exit.exitCode!==undefined&&exit.exitCode!==0)||!!exit.signal;
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
    output:resolvedOutput,exit,failed,running,name,
    error:firstLine(tool.errorMessage||tool.error|| (failed?resolvedOutput:''))};
}
