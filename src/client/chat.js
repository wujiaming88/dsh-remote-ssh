import React from 'react';
import { h, ui, api, useT, Select, FileGlyph, formatError } from './shared.js';
import { SessionClient } from './session.js';
import { pickerScrollTop } from './picker.js';
import { UsageMeter, SessionStatsPill } from './usage.js';
import { ComposerControls } from './composer-controls.js';
import {prepareSubmission,acknowledgeSubmission} from './submission.js';
import { initialState } from './events.js';
import {acpBlockLabels,acpCommandGroups,acpCommandName} from './presentation.js';
import {AcpPermissionCard,AcpElicitationCard} from './cards.js';
import {Transcript,RunningTail} from './transcript.js';
import {useTranscriptScroll} from './transcript-scroll.js';
import {visibleTranscriptItem} from './transcript-model.js';
import {ConversationStatus,PrepareRuntimeDialog} from './status.js';

const EMPTY = initialState();
const emptySubscribe = () => () => {};
const emptySnapshot = () => EMPTY;
function useClient(backend, acknowledge) {
  const [client, setClient] = React.useState(null);
  const onAck = React.useRef(acknowledge); onAck.current = acknowledge;
  React.useEffect(() => {
    const next = new SessionClient(backend);
    next.onAcknowledged(id => onAck.current(id));
    setClient(next);
    next.connect();
    return () => next.dispose();
  }, [backend.sessionId]);
  const state = React.useSyncExternalStore(client?.subscribe || emptySubscribe, client?.getSnapshot || emptySnapshot, emptySnapshot);
  return [client, state];
}

export function ChatPane({ backend, openRemoteFile, preferences, renderFactorySlot }) {
  const t = useT(), labels = acpBlockLabels(t), sid = backend.sessionId;
  const draftKey = `remote-acp.draft.v3.${sid}`;
  const [draft, setDraftState] = React.useState(() => { try { return localStorage.getItem(draftKey) || ''; } catch { return ''; } });
  const draftRef = React.useRef(draft); draftRef.current = draft;
  const setDraft = value => {
    const text = typeof value === 'function' ? value(draftRef.current) : value;
    draftRef.current = text; setDraftState(text);
    try { localStorage.setItem(draftKey, text); } catch {}
  };
  const [attachments, setAttachmentState] = React.useState([]);
  const attachmentsRef=React.useRef(attachments);attachmentsRef.current=attachments;
  const setAttachments=value=>{const next=typeof value==='function'?value(attachmentsRef.current):value;attachmentsRef.current=next;setAttachmentState(next);};
  const [readingFiles,setReadingFiles]=React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [preparePlan, setPreparePlan] = React.useState(null);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [fileQuery, setFileQuery] = React.useState(null);
  const [fileOptions, setFileOptions] = React.useState([]);
  const [choice, setChoice] = React.useState(0);
  const pickerPanel = React.useRef(null);
  const [pendingAnswers, setPendingAnswers] = React.useState(new Set());
  const submission = React.useRef(null), alive = React.useRef(false);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [client, state] = useClient(backend, requestId => {
    if (submission.current?.requestId !== requestId) return;
    const next=acknowledgeSubmission(draftRef.current,attachmentsRef.current,submission.current);
    setDraft(next.draft);setAttachments(next.attachments);submission.current=null;setSending(false);
  });
  const scroll=useTranscriptScroll(sid,state.items,!!state.binding&&!state.loading&&!state.failure);
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
  function input(value) {
    setDraft(value); setChoice(0);
    setCommandOpen(value.startsWith('/') && !/\s/.test(value));
    setFileQuery(/(?:^|\s)@([^\s]*)$/.exec(value)?.[1] ?? null);
  }
  function chooseFile(file) {
    if (file.type === 'directory') { input(draftRef.current.replace(/@[^\s]*$/, `@${file.path}/`)); return; }
    if (attachments.length >= 16) { setError(t('acp.attachmentTooLarge')); return; }
    setAttachments(previous => [...previous, { id: crypto.randomUUID(), path: file.path, name: file.name }]);
    input(draftRef.current.replace(/@[^\s]*$/, ''));
  }
  function chooseCommand(command) { input(`/${acpCommandName(command)} `); setCommandOpen(false); }
  async function send() {
    if (!client || sending || readingFiles || (!draft.trim() && !attachments.length)) return;
    const request=prepareSubmission(draft,attachmentsRef.current,submission.current);
    submission.current = request; setSending(true); setError(''); scroll.latest();
    try { await client.submit(request); }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setSending(false); }
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
    if(sending||readingFiles)return;
    setReadingFiles(true);
    try {
    const received = [];
    for (const file of files) {
      const image = /^image\/(png|jpeg|webp|gif)$/.test(file.type);
      if (file.size > (image ? 2 : 1) * 1024 * 1024) { setError(t('acp.attachmentTooLarge')); return; }
      if (image) {
        if (!state.capabilities.promptCapabilities?.image) { setError(t('acp.attachmentUnsupported')); return; }
        const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        received.push({ id: crypto.randomUUID(), type: 'image', name: file.name, mimeType: file.type, data: btoa(binary) });
      } else if (/^text\//.test(file.type) || /\.(md|txt|json|ya?ml|csv|[cm]?jsx?|tsx?|py|go|rs|java|sh|sql|css|html)$/i.test(file.name)) {
        received.push({ id: crypto.randomUUID(), name: file.name, mimeType: file.type || 'text/plain', text: await file.text() });
      } else { setError(t('acp.attachmentUnsupported')); return; }
    }
    if (!alive.current) return;
    const combined = [...attachmentsRef.current, ...received];
    const textBytes = combined.reduce((size, file) => size + new TextEncoder().encode(file.text || '').length, 0);
    const imageBytes = combined.reduce((size, file) => size + (file.data ? atob(file.data).length : 0), 0);
    if (combined.length > 16 || textBytes > 1048576 || imageBytes > 2097152) { setError(t('acp.attachmentTooLarge')); return; }
    setAttachments(combined);
    } catch(failure){if(alive.current)setError(failure.message);}
    finally {if(alive.current)setReadingFiles(false);}
  }
  const configs = ['models', 'reasoning'].flatMap(name => {
    const config = state.config[name];
    if (!config?.options?.length) return [];
    const label = t(name === 'models' ? 'acp.model' : 'acp.reasoning');
    return [h('div', { key: name, className: 'ra-acp-config' }, h('span', { className: 'ra-acp-config-label' }, label),
      h(Select, { label, value: String(config.currentValue ?? ''), disabled: !!busy,
        options: config.options.map(option => ({ id: String(option.value), label: option.name || String(option.value) })),
        onChange: value => action('acpSetConfig', { configId: config.configId, value }) }))];
  });
  if (state.config.modes?.availableModes?.length) configs.push(h('div', { key: 'mode', className: 'ra-acp-config' },
    h('span', { className: 'ra-acp-config-label' }, t('acp.mode')),
    h(Select, { label: t('acp.mode'), value: state.config.modes.currentModeId, disabled: !!busy,
      options: state.config.modes.availableModes.map(mode => ({ id: mode.id, label: mode.name })),
      onChange: modeId => action('acpSetMode', { modeId }) })));
  const waiting = state.permissions.length || state.elicitations.length;
  const hasVisibleContent=state.items.some(visibleTranscriptItem);
  const agentLabel = backend.backend?.type === 'claude' ? 'Claude Code' : backend.backend?.type === 'codex' ? 'Codex' : '';
  const remotePath = backend.workspace?.remotePath || backend.canonicalRemotePath || '';
  const startMeta = [agentLabel, remotePath].filter(Boolean).join(' · ');
  const activeChoice = Math.min(choice, Math.max((fileQuery !== null ? fileOptions : commands).length - 1, 0));
  React.useLayoutEffect(() => {
    const panel = pickerPanel.current;
    const selected = panel?.children[activeChoice];
    if (!selected) return;
    panel.scrollTop = pickerScrollTop({ scrollTop: panel.scrollTop, height: panel.clientHeight,
      itemTop: selected.offsetTop - panel.clientTop, itemHeight: selected.offsetHeight });
  }, [activeChoice, commandOpen, commandQuery, fileQuery, fileOptions, state.commands]);

  return h('section', { className: 'ra-acp-view', 'aria-label': t('acp.hero') },
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
      state.binding.status === 'error' ? h(ui.Button, {className:'rssh-output-retry', onClick: () => client.connect() }, t('acp.retry')) : null,
      h('div',{className:'rssh-transcript-frame'},
        h('div', {className:'ra-acp-messages',ref:scroll.viewportRef,tabIndex:-1,onScroll:scroll.onScroll,onWheel:scroll.onWheel},
          h('div',{className:'rssh-transcript-column',ref:scroll.contentRef,onPointerDown:scroll.onPointerDown},
            state.hasEarlier?h(ui.Button,{variant:'ghost',size:'sm',className:'rssh-history-control',disabled:scroll.prepending,onClick:async()=>{
              try{await scroll.prepend(()=>client.history(state.oldestSeq));}
              catch(failure){if(alive.current)setError(failure.message);}
            }},t('acp.loadEarlier')):null,
            hasVisibleContent?h(Transcript,{items:state.items,running:state.running,turns:state.turns,preferences,t,labels,openFile,renderFactorySlot,rootSessionId:state.binding.sessionId}):null,
            !hasVisibleContent&&!state.running&&!waiting&&state.connected?h('div',{className:'ra-acp-empty-state'},t('acp.emptyHint')):null,
            h(RunningTail,{state,t}))),
        !scroll.following?h(ui.Button,{variant:'outline',className:'rssh-jump-latest','aria-label':t('flow.latest'),title:t('flow.latest'),onClick:()=>{
          scroll.latest();scroll.viewportRef.current?.focus({preventScroll:true});
        }},h('svg',{width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},h('path',{d:'m4 6 4 4 4-4'}))):null),
      waiting ? h('div', { className: 'ra-acp-perms' },
        state.permissions.map(request => h(AcpPermissionCard, { key: request.requestId, permission: request, t, busy: pendingAnswers.has(request.requestId),
          onAnswer: (request, optionId) => answer(request, { optionId }, 'acpPermission'), onDismiss: request => answer(request, { cancelled: true }, 'acpPermission') })),
        state.elicitations.map(request => h(AcpElicitationCard, { key: request.requestId, request, t, busy: pendingAnswers.has(request.requestId), onAnswer: (request, result) => answer(request, result, 'acpElicitation') }))) : null,
      !state.running && state.suggestions.length ? h('div', {className:'ra-acp-suggestions', 'aria-label':t('acp.suggestions')},
        state.suggestions.filter(value=>value.text && Array.isArray(value.content) && value.content.every(block=>block.type==='text')).map((value,index)=>
          h(ui.Button, {key:index,variant:'ghost',size:'sm',onClick:()=>input(value.text)}, value.text))) : null,
      commandOpen || fileQuery !== null ? h('div', { ref: pickerPanel, className: 'ra-acp-cmd-panel', role: 'dialog', 'aria-label': t(fileQuery !== null ? 'acp.fileMentions' : 'acp.commandsPanel') },
        (fileQuery !== null ? fileOptions : commands).length === 0
          ? h('div', { className: 'ra-acp-cmd-empty', role: 'status' }, t(fileQuery !== null ? 'acp.noFiles' : 'acp.noCommands'))
          : (fileQuery !== null ? fileOptions : commands).map((value, index) => h(ui.Button, { key: value.path || value.name, size: 'sm', variant: 'ghost',
          className: 'ra-acp-cmd-row' + (index === activeChoice ? ' ra-acp-command-selected' : ''),
          'aria-current': index === activeChoice ? 'true' : undefined,
          title: value.description || value.path || `/${acpCommandName(value)}`,
          onClick: () => fileQuery !== null ? chooseFile(value) : chooseCommand(value) },
        h('span', { className: 'ra-acp-cmd-heading' },
          fileQuery !== null ? h(FileGlyph, { directory: value.type === 'directory', name: value.name }) : null,
          h('span', { className: 'ra-acp-cmd-label' }, fileQuery !== null ? value.path : `/${acpCommandName(value)}`)),
        value.description ? h('small', { className: 'ra-acp-cmd-description' }, value.description) : null))) : null,
      h('div', { className: 'ra-acp-composer', onDragOver: event => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); },
        onDrop: event => { if (event.dataTransfer.files.length) { event.preventDefault(); receiveFiles([...event.dataTransfer.files]); } } },
        attachments.length ? h('div', { className: 'ra-acp-attachments' }, attachments.map((file, index) => h(ui.Button, { key: index, size: 'sm', disabled: sending,
          'aria-label': `${t('acp.removeAttachment')}: ${file.name}`, onClick: () => setAttachments(old => old.filter((_, position) => position !== index)) }, file.name, ' ×'))) : null,
        h('textarea', { className: 'ra-acp-textarea', value: draft, rows: 2, readOnly: sending, 'aria-label': t('acp.composerPlaceholder'), placeholder: t('acp.composerPlaceholder'),
          onChange: event => input(event.target.value), onPaste: event => { if (event.clipboardData.files.length) { event.preventDefault(); receiveFiles([...event.clipboardData.files]); } },
          onKeyDown: event => {
            if (event.isComposing || event.nativeEvent.isComposing) return;
            if ((commandOpen || fileQuery !== null) && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
              if (event.key === 'Escape') { event.preventDefault(); setCommandOpen(false); setFileQuery(null); return; }
              const values = fileQuery !== null ? fileOptions : commands;
              if (values.length && !event.shiftKey) {
                event.preventDefault();
                if (event.key === 'ArrowDown') setChoice((activeChoice + 1) % values.length);
                else if (event.key === 'ArrowUp') setChoice((activeChoice + values.length - 1) % values.length);
                else if (fileQuery !== null) chooseFile(values[activeChoice]); else chooseCommand(values[activeChoice]);
                return;
              }
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.altKey) { event.preventDefault(); send(); }
          } }),
        h('div', { className: 'ra-acp-compose-bar' }, h('div', { className: 'ra-acp-compose-left' }, h('div', { className: 'ra-acp-configs' }, configs)),
          h('div', { className: 'ra-acp-compose-right' },
            h(ComposerControls, {running:state.running,draft,attachments,sending,readingFiles,busy,status:state.binding.status,
              onStop:()=>action('acpCancel'),onSend:send})))),
        h('div',{className:'rssh-compose-dock'},h(UsageMeter,{state}),h(SessionStatsPill,{state}))));
}
