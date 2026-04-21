interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-sm bg-surface border border-line ${className ?? ""}`}
    />
  );
}

export function SkeletonRow() {
  return (
    <div className="grid gap-[16px] px-[24px] py-[12px] border-b border-line grid-cols-[48px_1fr_80px_80px_80px_100px_90px_80px]">
      <Skeleton className="h-[14px] w-[32px]" />
      <Skeleton className="h-[14px] w-[60%]" />
      <Skeleton className="h-[14px]" />
      <Skeleton className="h-[14px]" />
      <Skeleton className="h-[14px]" />
      <Skeleton className="h-[14px]" />
      <Skeleton className="h-[14px]" />
      <Skeleton className="h-[14px]" />
    </div>
  );
}
