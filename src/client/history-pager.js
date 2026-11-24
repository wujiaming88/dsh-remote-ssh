// Event-driven history admission; no DOM, polling or automatic prompt execution.
export const HISTORY_EDGE=160;
export function scrollBoxConsumesUpward({scrollHeight,clientHeight,scrollTop,overflowY,overscrollBehaviorY}) {
  return /^(auto|scroll)$/.test(overflowY)&&
    (overscrollBehaviorY==='contain'||overscrollBehaviorY==='none'||scrollHeight>clientHeight&&scrollTop>0);
}


export class HistoryPager {
  constructor({getPage,load,changed,maxBurst=3}) {
    this.getPage=getPage;this.load=load;this.changed=changed;this.maxBurst=maxBurst;
    this.active=false;this.identity=null;this.epoch=0;this.pending=null;this.budget=0;
    this.state={loading:false,error:null};
  }
  publish(patch) {this.state={...this.state,...patch};this.changed(this.state);}
  activate(active,identity) {
    this.epoch++;this.active=active;this.identity=identity;this.budget=0;
    this.publish({loading:false,error:null});
  }
  pause() {this.budget=0;}
  check(metrics,{gesture=false,retry=false}={}) {
    if(!this.active)return Promise.resolve();
    const page={...this.getPage()};
    if(!page?.ready||page.identity!==this.identity||!page.hasEarlier)return Promise.resolve();
    if(gesture||retry)this.budget=this.maxBurst;
    if(this.pending)return this.pending;
    if(!metrics||metrics.clientHeight<=0||metrics.scrollTop>HISTORY_EDGE||!this.budget||this.state.error&&!retry)return Promise.resolve();
    if(!Number.isSafeInteger(page.beforeSeq)||page.beforeSeq<1){
      this.publish({error:{code:'history_no_progress'}});return Promise.resolve();
    }
    const epoch=this.epoch;this.budget--;
    // Lock before any awaited work, including the anchor capture/load wrapper.
    const task=Promise.resolve().then(()=>{
      if(!this.active||epoch!==this.epoch)return;
      this.publish({loading:true,error:null});
      return this.load(page);
    }).then(()=>{
      if(!this.active||epoch!==this.epoch)return;
      const next=this.getPage();
      if(next?.identity===page.identity&&next.hasEarlier&&(!Number.isSafeInteger(next.beforeSeq)||next.beforeSeq>=page.beforeSeq))
        this.publish({error:{code:'history_no_progress'}});
    }).catch(error=>{
      if(this.active&&epoch===this.epoch)this.publish({error:{code:error.code||'history_failed',message:error.message}});
    }).finally(()=>{
      if(this.pending!==task)return;
      this.pending=null;
      if(this.active)this.publish({loading:false});
    });
    this.pending=task;return task;
  }
}
