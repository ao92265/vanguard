import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { ImageDeliverySheet } from "./ImageDeliverySheet";

/**
 * The per-terminal image bar: where this session's images are staged, and the
 * way into the delivery sheet.
 *
 * The destination is an attachment destination and nothing more. It is not an
 * execution host: sessions always run locally, and setting this only changes
 * where a pasted image is written before its path is handed to the agent.
 */
export function ImageDestination({
  sessionId,
  onSheetOpenChange,
}: {
  sessionId: number;
  /**
   * Fires as the delivery sheet opens and closes. TerminalView uses it to
   * stand its own paste listener down, so an image cannot be uploaded twice
   * by the sheet and the terminal at the same time.
   */
  onSheetOpenChange?: (open: boolean) => void;
}) {
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const deliverRef = useRef<HTMLButtonElement>(null);
  // Focus goes back to the control that opened the sheet, not to the document.
  const returnFocus = useRef(false);
  const onSheetOpenChangeRef = useRef(onSheetOpenChange);
  onSheetOpenChangeRef.current = onSheetOpenChange;

  useEffect(() => {
    let current = true;
    invoke<string | null>("get_image_target", { sessionId })
      .then((value) => {
        if (current) {
          setTarget(value ?? "");
          setSaved(value);
          setLoaded(true);
        }
      })
      .catch((reason) => {
        if (current) setError(String(reason));
      });
    return () => {
      current = false;
    };
  }, [sessionId]);

  useEffect(() => {
    onSheetOpenChangeRef.current?.(sheetOpen);
    if (!sheetOpen && returnFocus.current) {
      returnFocus.current = false;
      deliverRef.current?.focus();
    }
  }, [sheetOpen]);

  // A closing terminal must not leave the grid thinking a sheet is still up.
  useEffect(() => () => onSheetOpenChangeRef.current?.(false), []);

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-maestro-border px-2 text-xs text-maestro-muted">
      <details className="min-w-0 flex-1">
        <summary className="cursor-pointer py-1">
          Images:{" "}
          {loaded
            ? saved || "this machine"
            : error
              ? "destination unavailable"
              : "checking destination…"}
        </summary>
        <form
          className="flex flex-wrap items-center gap-2 pb-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              const value = target.trim() || null;
              await invoke("set_image_target", { sessionId, target: value });
              setSaved(value);
              setLoaded(true);
            } catch (reason) {
              setError(String(reason));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            SSH target
            <input
              aria-label="Image SSH target"
              className="ml-2 rounded border border-maestro-border bg-maestro-bg px-2 py-1"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="SSH alias or user@host"
              disabled={busy || !loaded}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !loaded}
            className="rounded border border-maestro-border px-2 py-1"
          >
            {busy ? "Saving…" : "Apply"}
          </button>
          <span>Leave empty for this machine. Match the SSH session you opened.</span>
          {error && <span role="alert">{error}</span>}
        </form>
      </details>
      <button
        ref={deliverRef}
        type="button"
        onClick={() => {
          returnFocus.current = true;
          setSheetOpen(true);
        }}
        className="shrink-0 rounded border border-maestro-border px-2.5 py-1 text-[11.5px] font-medium text-maestro-muted transition-colors hover:border-maestro-accent/60 hover:text-maestro-text"
      >
        Deliver image
      </button>
      {sheetOpen && (
        <ImageDeliverySheet
          sessionId={sessionId}
          destination={saved}
          onDestinationChange={(next) => {
            setSaved(next);
            setTarget(next ?? "");
            setLoaded(true);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
