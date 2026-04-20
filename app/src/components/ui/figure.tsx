type FigureSize = "hero" | "price" | "data";
type FigureColor = "yes" | "no" | "default" | "accent";

interface FigureProps {
  label?: string;
  value: string;
  size?: FigureSize;
  color?: FigureColor;
  className?: string;
}

const sizeStyles: Record<FigureSize, string> = {
  hero: "text-[32px] tracking-[-0.02em]",
  price: "text-[22px] tracking-[-0.02em]",
  data: "text-[13px] tracking-[0]",
};

const colorStyles: Record<FigureColor, string> = {
  yes: "text-yes",
  no: "text-no",
  default: "text-text-hi",
  accent: "text-accent",
};

export function Figure({
  label,
  value,
  size = "price",
  color = "default",
  className = "",
}: FigureProps) {
  return (
    <div className={className}>
      {label && (
        <div className="font-mono text-[10px] text-muted uppercase tracking-[0.05em] mb-[6px]">
          {label}
        </div>
      )}
      <div
        className={[
          "font-mono tnum leading-none",
          sizeStyles[size],
          colorStyles[color],
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
