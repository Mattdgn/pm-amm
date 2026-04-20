import { type InputHTMLAttributes } from "react";

interface AmountInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  unit?: string;
}

export function AmountInput({
  label,
  unit = "USDC",
  className = "",
  ...props
}: AmountInputProps) {
  return (
    <div className={className}>
      {label && (
        <div className="text-caption mb-[8px]">{label}</div>
      )}
      <div
        className={[
          "flex items-center",
          "border border-line-2 rounded-lg",
          "px-[12px] bg-bg",
          "focus-within:border-muted",
          "transition-all duration-[120ms]",
        ].join(" ")}
      >
        <input
          className={[
            "bg-transparent border-none outline-none",
            "text-text-hi font-mono text-[16px]",
            "py-[10px] w-full",
          ].join(" ")}
          {...props}
        />
        <span className="font-mono text-[12px] text-muted shrink-0">
          {unit}
        </span>
      </div>
    </div>
  );
}
