# Workspace redesign

## Direction

User delegated design decisions and execution. Bounded redesign of the existing desktop shell, sidebar, board and decision queue; preserve navigation callbacks, terminal lifecycle, saved themes, project ordering and agent actions. Graphite surfaces, native system typography, existing violet brand colour, restrained borders and stronger hierarchy. Design variance 3/10, motion 1/10, density 7/10. No new packages or external fonts.

## Acceptance checklist before edits

- Primary workspace controls display readable labels when space permits and expose selected state accessibly.
- More and project menus close on Escape, restore trigger focus and never accidentally dispatch an action.
- Sidebar collapse removes its controls from keyboard navigation; saved width and tab shortcuts remain unchanged.
- Project tabs retain reorder, close and keyboard behaviour, and scroll without pushing window controls offscreen.
- Board columns, queue rows, stale/error states and all existing actions remain available.
- Typography, focus rings and light/dark foregrounds remain readable. Reduced-motion preference disables decorative animation.
- Run typecheck, Biome, all frontend tests and production/native builds; record exit codes. Review source and browser layout, then obtain confirmation in the real app.

## Baseline

`npm test`: exit 0, 1,431 tests. Work in the existing isolated agent worktree on `feat/workspace-redesign`; no shared checkout edits.

## Critique and refinement

| Before | After | Why |
| --- | --- | --- |
| Unlabelled view icons, no selected-state semantics | Responsive text labels and `aria-pressed` | Make destinations and current state discoverable |
| Shadowed sidebar cards and glowing board alerts | Flatter sections, explicit alert borders | Reserve emphasis for work needing attention |
| Tiny uppercase section headings | Native system type with larger sentence-case headings | Improve scan speed without changing workflow |
| Menus ignore Escape | Scoped Escape dismissal with trigger focus restored | Preserve keyboard context without launching actions |
| Sidebar width collapses but controls remain exposed | Hidden visibility while collapsed | Remove offscreen controls from navigation |
| Responsive toolbar containment can alter stacking | Explicit toolbar and content layers, no sidebar containment | Keep dropdowns above content and global dialogs above both |
| Expanded title-strip wrapper intercepts dragging | Tauri drag attribute on blank wrapper, full-height spacer | Preserve native drag/double-click behaviour |
| Long tab names can squeeze indicators | Truncated names with non-shrinking status/count/close controls | Keep operational state visible |

## Verification

- Red-green tests observed: missing selected-state semantics, both Escape paths, and collapsed sidebar visibility. Final frontend suite: `npm test`, exit 0, 1,435 tests across 118 files.
- `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/biome check .` and `git diff --check`: exit 0.
- `npm run build`: exit 0. Existing Browserslist and chunk-size warnings remain.
- Palette contrast assertions: primary/muted text against all three base surfaces exceed 4.5:1. Lowest measured muted contrast is 5.51:1; selected navigation text is 5.18:1 dark and 5.06:1 light. This is not a whole-app contrast audit of legacy translucent status styles.
- Independent reviewer rechecked the refinements and found no remaining Critical or Important issue in scope.
- No browser surface is available and native UI automation is disabled. Visual layout, dragging, light/dark appearance and menus still require real-app confirmation; no screenshot-based sign-off claimed.
- No dependencies, credentials, schemas, lockfiles or Rust source changed. NanoClaw was not changed by this redesign.

## Integration

- Final `npm run tauri build -- --bundles app`: exit 0. Locally merged `6157980` into `feat/control-door`; post-merge `npm test`: exit 0, 1,435 tests. No push.
- Installed and restarted `/Applications/Vanguard.app` after confirming zero registered sessions. Local ad-hoc signing, installed signature verification and binary SHA-256 comparison passed (exit 0).
- Previous image-enabled app preserved at `/Users/aoreilly/Library/Application Support/Vanguard-rollback.HqLr96/Vanguard.app`. No rollback files deleted.
- Browser preview process stopped. Next: user confirms the installed layout, title dragging, menu visibility and light/dark appearance in their real app.
