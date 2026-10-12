"use client";

import { useState, type ReactNode } from "react";

interface LiveFlashProps {
  value: string | number | null;
  className?: string;
  children: ReactNode;
}

// Wraps live data and flashes it briefly whenever `value` changes after the first render.
export function LiveFlash({ value, className, children }: LiveFlashProps) {
  const [prev, setPrev] = useState(value);
  const [flashes, setFlashes] = useState(0);

  if (value !== prev) {
    setPrev(value);
    setFlashes(flashes + 1);
  }

  // A new key remounts the span, which restarts the CSS animation.
  return (
    <span key={flashes} className={flashes > 0 ? `live-flash ${className ?? ""}` : className}>
      {children}
    </span>
  );
}
