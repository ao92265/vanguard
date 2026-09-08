import { ChevronDown, type LucideIcon, PanelLeft } from "lucide-react";
import type { ReactNode } from "react";

export interface RailDestination {
  label: string;
  icon: LucideIcon;
  selected?: boolean;
  pressed?: boolean;
  attention?: boolean;
  badge?: ReactNode;
  onClick?: () => void;
}

export function WorkbenchRail({
  primary,
  tools,
  sidebarOpen,
  onToggleSidebar,
  footer,
}: {
  primary: RailDestination[];
  tools: RailDestination[];
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  footer?: ReactNode;
}) {
  const destination = ({
    label,
    icon: Icon,
    selected,
    pressed,
    attention,
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
        onClick={selected ? undefined : onClick}
        className={`relative flex min-h-14 w-full shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] transition-colors ${selected || pressed ? "bg-maestro-accent/15 text-maestro-accent" : "text-maestro-muted hover:bg-maestro-card hover:text-maestro-text"}`}
      >
        <span className="relative">
          <Icon size={19} strokeWidth={1.6} />
          {badge}
        </span>
        <span>{label}</span>
        {attention && (
          <span
            role="img"
            className="absolute right-3 top-2 h-1.5 w-1.5 rounded-full bg-maestro-accent"
            aria-label="Needs attention"
          />
        )}
      </button>
    );
  return (
    <nav
      aria-label="Workspace"
      className="workbench-rail flex w-[88px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-maestro-border p-2"
    >
      {primary.map(destination)}
      <details className="mt-3 border-t border-maestro-border pt-3">
        <summary className="flex cursor-pointer items-center justify-center gap-1 py-2 text-[10px] text-maestro-muted">
          Tools <ChevronDown size={12} />
          {tools.some((tool) => tool.attention) && (
            <span
              role="img"
              aria-label="Tools need attention"
              className="h-1.5 w-1.5 rounded-full bg-maestro-accent"
            />
          )}
        </summary>
        {tools.map(destination)}
      </details>
      <div className="mt-auto flex flex-col items-center gap-3 pt-5">
        {footer}
        <button
          type="button"
          aria-label="Toggle sidebar"
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
          className="rounded-md p-3 text-maestro-muted hover:bg-maestro-card hover:text-maestro-text"
        >
          <PanelLeft size={18} />
        </button>
      </div>
    </nav>
  );
}
