# Vanguard workbench overhaul

## Intent

The first redesign retained the original composition and the user rejected it as too similar. The user's prior instruction delegates design choices and execution. This revision changes information architecture, not just colour: a narrow full-height navigation rail, vertical project navigator inside the project sidebar, a single native title strip and a filterable work ledger replacing the six-column kanban. Existing specialist views inherit the new shell but keep their domain controls.

## Structure

- Native title strip: Vanguard identity, current project, search, new terminal and window controls. Keep Tauri drag targeting and macOS traffic-light inset.
- Global navigation rail: Work, Terminals, Inbox, Factory, Orchestrator, Pulse, plus expandable tools for fleet/map, Git, processes, AI, memory, workflows and extensions. Active primary navigation is idempotent. Work/Terminals navigation closes covering overlays without unmounting the underlying terminal grid.
- Project sidebar: vertically sortable project list with counts, close and open actions, then existing General/History/Settings content. Preserve stored sidebar width and visibility. ArrowUp/Down select projects; modifier+Shift+arrows reorder; existing horizontal shortcuts remain supported.
- Work ledger: all six stages remain available as filters, with one vertical reading order. All shows grouped rows, without a horizontal minimum width. Selecting a stage limits both rendered cards and j/k/Enter navigation. Stale-source warnings remain visible even when their stage is filtered out. No state is fabricated.
- Visual language: compact rail against a raised central canvas, stronger title hierarchy, broad work rows with project/objective/status columns. Native type, existing violet brand, semantic status colours, explicit focus and reduced motion. Variance 6/10, motion 1/10, density 6/10.

## Constraints and verification

No new dependencies, credentials, schema, lockfiles or Rust source changes. Work only in the existing isolated worktree on feat/workbench-overhaul. Preserve terminal mounting and routing callbacks. No hidden launch/send/delete side effects. Test the existing components' new layout contracts and filtering first; missing modules do not count as red. Run typecheck, Biome, frontend tests, frontend/native build and an independent source review before integration. Real-app visual confirmation remains required because this session has no screen/browser surface.
