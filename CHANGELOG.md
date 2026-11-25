# Changelog

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
