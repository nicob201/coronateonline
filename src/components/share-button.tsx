"use client";

import { useState, useEffect } from "react";

interface ShareButtonProps {
  path: string;
  title: string;
  text?: string;
  label?: string;
  className?: string;
}

// Client-only share button: uses Web Share API when available, falls back to clipboard copy.
export function ShareButton({
  path,
  title,
  text,
  label = "Compartí tu corona",
  className = "text-label-caps font-label-caps border border-outline-variant/30 rounded-lg px-4 py-2 hover:bg-surface-container-high transition-colors",
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = copied ? setTimeout(() => setCopied(false), 2000) : undefined;
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleClick() {
    const url = window.location.origin + path;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // User cancelled — no error UI.
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
    >
      {copied ? "¡Copiado!" : label}
    </button>
  );
}
