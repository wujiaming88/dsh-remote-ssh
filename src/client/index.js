
import {useEffect} from 'react';
import { api, h, ui, useT, locale, NAMESPACE } from './shared.js';
import {watchSessionCompletion} from './session-completion.js';
import { createBackendRouter, knownRemoteBlank } from './router.js';
import {REMOTE_SESSION_PROJECTION_KEY} from '../../lib/protocol.js';
import { ChatPane } from './chat.js';
import {SessionClientPool} from './session-pool.js';
import {SessionStatusStore} from './session-status-store.js';
import {installSessionStatus,messages as sessionStatusMessages} from './session-status.js';
import { SessionSetup, messages as setupMessages } from './session-setup.js';
import { NewRemoteSession } from './new-session.js';
import { RemoteFilesSidebar, assertFileCloseAllowed, messages as fileMessages } from './files.js';
import filesCss from './files.css';
import { SettingsSection, messages as settingsMessages } from './settings.js';
import {installSessionActions, messages as sessionActionMessages} from './session-actions.js';
import {messages as usageMessages} from './usage.js';
import {messages as flowMessages} from './transcript.js';
import {ConversationStatus, messages as statusMessages} from './status.js';
import { RemoteWorkspaceFlow, messages as workspaceMessages } from './workspaces.js';
import zh from './zh.js';
import en from './en.js';
import css from './styles.css';
import uiCss from './ui.css';
import toolCss from './tool-stream.css';
import attachmentCss from './attachments.css';
import sentAttachmentCss from './sent-attachments.css';

function RemoteConversation(props) {
  const t = useT();
  const routing = props.useRemoteBackend(value => value);
  const title = props.useSessions(value => value.byId[props.sessionId]?.displayTitle || '');
  const preferences=props.useChatPreferences(snapshot=>snapshot.value);
  const conversationSelected=props.usePanelInfo(info=>info.activePanelId===null);
  const viewing=conversationSelected&&routing.phase==='remote'&&routing.sessionId===props.sessionId;
  useEffect(()=>viewing?props.trackSessionView(props.sessionId):undefined,[viewing,props.sessionId,props.trackSessionView]);
  if (routing.sessionId !== props.sessionId) return null;
  return h('main', { className: 'rssh-conversation' },
    h('header', { className: 'rssh-conversation-header', 'data-window-drag': '' },
      h('span', { className: 'rssh-conversation-title' }, title || t('acp.hero')),
      routing.value?.workspace?.shellWorkspaceId && routing.value.backend ? h(NewRemoteSession, { key: props.sessionId,
        workspaceId: routing.value.workspace.shellWorkspaceId, createSession: props.createRemoteSession, openSession: props.openSession, beginNavigation: props.beginNavigation }) : null,
      routing.value?.backend ? props.renderFactorySlot('contextMenu.button', {target:{kind:'remote-agent-session',value:{sessionId:props.sessionId}},label:t('session.more'),size:'sm'}) : null,
      h(ui.Button, { size: 'sm', variant: 'ghost', 'aria-label': t('acp.sidebar'), onClick: props.toggleFiles }, h(ui.IconFolderOpenOutline16, { size: 16 }))),
    routing.phase === 'remote' ? h(ChatPane, { key: props.sessionId, backend: routing.value, clients:props.clients, preferences, renderFactorySlot:props.renderFactorySlot, openRemoteFile: props.openRemoteFile })
      : routing.phase === 'selection' ? h(SessionSetup, { key: props.sessionId, backend: routing.value, onSelected: props.refreshBackend })
      : h(ConversationStatus, { kind: routing.phase === 'loading' ? 'loading' : 'error',
        title: t(routing.phase === 'loading' ? 'session.setup.loading' : 'session.setup.loadFailed'),
        description: routing.error || '', meta: t('session.setup.loadingHint'), onRetry: props.refreshBackend }));
}

export function apply(ctx) {
  const { slots } = ctx;
  const clients=new SessionClientPool();
  ctx.effect(()=>()=>clients.dispose());
  ctx.effect(() => ctx.locale.register(NAMESPACE, {
    zh: { ...zh, ...settingsMessages.zh, ...workspaceMessages.zh, ...setupMessages.zh, ...sessionActionMessages.zh, ...sessionStatusMessages.zh, ...usageMessages.zh, ...flowMessages.zh, ...statusMessages.zh, ...fileMessages.zh },
    en: { ...en, ...settingsMessages.en, ...workspaceMessages.en, ...setupMessages.en, ...sessionActionMessages.en, ...sessionStatusMessages.en, ...usageMessages.en, ...flowMessages.en, ...statusMessages.en, ...fileMessages.en },
  }));
  locale.t = ctx.locale.bind(NAMESPACE);
  locale.subscribe = listener => ctx.locale.subscribe(listener);
  locale.getSnapshot = () => ctx.locale.getSnapshot();
  installSessionActions(ctx);
  const sessionStatuses=new SessionStatusStore();
  installSessionStatus(ctx,sessionStatuses);
  ctx.effect(()=>{sessionStatuses.start();return ()=>sessionStatuses.dispose();});
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = uiCss + "\n" + toolCss + "\n" + css + "\n" + filesCss + "\n" + attachmentCss + "\n" + sentAttachmentCss; document.head.appendChild(style);
    return () => style.remove();
  });

  let router, refreshRoute = () => {}, catalog = [], catalogVersion = 0, active = true;
  let catalogController;
  const trackSessionView=sessionId=>watchSessionCompletion(sessionStatuses,sessionId,{canView:()=>
    ctx.uiSession.adapter.current.getSnapshot().key===sessionId&&ctx.layout.panelInfo.getSnapshot().activePanelId===null
    &&router?.getSnapshot().sessionId===sessionId&&router?.getSnapshot().phase==='remote'});
  async function loadCatalog() {
    const version=++catalogVersion;
    catalogController?.abort(); catalogController=new AbortController();
    const result=await api('listWorkspaces',{},catalogController.signal);
    if(!active||version!==catalogVersion||!result.ok||!Array.isArray(result.workspaces))return;
    catalog=result.workspaces;refreshRoute(true);
  }
  const changed = result => {
    if(Array.isArray(result?.workspaces)){catalogVersion++;catalog=result.workspaces;refreshRoute(true);}
    else if(result?.workspace){catalogVersion++;catalog=[...catalog.filter(value=>value.id!==result.workspace.id),result.workspace];refreshRoute(true);}
    else void loadCatalog();
  };
  ctx.effect(()=>()=>{active=false;catalogVersion++;catalogController?.abort();});
  void loadCatalog();
  slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: 'remote-ssh', order: 40,
    label: () => locale.t('rssh.settings.title'), locale: NAMESPACE,
    inject: () => ({ onBackendChanged: changed }) }, SettingsSection));
  // All three seats are declared by the current 0.2.2 Workspace implementation.
  for (const name of ['conversation.hero.workspace.directoryFlow', 'sidebar.workspaces.directoryFlow', 'workspace.picker.directoryFlow']) {
    slots.inject(name, () => slots.register({ name, priority: -100, locale: NAMESPACE,
      inject: () => ({ onBackendChanged: changed }) }, RemoteWorkspaceFlow));
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: '@wujiaming88/dsh-remote-ssh/files', kind: 'remote-files',
    title: () => locale.t('agents.filesTitle'), keepMounted: true }));
  slots.inject('sidebar.right.pane.tab', () => slots.register({ name: 'sidebar.right.pane.tab',
    key: '@wujiaming88/dsh-remote-ssh/files', locale: NAMESPACE }, RemoteFilesSidebar));
  ctx.effect(() => ctx.sidebarRight.registerCloseHandler('remote-files', assertFileCloseAllowed));

  slots.inject('main.conversation', () => {
    let live = true;
    let disposeMain = null;
    router = createBackendRouter({
      load: sessionId => api('sessionBackend', { sessionId }),
      show: active => {
        if (active && !disposeMain) disposeMain = slots.register({ name: 'main.conversation', priority: -100, locale: NAMESPACE,
          inject: () => ({ clients, trackSessionView, hooks: { remoteBackend: router, chatPreferences:ctx.configForms.get('ui-chat') }, refreshBackend: () => router.refresh(),
            beginNavigation: () => ctx.layout.beginNavigation(),
            createRemoteSession: options => ctx.sessions.create(options),
            openSession: id => ctx.uiWorkspace.openSession(id),
            toggleFiles: () => ctx.sidebarRight.isExpanded() ? ctx.sidebarRight.toggleExpanded() : ctx.sidebarRight.openTab('remote-files'),
            openRemoteFile: path => ctx.sidebarRight.openTab('remote-files', { params: { path } }),
          }) }, RemoteConversation);
        else if (!active && disposeMain) { const dispose = disposeMain; disposeMain = null; dispose(); }
      },
    });
    let identity = '', workspaceIdentity = '', projectionSource = null, disposeProjection = () => {};
    const current = ctx.uiSession.adapter.current;
    const refresh = force => {
      if (!live || !active) return;
      const id = current.getSnapshot().key || '';
      const row = ctx.sessions.list.getSnapshot().byId[id];
      // Public SessionFace projection source: the same Host-computed value used
      // by the standard useProjection hook, not a DOM or private-journal guess.
      const source = id ? ctx.sessions.binding(id)?.session.projections.faceOf(REMOTE_SESSION_PROJECTION_KEY) : null;
      if(source!==projectionSource){disposeProjection();projectionSource=source;disposeProjection=source?source.subscribe(()=>refresh(true)):()=>{};}
      const evidence={recorded:source?.getSnapshot()?.remote===true,blankWorkspace:knownRemoteBlank(row,catalog)};
      const next = `${id}\n${row?.cwd || ''}\n${row?.blank}\n${evidence.recorded}\n${evidence.blankWorkspace}`;
      if (force || next !== identity) { identity = next; router.select(id, true, evidence); }
    };
    refreshRoute=refresh;
    const workspaceChanged=()=>{
      if (!live || !active) return;
      const next=ctx.workspaces.list.getSnapshot().items.map(value=>`${value.workspaceId}:${value.path}`).join('\n');
      if(next!==workspaceIdentity){workspaceIdentity=next;void loadCatalog();}
      refresh(true);
    };
    const disposers = [current.subscribe(() => refresh(false)), ctx.sessions.list.subscribe(() => refresh(false)), ctx.workspaces.list.subscribe(workspaceChanged)];
    refresh(true);
    return () => { live=false;for (const dispose of disposers) dispose();disposeProjection();refreshRoute=()=>{};router.dispose();router=null; };
  });
}
export const inject = ['slots', 'locale', 'uiSession', 'sessions', 'workspaces', 'layout', 'sidebarRight', 'sidebarRightTabs', 'contextMenus', 'uiWorkspace', 'configForms'];
