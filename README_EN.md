# dsh-remote-ssh

English | [中文](./README.md)

Remote Claude Code / Codex conversations over SSH, integrated with DSH workspaces. **3.0.0-rc.22** implements one current DSH contract and a complete remote ACP runtime, without backward-compatibility layers.

> Offline tests are not GUI acceptance; dark/light theme, focus and pixel-level appearance still need manual verification in a browser.

## Current capabilities

- **Remote Claude Code / Codex**: connect over SSH or Kerberos/GSSAPI and execute in the actual remote working directory, without taking over local DSH conversations.
- **Native-style conversations**: locally adapt message, tool-row, composer and attachment views from distributed DSH 0.2.2-rc.5 source. Action names sit next to paths, and only the final reply of each authoritatively completed turn has a message-copy icon. Copy controls appear on hover or keyboard focus on hover-capable devices and stay visible on devices without hover support.
- **Conversation controls**: streaming, permission and form requests, model/mode selection, send/stop, history loading, reconnect, and remote-session rename, pin and fork.
- **Attachments and files**: text, images and ordinary files; ordinary files upload on Send and provide verified remote-path references. Remote file browsing, editing, upload/download and optional Git worktrees are also supported.
- **Durable execution and message delivery**: newly created durable tasks keep their remote owner across local network loss or Host exit, with native steering and removable queued input. When “Prevent system sleep while running” is enabled, the Host continuously holds a local sleep assertion (macOS `caffeinate -i -m -s`, Linux `systemd-inhibit`) whether or not any remote turn is running. A locked screen on power can keep working; turning the switch off releases it. It may use more power while enabled. Lid-close sleep, power loss or forced system sleep can still stop the local Host, but never cancel the remote task. Finish legacy tasks before upgrading; see [recovery and upgrade boundaries](<docs/DURABLE_EXECUTION.md>) and [delivery contracts](<docs/MESSAGE_DELIVERY.md>).
- **Factual status**: turn status and elapsed time, context occupancy and unread-completion indicators, without inventing statistics absent from the protocol.

Version **3.0.0-rc.22** passes **1005 automated tests**, the **83-module client build** and the **11-module remote worker build**. Real GUI visual and interaction acceptance remains pending.

[Changelog](./CHANGELOG.md) · [Native UI sources and adaptation boundaries](./docs/NATIVE_UI.md)

## Principles

- The ACP adapter, CLI, cwd, skills and MCP run together on the remote host.
- Workspaces store connections and directories, not Agent defaults. Explicitly choose an Agent and permissions in each new Session; the selection is immutable. Claude and Codex Sessions can share a workspace without changing existing bindings.
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
2. In **Add workspace → Remote workspace**, select only a connection, directory and optional owned worktree, without choosing an Agent.
3. Use the workspace's native **New Session** action. Choose **Claude Code / Codex** and permissions in the main conversation, then click **Start session**. Accept edits is the default permission; Bypass requires explicit confirmation. No remote Agent starts or workspace default binds before selection.
4. When dependencies are missing, inspect and confirm **Prepare remote runtime**. Errors remain explicit; the plugin does not intentionally switch a confirmed remote conversation to a local execution backend.

After selecting an Agent, **New session** in the conversation header creates an independent session in the same workspace and lets you choose another Agent, preserving the current session. Unlike the native workspace entry, it does not reuse an already-selected blank that has not sent its first message.

Local directories use native DSH and its native directory picker. Remote workspaces do not offer a misleading DSH option that would merely operate on an empty local anchor.

### Chat

- Enter / the primary send button use DSH's native `busyEnter` preference: Queue by default while running. Ctrl/Cmd+Enter uses the other mode (Steer by default); Shift+Enter adds a newline. Drafts clear after Host acknowledgement.
- While running, the primary button becomes an icon Stop instead of the text button; a non-empty draft keeps Send/Steer.
- Model, reasoning and mode controls follow actual adapter capabilities and update after confirmation.
- Explicit Queue uses the durable remote owner's FIFO; native Steer reaches Codex `turn/steer` or Claude Code streaming input without cancel-and-resend. The native-style queue supports viewing/removing unsubmitted messages. Unsupported or expired steering retains the draft rather than silently queueing; unknown outcomes retry the original ID/mode. See [delivery contracts](<docs/MESSAGE_DELIVERY.md>).
- Stop cancels execution/queued work without deleting history.
- The remote file sidebar shows VS Code-style language/config/image glyphs. Code and config files open in a syntax-highlighted read-only preview, Markdown renders, JSON is formatted, common raster images preview inline, and every text file can switch back to source editing.
- Permission requests and form elicitation support choices, multiple selection and custom answers, including AskUserQuestion. Unsupported schemas decline explicitly; URL/OAuth elicitation is not advertised.
- `/` opens actual commands/skills; arrows select, Enter/Tab insert and Escape dismisses. The command roster is restored from the session snapshot, so it survives long/resumed sessions.
- `@` browses workspace files. Text/image references use a bounded snapshot both for actual ACP input and native durable recording. This snapshot picker does not read archives or other binary content; for an ordinary file already on the remote host, include its path in the message.
- Select with “+”, drop, or paste files. Text/images retain their existing input flow and image capability checks. Other ordinary files (ZIP, PDF, Office, audio/video, etc.) upload only when Send is clicked, then contribute a remote-path text reference—not binary/base64 model input.
- Up to 16 attachments per message: 1 MiB total text, 2 MiB total images; other files are limited to 64 MiB each and 256 MiB combined. Uploaded files live under the remote workspace's `.dsh-attachments/<session scope>/<upload ID>/<safe filename>` without overwriting same-name files. Transfer support does not guarantee the remote parsing tools are installed.
- Cards show pending/uploading/uploaded/failed states. Failures retain drafts; retry reuses upload IDs and confirmed receipts. Queue and Steer share attachment authorization/admission checks. Native steering accepts only validated supported content; unsupported content is explicitly rejected and the draft remains available for queued send. Selecting does not upload; the plugin never automatically extracts or executes files. Removing a card does not delete remote files already uploaded.
- Unsent files and upload receipts remain in page-process memory across session switches, not in localStorage. Refreshing or closing the application does not restore local File objects; text drafts remain persisted. References are checked by size and SHA-256 before admission: moved/modified files cause explicit failure, not overwrite. If an earlier submission had an unknown outcome, check history first; a reference-validation failure does not establish that the earlier message was never delivered.
- The transcript uses native presentation: user messages are right-aligned bubbles, assistant text is full-width; thoughts, tool calls, subagents, plans, terminals, session messages, notices and compaction are lightweight disclosure rows with turn/parent identity.

### Native stream and composer

- Each turn has one process group containing reasoning, tools and intermediate assistant updates. Only its final reply after authoritative completion is shown separately; cancelled/interrupted turns do not fabricate a final answer. User messages and warnings remain visible, and process content is retained. Streaming follows the transcript tail, scrolling up pauses following, and history prepend keeps position via a stable anchor. Expanded process history uses a bounded scroll area to keep long outputs from filling the page.
- Compact tool rows place the native action icon and name next to the path/summary without repeating the path. Assistant text keeps only the icon that copies the current segment.
- Thinking renders as a "think icon + single-line summary + chevron" with a soft shimmer while streaming; expanding shows the full content without resetting on stream updates.
- Below the composer, a native ContextMeter-style context ring (click-open: percent, `~used / capacity` and a bar) plus a session-statistics pill (turn count, elapsed time); no hover icon and no session path/ID.
- Tool/subagent/plan rows show only a summary when collapsed and mount Diff/Read/Terminal or a structured result when expanded; raw payloads sit in a secondary "Raw details" disclosure.

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

- Switching views or closing the browser does not cancel remote work. The plugin keeps two recent browser clients warm; inactive clients expire after 10 minutes or are evicted by LRU, while mounted readers remain protected.
- Unsequenced Host heartbeats arrive every 15 seconds. After 45 seconds without a frame the browser subscription reconnects from its cursor with 1–10-second backoff. Accepted HTTP backpressure waits for drain instead of manufacturing a reconnect; each subscription has a 64 MiB pending budget and a 10-second stalled-drain deadline. Delayed history/action snapshots cannot replace newer same-cursor control state. Message-stream reattachment/recovery is labelled separately from remote SSH recovery. Heartbeats do not prove remote Agent health; missing runtimes or denied access require explicit retry.
- Draft attachments and uncertain request metadata survive view changes and connection eviction within this client-plugin lifetime; only draft text is persisted. ACKs reconcile matching inputs without clearing later edits. Manual retries of uncertain sends retain the original request ID and operation. Plugin/page teardown loses in-memory attachments and pending metadata; identity changes or access revocation clear the corresponding cache.
- Scroll near the top to load earlier pages using wheel, scrollbar, keyboard or touch. There is no routine Load earlier button; errors expose an explicit retry. Anchors are captured just before history publication, rather than using total height growth from independent tail output. No-progress pages stop; short/invisible pages continue for at most three loads per renewed reading gesture.
- Permission/form activity participates in native archive checks. Plugin shutdown reclaims connections but keeps recovery data; profile/workspace removal stops related instances without deleting histories or directories.

New data has explicit schema/version under the current profile's `data/remote-acp/v3/`. Existing user data is not deleted, but old formats are not read or migrated. Old remote workspaces must be added again.

## Structure

- [Host entry](./lib/index.js): routes, authorization, lifecycle and the read-only status tool.
- [Configuration](./lib/config.js), [SSH](./lib/ssh.js), [workspaces](./lib/workspaces.js), [bindings](./lib/bindings.js), [files](./lib/files.js).
- [ACP orchestration](./lib/acp.js), with separate core/config/events/requests/store/transport modules.
- [Native turn recorder](./lib/remote-turn-recorder.js): legitimate Session events and a deduplicating projection.
- [Client entry](./src/client/index.js), with independent settings, creation, conversation, state, files, controls and CSS modules.

The client imports only Host React, not Harness Client UI packages. Base controls and icons are copied from the installed DSH release and locally adapted with plugin-owned classes; existing public native factories remain in use. Markdown adopts native typography but retains the safe basic parser; full CommonMark and pixel-identical rendering are not claimed. See [source, license and adaptation details](./docs/NATIVE_UI.md).

## Build and install

```bash
npm run build
npm test
```

`lib/client.js` is generated with one module factory. Install a candidate using DSH **Plugins → Add plugin → Local directory**; Git commits and version tags do not imply an npm release; verify the actual package source and version before installation.

HTTP routes live under `/remote-ssh/v3/` and use one JSON envelope, current DSH authentication and resource authorization. The namespace is owner-only; old URLs, anonymous authorization and LiveShare fallbacks are not registered.

## Boundaries

- Journal pages currently use sequential disk scans, without automatic permanent-history deletion.
- SSH loss or a local Host restart does not cancel a durable remote owner. Remote machine reboot, owner/adapter crash, and login policies that kill an entire cgroup are different failures: an unknown owner is never automatically replaced. Same-UID/root processes remain trusted; no user service or linger setting is enabled implicitly. See [execution, recovery and resource limits](<docs/DURABLE_EXECUTION.md>).
- No password authentication, native ACP audio content blocks, arbitrary URI attachments, old-data migration or automatic per-session worktree allocation. Audio/video files can upload as ordinary files, but remote parsing capabilities are not guaranteed.
- ACP reports only `used/size/cost`: no system/tools/messages context breakdown, per-turn input/output/cache tokens, tokens-per-second or LLM/tool timing. The UI shows current-context tokens, a single occupancy segment, turn count and running state; session age appears in statistics details, not as execution time. Cost data is not displayed, and missing native metrics are not fabricated.
- There is no public general-purpose Markdown factory, so body text uses the plugin's own safe Markdown subset (no HTML execution, no inline executable documents); full CommonMark is not claimed.
- DSH has no verified composable early rejection hook for native prompts. Normal plugin UI keeps the remote backend, but Host-level prevention of an owner directly invoking native `session/prompt` is not claimed. No private patch or late fake guard is installed.
- Real GUI dark/light theme, focus, keyboard and pixel-level appearance have not been manually verified.

[MIT license](./LICENSE)
