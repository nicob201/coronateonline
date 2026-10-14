"use client";

import { useState, type ReactNode } from "react";

interface LiveFlashProps {
  value: string | number | null;
  className?: string;
  flashClass?: string;
  children: ReactNode;
}

// Wraps live data and plays `flashClass` (a gold flash by default) whenever `value` changes after the first render.
export function LiveFlash({ value, className, flashClass = "live-flash", children }: LiveFlashProps) {
  const [prev, setPrev] = useState(value);
  const [flashes, setFlashes] = useState(0);

  if (value !== prev) {
    setPrev(value);
    setFlashes(flashes + 1);
  }

  // A new key remounts the span, which restarts the CSS animation.
  return (
    <span key={flashes} className={flashes > 0 ? `${flashClass} ${className ?? ""}` : className}>
      {children}
    </span>
  );
}
