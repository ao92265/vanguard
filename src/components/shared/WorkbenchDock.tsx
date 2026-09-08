import { HealthAttentionBadge } from "./HealthAttentionBadge";
import type { UtilityPanelKind } from "./UtilityPanel";

const TOOLS: { panel: UtilityPanelKind; label: string; abbreviation: string }[] = [
  { panel: "ai", label: "AI", abbreviation: "AI" },
  { panel: "processes", label: "Processes", abbreviation: "Proc" },
  { panel: "notes", label: "Notes", abbreviation: "Notes" },
  { panel: "memory", label: "Memory", abbreviation: "Mem" },
  { panel: "secondbrain", label: "Second Brain", abbreviation: "Brain" },
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
      <button type="button" aria-label="Git" aria-pressed={gitOpen} onClick={onToggleGit}>
        Git
      </button>
      {TOOLS.map(({ panel, label, abbreviation }) => (
        <button
          key={panel}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={activePanel === panel}
          onClick={() => onSelect(panel)}
        >
          {abbreviation}
          {(panel === "processes" || panel === "memory") && <HealthAttentionBadge area={panel} />}
        </button>
      ))}
    </aside>
  );
}
