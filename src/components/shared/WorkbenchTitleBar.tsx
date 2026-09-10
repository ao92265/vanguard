import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useMemo } from "react";
import { isMac } from "@/lib/platform";

export function WorkbenchTitleBar({ projectName }: { projectName?: string }) {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  return (
    <header
      data-tauri-drag-region
      className="workbench-titlebar flex h-7 shrink-0 items-center gap-2 border-b border-maestro-border pr-3"
      style={{ paddingLeft: "max(var(--mac-title-bar-inset, 0px), 16px)" }}
    >
      {/* The wordmark used to live at the head of the rail, one row under this
          bar, so the app's name and the open project stacked into a column of
          two small labels with a hairline between them. They read as one line
          here instead, and the rail starts at its first destination. */}
      <span data-tauri-drag-region className="workbench-brand-mark">
        V
      </span>
      <span data-tauri-drag-region className="text-xs font-semibold text-maestro-text">
        Vanguard
      </span>
      <span data-tauri-drag-region aria-hidden="true" className="workbench-titlebar-divider" />
      <span data-tauri-drag-region className="min-w-0 truncate text-xs text-maestro-muted">
        {projectName ?? "Workspace"}
      </span>
      <div data-tauri-drag-region className="h-full min-w-3 flex-1" />
      {!isMac() && (
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => appWindow.minimize()}
            className="flex h-7 w-10 items-center justify-center text-maestro-muted hover:bg-maestro-card"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            aria-label="Maximize"
            onClick={() => appWindow.toggleMaximize()}
            className="flex h-7 w-10 items-center justify-center text-maestro-muted hover:bg-maestro-card"
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => appWindow.close()}
            className="flex h-7 w-10 items-center justify-center text-maestro-muted hover:bg-maestro-red/80 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  );
}
