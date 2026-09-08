import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export function ImageDestination({ sessionId }: { sessionId: number }) {
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
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

  return (
    <details className="shrink-0 border-b border-maestro-border px-2 text-xs text-maestro-muted">
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
  );
}
