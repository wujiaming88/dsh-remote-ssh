import React from 'react';
import {followsTranscriptTail,anchoredScrollTop,mayRestoreTranscriptAnchor} from './transcript-model.js';
import {HistoryPager,scrollBoxConsumesUpward} from './history-pager.js';
import {historyAnchorAdjustment} from './history-anchor.js';

// Pure restore decision: opaque viewport/content identities and measured numbers,
// not DOM nodes or React state. null means leave the reader's position untouched.
export function readingAnchorScrollTop(saved,current) {
  if(!saved||!current||current.following||!current.visible||
    !mayRestoreTranscriptAnchor({startedAtGeneration:saved.interaction,currentGeneration:current.interaction,
      sameViewport:saved.viewport===current.viewport&&saved.content===current.content&&saved.lifetime===current.lifetime,live:current.live}))return null;
  if(![saved.offset,current.offset,current.scrollTop].every(Number.isFinite))return null;
  return anchoredScrollTop({currentTop:current.scrollTop,previousOffset:saved.offset,nextOffset:current.offset});
}

// One owned scrollport. History loads on reader intent near its top, never on a timer.
export function useTranscriptScroll(identity,items,ready=true,history) {
  const viewportRef=React.useRef(null),contentRef=React.useRef(null);
  const follow=React.useRef(true),frame=React.useRef(null),live=React.useRef(false);
  const interaction=React.useRef(0),expectedScroll=React.useRef(null),pendingPrepend=React.useRef(null);
  const scrollIntent=React.useRef(false),touchPoint=React.useRef(null);
  const lastScrollTop=React.useRef(0),pendingRestore=React.useRef(null),lifetime=React.useRef(0);
  const readingAnchor=React.useRef(null);
  const historyRef=React.useRef(history);historyRef.current=history;
  const [following,setFollowing]=React.useState(true),[prepending,setPrepending]=React.useState(false);
  const [showLatest,setShowLatest]=React.useState(false),[historyStatus,setHistoryStatus]=React.useState({loading:false,error:null});
  const pagerRef=React.useRef(null);
  if(!pagerRef.current)pagerRef.current=new HistoryPager({
    getPage:()=>historyRef.current?.getPage(),
    load:page=>prepend((beforeApply,canApply)=>historyRef.current.load(page,beforeApply,canApply)),
    changed:state=>{if(live.current){setHistoryStatus(state);schedule();}},
  });
  const setFollow=value=>{follow.current=value;setFollowing(value);};
  const requestHistory=options=>pagerRef.current.check(viewportRef.current,options);
  const measureTail=viewport=>{
    const atTail=followsTranscriptTail(viewport);
    setShowLatest(!atTail);
    return atTail;
  };
  const writeScroll=(viewport,top)=>{
    expectedScroll.current=Math.max(0,Math.min(top,Math.max(0,viewport.scrollHeight-viewport.clientHeight)));
    viewport.scrollTop=expectedScroll.current;lastScrollTop.current=viewport.scrollTop;
    measureTail(viewport);
  };
  function pauseReading() {
    interaction.current++;scrollIntent.current=false;pagerRef.current.pause();setFollow(false);
  }
  function captureReading(anchor) {
    const viewport=viewportRef.current,content=contentRef.current;
    if(!live.current||!viewport||!content||anchor?.nodeType!==1||!content.contains(anchor))return;
    pauseReading();
    readingAnchor.current={anchor,viewport,content,lifetime:lifetime.current,interaction:interaction.current,
      offset:anchor.getBoundingClientRect().top-viewport.getBoundingClientRect().top};
    schedule();
  }
  function restoreReadingAnchor() {
    const saved=readingAnchor.current;if(!saved)return;
    readingAnchor.current=null;
    if(!mayRestoreTranscriptAnchor({startedAtGeneration:saved.interaction,currentGeneration:interaction.current,
      sameViewport:viewportRef.current===saved.viewport&&contentRef.current===saved.content&&lifetime.current===saved.lifetime,live:live.current})||follow.current)return;
    if(!saved.anchor.isConnected||!saved.content.contains(saved.anchor)||!saved.anchor.getClientRects().length)return;
    const offset=saved.anchor.getBoundingClientRect().top-saved.viewport.getBoundingClientRect().top;
    const top=readingAnchorScrollTop(saved,{viewport:viewportRef.current,content:contentRef.current,lifetime:lifetime.current,
      interaction:interaction.current,live:live.current,following:follow.current,visible:true,offset,scrollTop:saved.viewport.scrollTop});
    if(top!==null)writeScroll(saved.viewport,top);
  }
  function onReadingIntent(event) {
    if(event.detail?.afterLayout) {
      if(readingAnchor.current?.anchor===event.detail.anchor)restoreReadingAnchor();
    } else captureReading(event.detail?.anchor);
  }
  function onReadingClick(event) {
    // Capture keyboard activation and native <summary> before their default action.
    const target=event.target?.closest?.('button,summary,[role="button"]');
    if(event.isTrusted&&target)captureReading(target);
  }
  const schedule=()=>{
    if(!live.current||frame.current!==null)return;
    frame.current=requestAnimationFrame(()=>{
      frame.current=null;
      const viewport=viewportRef.current;
      if(!live.current||!viewport)return;
      if(follow.current)writeScroll(viewport,viewport.scrollHeight);
      else {restoreReadingAnchor();measureTail(viewport);requestHistory();}
    });
  };
  function measurements(viewport,content) {
    const edge=viewport.getBoundingClientRect().top;
    return [...content.querySelectorAll('[data-transcript-anchor]')].filter(node=>node.getClientRects().length).map(node=>{
      const bounds=node.getBoundingClientRect();
      return {key:node.dataset.transcriptAnchor,top:bounds.top-edge,bottom:bounds.bottom-edge,
        members:JSON.parse(node.dataset.historyMembers||'[]'),ranges:JSON.parse(node.dataset.historyRanges||'[]'),versions:JSON.parse(node.dataset.historyVersions||'{}')};
    });
  }
  function restorePrepend() {
    const saved=pendingRestore.current;if(!saved)return;
    pendingRestore.current=null;
    if(!mayRestoreTranscriptAnchor({startedAtGeneration:saved.interaction,currentGeneration:interaction.current,
      sameViewport:viewportRef.current===saved.viewport&&contentRef.current===saved.content&&lifetime.current===saved.lifetime,live:live.current})||follow.current)return;
    const adjustment=historyAnchorAdjustment(saved.anchors,measurements(saved.viewport,saved.content));
    if(adjustment)writeScroll(saved.viewport,anchoredScrollTop({currentTop:saved.viewport.scrollTop,...adjustment}));
  }
  React.useLayoutEffect(()=>{
    lifetime.current++;live.current=true;setFollow(true);setShowLatest(false);setPrepending(false);
    interaction.current++;expectedScroll.current=null;pendingRestore.current=null;readingAnchor.current=null;scrollIntent.current=false;touchPoint.current=null;
    const viewport=viewportRef.current,content=contentRef.current;
    lastScrollTop.current=viewport?.scrollTop||0;
    pagerRef.current.activate(ready,identity);
    const observer=viewport&&content?new ResizeObserver(schedule):null;
    if(observer){observer.observe(viewport);observer.observe(content);}
    viewport?.addEventListener('rssh:reading-intent',onReadingIntent);
    viewport?.addEventListener('click',onReadingClick,true);
    schedule();
    return()=>{
      live.current=false;lifetime.current++;pendingRestore.current=null;readingAnchor.current=null;
      viewport?.removeEventListener('rssh:reading-intent',onReadingIntent);
      viewport?.removeEventListener('click',onReadingClick,true);
      pagerRef.current.activate(false,identity);observer?.disconnect();
      if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;
    };
  },[identity,ready]);
  // Compensate at the commit that prepends, before a later live tail update can resize it.
  React.useLayoutEffect(()=>{restorePrepend();schedule();},[items]);
  const isNestedScroll=(event,upwards=null)=>{
    if(!event.currentTarget||!event.target)return false;
    let node=event.target.nodeType===1?event.target:event.target.parentElement;
    for(;node&&node!==event.currentTarget;node=node.parentElement){
      if(node.matches('input,textarea,select,[contenteditable="true"]'))return true;
      const style=getComputedStyle(node);
      if(scrollBoxConsumesUpward({scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,scrollTop:upwards===null?1:upwards?node.scrollTop:node.scrollHeight-node.clientHeight-node.scrollTop,
        overflowY:style.overflowY,overscrollBehaviorY:style.overscrollBehaviorY}))return true;
    }
    return false;
  };
  const onScroll=event=>{
    if(event&&event.target!==event.currentTarget)return;
    const viewport=viewportRef.current;if(!viewport)return;
    // Layout/scroll anchoring caused by expansion is not a new reader gesture.
    if(readingAnchor.current?.interaction===interaction.current) {measureTail(viewport);return;}
    const user=expectedScroll.current===null||Math.abs(viewport.scrollTop-expectedScroll.current)>1;
    const upwards=viewport.scrollTop<lastScrollTop.current;
    const downwards=viewport.scrollTop>lastScrollTop.current;
    expectedScroll.current=null;lastScrollTop.current=viewport.scrollTop;
    if(user){
      interaction.current++;setFollow(measureTail(viewport));
      if(upwards&&scrollIntent.current)requestHistory({gesture:true});
      else if(downwards){scrollIntent.current=false;pagerRef.current.pause();}
    } else measureTail(viewport);
  };
  const onWheel=event=>{
    if(!event.deltaY||event.ctrlKey||isNestedScroll(event,event.deltaY<0))return;
    interaction.current++;
    if(event.deltaY<0){scrollIntent.current=true;setFollow(false);requestHistory({gesture:true});}
    else if(event.deltaY>0){scrollIntent.current=false;pagerRef.current.pause();}
  };
  const onKeyDown=event=>{
    if(event.defaultPrevented||event.altKey||isNestedScroll(event,['ArrowUp','PageUp','Home'].includes(event.key)))return;
    if(['ArrowUp','PageUp','Home'].includes(event.key)){
      interaction.current++;scrollIntent.current=true;setFollow(false);requestHistory({gesture:true});
    } else if(['ArrowDown','PageDown','End'].includes(event.key)){interaction.current++;readingAnchor.current=null;scrollIntent.current=false;pagerRef.current.pause();}
  };
  const onPointerDown=event=>{
    if(event.button!==0||isNestedScroll(event))return;
    const control=event.target.closest('button,summary,[role="button"]');
    if(control){captureReading(control);return;}
    if(event.target.closest('a,input,select,textarea'))return;
    interaction.current++;readingAnchor.current=null;scrollIntent.current=event.target===event.currentTarget;setFollow(false);pagerRef.current.pause();
  };
  const onTouchStart=event=>{
    const touch=event.touches.length===1?event.touches[0]:null;
    touchPoint.current=touch?{x:touch.clientX,y:touch.clientY}:null;
    if(!touch){scrollIntent.current=false;pagerRef.current.pause();}
  };
  const onTouchMove=event=>{
    const previous=touchPoint.current,touch=event.touches.length===1?event.touches[0]:null;
    if(!previous||!touch){touchPoint.current=null;return;}
    const dx=touch.clientX-previous.x,dy=touch.clientY-previous.y;
    touchPoint.current={x:touch.clientX,y:touch.clientY};
    if(event.defaultPrevented||Math.abs(dy)<=Math.abs(dx)||isNestedScroll(event,dy>0))return;
    interaction.current++;
    if(dy>0){scrollIntent.current=true;setFollow(false);requestHistory({gesture:true});}
    else {scrollIntent.current=false;pagerRef.current.pause();}
  };
  const onTouchEnd=()=>{touchPoint.current=null;};
  const latest=()=>{interaction.current++;readingAnchor.current=null;scrollIntent.current=false;pagerRef.current.pause();setFollow(true);schedule();};
  const retryHistory=()=>{viewportRef.current?.focus({preventScroll:true});setFollow(false);requestHistory({retry:true});};
  function prepend(load) {
    if(pendingPrepend.current)return pendingPrepend.current;
    const viewport=viewportRef.current,content=contentRef.current;if(!viewport||!content)return Promise.resolve();
    const epoch=lifetime.current;
    setFollow(false);setPrepending(true);
    const beforeApply=()=>{
      if(!live.current||lifetime.current!==epoch||follow.current||viewportRef.current!==viewport||contentRef.current!==content)return;
      // Capture the CURRENT reader position after network latency, not where the wheel began.
      pendingRestore.current={task,viewport,content,lifetime:epoch,interaction:interaction.current,
        anchors:measurements(viewport,content).filter(anchor=>anchor.bottom>0)};
    };
    const canApply=()=>live.current&&lifetime.current===epoch&&viewportRef.current===viewport&&contentRef.current===content;
    const task=Promise.resolve().then(()=>load(beforeApply,canApply)).then(async()=>{
      if(!live.current||lifetime.current!==epoch)return;
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(pendingRestore.current?.task===task)restorePrepend();
    }).finally(()=>{
      if(pendingRestore.current?.task===task)pendingRestore.current=null;
      if(pendingPrepend.current===task)pendingPrepend.current=null;
      if(live.current&&lifetime.current===epoch)setPrepending(false);
    });
    pendingPrepend.current=task;
    return task;
  }
  return {viewportRef,contentRef,following,showLatest,prepending,history:historyStatus,retryHistory,
    onScroll,onWheel,onKeyDown,onPointerDown,onTouchStart,onTouchMove,onTouchEnd,latest,prepend};
}
