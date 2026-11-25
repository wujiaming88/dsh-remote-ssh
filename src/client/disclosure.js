import React from 'react';
import {h} from './shared.js';

export function FlowIcon({kind='tool'}) {
  const paths={tool:'m5 4-3 4 3 4m6-8 3 4-3 4M9 2 7 14',agent:'M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M1 14v-2a5 5 0 0 1 10 0v2m1-11a3 3 0 0 1 0 6m1 2a4 4 0 0 1 2 3',state:'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2m-3 6 2 2 4-4',plan:'m2 4 1 1 2-2m2 1h7M2 8h3m2 0h7M2 12h3m2 0h7',message:'M2 2h12v9H6l-4 3V2',native:'M5 2H2v12h3m6-12h3v12h-3M7 5 5 8l2 3m2-6 2 3-2 3'};
  return h('svg',{className:'rssh-flow-icon',width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.3,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:paths[kind]||paths.tool}));
}

// The affordance stays visible without hover; the category icon is secondary.
export function DisclosureLeading({icon}) {
  return h('span',{className:'rssh-disclosure-leading','aria-hidden':true},
    h('span',{className:'rssh-disclosure-icon'},icon),
    h('svg',{className:'rssh-disclosure-chevron',width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5},
      h('path',{d:'m4 6 4 4 4-4'})));
}

// Synchronous and local: the viewport captures the trigger before React changes layout.
export function requestReadingIntent(anchor,afterLayout=false) {
  if(anchor)anchor.dispatchEvent(new CustomEvent('rssh:reading-intent',{bubbles:true,detail:{anchor,afterLayout}}));
}

// Numeric policy only. A flat/open -> bounded/open transition is not an opening;
// keep that reading position instead of sending the user to the new scrollport tail.
export function boundedProcessScroll(metrics,{open,wasOpen,flat,scrollBody,wasBounded,running,following}) {
  if(!open||flat||!scrollBody)return {top:null,following:false};
  const {scrollTop,scrollHeight,clientHeight}=metrics;
  if(![scrollTop,scrollHeight,clientHeight].every(Number.isFinite))return {top:null,following:false};
  const tail=Math.max(0,scrollHeight-clientHeight);
  if(!wasOpen)return {top:running?tail:0,following:!!running};
  if(!wasBounded)return {top:null,following:false};
  return {top:running&&following?tail:null,following:!!running&&!!following};
}
export function processScrollFollowsTail({scrollTop,scrollHeight,clientHeight},threshold=32) {
  return [scrollTop,scrollHeight,clientHeight].every(Number.isFinite)&&Math.max(0,scrollHeight-clientHeight)-Math.max(0,scrollTop)<=threshold;
}

// A layout/clamping scroll is never permission to restart following. Upward
// intent wins even while still inside the tail threshold.
export function processScrollUpdate(metrics,{following,intent=0,previousTop,pointer=false}) {
  const delta=metrics.scrollTop-previousTop;
  if(!Number.isFinite(delta)||intent<0||delta<0)return false;
  const downward=intent>0||pointer&&delta>0;
  return (following||downward)&&processScrollFollowsTail(metrics);
}

// Initially lazy, then keep the body mounted even when hidden. Stable item keys and
// the owning group's stable container preserve child expansion and form state.
export function ownedDisclosure({title,summary,icon,running=false,failed=false,status,children,defaultOpen=false,open:controlledOpen,onOpenChange,onRead,className='',secondary=false,scrollBody=false,flat=false,scrollRunning=running}) {
  const [localOpen,setOpen]=React.useState(defaultOpen);
  const open=controlledOpen===undefined?localOpen:controlledOpen;
  const [mounted,setMounted]=React.useState(open);
  const id=React.useId(),trigger=React.useRef(null),bodyRef=React.useRef(null);
  const bounded=scrollBody&&!flat,following=React.useRef(false),expectedScroll=React.useRef(null);
  const previous=React.useRef({open:false,bounded:false}),lastTop=React.useRef(0);
  const scrollIntent=React.useRef(0),pointerScroll=React.useRef(false),touchY=React.useRef(null);
  function writeBodyScroll(top) {
    const body=bodyRef.current;
    if(body&&top!==null&&Math.abs(body.scrollTop-top)>1){expectedScroll.current=top;body.scrollTop=top;lastTop.current=body.scrollTop;}
  }
  React.useLayoutEffect(()=>{
    const before=previous.current;previous.current={open,bounded};
    const body=bodyRef.current;if(!body)return;
    if(!before.open||!before.bounded){lastTop.current=body.scrollTop;scrollIntent.current=0;pointerScroll.current=false;touchY.current=null;}
    const result=boundedProcessScroll(body,{open,wasOpen:before.open,flat,scrollBody,wasBounded:before.bounded,running:scrollRunning,following:following.current});
    following.current=result.following;writeBodyScroll(result.top);
    if(!open||!bounded)expectedScroll.current=null;
  },[open,flat,scrollBody,scrollRunning,children]);
  React.useLayoutEffect(()=>{
    const body=bodyRef.current;
    if(!body||!open||!bounded||typeof ResizeObserver==='undefined')return;
    let live=true;
    const observer=new ResizeObserver(()=>{
      if(!live||bodyRef.current!==body)return;
      const result=boundedProcessScroll(body,{open:true,wasOpen:true,flat:false,scrollBody:true,wasBounded:true,running:scrollRunning,following:following.current});
      writeBodyScroll(result.top);
    });
    observer.observe(body);
    return ()=>{live=false;observer.disconnect();};
  },[open,bounded,scrollRunning]);
  React.useLayoutEffect(()=>{if(open)setMounted(true);requestReadingIntent(trigger.current,true);},[open,flat]);
  React.useLayoutEffect(()=>{
    const body=bodyRef.current;if(!body||!open||!bounded)return;
    const stop=()=>{scrollIntent.current=0;pointerScroll.current=false;};
    const pointerEnd=()=>{pointerScroll.current=false;};
    body.addEventListener('scrollend',stop);
    body.ownerDocument.addEventListener('pointerup',pointerEnd,true);
    body.ownerDocument.addEventListener('pointercancel',pointerEnd,true);
    return ()=>{stop();body.removeEventListener('scrollend',stop);body.ownerDocument.removeEventListener('pointerup',pointerEnd,true);body.ownerDocument.removeEventListener('pointercancel',pointerEnd,true);};
  },[open,bounded]);
  function read(event) { if(event.isTrusted){following.current=false;scrollIntent.current=0;pointerScroll.current=false;if(onRead&&bounded)requestReadingIntent(bodyRef.current);onRead?.(event);} }
  function bodyScroll(event) {
    if(event.target!==event.currentTarget)return;
    const body=event.currentTarget,expected=expectedScroll.current,before=lastTop.current;
    expectedScroll.current=null;lastTop.current=body.scrollTop;
    if(expected!==null&&Math.abs(body.scrollTop-expected)<=1)return;
    following.current=processScrollUpdate(body,{following:following.current,intent:scrollIntent.current,previousTop:before,pointer:pointerScroll.current});
  }
  function acceptsGesture(event,direction) {
    if(!bounded||!event.isTrusted)return false;
    // Respect a nested viewport that consumes this gesture; horizontal/code
    // scrolling is not evidence that the process viewport should resume.
    for(let node=event.target;node&&node!==event.currentTarget;node=node.parentElement){
      if(node.nodeType!==1||node.scrollHeight<=node.clientHeight+1)continue;
      const style=globalThis.getComputedStyle(node);
      if(!['auto','scroll'].includes(style.overflowY))continue;
      if(['contain','none'].includes(style.overscrollBehaviorY)||(direction<0?node.scrollTop>0:node.scrollHeight-node.clientHeight-node.scrollTop>1))return false;
    }
    return true;
  }
  function setScrollIntent(event,direction,alreadyRead=false) {
    if(!direction||!acceptsGesture(event,direction))return;
    if(!alreadyRead)read(event);scrollIntent.current=direction;
    // A genuine downward gesture at the tail may not produce a scroll event.
    if(direction>0&&processScrollFollowsTail(event.currentTarget))following.current=true;
  }
  function bodyWheel(event) {
    if(!event.ctrlKey&&!event.shiftKey&&event.deltaY){read(event);setScrollIntent(event,Math.sign(event.deltaY),true);}
  }
  function bodyKeyDown(event) {
    read(event);
    if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)||event.target?.isContentEditable)return;
    const direction=['ArrowUp','PageUp','Home'].includes(event.key)?-1:['ArrowDown','PageDown','End'].includes(event.key)?1:event.key===' '?(event.shiftKey?-1:1):0;
    setScrollIntent(event,direction,true);
  }
  function bodyPointerDown(event) {
    if(event.button!==0)return;
    read(event);
    const x=event.nativeEvent?.offsetX??event.offsetX,body=event.currentTarget;
    pointerScroll.current=bounded&&event.isTrusted&&event.pointerType!=='touch'&&event.target===body&&Number.isFinite(x)&&(x>=body.clientWidth||x<body.clientLeft);
  }
  function bodyTouchStart(event) {
    read(event);touchY.current=event.isTrusted&&event.touches.length===1?event.touches[0].clientY:null;
  }
  function bodyTouchMove(event) {
    const before=touchY.current,next=event.touches.length===1?event.touches[0].clientY:null;
    touchY.current=next;
    if(before!==null&&next!==null&&before!==next){read(event);setScrollIntent(event,Math.sign(before-next),true);}
  }
  function toggle(event) {
    requestReadingIntent(event.currentTarget);
    const next=!open;
    if(controlledOpen===undefined)setOpen(next);
    if(onOpenChange)onOpenChange(next);
  }
  return h('section',{className:'rssh-flow '+className,'data-running':running?'':undefined,'data-failed':failed?'':undefined,'data-open':open?'':undefined,'data-summary':summary?'':undefined,'data-secondary':secondary?'':undefined,'data-flat':flat?'':undefined,'data-scroll-body':bounded?'':undefined,
    onKeyDown:event=>{if(open&&event.key==='Tab')read(event);}},
    h('button',{ref:trigger,hidden:flat,type:'button',className:'rssh-flow-toggle','aria-expanded':open,'aria-controls':id,onClick:toggle},
      h(DisclosureLeading,{icon:icon||h(FlowIcon)}),h('span',{className:'rssh-flow-title',title},title),
      summary?h(React.Fragment,null,h('span',{className:'rssh-flow-separator','aria-hidden':true}),h('span',{className:'rssh-flow-summary',title:summary},summary)):null,
      status?h('span',{className:failed?'rssh-flow-failure':'rssh-flow-status','data-active':running?'':undefined},status):running?h('span',{className:'rssh-flow-active-mark','aria-hidden':true}):null),
    h('div',{ref:bodyRef,id,hidden:!open,className:'rssh-flow-body',role:bounded?'region':undefined,tabIndex:bounded?0:undefined,'aria-label':bounded?title:undefined,
      onScroll:bounded?bodyScroll:undefined,onWheel:bodyWheel,
      onTouchStart:bodyTouchStart,onTouchMove:bodyTouchMove,
      onTouchEnd:()=>{touchY.current=null;},onTouchCancel:event=>{touchY.current=null;read(event);},
      onPointerDown:bodyPointerDown,onClick:read,onKeyDown:bodyKeyDown},
      open||mounted?(typeof children==='function'?children():children):null));
}
