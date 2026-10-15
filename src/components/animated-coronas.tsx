"use client";

import { useEffect, useRef, useState } from "react";
import { formatCoronas } from "@/lib/format";

const COUNT_MS = 600;

// Shows a Coronas amount that counts to each new value and floats the difference (+N / −N 👑) up into it.
export function AnimatedCoronas({ value }: { value: number }) {
  const [prev, setPrev] = useState(value);
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState({ amount: 0, key: 0 });
  const shownRef = useRef(value);

  // The first render only records the baseline; a later change floats its difference (a new key restarts the CSS).
  if (value !== prev) {
    setPrev(value);
    setDelta({ amount: value - prev, key: delta.key + 1 });
  }

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : COUNT_MS;
    let start: number | null = null;
    let frame = requestAnimationFrame(function tick(now: number): void {
      start ??= now;
      const t = duration === 0 ? 1 : Math.min((now - start) / duration, 1);
      // Ease-out cubic: fast at first, settling on the final number.
      shownRef.current = Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      setShown(shownRef.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className="relative tabular-nums">
      {formatCoronas(shown)}
      {delta.key > 0 && (
        <span
          key={delta.key}
          aria-hidden="true"
          className={`coin-float px-2 py-0.5 rounded-full border bg-surface-container-high text-label-caps font-label-caps ${
            delta.amount > 0 ? "text-tertiary border-tertiary/40" : "text-error border-error/40"
          }`}
        >
          {delta.amount > 0 ? "+" : "−"}
          {formatCoronas(Math.abs(delta.amount))}
        </span>
      )}
    </span>
  );
}
