// Mirrors the native ordinary-session composer posture: empty + running uses
// the primary Stop; a draft follows Queue/Steer; unacknowledged Send retains an
// independent interrupt control.
export function composerControls({running,draft='',attachments=[],sending=false,readingFiles=false,busy='',status,mode='queue',pendingKind,disabled=false}) {
  const empty=!draft.trim()&&!attachments.length;
  const primaryStops=!!running&&!sending&&empty;
  return {
    primaryStops,
    independentStop:!!running&&!!sending,
    stopping:busy==='acpCancel',
    primaryDisabled:disabled||(primaryStops?!!busy:sending||readingFiles||!!busy||empty||status==='error'),
    label:primaryStops?(busy==='acpCancel'?'acp.stopping':'acp.stop'):sending?'acp.sending':pendingKind?'acp.retrySubmission':running?(mode==='steer'?'acp.steer':'acp.queue'):'acp.send',
  };
}
