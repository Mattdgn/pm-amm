"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[16px] p-[48px]">
      <div className="text-caption">SOMETHING WENT WRONG</div>
      <p className="text-[12px] text-muted font-mono max-w-md text-center">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
