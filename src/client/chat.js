import React from 'react';
import { h, ui, api, useT, Select, FileGlyph, formatError ,NativeIcon} from './shared.js';
import {sessionClientKey} from './session-pool.js';
import { pickerScrollTop } from './picker.js';
import { UsageMeter, SessionStatsPill, UsagePill } from './usage.js';
import { ComposerControls, AttachmentButton, PermissionIcon } from './composer-controls.js';
import {acpBlockLabels,acpCommandGroups,acpCommandName} from './presentation.js';
import {AcpPermissionCard,AcpElicitationCard} from './cards.js';
import {Transcript,RunningTail} from './transcript.js';
import {useTranscriptScroll} from './transcript-scroll.js';
import {visibleTranscriptItem} from './transcript-model.js';
import {remoteConnectionPresentation} from './stream-view-model.js';
import {ConversationStatus,PrepareRuntimeDialog} from './status.js';
import {AttachmentList} from './attachments.js';
import {removeAttachmentById} from './attachments-model.js';
import {NativeComposerView} from './native-composer-view.js';
import {NativeQueueView} from './native-queue-view.js';
import {resolveDeliveryMode,composerEnterGesture,deliveryConflicts} from './composer-delivery-model.js';
import {composerConfiguration} from './native-composer-model.js';
import {installQuoteBridge,makeQuote} from './quote-bridge.js';

function useClient(backend,clients) {
  const [client,setClient]=React.useState(()=>clients.peek(backend));
  const [error,setError]=React.useState(null),[retry,setRetry]=React.useState(0);
  const identity=JSON.stringify([sessionClientKey(backend),backend.binding?.id,backend.canonicalRemotePath]);
  React.useEffect(()=>{
    let lease;
    try {lease=clients.acquire(backend);}catch(failure){setClient(null);setError(failure);return;}
    setError(null);setClient(lease.client);lease.client.ensureConnected();
    return ()=>lease.release();
  },[clients,identity,retry]);
  return {client:client===clients.peek(backend)?client:null,error,retry:()=>setRetry(value=>value+1)};
}

export function ChatPane({backend,clients,...props}) {
  const t=useT(),binding=useClient(backend,clients),client=binding.client;
  return client?h(ConnectedChatPane,{...props,key:client.viewKey,backend,client}):h(ConversationStatus,{kind:binding.error?'error':'loading',
    title:t(binding.error?'session.setup.loadFailed':'session.setup.loading'),description:binding.error?.message,onRetry:binding.error?binding.retry:undefined});
}
function ConnectedChatPane({ backend, client, openRemoteFile, preferences, busyEnter, renderFactorySlot, inputActions }) {
  const t = useT(), sid = backend.sessionId;
  const labels=React.useMemo(()=>acpBlockLabels(t),[t]);
  const attachmentContext=React.useMemo(()=>({id:client.state.binding?.id,dshSessionId:sid}),[client,sid,client.state.binding?.id]);
  const state=React.useSyncExternalStore(client.subscribe,client.getSnapshot,client.getSnapshot);
  const remoteStatus=remoteConnectionPresentation(state);
  const composer=client.composer;
  const composerState=React.useSyncExternalStore(composer.subscribe,composer.getSnapshot,composer.getSnapshot);
  const {draft,quotes,attachments,sending,readingFiles,uploads,pendingKind}=composerState;
  const inputUnavailable=remoteStatus.offline||remoteStatus.closed||!state.connected;
  const primaryMode=resolveDeliveryMode(busyEnter,state.running);
  const draftRef=React.useRef(draft);draftRef.current=draft;
  const editorRef=React.useRef(null);
  const sectionRef=React.useRef(null);
  const [quoteSelection,setQuoteSelection]=React.useState(null);
  const setDraft=value=>{composer.setDraft(value);draftRef.current=composer.getSnapshot().draft;};
  const insertQuote=React.useCallback(text => {
    const snapshot=composer.getSnapshot();
    if(snapshot.sending)return false;
    const quote=makeQuote(text);
    if(!quote)return false;
    composer.addQuote(quote);
    requestAnimationFrame(()=>editorRef.current?.focus({preventScroll:true}));
    return true;
  }, [composer]);
  React.useLayoutEffect(() => installQuoteBridge(inputActions, insertQuote), [inputActions, insertQuote]);
  React.useEffect(() => {
    const update = () => {
      const selection=window.getSelection();
      if(!selection||selection.isCollapsed||!selection.rangeCount||!selection.toString().trim()){setQuoteSelection(null);return;}
      const range=selection.getRangeAt(0), container=sectionRef.current;
      const node=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
      if(!container||!node||!container.contains(node)||node.closest('.rssh-native-composer-root,.ra-acp-cmd-panel')){setQuoteSelection(null);return;}
      const rect=range.getBoundingClientRect();
      if(!rect||(!rect.width&&!rect.height)){setQuoteSelection(null);return;}
      setQuoteSelection({text:selection.toString(),left:rect.left+rect.width/2,top:Math.max(8,rect.top-42)});
    };
    const clear=()=>setQuoteSelection(null);
    document.addEventListener('selectionchange',update);
    document.addEventListener('mouseup',update);
    document.addEventListener('keyup',update);
    window.addEventListener('scroll',clear,true);
    return ()=>{document.removeEventListener('selectionchange',update);document.removeEventListener('mouseup',update);document.removeEventListener('keyup',update);window.removeEventListener('scroll',clear,true);};
  }, []);
  const setAttachments=composer.setAttachments;
  const attachmentInput=React.useRef(null);
  const [busy, setBusy] = React.useState('');
  const [actionError, setError] = React.useState('');
  const error=actionError||composerState.error||(state.binding?.status==='closed'?state.error:'');
  const [preparePlan, setPreparePlan] = React.useState(null);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [commandDismissed,setCommandDismissed]=React.useState(false);
  const [fileQuery, setFileQuery] = React.useState(null);
  const [fileOptions, setFileOptions] = React.useState([]);
  const [choice, setChoice] = React.useState(0);
  const pickerPanel = React.useRef(null);
  const [pendingAnswers, setPendingAnswers] = React.useState(new Set());
  const alive = React.useRef(false);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const historyIdentity=value=>JSON.stringify([sid,value.cursor.generation,value.replayRevision||0]);
  const scroll=useTranscriptScroll(historyIdentity(state),state.items,!!state.binding&&!state.loading&&!state.failure,{
    getPage:()=>{const value=client.getSnapshot();return {identity:historyIdentity(value),
      ready:!!value.binding&&!value.loading&&!value.failure,hasEarlier:value.hasEarlier,beforeSeq:value.oldestSeq};},
    load:(page,beforeApply,canApply)=>client.history(page.beforeSeq,{beforeApply,canApply}),
  });
  React.useEffect(() => {
    if (fileQuery === null) { setFileOptions([]); return; }
    const controller = new AbortController();
    const slash = fileQuery.lastIndexOf('/'), directory = slash < 0 ? '.' : fileQuery.slice(0, slash) || '.';
    const fragment = fileQuery.slice(slash + 1).toLowerCase();
    const timer = setTimeout(async () => {
      const result = await api('sessionFiles', { sessionId: sid, action: 'list', path: directory }, controller.signal);
      if (controller.signal.aborted) return;
      setFileOptions(result.ok ? result.entries.filter(entry => entry.name.toLowerCase().includes(fragment)).slice(0, 30).map(entry => ({ ...entry, path: `${directory === '.' ? '' : directory + '/'}${entry.name}` })) : []);
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [sid, fileQuery]);

  const commandQuery = draft.startsWith('/') ? draft.slice(1).trim() : '';
  const commands = acpCommandGroups(state.commands, commandQuery).flatMap(group => group.items);
  const commandMenuOpen = commandOpen || (!!draft.startsWith('/') && !/\s/.test(draft) && !commandDismissed);
  function input(value) {
    setDraft(value); setChoice(0); setCommandDismissed(false);
    setCommandOpen(value.startsWith('/') && !/\s/.test(value));
    setFileQuery(/(?:^|\s)@([^\s]*)$/.exec(value)?.[1] ?? null);
  }
  function chooseFile(file) {
    if(composer.getSnapshot().sending||composer.getSnapshot().readingFiles)return;
    if (file.type === 'directory') { input(draftRef.current.replace(/@[^\s]*$/, `@${file.path}/`)); return; }
    if (attachments.length >= 16) { setError(t('acp.attachmentTooLarge')); return; }
    setAttachments(previous => [...previous, { id: crypto.randomUUID(), path: file.path, name: file.name }]);
    input(draftRef.current.replace(/@[^\s]*$/, ''));
  }
  function chooseCommand(command) { input(`/${acpCommandName(command)} `); setCommandOpen(false); setCommandDismissed(false); }
  async function send(gesture='enter') {
    if (!client || inputUnavailable || busy || sending || readingFiles || (!draft.trim() && !quotes.length && !attachments.length)) return;
    const mode=resolveDeliveryMode(busyEnter,state.running,gesture);
    if(pendingKind&&gesture==='accelerated'&&deliveryConflicts(pendingKind,mode,state.running)) {
      setError(t('acp.deliveryLocked'));return;
    }
    setError(''); scroll.latest();
    try { await client.sendDraft(pendingKind?'retry':mode); }
    catch { /* The retained composer records the current attempt's outcome. */ }
  }
  async function action(method, payload, key = method) {
    if (!client || busy) return;
    setBusy(key); setError('');
    try { await client.action(method, payload); }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(''); }
  }
  async function answer(request, payload, method) {
    if (!client || pendingAnswers.has(request.requestId)) return;
    setPendingAnswers(previous => new Set([...previous, request.requestId]));
    try { await client.action(method, { requestId: request.requestId, ...payload }); }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setPendingAnswers(previous => new Set([...previous].filter(id => id !== request.requestId))); }
  }
  async function prepare(confirmed) {
    if (!client || busy) return;
    setBusy('prepare'); setError('');
    try {
      const result = await client.prepare(confirmed);
      if (!alive.current) return;
      if (!confirmed) setPreparePlan(result.preparation);
      else { setPreparePlan(null); await client.connect(); }
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(''); }
  }
  async function openFile(path) {
    const result = await api('sessionBackend', { sessionId: sid });
    if (!alive.current) return;
    if (!result.ok) { setError(formatError(result)); return; }
    let relative = String(path);
    if (relative.startsWith('/')) {
      const root = result.canonicalRemotePath?.replace(/\/$/, '');
      if (!root || !relative.startsWith(root + '/')) { setError(t('acp.pathUnavailable')); return; }
      relative = relative.slice(root.length + 1);
    }
    openRemoteFile(relative);
  }
  async function receiveFiles(files) {
    if(sending||readingFiles||!files.length)return;
    setError('');
    try {await composer.receiveFiles(files,state.capabilities,failure=>t(`acp.${failure.code}`));}
    catch { /* Session-owned intake retains the localized error and original draft. */ }
  }
  const configuration = composerConfiguration(state.config, t, !!busy || sending);
  const configs = configuration.selectors.map(({key,configId,...props}) =>
    h(Select, {...props,key,onChange:value=>action('acpSetConfig',{configId,value})}));
  const permission = configuration.permission ? h(Select, {...configuration.permission,
    className:'rssh-permission-select', align:'start', icon:h(PermissionIcon),
    onChange:modeId=>action('acpSetMode',{modeId})}) : null;
  const waiting = state.permissions.length || state.elicitations.length;
  const hasVisibleContent=state.items.some(visibleTranscriptItem);
  const agentLabel = backend.backend?.type === 'claude' ? 'Claude Code' : backend.backend?.type === 'codex' ? 'Codex' : backend.backend?.type === 'pi' ? 'Pi' : '';
  const remotePath = backend.workspace?.remotePath || backend.canonicalRemotePath || '';
  const startMeta = [agentLabel, remotePath].filter(Boolean).join(' · ');
  const activeChoice = Math.min(choice, Math.max((fileQuery !== null ? fileOptions : commands).length - 1, 0));
  React.useLayoutEffect(() => {
    const panel = pickerPanel.current;
    const selected = panel?.children[activeChoice];
    if (!selected) return;
    panel.scrollTop = pickerScrollTop({ scrollTop: panel.scrollTop, height: panel.clientHeight,
      itemTop: selected.offsetTop - panel.clientTop, itemHeight: selected.offsetHeight });
  }, [activeChoice, commandMenuOpen, commandQuery, fileQuery, fileOptions, state.commands]);

  return h('section', { ref: sectionRef, className: 'ra-acp-view', 'aria-label': t('acp.hero') },
    preparePlan ? h(PrepareRuntimeDialog, { plan: preparePlan, onConfirm: () => prepare(true), onClose: () => { if (!busy) setPreparePlan(null); }, busy: !!busy }) : null,
    state.loading || !state.binding || state.failure ? h(ConversationStatus, {
      kind: state.loading ? 'loading' : 'error',
      code: state.failure?.code,
      description: state.error || state.failure?.error,
      needsPrepare: state.failure?.needsPrepare,
      nodeMissing: state.failure?.code === 'remote_node_missing',
      meta: startMeta,
      onRetry: () => client?.connect(),
      onPrepare: () => prepare(false),
      busy: !!busy })
    : h('div', { className: 'ra-acp' },
      error ? h('p', { role: 'alert', className: 'ra-acp-error rssh-output-alert' }, error) : null,
      !state.connected&&state.transportError?h('p',{role:'alert',className:'ra-acp-error rssh-output-alert'},state.transportError):null,
      remoteStatus.offline?h('div',{role:'status',className:'rssh-output-alert'},
        h('p',null,t('flow.remoteOffline')),
        state.binding.lastTransportError?h('p',null,state.binding.lastTransportError):null,
        remoteStatus.retryable?h(ui.Button,{onClick:()=>client.connect()},t('acp.retry')):null):null,
      state.binding.status === 'error' ? h(ui.Button, {className:'rssh-output-retry', onClick: () => client.connect() }, t('acp.retry')) : null,
      h('div',{className:'rssh-transcript-frame'},
        h('div', {className:'ra-acp-messages',ref:scroll.viewportRef,tabIndex:0,role:'region','aria-label':t('acp.messageHistory'),onScroll:scroll.onScroll,onWheel:scroll.onWheel,onKeyDown:scroll.onKeyDown,onPointerDown:scroll.onPointerDown,onTouchStart:scroll.onTouchStart,onTouchMove:scroll.onTouchMove,onTouchEnd:scroll.onTouchEnd,onTouchCancel:scroll.onTouchEnd},
          h('div',{className:'rssh-transcript-column',ref:scroll.contentRef},
            h('div',{className:'rssh-history-status','aria-busy':scroll.history.loading},
              h('span',{role:scroll.history.error?'alert':'status',title:scroll.history.error?.message},
                scroll.history.error?t(scroll.history.error.code==='history_no_progress'?'acp.historyNoProgress':'acp.historyFailed'):
                scroll.history.loading?t('acp.historyLoading'):state.hasEarlier?t('acp.historyScrollHint'):hasVisibleContent?t('acp.historyStart'):''),
              scroll.history.error?h(ui.Button,{variant:'ghost',size:'sm',onClick:scroll.retryHistory},t('acp.historyRetry')):null),
            hasVisibleContent?h(Transcript,{items:state.items,running:state.running&&!remoteStatus.offline,turns:state.turns,preferences,t,labels,openFile,renderFactorySlot,rootSessionId:state.binding.sessionId,attachmentContext}):null,
            !hasVisibleContent&&!state.running&&!waiting&&state.connected?h('div',{className:'ra-acp-empty-state'},t('acp.emptyHint')):null,
            h(RunningTail,{state,t}))),
        scroll.showLatest?h(ui.Button,{variant:'outline',className:'rssh-jump-latest','aria-label':t('flow.latest'),title:t('flow.latest'),onClick:()=>{
          scroll.latest();scroll.viewportRef.current?.focus({preventScroll:true});
        }},h(NativeIcon,{name:'chevron-down',size:16})):null),
      waiting ? h('div', { className: 'ra-acp-perms' },
        state.permissions.map(request => h(AcpPermissionCard, { key: request.requestId, permission: request, t, busy: pendingAnswers.has(request.requestId),
          onAnswer: (request, optionId) => answer(request, { optionId }, 'acpPermission'), onDismiss: request => answer(request, { cancelled: true }, 'acpPermission') })),
        state.elicitations.map(request => h(AcpElicitationCard, { key: request.requestId, request, t, busy: pendingAnswers.has(request.requestId), onAnswer: (request, result) => answer(request, result, 'acpElicitation') }))) : null,
      !state.running && state.suggestions.length ? h('div', {className:'ra-acp-suggestions', 'aria-label':t('acp.suggestions')},
        state.suggestions.filter(value=>value.text && Array.isArray(value.content) && value.content.every(block=>block.type==='text')).map((value,index)=>
          h(ui.Button, {key:index,variant:'ghost',size:'sm',onClick:()=>input(value.text)}, value.text))) : null,
      remoteStatus.closed?h('p',{className:'rssh-output-alert',role:'status'},t('flow.closedReadOnly')):h('div',{className:'rssh-native-composer-stack'},
      h(NativeQueueView,{items:state.queuedMessages,disabled:inputUnavailable,canSendNow:state.running===true&&state.capabilities?.steering?.supported===true,sendNowReason:state.running===true?'':'acp.queueSendNowNoTurn',
        onRemove:targetRequestId=>client.action('acpRemoveQueued',{targetRequestId}),
        onEdit:(targetRequestId,text)=>client.action('acpUpdateQueued',{targetRequestId,text}),
        onSendNow: async targetRequestId=>{const result=await client.action('acpPromoteQueued',{targetRequestId});
          if(result?.outcome!=='injected')throw Object.assign(new Error('Queued message was not injected; it remains queued'),{code:result?.outcome==='promptRequired'?'queue_awaiting_turn':'queue_not_injected'});
          return result;},t}),
      h(NativeComposerView, {
        editorRef,
        accessory: quotes.length ? h('div',{className:'rssh-native-composer-quotes'},quotes.map(quote=>
          h('span',{key:quote.id,className:'rssh-native-composer-quote'},
            h('span',{className:'rssh-native-composer-quoteMark','aria-hidden':true},'“'),
            h('span',{className:'rssh-native-composer-quoteText',title:quote.text},quote.summary),
            h('button',{type:'button',className:'rssh-native-composer-quoteRemove',
              'aria-label':t('acp.removeQuote'),title:t('acp.removeQuote'),
              onClick:()=>composer.removeQuote(quote.id)},'×')))) : null,
        notice: pendingKind&&!sending?t('acp.pendingSubmissionNotice'):null,
        cardProps: {onDragOver: event => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); },
        onDrop: event => {
          if ([...event.dataTransfer.items].some(item=>item.webkitGetAsEntry?.()?.isDirectory)) {
            event.preventDefault();setError(t('acp.attachmentInvalidFile'));return;
          }
          if (event.dataTransfer.files.length) { event.preventDefault(); receiveFiles([...event.dataTransfer.files]); }
        }},
        overlay: commandMenuOpen || fileQuery !== null ? h('div', { ref: pickerPanel, className: 'ra-acp-cmd-panel', role: 'dialog', 'aria-label': t(fileQuery !== null ? 'acp.fileMentions' : 'acp.commandsPanel') },
        (fileQuery !== null ? fileOptions : commands).length === 0
          ? h('div', { className: 'ra-acp-cmd-empty', role: 'status' }, t(fileQuery !== null ? 'acp.noFiles' : 'acp.noCommands'))
          : (fileQuery !== null ? fileOptions : commands).map((value, index) => h('button', { key: value.path || value.name, type: 'button',
          className: 'ra-acp-cmd-row' + (index === activeChoice ? ' ra-acp-command-selected' : ''),
          'aria-current': index === activeChoice ? 'true' : undefined,
          title: value.description || value.path || `/${acpCommandName(value)}`,
          onClick: () => fileQuery !== null ? chooseFile(value) : chooseCommand(value) },
        h('span', { className: 'ra-acp-cmd-heading' },
          fileQuery !== null ? h(FileGlyph, { directory: value.type === 'directory', name: value.name }) : null,
          h('span', { className: 'ra-acp-cmd-label' }, fileQuery !== null ? value.path : `/${acpCommandName(value)}`)),
        value.description ? h('small', { className: 'ra-acp-cmd-description' }, value.description) : null))) : null,
        fileInput: h('input',{ref:attachmentInput,type:'file',hidden:true,multiple:true,disabled:sending||readingFiles,
          onChange:event=>{const files=[...event.target.files];event.target.value='';receiveFiles(files);}}),
        attachments: h(AttachmentList,{attachments,uploads,sending,t,onRemove:id=>{
          if(!composer.getSnapshot().sending)setAttachments(old=>removeAttachmentById(old,id));
        }}),
        editor: {value: draft, readOnly: sending, 'aria-label': t('acp.composerPlaceholder'),
          onChange: event => input(event.target.value), onPaste: event => { if (event.clipboardData.files.length) { event.preventDefault(); receiveFiles([...event.clipboardData.files]); } },
          onKeyDown: event => {
            if (event.isComposing || event.nativeEvent.isComposing || event.keyCode===229 || event.nativeEvent.keyCode===229) return;
            const gesture=composerEnterGesture(event);
            if(event.key==='Enter'&&gesture===null)return;
            if ((commandMenuOpen || fileQuery !== null) && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
              if (event.key === 'Escape') { event.preventDefault(); setCommandOpen(false); setCommandDismissed(true); setFileQuery(null); return; }
              const values = fileQuery !== null ? fileOptions : commands;
              if (values.length && !event.shiftKey) {
                event.preventDefault();
                if (event.key === 'ArrowDown') setChoice((activeChoice + 1) % values.length);
                else if (event.key === 'ArrowUp') setChoice((activeChoice + values.length - 1) % values.length);
                else if (fileQuery !== null) chooseFile(values[activeChoice]); else chooseCommand(values[activeChoice]);
                return;
              }
            }
            if (gesture!==null) { event.preventDefault(); send(gesture); }
          }},
        placeholder: t('acp.composerPlaceholder'), showPlaceholder: !draft && !quotes.length && !attachments.length,
        add: h(AttachmentButton,{disabled:sending||readingFiles,onClick:()=>attachmentInput.current?.click()}),
        modes: permission, controls: configs,
        primary: h(ComposerControls, {running:state.running,draft,quotes,attachments,sending,readingFiles,busy,status:state.binding.status,
          mode:primaryMode,pendingKind,disabled:inputUnavailable,
          onStop:()=>action('acpCancel'),onSend:()=>send()}),
        dock: h(React.Fragment,null,h(SessionStatsPill,{state}),h(UsagePill,{state}),h(UsageMeter,{state})),
      }))),
    quoteSelection?h('button',{type:'button',className:'rssh-quote-selection','data-quote-fallback':'',
      style:{left:`${quoteSelection.left}px`,top:`${quoteSelection.top}px`},
      onPointerDown:event=>event.preventDefault(),
      onClick:()=>{if(insertQuote(quoteSelection.text)){window.getSelection()?.removeAllRanges();setQuoteSelection(null);}}},
      t('acp.quoteSelection')):null);
}
