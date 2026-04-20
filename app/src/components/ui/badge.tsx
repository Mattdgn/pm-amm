import { type HTMLAttributes } from "react";

export type BadgeVariant = "default" | "yes" | "no";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "text-text-dim border-line-2",
  yes: "text-yes border-[color-mix(in_oklch,var(--yes)_30%,transparent)]",
  no: "text-no border-[color-mix(in_oklch,var(--no)_30%,transparent)]",
};

export function Badge({
  variant = "default",
  dot = false,
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-[6px]",
        "px-[8px] py-[2px] rounded-sm",
        "font-mono text-[10px] uppercase tracking-[0.05em]",
        "border bg-transparent",
        variantStyles[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {dot && <span className="w-[4px] h-[4px] rounded-full bg-current" />}
      {children}
    </span>
  );
}
