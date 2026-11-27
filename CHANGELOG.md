# Changelog

## 3.0.0-rc.54 — one fork entry, remote-safe

- The native **Fork Session** action and `⌘F` shortcut now route remote Sessions through the Host ACP `sessionFork` path. Native local Sessions still use DSH's original fork.
- Removed the duplicate **Fork remote conversation** row-menu entry; the remote terminate action stays.
- This avoids the native remote fork child entering “backend snapshot missing” state, because the native fork action no longer creates that DSH-only child for remote Sessions.
- Plugin tests: **1078/1078**.

## 3.0.0-rc.53 — faster reconnect and cached transcript
## 3.0.0-rc.53 — faster reconnect and cached transcript

- Reconnect retry delays changed from `1s/2s/5s/10s` to `0.5s/1s/2s/4s`; re-attaching an established owner now has a **25s** handshake budget instead of 75s (cold starts keep 75s).
- The client keeps the cached transcript visible during `acpResume`; only a genuinely cold Session shows the full-page “正在启动远端 Agent” loader.
- Measured real SSH-drop reconnect after the change: Claude **4.8s**, Codex **3.2s**, Pi **3.4s** (before: 6.8s, 4.4s, 4.3s). Real Host restart attach is ~3.1–3.6s; SSH/Kerberos handshake alone is ~2.0–2.3s.
- Remaining costs and plan: SSH ControlMaster/ControlPersist (~2s auth), lower reconnect `ConnectTimeout`, and lazy/command-digest attach for Claude’s large command roster.
- Plugin tests: **1077/1077**.

## 3.0.0-rc.52 — native history fork is allowed
## 3.0.0-rc.52 — native history fork is allowed

- Native **Fork Session** no longer rejects a seeded remote-origin Session with `remote_fork_required`. It now creates a DSH-only child that copies the native transcript; it deliberately carries no remote CLI execution context and gets no remote backend binding.
- Remote **Fork remote conversation** remains the separate path that creates an ACP child and validates the remote fork proof.
- Plugin tests: **1077/1077**.

## 3.0.0-rc.51 — agent marks before session titles
## 3.0.0-rc.51 — agent marks before session titles

- Add 14px monochrome agent marks before remote Session titles in the sidebar: Claude/Anthropic, Codex/OpenAI and Pi.
- The mark is inserted at the title start (not in the `sidebar.session.row.leading` status cell) through a hidden trailing marker; the title text starts after the icon. It follows DSH label colors and theme.
- Sources: Simple Icons Anthropic/OpenAI (CC0) and the official `pi.dev/logo-auto.svg` geometric mark.
- Plugin tests: **1077/1077**.

## 3.0.0-rc.50 — Host-level fork validated for all three agents
## 3.0.0-rc.50 — Host-level fork validated for all three agents

- Pi's lack of an ACP session mode is no longer treated as an unconfirmed source/child permission during fork. Pi source and child permission snapshots now persist as the requested safe backend permission.
- Real DSH Host durable fork E2E passed for **Claude Code, Codex and Pi**:
  - Claude: source `a25b4d50…` → child `ebffc0b5…`, `completed/completed`, child `end_turn`
  - Codex: source `01a21b80…` → child `8b71a45a…`, `completed/completed`, child `end_turn`
  - Pi: source `01a21b81…` → child `54daf19f…`, `completed/completed`, child `end_turn`
  - all three printed `HOST_FORK_OK`
- This validates the real Host path: durable runtime → SSH → ACP `session/fork` → native fork seed → child remote prompt, not just adapter-level calls.
- Plugin tests: **1076/1076**.

## 3.0.0-rc.49 — Pi fork and cross-agent fork validation
## 3.0.0-rc.49 — Pi fork and cross-agent fork validation

- Pi now implements ACP `session/fork` via `pi --fork <session>`, advertises `sessionCapabilities.fork`, and returns a distinct forked session. Pi adapter version **0.2.0**.
- Real fork E2E passed for all three adapters on the remote host: source prompt succeeded, a distinct child session was created, and the child answered its own prompt:
  - Claude Code: source `ccc9dee1…` → forked `792000dd…`
  - Codex: source `01a21b7b-3f2f…` → forked `01a21b7b-6615…`
  - Pi: source `01a21b7a-c4be…` → forked `01a21b7a-d91f…`
- Post-fork child prompts returned `FORK_CHILD_OK` for each agent.
- Adapter unit line coverage **98.6%**. Plugin tests remain **1076/1076**.
- The Host-level durable fork still needs a successful end-to-end run through the UI; the previous stuck reservation and unclosable dialog are fixed in rc.48.

## 3.0.0-rc.48 — fork cannot wedge the page
## 3.0.0-rc.48 — fork cannot wedge the page

- Remote fork reservation/release RPCs now time out after 20s instead of waiting forever on an unresponsive durable worker. A timed-out fork is recorded as `unknown` and is never automatically retried.
- The fork dialog can be closed while the request is in flight; the operation continues/recovery metadata is preserved, and the page is no longer trapped behind a disabled modal.
- Plugin tests: **1076/1076**. This change is covered by unit/build tests; a real successful remote fork E2E is still required before claiming the fork path is healthy.

## 3.0.0-rc.47 — slash commands survive old-session snapshots
## 3.0.0-rc.47 — slash commands survive old-session snapshots

- A resumed/old Session could have its locally replayed command roster overwritten by an empty `commands` array from a snapshot, leaving `/` with no menu. Snapshot hydration now preserves a non-empty roster when the snapshot omits it.
- The command panel is also derived directly from a slash-prefixed draft (with Escape dismissal), so a stale `commandOpen` flag cannot hide the menu.
- Plugin tests: **1076/1076**.

## 3.0.0-rc.46 — native-style remote quote chips
## 3.0.0-rc.46 — native-style remote quote chips

- Remote selection quotes now render as composer quote chips (`“ summary`) instead of inserting raw `> ...` text into the editor, matching the native DSH composer shape.
- Quote text and editable draft are separate state: the chip shows a compact summary, the sent prompt still contains the full Markdown blockquote, and quotes participate in retry identity. Chips can be removed before sending and survive draft persistence within the session.
- Quote-only sends and quote+draft sends work through prompt/queue/steer without adapter changes.
- Plugin tests: **1076/1076**.

## 3.0.0-rc.45 — visible remote quote action
## 3.0.0-rc.45 — visible remote quote action

- The remote ChatPane does not render DSH's native text-interaction slot, so bridging `insertQuote` alone left no visible quote action. Added a remote selection action: selecting nonblank transcript text shows **引用文本 / Quote text**, which inserts the selection as a Markdown blockquote at the remote composer caret or replaces the selected draft span.
- The action is scoped to the remote transcript, ignores composer/picker selections, clears on scroll, and preserves the selection while clicking. It works for Codex, Claude Code and Pi.
- Plugin tests: **1074/1074**.

## 3.0.0-rc.44 — Pi errors are visible, devbox Pi auth repaired
## 3.0.0-rc.44 — Pi errors are visible, devbox Pi auth repaired

- Pi assistant `message_end.stopReason=error` is now rejected through ACP with code `pi_model_error` and the original message. Previously the adapter discarded the error and returned an empty `end_turn`, so the UI showed “已完成” with no reply.
- **devbox 10.37.91.120** was still on Pi 1.5.0. It is upgraded to **1.6.1**, and its `local` provider apiKey (a literal, unexecuted shell command) was replaced with the working gateway key. Raw Pi now returns text and token usage.
- Real plugin SSH transport E2E passes on all three hosts with adapter 0.1.5 and valid auth:
  - devbox: 77 commands, **10490** tokens
  - devbox2: 32 commands, **5753** tokens
  - devbox_sg: 35 commands, **6455** tokens
- Adapter `@wujiaming88/pi-agent-acp@0.1.5`; line coverage **98.57%**. Plugin tests: **1074/1074**.

## 3.0.0-rc.43 — native selection quote in remote sessions
## 3.0.0-rc.43 — native selection quote in remote sessions

- DSH selection quotes submit ordinary Markdown blockquotes (`> ` per line). The remote pane replaces the native composer, so the native quote button was writing into the hidden composer instead of the remote draft.
- Bridge the session `inputActions.insertQuote` into the remote composer at the current caret/selection, preserving the remote draft and cursor. The quote text then follows the normal prompt/queue/steer path, so Codex, Claude Code and Pi all receive it without adapter changes.
- Add pure quote formatting/caret tests and bridge intercept/restore tests; plugin tests: **1074/1074**.
- Release install/build output remains hidden until the session is refreshed.

## 3.0.0-rc.42 — Pi slash-command menu
## 3.0.0-rc.42 — Pi slash-command menu

- Fix the empty Pi `/` menu: commands were announced before the ACP client had learned the session id. The adapter now includes `_meta.pi.commands` in session/new, load and resume responses, and still sends `available_commands_update` after the response; the Host accepts command updates that arrive during startup.
- Pi adapter `@wujiaming88/pi-agent-acp@0.1.4` (tag `v0.1.4`), unit line coverage **98.55%**.
- Real plugin SSH transport E2E on both devboxes now sees command lists: devbox2 **32**, devbox_sg **35**, with token usage **5748 / 6455** and `PLUGIN_E2E_OK`.
- Plugin tests: **1070/1070**.

## 3.0.0-rc.41 — Pi per-turn token usage
## 3.0.0-rc.41 — Pi per-turn token usage

- Pi's session stats are cumulative, so the adapter now snapshots them at prompt start and writes the turn delta into ACP `PromptResponse._meta.quota.token_count` (`input_tokens`, `output_tokens`, `cached_read_input_tokens`, `cache_creation_input_tokens`, `total_tokens`).
- The existing DSH footer usage projection now receives real Pi token data instead of “— tok”. Context-window `usage_update` remains unchanged.
- Adapter `@wujiaming88/pi-agent-acp@0.1.2` (tag `v0.1.2`), unit line coverage **98.52%**.
- Real validation on both devboxes: adapter E2E tokens **5757 / 6447**; plugin SSH transport E2E tokens **5781 / 6455**, with `PLUGIN_E2E_OK` on both.
- Plugin tests: **1070/1070**.

## 3.0.0-rc.40 — validated Pi on both devboxes
## 3.0.0-rc.40 — validated Pi on both devboxes

- Pin the Pi adapter to `@wujiaming88/pi-agent-acp@0.1.1` / tag `v0.1.1`; missing Pi now rejects the ACP session instead of crashing with an unhandled child-process error.
- Upgrade **devbox2** from Node 22.16.0 / Pi 0.74.2 (user-local install) to Node 22.23.4 / Pi 1.6.1, remove its pre-existing broken `flux-bridge.ts` extension, and verify Pi RPC `get_state`.
- **devbox_sg** was already on Node 22.23.4 / Pi 1.6.1; re-verified with both test layers.
- Real adapter E2E passed on both hosts: streamed text, real bash tool, native steer while a tool ran, session close/load, clean shutdown. Real plugin SSH transport E2E (`tests/pi-plugin-e2e.mjs`) also passed on both hosts after preparing the pinned adapter.
- Plugin tests: **1070/1070**; 91 client modules and 11 remote modules built.

## 3.0.0-rc.39 — Pi backend via pi-agent-acp
## 3.0.0-rc.39 — Pi backend via pi-agent-acp

- Add the **Pi** agent as a third remote backend. It uses the independent `@wujiaming88/pi-agent-acp@0.1.0` adapter, pinned from GitHub tag `v0.1.0`, which translates Pi 1.6.1's native `--mode rpc` protocol to ACP v1.
- Pi supports session/new, load/resume/close, streaming text/thinking, tool calls, model and thinking-level config, Pi slash commands/skills, native `steer`, cancellation, and Pi extension confirmations/selections through ACP permission requests.
- Add Pi to the Host agent registry, Config schema, durable record validation, session activity, remote preparation, setup UI and labels. Remote preparation installs the adapter from the public GitHub tag and verifies the Pi CLI is available.
- Pi permission modes are not enforceable by Pi's ACP adapter; the setup UI explicitly warns that the Host permission selector does not restrict Pi built-in tools. Pi uses its own tool policy.
- Pi adapter repository: `https://github.com/wujiaming88/pi-agent-acp`. Unit line coverage: **98.44%** (>95% requirement). Real E2E on the devbox with Pi 1.6.1 passed: streamed text, a real bash tool call, native steering while a tool ran, session close/load, and clean process shutdown.
- Plugin tests: **1070/1070** pass; 91 client modules and 11 remote modules built.

## 3.0.0-rc.38 — keep the Host awake whenever the switch is on

- Change “运行时防止系统休眠” from turn-gated to unconditional: when the switch is on, the Host starts the sleep assertion immediately and keeps it across idle periods, closed pages, empty queues and sessions with no turns.
- Turning the switch off releases the assertion immediately (no stop grace); Host disposal still terminates the child, and `caffeinate -w` / the Linux Host-PID loop still prevents orphan blockers after a crash.
- Keep the switch on by default, as requested. The settings copy and documentation now state that the Host stays awake continuously and that this may increase power use.
- Update Host tests to assert the assertion is enabled at construction and flipped synchronously through the settings API.
- All 1067 automated tests pass with 91 client modules built.

## 3.0.0-rc.37 — inject Claude queue at the tool boundary without `later`
## 3.0.0-rc.37 — inject Claude queue at the tool boundary without `later`

- Fix the missing Claude queue pop: older Claude adapters advertise `steering.supported: true` but omit `priorities`. The automatic injection gate required `later`, so queued messages waited until turn end. It now injects at the last foreground tool completion, using `later` when advertised and falling back to `now` at the safe `runningTools === 0` boundary.
- Keep automatic injection Claude-only, preserve one-steer concurrency protection, and reject/queue normally on unsupported steering.
- Add a regression for a Claude adapter with steering but no priorities list: one steer at the tool boundary, queue removed, delivery steered in the active turn.
- Document that the fallback is unit-tested, not re-verified against a real legacy adapter. All 1068 automated tests pass.

## 3.0.0-rc.36 — join in-flight Claude steering instead of rejecting it
## 3.0.0-rc.36 — join in-flight Claude steering instead of rejecting it

- Fix the Claude Code race behind the generic “无法立即发送” error: when Claude’s automatic `later` priority injection is already steering a queued message, a manual “立即发送” now **joins the same in-flight steer** and returns its result, instead of failing with `queue_promotion_in_progress`.
- The manual action never sends a second steer, never removes the queue early, and still leaves the message queued if the joined injection returns `promptRequired` or an error.
- Clarify the remaining in-progress message: the system is already injecting the queued message; wait for the state refresh rather than clicking again.
- Add a regression that holds the automatic steer open, clicks send-now, and proves one steer call, one queue removal and no duplicate delivery. All 1067 automated tests pass; existing remote sessions keep their old worker until a new session starts.

## 3.0.0-rc.35 — explain failed immediate sends
## 3.0.0-rc.35 — explain failed immediate sends

- Stop collapsing every `立即发送` failure into one “could not send immediately” message. The UI now distinguishes: no injectable active turn / adapter requires a new prompt, message already started, unknown previous outcome, promotion already in flight, unsupported content, and adapter without steering.
- Disable `立即发送` while no turn is active and label it “当前没有可注入的运行中 turn”; the queued message remains queued and is sent normally after the current turn. This removes the common race where a Codex turn had already ended but the upload action was still clickable.
- Preserve the exact backend failure code through the client wrapper so the queue can show the real reason without ever cancelling or resending the message.
- Keep the message queued in every failure path; no duplicate submission, no interruption of active work. All 1066 automated tests pass with 91 client modules built.

## 3.0.0-rc.34 — VS Code-style file icons and type-aware previews
## 3.0.0-rc.34 — VS Code-style file icons and type-aware previews

- Replace the three-state file icon with a plugin-owned VS Code-style glyph registry: language, config, lockfile, document and image types get distinct brand colors and short marks (JS, TS, Py, Go, Java, JSON, YAML, shell, Docker, Make, etc.). No VS Code theme asset is copied, and unknown files stay neutral.
- Add a dependency-free syntax preview for common programming languages, configuration formats and markup: JavaScript/TypeScript, Python, Java, Kotlin, Go, Rust, C/C++, C#, Ruby, PHP, Swift, shell/PowerShell, SQL, JSON, YAML, TOML, INI/properties, XML/HTML, CSS, Dockerfile and Makefile. Markdown renders through the existing safe parser; JSON is formatted first.
- Code/config previews are read-only with line numbers and an explicit **Edit source** toggle; saving/discarding semantics and the dirty-file guard are unchanged. Rendering uses React text nodes only, never HTML injection or a remote highlighter runtime.
- Expand raster image previews to AVIF, BMP and ICO in addition to PNG/JPEG/GIF/WebP. SVG remains a safe XML source preview rather than executable markup.
- Cap highlighting at 300k characters / 60k tokens and fall back to plain text, keeping very large files responsive.
- Add file type, tokenizer, preview-wiring, icon and Host MIME regressions. All 1066 automated tests pass with 91 client modules built; the real component/CSS was additionally rendered in headless Chrome at 1200px and 1600px in light/dark themes, exercising source/preview toggles, long-name ellipsis, wrapped code, sticky line numbers, Markdown, images, error states and overflow geometry.

## 3.0.0-rc.33 — name the sleep switch explicitly

- Rename the Host sleep setting to exactly **“运行时防止系统休眠”** (English: “Prevent system sleep while running”), with the checkbox labeled “开启 / On”. Documentation uses the same name.
- No behavior change to the persisted `preventHostSleep` preference, activity gating, assertion lifecycle or platform commands. The switch remains **on by default**, including for existing configs that lack the field. All 1060 automated tests pass with 87 client modules built.

## 3.0.0-rc.32 — plugin switch for Host sleep inhibition

- Add a persisted `preventHostSleep` plugin preference, enabled by default. Plugin settings now expose a “Host runtime / Prevent Host sleep while running” switch with optimistic save and error rollback.
- Wire the switch to the live Host guard: turning it off releases the current assertion after the existing stop grace and prevents any new child; turning it on while a turn is already active starts inhibition immediately. Configuration is updated through the existing serialized config editor and survives reload.
- Keep the automatic behavior from rc.31 unchanged when enabled. Settings load/save are authorized through the same Host API; no assertion is created at Host construction, and no ACP/runtime work is triggered merely to read the preference.
- Add Host API/config persistence coverage and settings source/translation contracts. All 1060 automated tests pass with 87 client modules built.

## 3.0.0-rc.31 — prevent Host sleep while remote work is active

- Add a Host-owned sleep assertion while any remote session activity is `running` or `waiting`. macOS uses `caffeinate -i -m -s` (no display assertion, no forced screen wake); Linux uses `systemd-inhibit --what=idle:sleep --mode=block`. It is released three seconds after the last turn settles, so back-to-back turns do not flap the assertion.
- Bind the inhibitor to the Host PID: macOS uses `caffeinate -w`, and the Linux helper exits when the Host disappears. A crashed or force-quit Host therefore cannot leave an orphan sleep blocker. Host disposal terminates the child immediately.
- Locking the screen or letting the display sleep no longer stops an active Host on power. Lid-close sleep, forced sleep, power loss or system crash can still stop the local Host; the remote durable owner is not cancelled and can be reattached later.
- Add unit coverage for platform commands, one shared child across turns, stop grace/interruption, unsupported platforms, Host-PID binding, and running/waiting activity transitions. All 1059 automated tests pass with 87 client modules built.

## 3.0.0-rc.30 — smooth, incremental history paging

- Fix the real history-paging bottleneck: the Host previously scanned and `JSON.parse`d the entire journal from byte zero for every older page. A 134.5 MB journal measured ~443 ms per page; the new backward reader and in-memory line-offset cache measure ~1.5 ms for the first tail page and ~0.8–1.5 ms for subsequent pages. The cache is not persisted and falls back safely on restart/shrink.
- Preserve complete-line/Unicode handling and torn-tail tolerance while reading backwards across chunks; cached `beforeSeq` pages resume from the previous page’s byte offset, so newer history is never re-scanned.
- Remove the scroll flash: disable browser automatic anchoring on the owned transcript scrollport, capture the pre-insert `scrollTop`/`scrollHeight`, and fall back to exact inserted-height compensation when no stable item anchor survives. Keep existing per-item anchor restoration when available.
- Avoid fast-page flicker and unnecessary repaint: loading feedback now appears only after 180 ms, a completed fast page does not emit a second status update, the unused `prepending` render state is removed, labels/attachment context are memoized, and the already-projected transcript is wrapped in `React.memo` so scroll-status changes do not repaint every Markdown/tool row.
- Add regressions for backwards paging across multi-chunk journals, cached cursors with newer appends, torn tails, Unicode chunk boundaries, and the scroll/loading/memo contracts. All 1054 automated tests pass with 87 client modules built.

## 3.0.0-rc.29 — circular jump-to-latest button

- Move the requested circular outlined treatment to the actual “Jump to latest” control at the lower right: 32px round target, 0.5px theme border, base background, no popup shadow, hover fill and existing keyboard/aria behavior.
- Revert the accidental rc.28 change to the completed-turn process chevron; that summary row returns to its native inline chevron while remaining the single accessible expand/collapse control.
- Add style contracts for the jump button and the restored summary geometry. All 1051 automated tests pass with 87 client modules built.

## 3.0.0-rc.28 — circular turn disclosure button

- Restyle the completed-turn process chevron as a native circular outlined button: 28px round target, thin theme border, base background, hover fill, and preserved open-state rotation. The whole summary row remains the single accessible expand/collapse control, so no nested button or duplicate focus stop is introduced.
- Keep collapsed process wrappers, duration facts, focus protection and reduced-motion behavior unchanged. Add source/CSS contracts for the circular wrapper and updated geometry. All 1051 automated tests pass with 87 client modules built.

## 3.0.0-rc.27 — per-turn usage details

- Make the completed-turn usage footer open a native-style “Turn usage” popover. It reports the full total token count, provider/model, cache-hit percentage, uncached input, cache read, cache write and output tokens for that turn.
- Normalize usage from the authoritative stop response (`usage` or `_meta.quota.token_count`/`model_usage`) and compute cache hit from input/cache components. Values are snapshotted on the turn, so history and later turns never reuse the current session totals; missing fields stay `—` and are never estimated.
- Keep exactly copy, usage and completion time in the final-reply footer. The compact total is shown inline and the full grouped total plus breakdown appears in the click-open panel, matching the native reveal/focus behavior.
- Add regression coverage for stop-response token normalization, quota fallbacks, cache-hit math, full/compact formatting, missing fields, and the popover contract. All 1051 automated tests pass with 87 client modules built.

## 3.0.0-rc.26 — per-turn footer usage and completion time

- Add a compact footer to each completed turn’s final reply with exactly three facts: copy, usage tokens and the completion clock time. Usage comes from the usage snapshot observed during that turn (never another turn’s or the live session’s latest value), and the timestamp comes from the authoritative stop event; missing facts render `—` or are omitted instead of being synthesized.
- Preserve the same footer through history replay and final-response selection. Keep the existing native hover/focus reveal, copy feedback, responsive wrapping and theme tokens; no extra feedback/fork controls are added.
- Add regression coverage for per-turn usage snapshots, stop-time capture, local `HH:mm` formatting, history replay, missing/invalid facts, and the three-item footer contract. All 1050 automated tests pass with 87 client modules built.

## 3.0.0-rc.25 — Claude queue follows the native tool boundary

- Queue messages for Claude can now stay pending while a foreground tool runs and are injected at **later** priority when the last root tool call finishes, inside the same turn. This mirrors Claude Code's native queue: tool execution completes normally, the current answer is not preempted, and no second `session/prompt` starts. The queued card remains editable/removable until that boundary.
- Add a bounded, exact, idempotent patch for the pinned `claude-agent-acp@0.109.1`: expose `_meta.steering.priorities` and honor a Host-selected `later`/`now` priority. Any source-layout mismatch leaves the package untouched and falls back to turn-boundary FIFO; no other adapter code is changed. The patch and fallback are covered by syntax, serialization and source-contract tests.
- Explicit “Send now” still uses priority `now` and may interrupt/interleave according to Claude Code's own `Ctrl+Enter` semantics. Adapters without the patched priority capability keep the existing safe FIFO and disabled explanation.
- Add regressions for steering priority negotiation, serialized remote patch delivery, queued text identity/order, later-priority injection after the last tool, no duplicate prompt, and editable cards until the tool boundary. All 1047 automated tests pass with 86 client modules built; real-browser and live remote acceptance remain separate.

## 3.0.0-rc.24 — edit queued messages and send them immediately

- Add in-place editing for still-queued messages. Keep the original `requestId`, turn identity, FIFO position and admitted attachments; batch, prompt and queue-capacity validation still apply. The edited text updates both the browser projection and the Host-owned native admission, and long preview-only rows disable editing instead of risking truncated content.
- Add “Send now” for queued messages. When the adapter advertises native steering (Codex), atomically inject the queued content into the active turn and remove only that queue identity; the current turn is never cancelled and no second prompt starts. Adapters without steering (including Claude Code) keep their existing queue mechanism and send after the current turn: the action is disabled with an explicit explanation rather than interrupting or reporting false success.
- Add atomic durable broker operations `updateQueued`/`promoteQueued`, deterministic operation identities for safe retries after link loss or Host recreation, and optimistic native-admission text replacement with rollback on authoritative remote rejection. Drain is held during promotion so an edited identity cannot race into a separate turn.
- Extend the queue dock with localized edit/save/cancel and send-now actions, busy states, explicit failures, attachment preservation and keyboard edit controls. Add regression coverage for queue edit identity/order/attachments, capacity and active-turn rejection, Codex-style steering promotion, unsupported-steering preservation, Host authorization, durable recovery and unauthorized callers.
- All 1044 automated tests pass; browser visual/interaction acceptance remains separate from source tests and installation.

## 3.0.0-rc.23 — inline output images and instant session return

- Render assistant Markdown images inside the transcript instead of treating them as navigation links. Remote filesystem references use a new session-bound, read-only `output-image` route; the image must appear verbatim in the recorded source text. Revalidate Host binding and owner authorization around the bounded SSH read, permit only raster PNG/JPEG/GIF/WebP content, and keep failures visible without opening an Electron blank window.
- Add inline image thumbnails with loading/error/retry feedback and an in-app modal preview with zoom controls and localized labels. Preserve existing sent-attachment URL restrictions and do not browse authorization links or execute authentication.
- Suspend idle/off-LRU browser subscriptions while retaining a bounded set of transcript projections, cursors, bindings and composer state. Returning to a healthy Session now reattaches from its cursor without repeating `acpStart`/`acpResume` or history loading; real SSH/runtime failures still follow the explicit recovery path. Identity changes dispose stale projections and uncertain composer state, and active HTTP subscriptions remain bounded.
- Move an accepted queued user message after the preceding turn's completion, while leaving steered messages and request/turn identity scoping unchanged.
- Add regression coverage for long-idle return, LRU suspension, immediate reattach races, binding replacement, queue ordering, Markdown rendering, scoped image proof, authorization revocation, path/symlink/type/size limits and post-I/O binding changes. All 1038 automated tests pass with 86 client modules built. Browser visual and interaction acceptance remains separate from source tests and installation.

## 3.0.0-rc.22 — stable message subscriptions and accurate recovery state

- Fix HTTP backpressure being treated as disconnection: an accepted `write(false)` now waits for drain, preserves ordered delivery, and never resends that accepted frame. Bound pending delivery to 64 MiB with an independent 10-second drain deadline; keep slow-consumer cleanup, authorization and admitted-prompt lifetime separate from delivery.
- Prevent delayed history pages and action receipts from overwriting newer same-cursor control snapshots; preserve operation results without resending. Safely initialize an empty journal generation without skipping events; retain closed-session and generation boundaries.
- Distinguish browser message-stream reattachment/recovery from actual remote SSH connection recovery, with bounded payload-free subscription diagnostics. Do not hide real failures or re-enable actions while the subscription is disconnected.
- Add real localhost HTTP/socket regression tests using realistic snapshot sizes, 16/64 KiB high-water marks, replay bursts, paused consumers and prompt completion during drain. All 1005 tests pass with 83 client modules built. Live target checks remain read-only; no remote task is restarted or resent, and browser visual acceptance is still separate.

## 3.0.0-rc.21 — one process disclosure per turn

- Group intermediate assistant prose, reasoning and tool activity into one stable process per Session/turn instead of splitting at each assistant message. Retain original content and order within the process; keep user messages, warnings and errors standalone.
- Show only the final nonempty assistant reply before an authoritative completed turn boundary outside the process. Share this selection with final-response copying across the complete transcript, including nested views. Running, cancelled, interrupted and unknown turns do not promote their current tail into a final answer.
- Make the completed-turn summary directly control its single process body, eliminating a redundant second disclosure click while preserving individual tool details, reading state and explicit verbose/detailed policies.
- Preserve history reading anchors with stable turn keys: exact key equality alone cannot anchor a changed process; validate retained members, event versions, text ranges and generations before top/bottom compensation.
- All 956 automated tests pass, with 83 client modules built. Browser visual/interaction acceptance remains pending; no conversation history or remote execution state is rewritten.

## 3.0.0-rc.20 — trust the selected remote runtime environment

- Remove the extra runtime-root and ancestor ownership/write-bit whitelist. The user's explicitly selected SSH host and its runtime environment are trusted; administrator-owned mounts and shared dependency directories no longer trigger `remote_unsafe_runtime`. Existing-directory and real filesystem access requirements still apply.
- Keep user-private durable state, worker artifacts and socket directories/files, symlink and integrity checks, owner identity, fencing, and operation deduplication. Do not chmod/chown remote directories, add per-directory trust prompts, or change the Agent's selected execution permissions.
- Document the trust boundary explicitly: SSH authentication is not isolation from a server administrator or another user able to replace the runtime or its ancestors. Real model execution and end-to-end GUI recovery remain separate acceptance steps.
- All 941 tests pass, including serialized-helper regressions for shared runtimes and retained private-state protections. An authorized read-only probe of the production helper on a real SSH target passed the runtime-path check without creating an owner, changing permissions or invoking a model.

## 3.0.0-rc.19 — restore sessions with default effective permissions

- Fix `Invalid backend type or permission` when reopening a Session whose actual ACP permission is `default`. Accept that existing runtime state in backend metadata and preserve it through permission normalization instead of silently substituting `acceptEdits` or the previously requested `bypass`.
- Keep explicit new-Session choices and bypass confirmation unchanged. `default` still waits for human permission responses; it does not assert that the adapter is read-only. An adapter without an advertised `default` mode still rejects that mode rather than substituting another one. Existing resume intent/mode restoration is unchanged.
- Regenerate the durable worker so Host and newly started remote workers use the same normalization. No binding/history migration, deletion or permission rewrite is required.
- Add 13 regressions covering Claude/Codex, live/cold, legacy/durable metadata, exact mode selection, unsupported-mode refusal and non-automatic approval. All 915 tests pass. Browser reopening acceptance remains separate from automated verification.

## 3.0.0-rc.18 — durable execution, native message delivery and turn summaries

- Fix slash-command/file picker overlap by using content-sized rows rather than fixed-height small buttons; preserve full tooltips, two-line descriptions, keyboard navigation and visible focus. Prevent late history snapshots from rolling back a newer command roster after reconnect, with warm/cold reopen regressions.

- Add explicit remote-owned FIFO Queue and native Steer modes for Codex/Claude Code, using the installed DSH busy-Enter preference, complementary Ctrl/Cmd+Enter, and copied QueueDock presentation. Queued messages can be removed before execution; unsupported or no-longer-active steering never silently changes into Queue. See [message delivery contracts](<docs/MESSAGE_DELIVERY.md>).
- Preserve immutable request identity across unknown receipts; bound queue previews and request tombstones, recover authoritative queued state, and share receipt/state synchronization across concurrent duplicate calls. Validate steering attachments and persist trusted native admission fingerprints before dispatch.
- Keep late steering ACKs in their original turn, freeze future turns after unknown injection, and synchronously stop admission/drain after journal failure. Add SDK wire, Host admission, durable reconnect, queue cancellation and late-ACK native-history regressions.

- Show the assistant message-copy action only on each turn's final nonempty reply after authoritative completion. Intermediate/streaming replies and cancelled, interrupted or unknown turns have no message-copy footer. Preserve earlier completed turns' final copy actions, user/tool copying, and the original final reply text without concatenating intermediate messages.

- Restore native Bash/TerminalBlock presentation for long command scripts: avoid repeating a command-shaped ACP title as whitespace-collapsed prose, preserve independent descriptions and raw evidence, and apply the installed Bash view's pre-wrapped command layout. Multiline title-only data uses the existing literal TextBlock without guessing an execution kind. Cover heredocs, indentation, blank lines, long commands and streaming/history replay.

- Move task ownership into a detached remote ACP broker. SSH/Host/browser lifetimes no longer cancel admitted work; reconnect to the same execution and replay canonical events, latest state and pending permission/form requests without reinitializing the adapter or blindly resending prompts.
- Persist private owner identity and native message admissions before dispatch. Add fsync operation admission/results, HMAC argument identity, single-writer fencing, bounded backpressure/quotas and query-first recovery; lost active owners remain explicit unknown rather than starting replacement tasks.
- Separate SSH status from browser HTTP connectivity. Add an explicit confirmed “End remote session” action with read-only history; closed workers exit and a private terminal proof supports late result queries. Host shutdown interrupts local waits only, and unconfirmed owners prevent deleting their recovery configuration.
- Add real local process tests covering killed Host/helper processes, offline approvals/forms, lost receipts, terminal replay, worker exit and owner-loss refusal. Actual target-server SSH behavior and GUI appearance still require acceptance; automated local process tests do not establish target-server acceptance. See [durable execution boundaries](<docs/DURABLE_EXECUTION.md>).

- Add one native-style completion summary per root turn: status, factual duration, adjacent disclosure arrow and a divider, adapted from DSH 0.2.2-rc.5 TurnProcessNodeView. Use only authoritative lifecycle timestamps; missing/invalid times omit duration, and stopped/interrupted/failed turns never claim completion.
- The summary controls all process segments in that turn without moving or hiding assistant prose. Preserve each segment's own disclosure state and mounted content; turns without process content show a static summary without a false arrow.
- Preserve focused readers across both completion and next-input folding, including inner flat-to-bounded transitions. Keep explicit user collapse available and retain the existing detailed/verbose display policy.

## 3.0.0-rc.17 — contextual copy visibility and refreshed documentation

- Reveal assistant copy actions only on message hover or keyboard focus on hover-capable devices, including the final response. Keep controls visible on touch-only devices and preserve footer space to avoid layout shifts; copying scope and stream/interruption states are unchanged.

- Refresh both READMEs with current capabilities, link historical releases through the changelog, clarify bounded process scrolling and ordinary audio/video file uploads, and remove the original-repository footer. Preserve license and third-party notices.

## 3.0.0-rc.16 — single response copy action

- Remove the extra “Copy turn responses” button from assistant messages. Keep the single icon that copies the current response segment, without changing user-message copying or streaming/interruption state.

## 3.0.0-rc.15 — native conversation presentation with remote adapters

- Copy the complete conversation presentation layer from installed DSH 0.2.2-rc.5 source: user/assistant message seats and actions, ToolRow/DisclosureRow/TextShimmer, InputBar, AttachmentRail, FileCard and MessageImage. Feed these local views through ACP/draft/configuration adapters, rather than importing private Host stores or duplicating remote execution logic.
- Replace 60/40 tool-row columns with intrinsic action titles and adjoining summaries, use structured-kind native icons, avoid duplicate file paths, and keep full original titles, commands, diagnostics and result bodies in details. File actions use original structured paths through the existing authorization boundary; display-only line numbers are not appended to file targets.
- Seat attachments before the user bubble; adopt the native composer overlay/editor/control/dock structure and 64px attachment rail. Retain IME, file intake, retry/ACK state, send/stop, remote permission/configuration and attachment lifecycles. Adapt multiple selectors and proportional image sizing to narrow panels without overriding inherited Host width axes.
- Hide the generic “Waiting for Agent progress” row while a confirmed running footer already supplies turn status. Keep the real timer, connection/intervention notices and feedback for unconfirmed turns; do not invent progress or hide user-action requests.
- Give the execution-process header its own copied native checklist/step-list icon instead of reusing the hash-shaped code icon. Preserve hover/focus disclosure affordances, running indicators and fold behavior; tool-row icons now follow their own structured action kinds.

## 3.0.0-rc.14 — native UI adaptations and remote file attachments

- Remove the repeated active command/subagent title below the execution process when the running footer is available. Keep the process summary and details, root-turn status/timing, and actual concurrent-operation count in the footer. Connection, permission, question and unconfirmed-turn feedback remain visible; elapsed ticks stay outside live announcements.
- Add ordinary-file attachments through selection, drag/drop and file paste: keep existing text/image semantics; defer other binary uploads until Send and provide a verified remote-path text block rather than binary/base64 prompt data. Allow 64 MiB per ordinary file, 256 MiB combined, within the existing 16-item message limit. Uploading does not imply the Agent has a parser; never automatically extract or execute files.
- Store files in session-isolated workspace directories with safe names and unique upload IDs. Recheck session access, reject symlinks/out-of-root references, publish without overwrite, verify SHA-256 and size, and make retries idempotent. Safely recover owned pending files left by interrupted publication; unknown entries, symlinks and external hardlinks remain errors.
- Retain draft File objects and confirmed receipts only in memory. Show upload status, keep failed drafts for retry, stop stale results from crossing session/attempt boundaries, and clear interrupted spinners. Reject attachment steering before pinning a pending operation, so an unchanged draft can be sent after the active turn. Removing a card never deletes uploaded remote files.
- Replace independently drawn controls and scattered glyphs with local adaptations from the installed DSH 0.2.2-rc.5 frontend: Button, Input, Checkbox, Tag, StateDot, Menu and Modal, plus 47 real SVG shapes and 53 explicit role mappings. Keep runtime imports restricted to Host React and retain upstream MIT attribution.
- Copy native code/read/diff/terminal view structure and Markdown typography while preserving the existing safe parser, complete-content copy, line numbers, explicit unknown exit state and Host font preferences. Keep browser dialog/popover ownership rather than importing private Portal or focus-manager state.
- Align composer, disclosure, user bubble, settings, files, attachment previews and usage views to verified upstream styles. Adapt configuration selects with the copied Input shell and real HTML select semantics. Preserve remote data sources, permission decisions, unread receipts, turn timing and scroll intent.
- Record exact release hashes, original symbols, local adaptations and unsupported renderer features in [native UI notes](./docs/NATIVE_UI.md). Source and automated verification do not establish real-browser visual, focus or interaction acceptance. Refresh the GUI after installing the updated bundle.
- Verification: 724 automated tests pass, including installed-runtime contracts, real local Python file-publication tests, and Blob/File/Response-based submission tests; 65 client modules build successfully. Independent source/UX review findings for native UI, interrupted upload feedback, steer retry, crash recovery and pending-intake retention are addressed. Live SSH upload and real-browser acceptance remain pending.

## 3.0.0-rc.13 — two-line running feedback and quiet sidebar states

- Replace the single-dot running tail with a muted current-activity row and a blue turn-in-progress footer, separated by a quiet rule. Use plugin-owned line icons and softly animated trailing dots; preserve real concurrent-operation counts and full activity titles. Normal completion, cancellation and fatal termination remove the tail.
- Show elapsed time only from the current root turn's observed Host turn_start timestamp, never Session age, queued input time or component mount time. Reconnect/replay preserve that start. Missing, invalid or future timestamps omit the stopwatch; a history window without the original start remains an explicitly unknown-progress state rather than inventing a start time. Elapsed time includes waits and connection interruptions, not pure model reasoning time.
- Permissions and questions use static warning feedback. Connection uncertainty and queued/unknown execution stay neutral without an execution animation or timer. Hidden tabs stop ticking and catch up on return; timers and visibility listeners are disposed with the tail. Keep per-second time outside live announcements, use theme tokens and wrapping text, and honor reduced-motion preferences.
- Show sidebar indicators only for running, waiting for user input, unread completion and confirmed errors. Idle, read completion and stopped states render nothing instead of an empty-circle placeholder; disconnected or unknown metadata also stays quiet rather than claiming a remote failure. Reading a completion removes its glyph entirely, without changing execution state; a later unread turn can light it again.
- Verification: 617 automated tests pass (19 new regressions); client build contains 57 modules. Source/controller and independent UX review do not establish real-browser animation, light/dark contrast, narrow-screen layout or screen-reader acceptance.

## 3.0.0-rc.12 — completion unread acknowledgement and quieter process headers

- Treat the green sidebar marker as a completed turn not yet viewed, rather than a permanent execution outcome. Opening its foreground conversation clears it; a completion while that conversation is visible and focused does not leave a green marker. A later background completion can light it again, even if an intermediate running update was missed.
- Supply a stable, opaque completion identity only for real submitted root turns. Keep execution state separate from local read acknowledgement; errors, waits and running state are not dismissed by opening a conversation.
- Use mounted conversation leases, public panel/current-session/router facts, and browser visibility/focus. Sample those facts again when a completion arrives so delayed cleanup cannot acknowledge another conversation or an inactive main panel. No native unread state is modified, and no per-row Agent or stream is created. Modal occlusion has no public observable in this installation and is not inferred through private DOM inspection.
- Preserve acknowledgements across overview reconnects, transient resets and unsupported-API failures; unsupported endpoints still stop automatic retries without pretending access was revoked. Viewing during an outage can acknowledge only the last completion already observed, never future unseen turns. Same-tab reloads retain up to 4096 recent id-only receipts in sessionStorage; blocked or corrupt storage falls back to in-memory state. Session removal and authorization revocation clear affected receipts.
- Remove category-count summaries such as “Reasoning × 2 · Commands × 2” from process headers. Keep the Activity title, disclosure controls, complete process contents, actual live activity and failure notices; empty summaries leave no separator behind.
- Verification: 598 automated tests pass (26 new regressions); client build contains 56 modules. Source/controller checks do not establish real-browser focus, panel switching or visual acceptance.

## 3.0.0-rc.11 — process density, image previews and sidebar status

- Verification: 572 automated tests pass (113 new regressions), including offline checks against the installed DSH attachment/query APIs; the client build contains 55 modules. These are not real-browser visual or interaction acceptance results.

- Default the remote view to standard when no explicit presentation mode is supplied. Standard/compact start with grouped activity closed; detailed keeps live activity flat and groups history according to completion/next-input timing; verbose stays flat. Existing selected preferences are respected, and every record remains available.
- Restore the native-style `min(400px, 50vh)` scrollport only for explicitly expanded grouped processes. Keep the same disclosure/body identity across mode changes. A reader who interacted with flat content keeps its full height on completion until deliberately closing/reopening; raw diagnostics inside a bounded group do not add another vertical scrollport.
- Prioritize supplied action titles and short target metadata. Long commands and results live in expandable details, with literal command fallback when no title is supplied. Normal tool/agent/terminal success is quiet; running, pending and failure states remain explicit. Standard/compact suppress settled thought excerpts without removing their content.
- Summarize inactive groups using actual supplied activity categories and retain historical failure counts. Do not label the last completed tool as currently running, infer command intent from shell text, or trim the history to the latest N records.
- Replace composer image-name chips with a compact, single-row thumbnail strip: preserve image proportions, separate preview from removal, retain ordinary file chips, support the existing modal, and release local Blob URLs on removal/unmount. Validate local raster payloads and keep preview state out of submission/retry data.
- Render sent images from DSH's existing durable attachment references through public SessionQuery/Attachments services. This also restores old rc.10 images where native references exist; missing records remain explicitly unavailable. Preserve new image filenames without changing ACP wire image semantics, and remove empty text bubbles/copy buttons from image-only messages.
- Use a session-scoped metadata RPC and authenticated image endpoint, not arbitrary event URLs, digests or Host paths. Check native message membership, fork boundaries and permissions, including conflicting Session aliases and revocation during reads. Pending previews belong only to the target active/queued turn and have a manual retry; successful previews survive turn completion without remounting.
- Add remote sidebar status through the public leading slot and plugin-owned, theme-aware status glyphs, without importing Harness Client UI packages. A single authorized metadata overview reports actual running, approval/question waits, completion, stopping, errors and disconnection; it never opens a per-row ACP connection. Disconnects become unknown, revocation removes data, and cold history does not invent a successful outcome. Preserve native status priority: blank/archived rows, search results and rows already displaying a native status do not expose this leading slot.
- Real-browser image loading/refresh, sidebar alignment/animation, focus, selection, nested-scroll behavior, narrow-screen layout and themes still require acceptance. Automated and independent source-level reviews are not visual acceptance.

## 3.0.0-rc.10 — coherent stream reading and process presentation

- Release verification: 459 automated tests pass (49 new regressions); independent source-level UI/UX review completed, including fixes found during integration. Real-browser focus, scroll anchoring, narrow-screen typography and dark/light visual acceptance remain unverified.
- Preserve all assistant prose in order: a positional last segment is not an authoritative final-answer marker. Default copy copies that segment; copying the entire turn is a separately labelled action. Existing final-only preferences no longer hide unclassified prose.
- Keep one stable process disclosure through streaming and completion. Summaries show supplied actions and historical failure counts (including descendants), not just record totals. User reading pins the group open; opened child bodies remain mounted when hidden to retain local state.
- Treat expansion and explicit reading as a pause in tail following. Restore the trigger offset with viewport/content/lifetime/interaction guards; preserve existing history pagination guards. Remove the process-group inner scrollport and use explicit 20-line previews for long tool outputs; raw diagnostics remain a last-level bounded exception.
- Use persistent chevrons, visible static activity status, consistent content axes and coarse-pointer targets. Remove competing full-title/thought shimmer. Reasoning summaries do not jump back to the first paragraph on completion.
- Update plan snapshots in place by actual scope/identity; ending or removing a plan stops its activity display without inventing successful steps. Fix subagent scope and reuse top-level filtering, roles and copy rules in nested conversations.
- Retain concise permission/question receipts from explicit resolution events, with allowlisted decisions and no answer/schema/option-label payloads. Distinguish connection state, structured user waits, active root-turn tools and unknown progress; never infer external authorization from prose or URL clicks.
- Render all supplied diff, terminal and distinct text result sections, retaining first-terminal tool-level exit fallback without applying it to unrelated terminals. Keep IDs and source metadata in diagnostic disclosures.
- Scope boundaries: no Host lifecycle, SSH configuration, ACP authorization or conversation records are rewritten; no new preferences are introduced. The legacy presentation-mode fields remain accepted, but container identity is now consistent across modes. Already-open hidden content can still incur rendering cost and requires real-browser performance acceptance.

## 3.0.0-rc.9 — automatic HTTP links in message text

- Release verification: build and 410 automated tests pass; source-level link interaction review completed. Includes the rc.8 browser timer receiver hotfix.

- Recognize bare HTTP(S) URLs and angle autolinks in message Markdown, preserving literal query strings and reusing native anchors with `noopener noreferrer`. No automatic navigation, URL fetching or authentication is performed.
- Keep code spans/fences literal, avoid nested anchors in existing Markdown labels, and keep common prose punctuation outside links while preserving balanced URL brackets. Long candidates are never linked using a truncated prefix; oversized or invalid candidates remain text.
- Add 15 pure parsing/render-contract regressions, including long inline code, authorization-shaped synthetic URLs, Unicode, IPv6, streamed text and bounded malformed input. Live browser click acceptance remains unverified.

## 3.0.0-rc.8 — browser timer receiver hotfix

- Build and 395 automated tests pass. The default-timer regression is independently source-reviewed; actual GUI acceptance after refresh remains required.

- Bind native browser timer defaults to `globalThis` in both the session pool and session client. rc.7 invoked captured Window timers as instance methods, causing `Illegal invocation` during the first pool acquisition and again at connection startup, before any remote request.
- Keep explicitly injected timer functions unchanged. Add three controller regressions enforcing the Window receiver contract across acquisition, remount, eviction, startup, heartbeat expiry, reconnect and disposal. The two default-timer tests reproduce the failure before the fix; ordinary Node/injected arrow timers had concealed it. These tests do not replace live-browser acceptance.

## 3.0.0-rc.7 — scroll-loaded history, connection continuity and clearer process rows

- Release verification: 392 automated tests pass; source-level UI/UX review completed. Live GUI visual acceptance and real-network interruption testing remain unverified.

- Replace the routine “Load earlier messages” button with automatic near-top paging from mouse wheel, scrollbar, keyboard and touch reading gestures. Keep localized loading/start feedback and a retry button only after an error; the transcript is keyboard-focusable.
- Coalesce in-flight history reads, stop on exhausted/nonadvancing cursors and bound short/invisible-page continuation to three pages per renewed gesture. Initial tail-following and resize/live updates without prior reader intent do not initiate a history download; nested scroll containment remains local.
- Capture the current reading anchors immediately before a page is published and restore in the committed layout, rather than using stale pre-network positions or total scroll-height growth. Preserve factual text/member identities across split pages and reject ambiguous/changed live boundaries. Journal-reset revisions reject late pages even when a reset reuses the same generation.

- Remove the explanatory current-context-versus-cumulative-token note from the usage popover in both languages; keep the current-context token and capacity readings unchanged.

- Retain recent session clients at plugin lifetime instead of aborting the event subscription on every view switch. Keep two warm clients with LRU eviction and a 10-minute inactive timeout; mounted readers remain protected. Eviction closes browser requests, never cancels the remote Agent.
- Keep connection state independent of journal replay/reset so idle sessions and loading earlier history cannot falsely remain “Reconnecting”. Initial attachment is labelled “Connecting”. Healthy remounts reuse the existing cursor and projection without another start/resume/history cycle.
- Add unsequenced 15-second HTTP heartbeats, a 45-second client watchdog and cursor-based reconnect with 1–10-second backoff. Heartbeats verify Host subscription liveness, not remote Agent health; missing runtimes and authorization failures require explicit retry rather than endless reconnection or implicit new work.
- Retain draft/attachment and pending-request metadata independently of view and connection eviction, reconciling ACKs even while detached. Uncertain sends keep their original request ID and prompt/steer kind; EOF without acknowledgment remains explicit. Only draft text is persisted; other composer data lives until this client-plugin lifetime ends.
- Validate immutable workspace, profile, binding and canonical-path identity before reusing cached data, including after eviction. Authorization denial clears cached private data, halts automatic retry and prevents stale responses from repopulating it. HTTP detach/backpressure does not discard an already-admitted authorized prompt.
- Add 30 client lifecycle/identity/ACK regressions and 35 deterministic Host heartbeat/admission/cleanup tests. Browser visual acceptance and real-network interruption testing remain unverified.

- Suppress repeated command/path previews when ACP uses the same text as the tool title. Prefer an actual supplied command description when available; preserve full commands, output and failure details without guessing shell intent.
- Match native 13px/24px tool typography and leading icon-to-chevron disclosure affordances for tool and reasoning rows; remove trailing arrows and let single-title rows use the available width.
- Bound expanded process lists to the native `min(400px, 50vh)` height with 4px row spacing and keyboard scrolling. Live lists open at the tail and follow while the reader stays there; history opens at the start. Existing view preferences and manual folding remain unchanged.
- Add nine process-presentation regressions. Source-level UI/UX review completed; live GUI visual acceptance remains unverified.

## 3.0.0-rc.6 — native-style composer, files and session actions

- Align the remote composer with native DSH surfaces, 28px panel radius, typography, attachment/permission controls on the left and model/reasoning/send controls on the right. The draft grows within a bounded scroll area; narrow layouts wrap rather than hiding controls.
- Center the activity, usage and context-ring dock in native order. The usage pill explicitly reports current-context tokens, never fabricated cumulative billing, cache-hit rates, steps or decode speed. Cost rows, billing disclaimers and cost-only fallback readings are omitted from the UI; protocol cost data remains unchanged. Session age remains in the statistics details.
- Add nine composer/usage regressions, preserve keyboard picker highlights, and support Escape from all dock triggers. Source-level UX review completed; live GUI visual acceptance remains unverified.
- Declare the Host `sessionTitle`, `sessionQuery` and `agents` dependencies required by session actions. This fixes deterministic menu-read failures for live/cold Sessions, title synchronization failures and native child creation failures during remote forks.
- Added four installed-runtime regressions using a real scoped Cordis plugin context and the exported production injection list, rather than a plain dependency object, covering menu reads, persisted cold titles, canonical rename/pin and native fork creation.
- File lists, text editors and image previews fill the remaining pane height, with stationary controls and independent content scrolling instead of fixed-height cards.
- A native-density toolbar, workspace return action, filename-preserving path, full-width rows, file sizes and narrow-pane rules improve remote browsing.
- Loading, empty, failed and truncated listings are explicit; refresh retains existing content and failed image previews can be retried. Editors are read-only during pending reads/writes, with existing unsaved-change protections retained.
- Added 13 sidebar presentation/controller regression tests. Source-level UX review completed; live GUI visual acceptance remains unverified.
- Remove the navigation toggle to the left of the remote conversation title while retaining New session, session actions and remote files controls; add a header regression test.

## 3.0.0-rc.5 — per-session Agent selection and scroll visibility

- Remote workspace creation now asks only for the SSH connection, directory and optional owned worktree. Agent and permissions are selected explicitly in each new conversation; existing Session bindings remain unchanged.
- Unselected remote Sessions do not inherit workspace defaults, persist a binding or start an Agent. Host selection is owner-only, validates blank/unarchived state, requires explicit Bypass confirmation and rejects conflicting concurrent selections.
- The remote conversation header offers New session without native blank reuse, so another Agent can be selected even before the current Session sends its first message. Later navigation suppresses stale opening results.
- Jump-to-latest visibility now follows actual distance from the bottom (more than 32px), independently of automatic following. Clicking/selecting text at the bottom no longer reveals the button; paused stream growth, viewport resizing and content collapse update its visibility.
- Added regression coverage for selection, authorization, immutability, navigation races and scroll geometry. Real GUI acceptance remains unverified.

## 3.0.0-rc.4 — native-style output stream

- The remote transcript renders user/assistant messages, thoughts, tool calls, subagent calls, plans, terminal output, session messages, notices and context compaction as lightweight native-style disclosure rows with one owned scrollport and turn-level fold behavior.
- The composer mirrors native DSH: an icon-only Stop that replaces Send while running, a lightweight streaming thinking disclosure, and no Enter/Shift+Enter hint line.
- Context and usage moved below the composer as a native ContextMeter ring (click-open) plus a session-statistics pill (turn count and elapsed time); no hover icon and no session path/id details.
- Session start/loading failures render a structured status card (icon, mapped title, error code, message and hierarchical actions), and the prepare-runtime dialog lists packages, install directory and Node requirement instead of raw JSON.
- `notice` events keep their title/description/severity, `compaction`/`compaction_chunk` aggregate into one compaction marker, and the session snapshot restores the slash-command roster after resume.
- The remote SSH settings page follows native settings density and interaction.

## 3.0.0-rc.3 — remote session actions

- Native-style session menus expose rename, pin/unpin and real ACP forks.
- Titles synchronize with session/set_title, including metadata-only cold/archived updates; uncertain outcomes remain visible.
- Pin ordering remains native and forks do not inherit a pin.
- Real remote forks precede native publication, preserve independent context/configuration and carry explicit inherited-history proofs.
- Durable operation ledgers recover local publication failures without repeating the remote fork. Ordinary native forks of remote logs are rejected instead of producing unusable shells.
- The plugin remains disabled; no real SSH/model or GUI activation was performed for this change.

## 3.0.0-rc.2 — remote-only implementation

This candidate replaces the previous implementation rather than carrying compatibility branches forward. The plugin remains disabled pending explicit permission and GUI acceptance.

### Architecture

- Split Host configuration, SSH, workspaces, bindings, files, native content and lifecycle recording into focused modules.
- Split ACP transport, events, configuration, requests and versioned storage from runtime orchestration.
- Replace the client monolith with ESM modules and a single generated browser factory.
- Remove TUI/Shell panels, local adapter wrappers, synchronization/write-back, native service monkeypatches, old sidebar routes, terminal overrides, migration code and superseded tests.
- Remove local copies of remote adapters and the unused YAML dependency.

### Correctness

- Local Sessions do not consult unrelated ACP records and never lose native Chat because a plugin lookup failed.
- Backend snapshots remain stable across workspace-default changes; remote workspaces offer only Claude/Codex.
- Real external turns are recorded through public Session APIs and a deduplicating projection, so native New Session no longer reuses an already-used remote container.
- Persistent journals, generation/seq replay, explicit startup errors, full-payload request identity and acknowledgement-based draft handling.
- Actual permission-mode application, serial queues, form elicitation and ownership-preserving native/subagent event rendering.
- Session-bound file snapshots, SHA256 conflict checks, atomic writes, dirty-editor protection and owned-worktree removal without force.

### Protocol and verification

- One versioned `/remote-ssh/v3/` HTTP namespace with authenticated owner access and no old aliases.
- Current DSH `0.2.2-rc.5` only; no compatibility facades for older contracts.
- Functional Node tests plus actual installed DSH SessionStore, projections, listing, filesystem and access-policy tests replace source-string assertions about removed code.
- Earlier SSH smoke tests proved the remote transport for both CLIs. The newly reorganized Host and GUI have not been re-enabled in the user's profile.
- Host-level blocking of an owner bypassing the plugin UI and invoking native `session/prompt` is a documented platform limitation, not hidden behind a private or late guard.
