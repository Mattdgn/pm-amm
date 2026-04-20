type StatusVariant = "active" | "expiring" | "resolved-yes" | "resolved-no" | "resolved";

interface StatusBadgeProps {
  variant: StatusVariant;
  className?: string;
}

const variantStyles: Record<StatusVariant, { text: string; label: string }> = {
  active: {
    text: "text-yes border-[color-mix(in_oklch,var(--yes)_30%,transparent)]",
    label: "ACTIVE",
  },
  expiring: {
    text: "text-accent border-[color-mix(in_oklch,var(--accent)_35%,transparent)]",
    label: "<24H",
  },
  "resolved-yes": {
    text: "text-yes border-[color-mix(in_oklch,var(--yes)_30%,transparent)]",
    label: "YES",
  },
  "resolved-no": {
    text: "text-no border-[color-mix(in_oklch,var(--no)_30%,transparent)]",
    label: "NO",
  },
  resolved: {
    text: "text-text-dim border-line-2",
    label: "RESOLVED",
  },
};

export function StatusBadge({ variant, className = "" }: StatusBadgeProps) {
  const { text, label } = variantStyles[variant];

  return (
    <span
      className={[
        "inline-block",
        "text-[9px] uppercase tracking-[0.1em]",
        "px-[5px] py-[1px]",
        "border rounded-sm",
        "font-mono",
        text,
        className,
      ].join(" ")}
    >
      {label}
    </span>
  );
}
