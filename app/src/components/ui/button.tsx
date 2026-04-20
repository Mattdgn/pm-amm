import { type ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "yes" | "no";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-text-hi text-bg hover:bg-text border-transparent",
  secondary: "bg-transparent text-text border-line-2 hover:border-muted",
  ghost: "bg-transparent text-text-dim border-transparent hover:text-text-hi",
  yes: "bg-yes-soft text-yes border-[color-mix(in_oklch,var(--yes)_25%,transparent)]",
  no: "bg-no-soft text-no border-[color-mix(in_oklch,var(--no)_25%,transparent)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={[
          "inline-flex items-center justify-center",
          "gap-[6px] px-[14px] py-[8px]",
          "rounded-lg text-[13px] font-medium",
          "border cursor-pointer",
          "transition-all duration-[120ms] ease-linear",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          variantStyles[variant],
          className,
        ].join(" ")}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
