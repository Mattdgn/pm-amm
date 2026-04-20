interface MetaRowProps {
  label: string;
  value: string;
  last?: boolean;
  className?: string;
}

export function MetaRow({
  label,
  value,
  last = false,
  className = "",
}: MetaRowProps) {
  return (
    <div
      className={[
        "flex justify-between items-baseline",
        "py-[7px] text-[12px]",
        last ? "" : "border-b border-line",
        className,
      ].join(" ")}
    >
      <span className="text-text-dim">{label}</span>
      <span className="font-mono tnum text-text">{value}</span>
    </div>
  );
}

interface MetaRowGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function MetaRowGroup({ children, className = "" }: MetaRowGroupProps) {
  return <div className={className}>{children}</div>;
}
