import { PanelRight } from "lucide-react";

/**
 * Opens the right-hand tools panel, from the right-hand edge.
 *
 * This control used to sit in the left rail's More menu as "Toggle sidebar",
 * next to a control that changed the width of the rail itself. Two controls
 * for opposite sides of the screen, both on the left, read as two versions of
 * the same thing. Closing the panel stays with the panel's own close button,
 * so each state has exactly one control and it is where the panel is.
 */
export function ToolsEdgeToggle({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  if (open) return null;
  return (
    <button
      type="button"
      aria-label="Open tools"
      title="Git, AI, processes, notes, memory"
      onClick={onOpen}
      className="absolute right-0 top-1/2 z-50 -translate-y-1/2 rounded-l-md border border-r-0 border-maestro-border bg-maestro-surface px-1.5 py-3 text-maestro-muted transition-colors hover:text-maestro-text"
    >
      <PanelRight size={14} />
    </button>
  );
}
