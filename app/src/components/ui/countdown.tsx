"use client";

import { useState, useEffect } from "react";

function format(endTs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTs - now;
  if (remaining <= 0) return "EXPIRED";
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface CountdownProps {
  endTs: number;
  className?: string;
}

export function Countdown({ endTs, className }: CountdownProps) {
  const [text, setText] = useState(() => format(endTs));

  useEffect(() => {
    setText(format(endTs));
    const interval = setInterval(() => setText(format(endTs)), 60_000);
    return () => clearInterval(interval);
  }, [endTs]);

  const expired = text === "EXPIRED";

  return (
    <span className={`tnum ${expired ? "text-no" : ""} ${className ?? ""}`}>
      {text}
    </span>
  );
}
