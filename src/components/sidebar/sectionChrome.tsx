/** Shared visual chrome for sidebar section cards. */

export const cardClass = "sidebar-card-link rounded-lg bg-maestro-card/50 p-3 overflow-hidden";

export const divider = <div className="h-px bg-maestro-border/30 my-1" />;

export function SectionHeader({
  icon: Icon,
  label,
  breathe = false,
  iconColor,
  badge,
  right,
}: {
  icon: React.ElementType;
  label: string;
  breathe?: boolean;
  iconColor?: string;
  badge?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-maestro-text">
      <Icon
        size={13}
        className={`${iconColor ?? "text-maestro-muted/80"} ${breathe ? "animate-breathe" : ""}`}
      />
      <span className="flex-1">{label}</span>
      {badge}
      {right}
    </div>
  );
}
