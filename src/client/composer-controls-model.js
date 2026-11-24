// Mirrors the native ordinary-session composer posture: empty + running uses
// the primary Stop; a draft keeps Send/Steer; unacknowledged Send retains an
// independent interrupt control.
export function composerControls({running,draft='',attachments=[],sending=false,readingFiles=false,busy='',status}) {
  const empty=!draft.trim()&&!attachments.length;
  const primaryStops=!!running&&!sending&&empty;
  return {
    primaryStops,
    independentStop:!!running&&!!sending,
    stopping:busy==='acpCancel',
    primaryDisabled:primaryStops?!!busy:sending||readingFiles||!!busy||empty||status==='error',
    label:primaryStops?(busy==='acpCancel'?'acp.stopping':'acp.stop'):sending?'acp.sending':running?'acp.steer':'acp.send',
  };
}
