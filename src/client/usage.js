import React from 'react';
import {h,ui,useT,NativeIcon} from './shared.js';
import {usageDetails,formatTokens,formatPercentage,sessionStats,formatElapsed,usageSummary} from './usage-model.js';

export const messages = {
  zh: {
    'usage.title':'上下文与用量','usage.context':'上下文','usage.usage':'用量',
    'usage.model':'模型','usage.reasoning':'思考级别','usage.mode':'权限模式','usage.unreported':'尚未报告',
    'stats.title':'会话统计','stats.turns':'轮','stats.elapsed':'会话时长','stats.running':'进行中',
    'usage.contextUsed':'当前上下文 token','usage.capacity':'上下文容量',
  },
  en: {
    'usage.title':'Context & usage','usage.context':'Context','usage.usage':'Usage',
    'usage.model':'Model','usage.reasoning':'Reasoning','usage.mode':'Permission mode','usage.unreported':'Not reported',
    'stats.title':'Session statistics','stats.turns':'turns','stats.elapsed':'Session age','stats.running':'Running',
    'usage.contextUsed':'Current context tokens','usage.capacity':'Context capacity',
  },
};

export function dismissUsagePopover(event, open, close) {
  if (!open || event.key !== 'Escape') return;
  event.preventDefault(); event.stopPropagation(); close();
}

// Native ring geometry: 14px viewBox, 2px stroke.
const RADIUS = 5.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function UsageMeter({state}) {
  const t=useT(), details=usageDetails(state);
  const [open,setOpen]=React.useState(false);
  React.useEffect(()=>{if(details.percent===null)setOpen(false);},[details.percent]);
  // Native ContextMeter renders nothing until both pressure and capacity exist.
  if (details.percent === null) return null;
  const reading=formatPercentage(details.percent);
  const row=(key,value)=>h('div',{className:'rssh-meter-row',key},h('dt',null,t(key)),h('dd',null,value||t('usage.unreported')));
  return h(ui.Menu, {open,onClose:()=>setOpen(false),autoFocus:false,role:'dialog',align:'end',
    className:'rssh-meter-panel','aria-label':t('usage.title'),
    anchor:h('button',{type:'button',className:'rssh-meter-trigger','data-tone':details.tone,
      'aria-label':`${t('usage.context')} ${reading}`,
      onKeyDown:event=>dismissUsagePopover(event,open,()=>setOpen(false)),onClick:()=>setOpen(value=>!value)},
      h('svg',{viewBox:'0 0 14 14',width:14,height:14,'aria-hidden':true},
        h('circle',{className:'rssh-meter-track',cx:7,cy:7,r:RADIUS}),
        h('circle',{className:'rssh-meter-fill',cx:7,cy:7,r:RADIUS,
          strokeDasharray:`${CIRCUMFERENCE * details.barPercent / 100} ${CIRCUMFERENCE}`,
          transform:'rotate(-90 7 7)'})),
      h('span',{className:'rssh-meter-reading'},reading))},
    h('section',{className:'rssh-meter-card','data-tone':details.tone},
      h('div',{className:'rssh-meter-header'},
        h('span',{className:'rssh-meter-headline'},t('usage.context')),
        h('span',{className:'rssh-meter-percent'},reading),
        h('span',{className:'rssh-meter-figures'},`~${formatTokens(details.used)} / ${formatTokens(details.capacity)}`)),
      h('div',{className:'rssh-meter-bar'},h('div',{className:'rssh-meter-segment',style:{width:`${details.barPercent}%`}})),
      h('dl',{className:'rssh-meter-rows'},
        row('usage.model',details.model),row('usage.reasoning',details.reasoning),row('usage.mode',details.mode))));
}

function StatsIcon(){return h(NativeIcon,{name:'stats',size:14,className:'rssh-stats-icon'});}
function UsageIcon(){return h(NativeIcon,{name:'usage',size:14});}
export function UsagePill({state}) {
  const t=useT(),details=usageDetails(state),summary=usageSummary(details);
  const [open,setOpen]=React.useState(false);
  const available=summary!==null;
  React.useEffect(()=>{if(!available)setOpen(false);},[available]);
  if(!summary)return null;
  const reading=`${t('usage.context')} ${summary.value}`;
  const row=(key,value)=>h('div',{className:'rssh-meter-row',key},h('dt',null,t(key)),h('dd',null,value));
  return h(ui.Menu,{open,onClose:()=>setOpen(false),autoFocus:false,role:'dialog',align:'end',className:'rssh-meter-panel','aria-label':t('usage.usage'),
    anchor:h('button',{type:'button',className:'rssh-meter-trigger rssh-usage-trigger',title:reading,'aria-label':`${t('usage.usage')}: ${reading}`,onKeyDown:event=>dismissUsagePopover(event,open,()=>setOpen(false)),onClick:()=>setOpen(value=>!value)},
      h(UsageIcon),h('span',{className:'rssh-meter-reading'},reading))},
    h('section',{className:'rssh-meter-card'},
      h('div',{className:'rssh-meter-header'},h('span',{className:'rssh-meter-headline'},t('usage.usage'))),
      h('dl',{className:'rssh-meter-rows'},
        row('usage.contextUsed',details.used===null?t('usage.unreported'):formatTokens(details.used)),
        row('usage.capacity',details.capacity===null?t('usage.unreported'):formatTokens(details.capacity)))));
}

export function SessionStatsPill({state}) {
  const t=useT();
  const [now,setNow]=React.useState(()=>Date.now());
  React.useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(id);},[]);
  const stats=sessionStats(state);
  const [open,setOpen]=React.useState(false);
  if (stats.completed===0 && stats.running===0) return null;
  const elapsedMs=stats.startedAt==null?null:Math.max(0,now-stats.startedAt);
  const turns=`${stats.completed} ${t('stats.turns')}`;
  const elapsed=formatElapsed(elapsedMs);
  const reading=stats.running>0?`${turns} · ${t('stats.running')}`:turns;
  const row=(key,value)=>h('div',{className:'rssh-meter-row',key},h('dt',null,t(key)),h('dd',null,value||t('usage.unreported')));
  return h(ui.Menu,{open,onClose:()=>setOpen(false),autoFocus:false,role:'dialog',align:'end',
    className:'rssh-meter-panel','aria-label':t('stats.title'),
    anchor:h('button',{type:'button',className:'rssh-meter-trigger rssh-stats-trigger',title:`${t('stats.title')}: ${reading}`,'aria-label':`${t('stats.title')}: ${reading}`,
      onKeyDown:event=>dismissUsagePopover(event,open,()=>setOpen(false)),onClick:()=>setOpen(value=>!value)},
      h(StatsIcon),h('span',{className:'rssh-meter-reading'},reading))},
    h('section',{className:'rssh-meter-card'},
      h('div',{className:'rssh-meter-header'},
        h('span',{className:'rssh-meter-headline'},t('stats.title')),
        stats.running>0?h('span',{className:'rssh-meter-percent'},t('stats.running')):null),
      h('dl',{className:'rssh-meter-rows'},
        row('stats.turns',turns),row('stats.elapsed',elapsed))));
}
