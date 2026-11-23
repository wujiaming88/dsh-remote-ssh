# @wujiaming88/dsh-remote-ssh

English | [中文](./README.md)

Develop directly on remote machines inside DSH: SSH connections, remote workspaces, remote files and terminals, and Codex / Claude Code / Pi sessions on the remote machine — managed as **Chat**, **TUI**, or **Shell** sessions.

## Features

### SSH and workspaces

- **Three auth methods**: private key, **Kerberos (GSSAPI, no key/password)**, password; ProxyJump and one-click import from `~/.ssh/config`
- **Many connections at once**; remote directories with the same basename are disambiguated as `connection:path`
- **Remote workspaces**: turn a remote directory into a native DSH workspace; `@` completion lists remote files
- **Files and terminal**: the built-in Files tab reads/writes remote files over SSH (with `dsh-better-sidebar`); the Terminal tab opens in the workspace's remote directory
- **Sync and write-back**: whole-tree or scoped sync, upload/download, remote-freshness guard

### Remote agents (2.7.0)

A new right-sidebar **Remote Agents** tab detects installed agents and manages sessions:

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

### Model tools

13 `remote_ssh_*` tools: `profiles` / `exec` / `kill` / `ls` / `cat` / `write` / `grep` / `glob` / `mkdir` / `delete` / `move` / `sync` / `push`. Inside a remote-workspace session the connection parameters can be omitted; commands have timeouts, cancellation, and session pooling.

## Install

```bash
# npm (once published)
dsh plugin --profile <name> add @wujiaming88/dsh-remote-ssh@2.7.2

# or GitHub
dsh plugin --profile <name> add github:wujiaming88/dsh-remote-ssh
```

Restart DSH after installing. Remote read/write in the Files tab needs `dsh-better-sidebar`; without it the settings page, model tools, terminal and the Agents panel still work (TUI/Shell need `tmux` remotely).

## Quick start

1. **Settings → Remote Connections**: add host/port/user/auth → Test Connection; import from `~/.ssh/config` if present
   - Kerberos: `kinit <principal>` first, then choose **Kerberos (GSSAPI)**
2. **Add Workspace → Select Remote Directory**: pick a connection, browse, create the native workspace
3. Inside it, edit files in the Files tab and open the Terminal tab in the remote directory
4. **Right sidebar → `+` → Remote Agents** (or Settings → Remote Connections → Open Agents Panel): choose a connection, refresh detection, pick mode (Chat / TUI / Shell) and directory, then create a session

## Using agent sessions

- **Chat**: type in the composer; replies appear as message bubbles. Choose the permission when creating
- **TUI**: send text from the composer and use the Keys menu for arrows/Esc/Ctrl-C; best for agents that need their full interactive UI
- **Shell**: a plain login shell
- Sessions are recorded in `~/.dsh/remote-ssh/agent-sessions.json`; TUI/Shell processes live in tmux and can be attached over SSH with `tmux attach -t dsh-rs-*`

### Cancel, timeout, and kill

The stop button or `remote_ssh_kill` best-effort sends `SIGHUP` to the remote process group. `timeoutMs` on `remote_ssh_exec` is only a **local wait budget**: when it expires the plugin abandons the wait and **does not terminate the remote command** (use the remote `timeout` command for a hard limit). A timed-out pooled session is discarded and rebuilt on the next call.

## Compatibility

- Verified DSH: `0.2.2-rc.5` (peer range names `^0.2.2-rc.5` explicitly)
- Optional: `dsh-better-sidebar` (remote Files tab/editor)
- Remote: standard sshd + `tmux` (agent TUI/Shell); git (worktrees)

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Kerberos auth fails | Check `klist`; run `kinit <principal>`; ensure the profile user matches the principal; remote sshd needs `GSSAPIAuthentication yes` |
| Test Connection says the key file is missing | Fix `keyPath`, or clear it to rely on ssh-agent / `~/.ssh/config` |
| Remote agents unavailable | Install `tmux`; sign in to the agent once over an SSH terminal |
| Agents panel is missing | Refresh the page; open it from the right-sidebar `+` guide or Settings → Open Agents Panel |
| Files tab cannot read remote files | Install `dsh-better-sidebar`; a standalone install degrades that tab |
| Command timing out | `timeoutMs` on `remote_ssh_exec` is a local wait budget; use `timeoutMs: 0` for long jobs and remote `timeout` for a hard limit |

## License

[MIT](./LICENSE)

---

Original repository: [dsh-remote-ssh](https://github.com/ZhangFengshun/dsh-remote-ssh)
