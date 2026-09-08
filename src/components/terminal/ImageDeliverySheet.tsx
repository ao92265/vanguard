import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { type StagedImage, savePastedImage } from "@/lib/terminal";

/**
 * The image delivery sheet.
 *
 * Everything on it is something this backend actually does. Three things the
 * approved design shows are deliberately absent, because nothing here can
 * report them: a verified execution host (there is no remote launcher, and an
 * image destination is not proof of one), a checklist of green ticks for
 * backend phases the frontend never observes (magic-byte sniff, staging
 * directory mode, known_hosts match), and a second delivery route to Telegram.
 * See the task report.
 *
 * `save_pasted_image` stages the bytes and pastes the staged path into the
 * PTY without submitting it. It returns that path, which is the only location
 * claim this sheet makes.
 */

/** Matches `MAX_IMAGE_BYTES` in `src-tauri/src/core/session_attachments.rs`. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * The session's image destination as the app actually knows it. Absence is a
 * state of its own: a destination that has not loaded, or whose lookup failed,
 * must never be rendered as a place.
 */
export type ImageDestinationState =
  | { known: true; ssh: string | null }
  | { known: false; reason: "loading" }
  | { known: false; reason: "unavailable"; message: string };

export interface ImageDeliverySheetProps {
  sessionId: number;
  /** Saved image destination for this session, and whether it is known at all. */
  destination: ImageDestinationState;
  /** Fires when this sheet changes the session's destination, so the bar agrees. */
  onDestinationChange: (next: string | null) => void;
  onClose: () => void;
}

/** What the clipboard turned out to hold. */
type Clipboard =
  | { state: "reading" }
  | { state: "ready"; bytes: Uint8Array; mediaType: string; size: number }
  | { state: "empty" }
  | { state: "error"; message: string };

/** Where a delivery attempt got to. */
type Transfer =
  | { state: "idle" }
  | { state: "sending" }
  | {
      state: "sent";
      /** What the backend reports it did. The only authority on where the file is. */
      staged: StagedImage;
      /**
       * The destination this sheet was showing when the button was pressed, or
       * undefined when it was showing that it did not know. Compared with the
       * backend's answer only to tell the user the two differed.
       */
      shown: string | null | undefined;
    }
  | { state: "failed"; message: string };

/** A place the backend has named. Never used for a destination we do not have. */
function placeLabel(ssh: string | null): string {
  return ssh ?? "this machine";
}

/**
 * What to print for the session's destination. An unloaded or failed lookup
 * prints as the state it is in, never as a place: the backend reads its own
 * target when it stages, so a frontend that has not loaded one knows nothing
 * about where an image would go.
 */
function describeDestination(destination: ImageDestinationState): string {
  if (destination.known) return placeLabel(destination.ssh);
  return destination.reason === "loading" ? "still loading" : "not known";
}

/** Byte count in the unit a person would use for it. */
function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

/** "image/png" as a person writes it. */
function formatMediaType(mediaType: string): string {
  const subtype = mediaType.startsWith("image/") ? mediaType.slice("image/".length) : mediaType;
  return subtype.toUpperCase();
}

/** The first image on a clipboard read, as bytes, or null when there is none. */
async function readClipboardImage(): Promise<Clipboard> {
  const clipboard = navigator.clipboard as { read?: () => Promise<ClipboardItem[]> } | undefined;
  if (!clipboard?.read) {
    return { state: "error", message: "This webview does not expose clipboard reads." };
  }
  const items = await clipboard.read();
  for (const item of items) {
    const mediaType = item.types.find((type) => type.startsWith("image/"));
    if (!mediaType) continue;
    const blob = await item.getType(mediaType);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { state: "ready", bytes, mediaType, size: bytes.byteLength };
  }
  return { state: "empty" };
}

const LABEL_CLASS =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted";

export function ImageDeliverySheet({
  sessionId,
  destination,
  onDestinationChange,
  onClose,
}: ImageDeliverySheetProps) {
  const [clipboard, setClipboard] = useState<Clipboard>({ state: "reading" });
  const [transfer, setTransfer] = useState<Transfer>({ state: "idle" });
  const knownSsh = destination.known ? destination.ssh : null;
  const [draft, setDraft] = useState(knownSsh ?? "");
  const [savingDestination, setSavingDestination] = useState(false);
  const [destinationError, setDestinationError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  // What the sheet was SHOWING when a transfer started, readable from inside
  // that transfer. It is only ever compared against the backend's answer, so
  // that a difference can be reported; it is never itself reported as the
  // place the image went.
  const shownRef = useRef<string | null | undefined>(undefined);
  shownRef.current = destination.known ? destination.ssh : undefined;
  // One delivery at a time, even if two clicks land in the same tick.
  const deliveringRef = useRef(false);

  useEffect(() => {
    let current = true;
    readClipboardImage()
      .then((result) => {
        if (current) setClipboard(result);
      })
      .catch((reason) => {
        if (current) {
          setClipboard({
            state: "error",
            message: reason instanceof Error ? reason.message : String(reason),
          });
        }
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Where this image is, or will be. Once the backend has answered, its answer
  // wins over anything the frontend was showing, so the path panel and the
  // sentence beside it can never describe two different machines.
  const effective: ImageDestinationState =
    transfer.state === "sent" ? { known: true, ssh: transfer.staged.destination } : destination;
  const handoffSentence = !effective.known
    ? "The agent is handed a path on whichever destination this session is set to."
    : effective.ssh === null
      ? "The image is written to a temporary directory on this machine, and that local path is what the agent is handed."
      : `Bytes are sent to ${effective.ssh}. The path handed over is a file on ${effective.ssh}, not on this machine.`;

  const oversized = clipboard.state === "ready" && clipboard.size > MAX_IMAGE_BYTES;
  // A delivered image stays delivered: re-arming the button after a success
  // is how one clipboard image ends up staged twice, with two paths pasted.
  // A failure does re-arm it, because retrying a failure is the point.
  const canDeliver =
    clipboard.state === "ready" &&
    !oversized &&
    transfer.state !== "sending" &&
    transfer.state !== "sent" &&
    !savingDestination;

  const deliver = useCallback(() => {
    if (clipboard.state !== "ready" || deliveringRef.current) return;
    if (clipboard.size > MAX_IMAGE_BYTES) return;
    deliveringRef.current = true;
    const shown = shownRef.current;
    setTransfer({ state: "sending" });
    savePastedImage(clipboard.bytes, clipboard.mediaType, sessionId)
      .then((staged) => {
        setTransfer({ state: "sent", staged, shown });
      })
      .catch((reason) => {
        setTransfer({
          state: "failed",
          message: reason instanceof Error ? reason.message : String(reason),
        });
      })
      .finally(() => {
        deliveringRef.current = false;
      });
  }, [clipboard, sessionId]);

  const applyDestination = useCallback(async () => {
    setSavingDestination(true);
    setDestinationError("");
    const next = draft.trim() || null;
    try {
      await invoke("set_image_target", { sessionId, target: next });
      onDestinationChange(next);
    } catch (reason) {
      setDestinationError(String(reason));
    } finally {
      setSavingDestination(false);
    }
  }, [draft, sessionId, onDestinationChange]);

  // A paste inside the sheet is the fallback for a webview that refuses
  // programmatic clipboard reads. The terminal's own paste listener is
  // suppressed while this sheet is open, so an image can only be taken once.
  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
      entry.type.startsWith("image/"),
    );
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const mediaType = item.type;
    file
      .arrayBuffer()
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        setClipboard({ state: "ready", bytes, mediaType, size: bytes.byteLength });
      })
      .catch((reason) => setClipboard({ state: "error", message: String(reason) }));
  }, []);

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/45">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Deliver image"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        onPaste={handlePaste}
        className="max-h-full overflow-y-auto border-t border-maestro-border bg-maestro-surface px-6 py-5 outline-none"
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="text-[18px] font-semibold text-maestro-text">Deliver image</span>
          <span className="font-mono text-xs text-maestro-muted">
            {clipboard.state === "reading" && "reading the clipboard…"}
            {clipboard.state === "ready" &&
              `${formatMediaType(clipboard.mediaType)} · ${formatBytes(clipboard.size)} · from the clipboard`}
            {clipboard.state === "empty" && "No image on the clipboard."}
            {clipboard.state === "error" && "clipboard unavailable"}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-maestro-muted hover:text-maestro-text"
          >
            Cancel <span className="font-mono opacity-70">esc</span>
          </button>
        </div>

        <div className="flex flex-wrap items-stretch gap-6">
          <div className="flex min-w-[260px] flex-1 flex-col gap-3">
            <span className={LABEL_CLASS}>Image destination</span>
            <div className="rounded-[10px] border border-maestro-border bg-maestro-card px-4 py-3">
              <div
                className={`font-mono text-xs ${destination.known ? "text-maestro-text" : "text-maestro-orange"}`}
              >
                {describeDestination(destination)}
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-maestro-muted">
                {destination.known
                  ? "Where this session stages images. It is the destination this app was told to write to. Nothing here has checked it, and it is not an execution target."
                  : destination.reason === "loading"
                    ? "This session's destination has not come back yet. The backend reads its own, so an image sent now still goes somewhere; this sheet just cannot say where until it lands."
                    : `Could not read this session's destination: ${destination.message}. The backend reads its own, so an image sent now still goes somewhere; this sheet cannot say where until it lands.`}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-[11px] text-maestro-muted">
                  <span className="sr-only">Image destination host</span>
                  <input
                    aria-label="Image destination host"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="SSH alias or user@host"
                    disabled={savingDestination}
                    className="w-48 rounded border border-maestro-border bg-maestro-bg px-2 py-1 font-mono text-[11px] text-maestro-text outline-none focus:border-maestro-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    applyDestination().catch(console.error);
                  }}
                  disabled={savingDestination}
                  className="rounded border border-maestro-border px-2 py-1 text-[11px] text-maestro-text hover:border-maestro-accent/60 disabled:opacity-50"
                >
                  {savingDestination ? "Setting…" : "Set destination"}
                </button>
                <span className="text-[11px] text-maestro-muted">Empty stages locally.</span>
              </div>
              {destinationError && (
                <span role="alert" className="mt-2 block text-[11px] text-maestro-red">
                  {destinationError}
                </span>
              )}
            </div>

            <span className={LABEL_CLASS}>Path handed to the agent</span>
            <div className="rounded-[10px] border border-maestro-border bg-maestro-card px-4 py-3 font-mono text-xs">
              {transfer.state === "sent" ? (
                <span className="text-maestro-text">{transfer.staged.path}</span>
              ) : (
                <span className="text-maestro-muted">
                  Not staged yet. The backend generates the path and returns it.
                </span>
              )}
            </div>
          </div>

          <div className="w-px shrink-0 bg-maestro-border" />

          <div className="flex w-[320px] shrink-0 flex-col gap-2">
            <span className={LABEL_CLASS}>What happens to it</span>
            <ul className="m-0 list-none space-y-1.5 p-0 font-mono text-[11.5px] leading-relaxed text-maestro-muted">
              <li>
                {clipboard.state === "ready"
                  ? `${formatBytes(clipboard.size)} against the 10 MB cap${oversized ? ", over it" : ""}`
                  : "10 MB cap on the image"}
              </li>
              <li>{handoffSentence}</li>
              <li>Staged files are kept for 24 hours, and removed when the session closes.</li>
              <li>The staged path is pasted into the terminal, not submitted.</li>
            </ul>
          </div>

          <div className="flex w-[190px] shrink-0 flex-col justify-end gap-2.5">
            <button
              type="button"
              onClick={deliver}
              disabled={!canDeliver}
              className="rounded-[9px] bg-maestro-accent px-4 py-3 text-[13px] font-medium text-maestro-onAccent disabled:opacity-40"
            >
              Deliver image
            </button>
          </div>
        </div>

        {oversized && (
          <p className="mt-4 text-[11.5px] text-maestro-red">
            This image is over the 10 MB cap the backend enforces, so it cannot be staged.
          </p>
        )}
        {clipboard.state === "error" && (
          <p role="alert" className="mt-4 text-[11.5px] text-maestro-red">
            Could not read the clipboard: {clipboard.message}. Pasting into the terminal still
            works.
          </p>
        )}
        {transfer.state === "failed" && (
          <p role="alert" className="mt-4 text-[11.5px] text-maestro-red">
            {transfer.message}
          </p>
        )}
        {(transfer.state === "sending" || transfer.state === "sent") && (
          <output className="mt-4 block text-[11.5px] text-maestro-text">
            {transfer.state === "sending"
              ? "Staging the image…"
              : transfer.shown !== undefined && transfer.shown !== transfer.staged.destination
                ? `The destination changed while this transfer was running. The image went to ${placeLabel(transfer.staged.destination)}, not ${placeLabel(transfer.shown)}.`
                : `Staged on ${placeLabel(transfer.staged.destination)} and pasted into the terminal.`}
          </output>
        )}
      </div>
    </div>
  );
}
