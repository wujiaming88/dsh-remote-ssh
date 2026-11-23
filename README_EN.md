# @wujiaming88/dsh-remote-ssh

English | [中文](./README.md)

Develop directly on remote machines inside DSH: SSH connections, remote workspaces, remote files and terminals, and Claude Code / Codex agents running remotely — open **Remote Agent** on the New Session page to chat over ACP.

## Features

### SSH and workspaces

- **Three auth methods**: private key, **Kerberos (GSSAPI, no key/password)**, password; ProxyJump and one-click import from `~/.ssh/config`
- **Many connections at once**; remote directories with the same basename are disambiguated as `connection:path`
- **Remote workspaces**: turn a remote directory into a native DSH workspace; `@` completion lists remote files
- **Files and terminal**: the built-in Files tab reads/writes remote files over SSH (with `dsh-better-sidebar`); the Terminal tab opens in the workspace's remote directory
- **Sync and write-back**: whole-tree or scoped sync, upload/download, remote-freshness guard

### Remote agents (2.7.0 legacy panel)

> From the next release the entry point is **ACP Chat** on the New Session page. The right-sidebar **Remote Agents** tab and the Settings "Open Agent Panel" button are gone. The TUI / Shell / headless-chat code remains in the repo but is no longer registered anywhere in the UI.

The 2.7.0 right-sidebar panel detected installed agents and managed sessions:

| Capability | Detail |
| --- | --- |
| Detection | One SSH probe for `codex` / `claude` / `pi`, versions, `tmux`, `git`; clear install hints when missing |
| Chat | Headless structured chat: Claude `-p --output-format json`, pi `-p --mode json`, codex `exec --json`; resumes via the CLI session id and persists messages |
| TUI | The agent's interactive UI runs in remote tmux (`dsh-rs-*`); the panel replays output and forwards input; survives disconnects/restarts |
| Shell | Remote login shell, also in tmux |
| Permission | Per Chat session: `Plan` (read-only), `Accept edits` (default), `Bypass` (dangerous) |
| Sessions | List, switch, key menu (arrows/Esc/Ctrl-C), stop |
| Files | Browse remote directories, preview text/images, stream upload, download |
| Worktree | List `git worktree`, or create a branch worktree as the session directory |

Agents must be signed in once on the remote host (e.g. `claude` / `pi` first-run auth). TUI/Shell sessions require `tmux` on the remote.

### ACP Chat

On the **New Session** page, click **Remote Agent** in the options row to open a large DSH Modal:

1. Pick a connection → **Detect** to find remote Claude Code / Codex (`acpAgents`)
2. Pick a remote workspace (fills `mirrorPath` / `remotePath`) or enter `mirrorCwd`
3. Pick an agent and permission level (Accept edits / Plan / Bypass) → **Start session** (`acpStart`)

The chat renders Markdown text, tool cards (DiffBlock / TerminalBlock / ReadBlock), plans and commands, model / reasoning / mode selectors
(`acpSetConfig` / `acpSetMode`), in-turn steering (`acpSteer`, shown immediately), Stop (`acpCancel`), HITL permission cards
(adapter options returned verbatim as optionId; never auto-approved except Host-side Bypass), session list/resume (`acpList` / `acpResume`),
and End session (`acpClose`). Esc closes the Modal; while a turn is running it asks first.

Host side: a local ACP adapter (Claude Code / Codex) plus a generated SSH wrapper drives the remote agent and streams NDJSON events.

### Model tools

13 `remote_ssh_*` tools: `profiles` / `exec` / `kill` / `ls` / `cat` / `write` / `grep` / `glob` / `mkdir` / `delete` / `move` / `sync` / `push`. Inside a remote-workspace session the connection parameters can be omitted; commands have timeouts, cancellation, and session pooling.

## Install

```bash
# npm (once published)
dsh plugin --profile <name> add @wujiaming88/dsh-remote-ssh@2.8.0

# or GitHub
dsh plugin --profile <name> add github:wujiaming88/dsh-remote-ssh
```

Restart DSH after installing. Remote read/write in the Files tab needs `dsh-better-sidebar`; without it the settings page, model tools, terminal and ACP Chat still work (the legacy TUI/Shell panel is no longer reachable and needs `tmux` remotely).

## Quick start

1. **Settings → Remote Connections**: add host/port/user/auth → Test Connection; import from `~/.ssh/config` if present
   - Kerberos: `kinit <principal>` first, then choose **Kerberos (GSSAPI)**
2. **Add Workspace → Select Remote Directory**: pick a connection, browse, create the native workspace
3. Inside it, edit files in the Files tab and open the Terminal tab in the remote directory
4. **New Session → Remote Agent**: choose a connection → Detect → pick a remote workspace → pick agent / permission → Start session; then chat, steer, stop or resume inside the Modal

## Using agent sessions

- **Create**: New Session → Remote Agent → connection → Detect → remote workspace (or `mirrorCwd`) → agent / permission → Start
- **Chat**: Enter sends, Shift+Enter inserts a newline; while a turn runs the Send action becomes **Steer**, delivering immediately without waiting for the turn to end
- **Permissions**: when a tool asks, a permission card appears; allow once / always / reject exactly as the adapter offers, or Dismiss to send `cancelled`. Bypass is auto-approved by the Host
- **Model / reasoning / mode**: selectors at the top of the chat apply to the live session
- **Stop / end**: Stop cancels the current turn; End session removes it (no resume afterwards); closing the Modal only stops a running turn and keeps the session resumable under Saved sessions
- **Files**: diff/terminal/read tool cards render via DiffBlock / TerminalBlock / ReadBlock; the Files button in the chat header browses the remote directory
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
| The Remote Agent button is missing | Refresh the page; it lives on the New Session page (`conversation.hero.options`) |
| Files tab cannot read remote files | Install `dsh-better-sidebar`; a standalone install degrades that tab |
| Command timing out | `timeoutMs` on `remote_ssh_exec` is a local wait budget; use `timeoutMs: 0` for long jobs and remote `timeout` for a hard limit |

## License

[MIT](./LICENSE)

---

Original repository: [dsh-remote-ssh](https://github.com/ZhangFengshun/dsh-remote-ssh)
