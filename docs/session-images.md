# Session images

Clipboard images and Telegram photo replies use the same session attachment service. The service uploads the bytes before pasting a path, and checks that the session and configured destination still match.

## Using clipboard paste

1. Open the terminal's **Images** disclosure.
2. For a local agent, leave the SSH target empty. For a Linux SSH agent, enter the SSH config alias or `user@host` matching the session and select **Apply**.
3. Paste the screenshot. The upload status appears above the terminal. On success, the agent-visible path is pasted without pressing Enter. On failure, no path is pasted and an error is shown.

The target belongs to the session and must be selected again for a new session. It does not open SSH, detect manually typed SSH commands, or follow nested SSH sessions. Clear/change it when moving between local and remote shells. Set custom ports, jump hosts and identity-file settings in the chosen SSH alias. Uploads use system SSH with batch authentication, strict known-host checking, a 10-second connect limit and a 30-second transfer limit; they never prompt for a password or accept a new host key automatically. Remote staging requires a POSIX shell and standard `mkdir`, `cat`, `wc`, `rm` and `rmdir` commands.

## Telegram

Run the corresponding NanoClaw `feat/session-images` changes as well. Send a photo as a reply to a single-session Maestro alert. The existing token-authenticated loopback control door resolves the session and checks that the same blocked marker is still current after uploading. Ambiguous alerts are rejected. The photo path and optional single-line caption are submitted together.

Ordinary Telegram photos go to NanoClaw's existing group/container pipeline instead. Send an image as a **photo**, not as a document/file; document-message support is outside this change.

## Bounds and cleanup

Images are limited to 10 MiB and checked for PNG, JPEG, GIF or WebP signatures matching their declared type. This is signature validation, not full image decoding. SVG/BMP and empty inputs are rejected. Two uploads and two cleanup operations may run concurrently; Maestro retains at most approximately 128 tracked images. Local Unix directories/files use `0700`/`0600` and exclusive creation. Remote paths are generated beneath `/tmp`, contain no user filename, and carry an independent ownership marker. Remote byte-count checking rejects truncated transfers.

Maestro expires images after 24 hours (checked once per minute) or on session close. Failed cleanup remains tracked and is retried while Maestro runs. Cleanup removes only its generated file, ownership marker and empty directory. App shutdown/crash loses the in-memory cleanup queue; disconnected hosts and orphaned files then depend on host temporary-directory retention. No durable remote cleanup journal is provided.

## Verification on 8 September 2026

From this isolated worktree:

| Check | Command | Exit |
| --- | --- | --- |
| Frontend types | `./node_modules/.bin/tsc --noEmit` | 0 |
| Frontend lint | `./node_modules/.bin/biome check .` | 0 |
| Frontend tests | `npm test` — 1,431 passed | 0 |
| Frontend build | `npm run build` | 0 |
| Rust types | `cargo check --locked -p maestro --lib` | 0 |
| Rust lint | `cargo clippy --locked -p maestro --lib` | 0 |
| Rust tests | `TMPDIR=/private/tmp cargo test --locked --lib` from `src-tauri` — 1,246 passed, 3 existing ignored | 0 |
| Native build | `cargo build --locked -p maestro` from `src-tauri` | 0 |
| MCP sidecar | `cargo build --locked --release -p maestro-mcp-server` | 0 |

The canonical `TMPDIR` avoids an existing test's `/var` versus `/private/var` path mismatch. The ignored tests require a running ACT, an ACT checkout, or real user configuration; none was enabled or bypassed. Clippy reports four existing warnings in unrelated files. Frontend builds report existing chunk-size/Browserslist warnings.

Tests include destination rejection, interrupted transfer, binary preservation, private permissions, non-clobbering cleanup, cleanup retry state, stale destination rejection, independent session locking, IPC session binding and control endpoint authentication. A separate reviewer rechecked the cleanup, UI identity and blocking-I/O fixes and found no remaining Critical or Important issue in that focused review.

Live SSH, live Telegram delivery and the appearance/behaviour in the real Maestro app still require user confirmation. Source tests and builds do not certify those checks. No app was installed, restarted or deployed, and no credentials or lockfiles were changed.
