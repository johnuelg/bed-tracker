import { getStatusIconComponent, getDefaultIconForLabel } from "@/lib/status-icons";

type StatusLevel = {
  key: string;
  label: string;
  color: string;
  icon?: string;
};

type StatusBadgeProps = {
  level: StatusLevel;
  /** Visual size of the badge. Defaults to "md" used across dashboard tables. */
  size?: "sm" | "md" | "lg";
};

const SIZE_STYLES: Record<NonNullable<StatusBadgeProps["size"]>, { wrapper: string; iconSize: number; gap: string }> = {
  sm: { wrapper: "px-2 py-0.5 text-[11px]", iconSize: 12, gap: "gap-1" },
  md: { wrapper: "px-2.5 py-1 text-xs", iconSize: 14, gap: "gap-1.5" },
  lg: { wrapper: "px-3 py-1.5 text-sm", iconSize: 16, gap: "gap-2" },
};

export const StatusBadge = ({ level, size = "md" }: StatusBadgeProps) => {
  const iconKey = level.icon ?? getDefaultIconForLabel(level.label, level.key);
  const IconComponent = getStatusIconComponent(iconKey);
  const styles = SIZE_STYLES[size];

  return (
    <span
      className={`inline-flex items-center ${styles.gap} rounded-full font-semibold ${styles.wrapper}`}
      style={{
        color: level.color,
        backgroundColor: `${level.color}22`,
      }}
    >
      {IconComponent ? <IconComponent size={styles.iconSize} aria-hidden /> : null}
      <span>{level.label}</span>
    </span>
  );
};