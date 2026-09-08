# Workbench overhaul — 8 September 2026

## Verdict and scope

The first redesign preserved the old silhouette and was rejected as too similar. This iteration changes the composition: full-height destination rail, vertical projects inside the resizable sidebar, one native title strip, and a grouped work ledger instead of six horizontally scrolling columns. Specialist view bodies remain unchanged; this is the shell and primary work surface overhaul, not a rewrite of every tool.

Worked in the isolated `maestro-session-images` worktree on `feat/workbench-overhaul`, based on `26dd80b`. No new dependencies, lockfile, credentials, Rust source or NanoClaw changes.

## Design decisions and critique

- Separate global destinations from projects. The rail stays present while project details can collapse; project switching/reordering now supports vertical arrows and drag.
- Replace empty kanban columns with one starting point. Stage filters retain counts and specific empty explanations; stale-source warnings remain visible outside filters.
- Read work across rows: project, objective, state. Container queries stack the objective when the central pane narrows. The canvas has no horizontal minimum width.
- Preserve terminal ownership: `MultiProjectView` remains a single unconditional mounted child. Navigation only changes view layers, selection and focus.
- Design-taste guidance informed the structural hierarchy, restrained colour, typography and responsive rows. No new fonts, ornamental dashboards or fabricated activity were introduced.

## Test-first and review

The initial behavioural tests failed on real assertions: missing rail/filter controls and missing vertical orientation (7 failures, 42 passes). Corrected a fixture assumption: `NeedsInput` belongs to Building, so the cross-stage session fixture uses Done. Existing stale-column assertions now select an otherwise hidden empty stage before inspecting it.

Independent source review identified and drove fixes for:

1. Filter/rail focus blocking j/k. Keyboard selection now focuses and scrolls the actual selected work row; native button activation owns Enter. A focused-filter regression failed before the fix, including repeat entry with one already-selected row.
2. Map remaining open behind Workflows. Workflows now closes all covering views through the common workbench navigation callback.
3. Search selecting a terminal behind Work. Search now reveals terminals before selecting/zooming, including project-only results.

Also retained utility toggle state and health indicators, and routed New terminal through the idle-project-capable add-session path. Explicit source assertions cover search ordering, all cover-store closures and the permanent terminal root. These source assertions are not a substitute for interactive app testing. Final independent review found no remaining Critical or Important issues.

## Verification

- `tsc --noEmit`: exit 0.
- `biome check .`: exit 0, 400 files.
- Full `npm test`: exit 0, 1,442 tests in 119 files; no test exclusions in the full gate. Targeted `-t` runs during the red phase intentionally selected one regression, without editing test skips.
- `git diff --check`: exit 0.
- Native bundle build and installation: pending final build.

No browser/native automation surface is available in this environment. Source inspection and component tests cannot certify rendered spacing, contrast or visual appeal. The user must confirm the actual installed app. Live SSH/Telegram image delivery remains outside this redesign's verification scope.

## Integration

Pending final build/review before local fast-forward and recoverable installation. Existing app was not running during the pre-install probe (`ECONNREFUSED` on 9900; no `maestro` process), so that failed probe is not claimed as runtime success.
