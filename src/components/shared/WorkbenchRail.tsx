import { type LucideIcon, MoreHorizontal, PanelLeft, Pin } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

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
  sidebarOpen,
  onToggleSidebar,
  footer,
  projectNavigation,
}: {
  primary: RailDestination[];
  tools: RailDestination[];
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  footer?: ReactNode;
  projectNavigation?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const destination = (
    { label, icon: Icon, selected, pressed, attention, disabled, badge, onClick }: RailDestination,
    closeMore = false,
  ) =>
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
          if (closeMore) setMoreOpen(false);
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
    <nav
      aria-label="Workspace"
      data-expanded={pinned || hovered || focused || moreOpen}
      className="workbench-rail"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
          setMoreOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && moreOpen) {
          event.stopPropagation();
          setMoreOpen(false);
          moreRef.current?.focus();
        }
      }}
    >
      <div className="workbench-brand">
        <span className="workbench-brand-mark">V</span>
        <span className="workbench-rail-label">Vanguard</span>
      </div>
      <div className="workbench-navigation">{primary.map((item) => destination(item))}</div>
      <div className="workbench-project-divider" />
      {projectNavigation}
      <div className="workbench-rail-bottom">
        {moreOpen && (
          <div className="workbench-more">
            {tools.map((item) => destination(item, true))}
            {destination(
              {
                label: "Toggle sidebar",
                icon: PanelLeft,
                pressed: sidebarOpen,
                onClick: onToggleSidebar,
              },
              true,
            )}
            {footer}
          </div>
        )}
        <button
          type="button"
          aria-label="Pin navigation"
          aria-pressed={pinned}
          onClick={() => setPinned((value) => !value)}
          className="workbench-rail-row"
        >
          <span className="workbench-rail-icon">
            <Pin size={16} />
          </span>
          <span className="workbench-rail-label">Pin navigation</span>
        </button>
        <button
          ref={moreRef}
          type="button"
          aria-label="More"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((value) => !value)}
          className="workbench-rail-row"
        >
          <span className="workbench-rail-icon">
            <MoreHorizontal size={16} />
          </span>
          <span className="workbench-rail-label">More</span>
          {tools.some((tool) => tool.attention) && (
            <span role="img" aria-label="Tools need attention" className="workbench-attention" />
          )}
        </button>
      </div>
    </nav>
  );
}
