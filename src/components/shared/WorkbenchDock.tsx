import { GitBranch } from "lucide-react";
import { HealthAttentionBadge } from "./HealthAttentionBadge";
import { PANEL_META, type UtilityPanelKind } from "./UtilityPanel";

/**
 * The dock is a 68px column, which is too narrow for a word, so the labels had
 * become abbreviations ("Proc", "Mem", "Brain") that are no faster to read
 * than a glyph and less certain. Icons say the same six things in the width
 * available. The name is still there for anyone who wants it, in the tooltip
 * and as the accessible name, so nothing about reaching a panel by name
 * changes.
 */
const TOOLS: UtilityPanelKind[] = [
  "ai",
  "conversation",
  "processes",
  "notes",
  "memory",
  "secondbrain",
];

export function WorkbenchDock({
  activePanel,
  onSelect,
  gitOpen,
  onToggleGit,
}: {
  activePanel: UtilityPanelKind | null;
  onSelect: (panel: UtilityPanelKind) => void;
  gitOpen: boolean;
  onToggleGit: () => void;
}) {
  return (
    <aside aria-label="Utilities" className="workbench-dock">
      <button
        type="button"
        aria-label="Git"
        title="Git"
        aria-pressed={gitOpen}
        onClick={onToggleGit}
      >
        <GitBranch size={16} aria-hidden="true" />
      </button>
      {TOOLS.map((panel) => {
        const { title, icon: Icon } = PANEL_META[panel];
        return (
          <button
            key={panel}
            type="button"
            aria-label={title}
            title={title}
            aria-pressed={activePanel === panel}
            onClick={() => onSelect(panel)}
          >
            <Icon size={16} aria-hidden="true" />
            {(panel === "processes" || panel === "memory") && <HealthAttentionBadge area={panel} />}
          </button>
        );
      })}
    </aside>
  );
}
