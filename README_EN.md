# dsh-remote-ssh

English | [中文](./README.md)

Remote Claude Code / Codex conversations over SSH, integrated with DSH workspaces. **3.0.0-rc.3** implements one current DSH contract and a complete remote ACP runtime, without backward-compatibility layers.

> The plugin remains disabled. Re-enabling requires the user's explicit agreement. Offline tests are not GUI acceptance. If an earlier process retains a filesystem wrapper, restart DSH while the plugin stays disabled.

## Principles

- The ACP adapter, CLI, cwd, skills and MCP run together on the remote host.
- Workspaces provide defaults; each Session receives an immutable backend snapshot. Changing defaults does not rewrite existing Sessions.
- Local Sessions keep native Chat. Unknown metadata and unrelated remote failures cannot seize it. No filesystem/file-reference monkeypatches, terminal overrides, global fetch replacement or cross-plugin DOM mutation.
- Actual remote turns produce legitimate paired native `turn/start`, `user/message`, and `turn/end` records. Queuing is not execution. Native New Session can therefore distinguish a used remote Session from an eligible blank without placeholder events.
- The only model tool, `remote_session_status`, reads the executing Session's status. It cannot start an Agent, approve permissions, answer forms or change a backend.
- There are no local adapter wrappers, TUI/Shell panels, sync/write-back paths, old sidebar adapters, schema migrations or older-DSH fallbacks.

## Requirements

- DSH `0.2.2-rc.5`, local Node.js 22+.
- SSH key/ssh-agent or Kerberos/GSSAPI. Obtain a valid Kerberos ticket first when needed.
- Remote Node.js 22+, npm and bash; Python 3 for files/worktrees and Git for worktrees.
- Valid remote CLI authentication, proxy/model gateway and quota. Detecting an executable does not verify model access.

Pinned remote dependencies: ACP SDK `2.9.1`, Claude adapter `0.109.1`, Codex adapter `2.9.0`. Preparing them requires an explicit installation-plan confirmation. The default remote prefix is `~/.local/share/dsh-remote-acp/v1`; preparation uses no sudo, changes no shell configuration and does not install system Node.

## Use

1. In **Settings → Remote SSH**, create a key/Kerberos profile or select SSH config data and explicitly save it. Test the connection.
2. In **Add workspace → Remote workspace**, select a connection, directory and **Claude or Codex**. Accept edits is the default permission; Bypass requires confirmation.
3. Use the workspace's native **New Session** action. Confirmed remote Sessions open directly in the main conversation, without a global extra Agent tab.
4. When dependencies are missing, inspect and confirm **Prepare remote runtime**. Errors remain explicit; the plugin does not intentionally switch a confirmed remote conversation to a local execution backend.

Local directories use native DSH and its native directory picker. Remote workspaces do not offer a misleading DSH option that would merely operate on an empty local anchor.

### Chat

- Enter sends, Shift+Enter adds a newline. Drafts clear after Host acknowledgement.
- Model, reasoning and mode controls follow actual adapter capabilities and update after confirmation.
- In-turn input uses steering or the Host's serial queue. Unknown delivery is not blindly resent.
- Stop cancels execution/queued work without deleting history.
- Permission requests and form elicitation support choices, multiple selection and custom answers, including AskUserQuestion. Unsupported schemas decline explicitly; URL/OAuth elicitation is not advertised.
- `/` opens actual commands/skills; arrows select, Enter/Tab insert and Escape dismisses.
- `@` browses workspace files. A bounded snapshot is used both for actual ACP input and native durable recording.
- Text/images may be pasted or dropped, subject to capabilities and limits: 16 attachments, 1 MiB total text and 2 MiB total images.
- The transcript shows text, thoughts, tools, diffs, reads, terminal output, plans, usage and subagent/native events with turn and parent identity.

Terminal cards are output views, not interactive TTYs. Command and subagent controls are limited to what the adapters actually expose.

### Rename, pin and fork

The remote conversation header's native ellipsis menu provides **Rename / Pin (Unpin) / Fork**.

- Rename updates the same DSH Session and synchronizes the CLI using ACP `session/set_title`, using the returned normalized title. Native sidebar renames also synchronize; asynchronous failures produce a native notification that opens that session’s synchronization status. A remote failure does not pretend to roll back the committed DSH name; failed/unknown synchronization remains explicit. Cold/archived titles use a metadata-only connection, not new/resume/prompt.
- Pin uses the native WorkspaceRegistry's one persistent ordering; there is no second remote pin concept.
- Fork invokes the real remote `session/fork`, creates an independent remote identity/controller and then publishes a new inherited DSH conversation. It does not reconstruct context from a prompt or publish an empty shell. Actual model/reasoning/permissions are verified without escalation; pins and pending approvals are not copied.

Only the **latest whole context** is supported. The source must be idle, with no queued turns, approvals or configuration operations; unarchive it first if necessary. Forks share the working directory and do not copy files or create a worktree.

The native session-row menu additionally offers **Fork remote conversation**. DSH's ordinary Fork command/shortcut only clones its own log, so it is explicitly refused for remote conversations; local DSH forks are unchanged.

Persistent operation IDs distinguish remote completion from local publication. Recoverable failures reuse the same child rather than forking again. Unknown outcomes are not automatically retried; a new attempt requires explicit acknowledgement. Inherited events carry provenance and do not replay tools or create new native turns.

### Files and worktrees

The session sidebar provides remote browsing, text/image preview, editing, upload and download. Paths are resolved against the real Session workspace. Saves use SHA256 version checks and atomic publication; uploads need confirmation to overwrite. Downloads are limited to 64 MiB. Dirty editors block closure/navigation. Only PNG/JPEG/GIF/WebP are inlined as images, not HTML/SVG.

Workspace creation can explicitly create a Git worktree from a branch/base. The Host records ownership before exposing removal. Removal requires confirmation and no active Sessions; dirty worktrees are refused, with no force removal or branch deletion. Ordinary workspace unregistration preserves directories.

## Lifecycle and data

UI unmount only detaches browser subscriptions. generation/seq cursors and history pages support reconnection. Permission/form activity participates in native archive checks. Plugin shutdown reclaims connections but keeps recovery data; profile/workspace removal stops related instances without deleting histories or directories.

New data has explicit schema/version under the current profile's `data/remote-acp/v3/`. Existing user data is not deleted, but old formats are not read or migrated. Old remote workspaces must be added again.

## Structure

- [Host entry](./lib/index.js): routes, authorization, lifecycle and the read-only status tool.
- [Configuration](./lib/config.js), [SSH](./lib/ssh.js), [workspaces](./lib/workspaces.js), [bindings](./lib/bindings.js), [files](./lib/files.js).
- [ACP orchestration](./lib/acp.js), with separate core/config/events/requests/store/transport modules.
- [Native turn recorder](./lib/remote-turn-recorder.js): legitimate Session events and a deduplicating projection.
- [Client entry](./src/client/index.js), with independent settings, creation, conversation, state, files, controls and CSS modules.

The client imports only Host React, not private DSH UI packages. Controls follow DSH theme/interaction conventions. Markdown is a safe basic subset; full CommonMark and pixel-identical rendering are not claimed.

## Build and install

```bash
node build-client.mjs
node --test tests/*.test.mjs
```

`lib/client.js` is generated with one module factory. Install a candidate using DSH **Plugins → Add plugin → Local directory**; this document does not imply publication to npm/GitHub.

HTTP routes live under `/remote-ssh/v3/` and use one JSON envelope, current DSH authentication and resource authorization. The namespace is owner-only; old URLs, anonymous authorization and LiveShare fallbacks are not registered.

## Boundaries

- Journal pages currently use sequential disk scans, without automatic permanent-history deletion.
- Remote process survival after network/host failure depends on SSH and the CLI.
- No passwords, audio, arbitrary URI attachments, old-data migration or automatic per-session worktree allocation.
- DSH has no verified composable early rejection hook for native prompts. Normal plugin UI keeps the remote backend, but Host-level prevention of an owner directly invoking native `session/prompt` is not claimed. No private patch or late fake guard is installed.
- Real GUI mounting, focus and local-session isolation must be checked before re-enabling.

[MIT license](./LICENSE)

---

Original repository: [dsh-remote-ssh](https://github.com/ZhangFengshun/dsh-remote-ssh)
