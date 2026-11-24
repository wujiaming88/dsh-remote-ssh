# Changelog

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
