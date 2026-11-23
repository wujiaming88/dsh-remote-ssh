# @wujiaming88/dsh-remote-ssh

English | [中文](./README.md)

Develop directly on remote machines inside DSH: SSH connections, remote workspaces, remote files and terminals, and Claude Code / Codex agents running remotely — create a session through the native **New Session / ⌘N → SSH** flow, then switch to the **Remote Agent** tab.

## Features

### SSH and workspaces

- **Three auth methods**: private key, **Kerberos (GSSAPI, no key/password)**, password; ProxyJump and one-click import from `~/.ssh/config`
- **Many connections at once**; remote directories with the same basename are disambiguated as `connection:path`
- **Remote workspaces**: turn a remote directory into a native DSH workspace; `@` completion lists remote files
- **Files and terminal**: the built-in Files tab reads/writes remote files over SSH (with `dsh-better-sidebar`); the Terminal tab opens in the workspace's remote directory
- **Sync and write-back**: whole-tree or scoped sync, upload/download, remote-freshness guard

### ACP Chat (resident session View)

Create a session through the native **New Session / ⌘N** flow: choose **SSH** in the DSH workspace picker, pick a remote workspace,
then switch to the **Remote Agent** tab in the session. The View binds the current DSH session (`dshSessionId`):
on mount it calls `acpList({dshSessionId})` and `acpResume` when a record exists; otherwise it shows setup inside the View.

1. Setup defaults to the current session's **remote workspace** (`useWorkspaces.sessionIds` + `mirrorPath`); you can still change connection/workspace
2. Pick an agent (Claude Code / Codex) and permission level (Accept edits / Plan / Bypass) → **Start session** (`acpStart` with `dshSessionId`)

> The Add Workspace → SSH remote dialog also offers **Session agent** (DSH default / Claude Code / Codex); later sessions preselect it in the Remote Agent view.
3. Switching views or refreshing restores the session; **switching views never ends it**

The View renders Markdown text, tool/native/subagent cards, model / reasoning / mode selectors (`acpSetConfig` / `acpSetMode`),
in-turn steering (`acpSteer`), Stop (`acpCancel`, current turn only), HITL permission cards, session list/resume (`acpList` / `acpResume`)
and End session (`acpClose`, confirmed).

- **Files**: the top Files button opens the existing remote file panel (listDir / readFile / upload / download), text and image preview, defaulting to the session `remotePath`
- **Commands / skills**: the ACP `commands` list becomes a searchable, grouped panel that inserts `/name` or Codex `/skills` into the composer, with description and input hint; sending is an ordinary message
- **Lifecycle**: no Modal shell; switching views/refresh does not call `acpClose`; only End session removes the record

Host side: a local ACP adapter (Claude Code / Codex) plus a generated SSH wrapper drives the remote agent and streams NDJSON events. Native/subagent events are surfaced too: Claude `_meta.claudeCode.parentToolUseId` becomes `parentToolCallId`; `Agent`/`Task` tools and `<task-notification>` messages become subagent cards; Codex `subagent_update`, `state_update`, `session_message`, terminal and usage events pass through; each card can expand its truncated native `_meta` JSON.

### Model tools

13 `remote_ssh_*` tools: `profiles` / `exec` / `kill` / `ls` / `cat` / `write` / `grep` / `glob` / `mkdir` / `delete` / `move` / `sync` / `push`. Inside a remote-workspace session the connection parameters can be omitted; commands have timeouts, cancellation, and session pooling.

## Install

```bash
# npm (once published)
dsh plugin --profile <name> add @wujiaming88/dsh-remote-ssh@2.13.2

# or GitHub
dsh plugin --profile <name> add github:wujiaming88/dsh-remote-ssh
```

Restart DSH after installing. Remote read/write in the Files tab needs `dsh-better-sidebar`; without it the settings page, model tools, terminal and ACP Chat still work (the legacy TUI/Shell panel is no longer reachable and needs `tmux` remotely).

## Quick start

1. **Settings → Remote Connections**: add host/port/user/auth → Test Connection; import from `~/.ssh/config` if present
   - Kerberos: `kinit <principal>` first, then choose **Kerberos (GSSAPI)**
2. **Add Workspace → Select Remote Directory**: pick a connection, browse, create the native workspace
3. Inside it, edit files in the Files tab and open the Terminal tab in the remote directory
4. **New Session / ⌘N → SSH → remote workspace**: open the session, switch to the **Remote Agent** tab; the View defaults to the current remote workspace, then pick agent / permission and start

## Using agent sessions

- **Create**: New Session / ⌘N → SSH → remote workspace → switch to the **Remote Agent** tab → confirm connection/workspace → start
- **Chat**: Enter sends, Shift+Enter inserts a newline; while a turn runs the Send action becomes **Steer**, delivering immediately without waiting for the turn to end
- **Permissions**: when a tool asks, a permission card appears; allow once / always / reject exactly as the adapter offers, or Dismiss to send `cancelled`. Bypass is auto-approved by the Host
- **Model / reasoning / mode**: selectors at the top of the View apply to the live session
- **Stop / end**: Stop cancels only the current turn; End session is confirmed and removes it (no resume afterwards); switching views/refresh keeps the session resumable
- **Files / commands**: the top Files button browses the remote directory; the Commands button opens the searchable/grouped panel for `/name` and `/skills`
- Legacy sessions are still recorded in `~/.dsh/remote-ssh/agent-sessions.json`; TUI/Shell processes live in tmux and can be attached with `tmux attach -t dsh-rs-*`

### Cancel, timeout, and kill

The stop button or `remote_ssh_kill` best-effort sends `SIGHUP` to the remote process group. `timeoutMs` on `remote_ssh_exec` is only a **local wait budget**: when it expires the plugin abandons the wait and **does not terminate the remote command** (use the remote `timeout` command for a hard limit). A timed-out pooled session is discarded and rebuilt on the next call.

## Compatibility

- Verified DSH: `0.2.2-rc.5` (peer range names `^0.2.2-rc.5` explicitly)
- Optional: `dsh-better-sidebar` (remote Files tab/editor)
- Remote: standard sshd; `claude` / `codex` installed and signed in (ACP Chat). The legacy TUI/Shell panel additionally needs `tmux`; git (worktrees)

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Kerberos auth fails | Check `klist`; run `kinit <principal>`; ensure the profile user matches the principal; remote sshd needs `GSSAPIAuthentication yes` |
| Test Connection says the key file is missing | Fix `keyPath`, or clear it to rely on ssh-agent / `~/.ssh/config` |
| Detect cannot find an agent | Sign in to `claude` / `codex` once over an SSH terminal, then Detect again (checks PATH, login shell and common install dirs) |
| The Remote Agent tab is missing | Make sure the session came from an SSH remote workspace; refresh the page, then switch to the tab (`conversation.view`) |
| Files tab cannot read remote files | Install `dsh-better-sidebar`; a standalone install degrades that tab |
| Command timing out | `timeoutMs` on `remote_ssh_exec` is a local wait budget; use `timeoutMs: 0` for long jobs and remote `timeout` for a hard limit |

## License

[MIT](./LICENSE)

---

Original repository: [dsh-remote-ssh](https://github.com/ZhangFengshun/dsh-remote-ssh)
