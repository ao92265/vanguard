import { type LucideIcon, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { type ReactNode, useState } from "react";

export interface RailDestination {
  label: string;
  icon: LucideIcon;
  selected?: boolean;
  pressed?: boolean;
  attention?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  onClick?: () => void;
}

export function WorkbenchRail({
  primary,
  tools,
  projectNavigation,
}: {
  primary: RailDestination[];
  tools: RailDestination[];
  projectNavigation?: ReactNode;
}) {
  /* One control decides the width, and the content column gives up exactly
     that width. The rail used to widen on hover and float over the terminals
     instead, so passing the mouse never resized a live session, but it also
     meant expanding appeared to move nothing. */
  const [expanded, setExpanded] = useState(false);
  const destination = ({
    label,
    icon: Icon,
    selected,
    pressed,
    attention,
    disabled,
    badge,
    onClick,
  }: RailDestination) =>
    onClick && (
      <button
        key={label}
        type="button"
        aria-label={label}
        aria-current={selected ? "page" : undefined}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={() => {
          if (!selected) onClick();
        }}
        className="workbench-rail-row"
      >
        <span className="workbench-rail-icon">
          <Icon size={16} strokeWidth={1.75} />
          {badge}
        </span>
        <span className="workbench-rail-label">{label}</span>
        {attention && (
          <span role="img" className="workbench-attention" aria-label="Needs attention" />
        )}
      </button>
    );
  return (
    <>
      {/* The width the content column gives up. The rail is positioned over
          this and the two always agree, so widening the rail moves the page
          rather than covering it. */}
      <div className="workbench-rail-slot" data-expanded={expanded} aria-hidden="true" />
      <nav aria-label="Workspace" data-expanded={expanded} className="workbench-rail">
        <div className="workbench-navigation">
          {primary.map((item) => destination(item))}
          {/* Everything that used to hide behind a More menu. One click each,
              nothing to open first. They sat at the foot of the rail, below the
              projects and away from the rest of the navigation, so they read as
              leftovers rather than places to go. */}
          <div className="workbench-project-divider" />
          {tools.map((item) => destination(item))}
        </div>
        <div className="workbench-project-divider" />
        {projectNavigation}
        <div className="workbench-rail-bottom">
          <button
            type="button"
            aria-label="Wide menu"
            aria-pressed={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="workbench-rail-row"
          >
            <span className="workbench-rail-icon">
              {expanded ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </span>
            <span className="workbench-rail-label">Narrow the menu</span>
          </button>
        </div>
      </nav>
    </>
  );
}
