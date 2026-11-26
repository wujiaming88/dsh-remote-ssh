// COPY/ADAPTATION: DSH 0.2.2-rc.5 ui-chat TurnProcessNodeView.tsx:19–59.
// The remote adapter owns authoritative turn status/time and process visibility.
// No private turn stores, inferred completion, minimum-duration clamp or history live announcements.
import {h,NativeIcon} from './shared.js';

import {turnSummaryText} from './turn-summary-model.js';

export function NativeTurnSummary({summary,t,open,collapsible,controls,onToggle,failedCount=0}) {
  const {label,parts}=turnSummaryText(summary,t);
  const warning=failedCount?` · ${t('flow.hadFailures')} ${failedCount}`:'';
  const title=label+parts.map(part=>part.text).join('')+warning;
  return h(collapsible?'button':'div',{
    className:'rssh-turn-summary',type:collapsible?'button':undefined,
    'data-open':open?'':undefined,'data-status':summary.status,
    'aria-expanded':collapsible?open:undefined,'aria-controls':collapsible?controls:undefined,
    'aria-label':collapsible?`${title} · ${t('flow.turnProcessToggle')}`:undefined,
    title:summary.seconds!==null?`${title} · ${t('flow.elapsedHint')}`:title,
    onClick:collapsible?onToggle:undefined,
  },h('span',{className:'rssh-turn-summary-label'},label,
    parts.length?h('time',{dateTime:`PT${summary.seconds}S`},parts.map((part,index)=>h('span',{key:index,className:part.numeric?'rssh-turn-summary-number':undefined},part.text))):null,
    warning?h('span',{className:'rssh-turn-summary-warning'},warning):null),
    collapsible?h('span',{className:'rssh-turn-summary-toggle','aria-hidden':true},
      h(NativeIcon,{name:'chevron-down',size:14,className:'rssh-turn-summary-chevron'})):null);
}
