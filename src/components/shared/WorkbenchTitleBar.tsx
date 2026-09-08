import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Plus, Search, Square, X } from "lucide-react";
import { useMemo } from "react";
import { isMac } from "@/lib/platform";
import { modLabel } from "@/lib/shortcuts";

export function WorkbenchTitleBar({
  projectName,
  onSearch,
  onAddSession,
  canAddSession,
}: {
  projectName?: string;
  onSearch: () => void;
  onAddSession: () => void;
  canAddSession: boolean;
}) {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  return (
    <header
      data-tauri-drag-region
      className="workbench-titlebar flex h-12 shrink-0 items-center gap-4 border-b border-maestro-border pr-3"
      style={{ paddingLeft: "max(var(--mac-title-bar-inset, 0px), 16px)" }}
    >
      <span
        data-tauri-drag-region
        className="text-xs font-semibold tracking-tight text-maestro-text"
      >
        Vanguard
      </span>
      <span data-tauri-drag-region className="min-w-0 truncate text-xs text-maestro-muted">
        {projectName ?? "Workspace"}
      </span>
      <div data-tauri-drag-region className="h-full min-w-3 flex-1" />
      <button
        type="button"
        onClick={onSearch}
        className="flex shrink-0 items-center gap-3 rounded-md border border-maestro-border px-3 py-1.5 text-xs text-maestro-muted hover:text-maestro-text"
        aria-label="Find project or terminal"
      >
        <Search size={13} />
        <span className="hidden sm:inline">Find anything</span>
        <kbd className="text-[10px]">{modLabel()}P</kbd>
      </button>
      <button
        type="button"
        onClick={onAddSession}
        disabled={!canAddSession}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-maestro-accent px-3 py-1.5 text-xs font-medium text-maestro-bg disabled:opacity-40"
        aria-label="New terminal"
      >
        <Plus size={14} />
        <span className="hidden sm:inline">New terminal</span>
      </button>
      {!isMac() && (
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => appWindow.minimize()}
            className="p-3 text-maestro-muted hover:bg-maestro-card"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            aria-label="Maximize"
            onClick={() => appWindow.toggleMaximize()}
            className="p-3 text-maestro-muted hover:bg-maestro-card"
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => appWindow.close()}
            className="p-3 text-maestro-muted hover:bg-maestro-red/80 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  );
}
