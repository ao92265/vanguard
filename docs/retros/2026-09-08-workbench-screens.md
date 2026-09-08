# Workbench screens — 8 September 2026

## Scope and design

The approved bounded follow-up extends the structural workbench redesign into
session setup, Inbox and Factory. Existing terminal lifecycle and action handlers
are retained. No mobile client or relay expansion is included.

The design-taste skill informed quiet chrome, larger working areas and progressive
disclosure. Design dials: variance 5, motion 1, density 5. Existing theme tokens,
fonts and icon library are retained.

| Before | After | Why |
| --- | --- | --- |
| Compact launch card with integration controls always visible | Spacious setup with advanced settings collapsed | Keep branch/worktree safety visible without overwhelming launch |
| Actions embedded throughout the Inbox list | Priority queue with a focused detail pane | Inspect before acting, with explicit navigation |
| Spec editor always beside Factory runs | Runs-first view; New run opens the retained editor | Give monitoring the default working area |

## Test-first implementation and review

The three initial behaviour assertions failed for the expected missing behaviour,
then passed after implementation. An unrelated Tauri persistence mock error was
removed before accepting the Inbox red result. Review-driven regressions covered
detail focus and return focus, isolated rename state between inspected sessions,
and Factory editor focus while preserving drafts. All passed after fixes.

The reviewer reported no remaining Critical or Important findings. No new skipped
tests, placeholders or production stubs were introduced.

## Verification

All commands below exited 0 on the final source tree:

- `./node_modules/.bin/tsc --noEmit`
- `./node_modules/.bin/biome check .` — 402 files
- `npm test` — 1,446 tests in 121 files
- `npm run tauri build -- --bundles app` — release app bundle
- `TMPDIR=/private/tmp cargo test --locked --lib -- --test-threads=1` —
  1,246 passed, three pre-existing ignored tests
- `cargo clippy --locked --example image_staging_probe` — four existing unrelated warnings
- `cargo run --locked --example image_staging_probe`
- `git diff --check`

Build warnings remain for chunk sizes, stale Browserslist data and the existing
bundle identifier. Dependencies and lockfiles were not changed.

## Image-delivery evidence and limits

The diagnostic example exercises the production local service and generated Linux
upload/cleanup scripts. It checks byte preservation, directory mode 0700, file mode
0600, collisions, truncated uploads, ownership checks and cleanup. Linux runs as an
unprivileged user in an automatically removed, network-disabled, read-only Ubuntu
container with only a temporary filesystem; no host mounts or credentials.

An initial undersized synthetic PNG was correctly rejected (probe exit 101).
Replacing it with the existing real bundled PNG made the diagnostic pass. The
example is explicitly Unix-only and does not change production visibility.

The seven attachment unit tests passed. NanoClaw's five controlled Telegram/image
bridge tests also passed with exit 0 in its isolated worktree; NanoClaw was not edited.
These are not live Telegram or SSH transport evidence.

No corporate SSH host was contacted. A Linux alias/disposable session and a user
photo reply were requested and remain outstanding. The real clipboard, SSH agent
path consumption and Telegram photo round trip are not certified.

## Visual confirmation

The available UI inventory contained no browsers or apps. Source, interaction
tests and review support the changes, but the user must confirm the installed
screens in the real app; no screenshot-only visual certification is claimed.
