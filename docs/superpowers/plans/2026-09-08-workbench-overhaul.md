# Vanguard Workbench Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, with test-driven-development for each behavioural change.

**Goal:** Replace the desktop composition with a rail, vertical projects and a work ledger while preserving agent workflows.

**Architecture:** App owns navigation and terminal lifetime. TopBar gains an explicit rail presentation using the same callbacks; ProjectTabs gains vertical presentation and keyboard orientation. BoardView filters its existing assembled data for both rendering and keyboard navigation.

**Tech Stack:** Existing React, TypeScript, Zustand, Tailwind, Lucide and Tauri.

**Spec:** `docs/superpowers/specs/2026-09-08-workbench-overhaul-design.md`

## Global constraints

No new dependencies, credentials, schema, lockfiles or Rust source changes. Preserve terminal mounting and routing callbacks. No hidden launch/send/delete side effects. Work only in the isolated worktree.

## Task 1: Rail and project navigation

Files: `src/components/shared/TopBar.tsx`, `WorkbenchRail.tsx`, `WorkbenchTitleBar.tsx`, `ProjectTabs.tsx`, their `__tests__`, `src/components/sidebar/Sidebar.tsx`, `src/App.tsx`.

- [ ] Add tests against TopBar with `layout="rail"`: selected Home is marked current and clicking it does not toggle it closed; Work and Terminals dispatch the existing Board boolean callback. Render ProjectTabs with `vertical` and assert ArrowDown selects the next project and close does not also select it.
- [ ] Run targeted Vitest, observe assertion failures in real existing components.
- [ ] Add `layout?: "toolbar" | "rail"` to TopBar and `vertical?: boolean` to ProjectTabs. Render rail entries from existing callbacks. Use vertical DnD sorting strategy and axis restriction when vertical. In App, place rail beside Sidebar, pass vertical projects into a `projectNavigation?: React.ReactNode` Sidebar slot, and keep MultiProjectView in its existing permanent main position.
- [ ] Put native window actions/search/new-terminal in WorkbenchTitleBar. Reuse `getCurrentWindow`, `setQuickOpenOpen`, existing active-project/eagle launch handlers and macOS inset. Work/Terminals callback closes full-screen stores then sets Board state; no terminal lifecycle call.
- [ ] Rerun targeted tests and typecheck.

## Task 2: Work ledger

Files: `src/components/board/BoardView.tsx`, `BoardCard.tsx`, `BoardColumn.tsx`, `__tests__/BoardView.test.tsx`, `src/styles/globals.css`.

- [ ] Add a two-stage fixture and select Review: Building disappears, j/Enter only opens the review item. Change filter after selecting a Building item: Enter never opens that hidden card. Assert stale process/PR warning remains outside the stage filter.
- [ ] Run the new tests to assertion failure.
- [ ] Add `stageFilter: BoardColumnKey | "all"`. Derive `visibleKeys = stageFilter === "all" ? BOARD_COLUMN_ORDER : [stageFilter]`; use visibleKeys for both flat keyboard cards and rendered sections. Keep source warnings above filters. Render all stage buttons with counts and aria-pressed; remove horizontal min-width. Restyle existing cards as full-width work rows with project, objective and state sections.
- [ ] Preserve empty explanations, disabled cards, peek modal guards and click routing. Guard Board keyboard handling against button/link targets so filter Enter cannot also activate a card.
- [ ] Run all board tests, then full frontend gates and app bundle build.

## Task 3: Review, integration and installation

- [ ] Independently review source for navigation, stacking, drag, filtering and focus defects. Fix Important findings and rerun affected gates.
- [ ] Record before/after critique and command exit codes in `docs/retros/2026-09-08-workbench-overhaul.md`.
- [ ] Commit exact scoped files and fast-forward the original Vanguard feature branch. Rerun tests on the merged tree.
- [ ] Preserve installed app as rollback, sign/verify built bundle, confirm no live sessions before restart, install and probe running endpoints. If sessions exist, stop for restart approval.
- [ ] Ask user to confirm the actual design in Vanguard, explicitly separate runtime checks from visual approval.
