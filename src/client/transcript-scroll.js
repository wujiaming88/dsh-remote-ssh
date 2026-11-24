import React from 'react';
import {followsTranscriptTail,anchoredScrollTop,mayRestoreTranscriptAnchor} from './transcript-model.js';

// One owned scrollport, no outer-document scrolling or reconstructed text DOM.
// Resizes follow only at the tail; browsing/selecting history opts out.
export function useTranscriptScroll(identity,items,ready=true) {
  const viewportRef=React.useRef(null),contentRef=React.useRef(null);
  const follow=React.useRef(true),frame=React.useRef(null),live=React.useRef(false);
  const interaction=React.useRef(0),expectedScroll=React.useRef(null),pendingPrepend=React.useRef(null);
  const [following,setFollowing]=React.useState(true),[prepending,setPrepending]=React.useState(false);
  const setFollow=value=>{follow.current=value;setFollowing(value);};
  const writeScroll=(viewport,top)=>{
    expectedScroll.current=Math.max(0,Math.min(top,viewport.scrollHeight-viewport.clientHeight));
    viewport.scrollTop=expectedScroll.current;
  };
  const schedule=()=>{
    if(!live.current||!follow.current||frame.current!==null)return;
    frame.current=requestAnimationFrame(()=>{
      frame.current=null;
      if(live.current&&follow.current&&viewportRef.current)writeScroll(viewportRef.current,viewportRef.current.scrollHeight);
    });
  };
  React.useLayoutEffect(()=>{
    live.current=true;setFollow(true);
    const viewport=viewportRef.current,content=contentRef.current;
    const observer=viewport&&content?new ResizeObserver(schedule):null;
    if(observer){observer.observe(viewport);observer.observe(content);}
    schedule();
    return()=>{live.current=false;observer?.disconnect();if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;};
  },[identity,ready]);
  React.useLayoutEffect(schedule,[items]);
  const onScroll=()=>{
    const viewport=viewportRef.current;if(!viewport)return;
    if(expectedScroll.current===null||Math.abs(viewport.scrollTop-expectedScroll.current)>1)interaction.current++;
    expectedScroll.current=null;
    setFollow(followsTranscriptTail(viewport));
  };
  const onWheel=event=>{interaction.current++;if(event.deltaY<0)setFollow(false);};
  const onPointerDown=event=>{
    if(event.button!==0||event.target.closest('button,a,summary,input,select,textarea,[role="button"]'))return;
    interaction.current++;setFollow(false);
  };
  const latest=()=>{interaction.current++;setFollow(true);schedule();};
  function prepend(load) {
    if(pendingPrepend.current)return pendingPrepend.current;
    const viewport=viewportRef.current,content=contentRef.current;if(!viewport||!content)return Promise.resolve();
    setFollow(false);setPrepending(true);
    const generation=interaction.current,edge=viewport.getBoundingClientRect().top;
    const anchor=[...content.querySelectorAll('[data-transcript-anchor]')].find(node=>node.getClientRects().length&&node.getBoundingClientRect().bottom>edge);
    const anchorKey=anchor?.dataset.transcriptAnchor,offset=anchor?anchor.getBoundingClientRect().top-edge:null;
    const task=Promise.resolve().then(load).then(async()=>{
      if(!live.current)return;
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(!mayRestoreTranscriptAnchor({startedAtGeneration:generation,currentGeneration:interaction.current,
        sameViewport:viewportRef.current===viewport,live:live.current})||!anchorKey)return;
      const next=[...content.querySelectorAll('[data-transcript-anchor]')].find(node=>node.dataset.transcriptAnchor===anchorKey&&node.getClientRects().length);
      if(!next)return;
      const nextOffset=next.getBoundingClientRect().top-viewport.getBoundingClientRect().top;
      writeScroll(viewport,anchoredScrollTop({currentTop:viewport.scrollTop,previousOffset:offset,nextOffset}));
    }).finally(()=>{
      if(pendingPrepend.current===task)pendingPrepend.current=null;
      if(live.current)setPrepending(false);
    });
    pendingPrepend.current=task;
    return task;
  }
  return {viewportRef,contentRef,following,prepending,onScroll,onWheel,onPointerDown,latest,prepend};
}
