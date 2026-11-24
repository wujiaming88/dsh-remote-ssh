import React from 'react';
import {h,ui,useT} from './shared.js';
import {usageDetails,formatTokens,formatPercentage,formatCost,sessionStats,formatElapsed} from './usage-model.js';

export const messages = {
  zh: {
    'usage.title':'上下文与用量','usage.context':'上下文','usage.usage':'用量','usage.cost':'累计费用',
    'usage.costNote':'由远端 Agent 报告，不代表最终账单。',
    'usage.model':'模型','usage.reasoning':'思考级别','usage.mode':'权限模式','usage.unreported':'尚未报告',
    'stats.title':'会话统计','stats.turns':'回合','stats.elapsed':'已用时','stats.running':'进行中',
  },
  en: {
    'usage.title':'Context & usage','usage.context':'Context','usage.usage':'Usage','usage.cost':'Cumulative cost',
    'usage.costNote':'Reported by the remote Agent; not a final invoice.',
    'usage.model':'Model','usage.reasoning':'Reasoning','usage.mode':'Permission mode','usage.unreported':'Not reported',
    'stats.title':'Session statistics','stats.turns':'turns','stats.elapsed':'Elapsed','stats.running':'Running',
  },
};

// Native ring geometry: 14px viewBox, 2px stroke.
const RADIUS = 5.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function UsageMeter({state}) {
  const t=useT(), details=usageDetails(state);
  const [open,setOpen]=React.useState(false);
  // Native ContextMeter renders nothing until both pressure and capacity exist.
  if (details.percent === null) return null;
  const reading=formatPercentage(details.percent);
  const row=(key,value)=>h('div',{className:'rssh-meter-row',key},h('dt',null,t(key)),h('dd',null,value||t('usage.unreported')));
  return h(ui.Menu, {open,onClose:()=>setOpen(false),autoFocus:false,role:'dialog',align:'end',
    className:'rssh-meter-panel','aria-label':t('usage.title'),
    anchor:h('button',{type:'button',className:'rssh-meter-trigger','data-tone':details.tone,
      'aria-label':`${t('usage.context')} ${reading}`,
      onClick:()=>setOpen(value=>!value)},
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
        row('usage.cost',details.cost?formatCost(details.cost):null),
        row('usage.model',details.model),row('usage.reasoning',details.reasoning),row('usage.mode',details.mode)),
      h('p',{className:'rssh-meter-note'},t('usage.costNote'))));
}

function StatsIcon() {
  return h('svg',{className:'rssh-stats-icon',width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.4,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},
    h('ellipse',{cx:8,cy:5,r:5.5}),h('path',{d:'M2.5 5v6c0 2.5 2.5 4 5.5 4s5.5-1.5 5.5-4V5'}),h('path',{d:'M2.5 8c0 2.5 2.5 4 5.5 4s5.5-1.5 5.5-4'}));
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
  const reading=elapsedMs==null?turns:`${turns} · ${elapsed}`;
  const row=(key,value)=>h('div',{className:'rssh-meter-row',key},h('dt',null,t(key)),h('dd',null,value||t('usage.unreported')));
  return h(ui.Menu,{open,onClose:()=>setOpen(false),autoFocus:false,role:'dialog',align:'end',
    className:'rssh-meter-panel','aria-label':t('stats.title'),
    anchor:h('button',{type:'button',className:'rssh-meter-trigger','aria-label':`${t('stats.title')}: ${reading}`,
      onClick:()=>setOpen(value=>!value)},
      h(StatsIcon),h('span',{className:'rssh-meter-reading'},reading))},
    h('section',{className:'rssh-meter-card'},
      h('div',{className:'rssh-meter-header'},
        h('span',{className:'rssh-meter-headline'},t('stats.title')),
        stats.running>0?h('span',{className:'rssh-meter-percent'},t('stats.running')):null),
      h('dl',{className:'rssh-meter-rows'},
        row('stats.turns',turns),row('stats.elapsed',elapsed))));
}
