interface ProbabilityBarProps {
  yesPercent: number;
  showLabels?: boolean;
  className?: string;
}

export function ProbabilityBar({
  yesPercent,
  showLabels = true,
  className = "",
}: ProbabilityBarProps) {
  const noPercent = 100 - yesPercent;

  return (
    <div className={className}>
      {showLabels && (
        <div className="flex justify-between mb-[8px] text-[12px] font-mono">
          <span className="text-yes">YES {yesPercent.toFixed(1)}%</span>
          <span className="text-no">NO {noPercent.toFixed(1)}%</span>
        </div>
      )}
      <div className="flex h-[2px] bg-line overflow-hidden rounded-sm">
        <div className="bg-yes" style={{ width: `${yesPercent}%` }} />
        <div className="bg-no opacity-70" style={{ width: `${noPercent}%` }} />
      </div>
    </div>
  );
}
