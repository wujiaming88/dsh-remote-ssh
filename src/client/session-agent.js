import React from 'react';
import {h,NAMESPACE} from './shared.js';
import {agentMask,AGENT_ICON_NAMES} from './agent-icon.js';

/** Hidden trailing marker; CSS paints the agent mark before the native title. */
export function RemoteSessionAgentMark({sessionId, useRemoteSessionStatuses}) {
  const agent = useRemoteSessionStatuses(snapshot => snapshot.byId[sessionId]?.agent);
  const marker = React.useRef(null);
  React.useEffect(() => {
    const row = marker.current?.closest('[role="treeitem"]');
    const title = row?.querySelector('[class*="_title_"]') || row?.children?.[1];
    if (!title || !agent || !AGENT_ICON_NAMES[agent]) return;
    const icon = document.createElement('span');
    icon.className = 'rssh-agent-title-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.style.maskImage = agentMask(agent);
    icon.style.webkitMaskImage = agentMask(agent);
    title.insertBefore(icon, title.firstChild);
    title.dataset.rsshAgent = agent;
    return () => {
      icon.remove();
      delete title.dataset.rsshAgent;
    };
  }, [agent]);
  return h('span', { ref: marker, hidden: true, 'aria-hidden': 'true', 'data-rssh-agent-marker': agent || '' });
}

/** Trailing owns the marker without taking the leading status cell. */
export function installSessionAgentMark(ctx, store) {
  return ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
    name: 'sidebar.session.row.trailing',
    id: 'remote-ssh.agent',
    order: -100,
    locale: NAMESPACE,
    inject: () => ({ hooks: { remoteSessionStatuses: store } }),
  }, RemoteSessionAgentMark));
}
