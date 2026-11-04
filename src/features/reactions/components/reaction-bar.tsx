"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { reaccionar } from "@/actions/reactions";
import type { ReactionCounts, ReactionKind } from "@/types";

const REACTIONS: { kind: ReactionKind; field: keyof ReactionCounts; emoji: string; label: string }[] = [
  { kind: "tomato", field: "tomatoes", emoji: "🍅", label: "Tirale un tomate" },
  { kind: "applause", field: "applause", emoji: "👏", label: "Aplaudilo" },
];

const PILL =
  "relative flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-high border border-outline-variant/30 text-label-caps font-label-caps text-on-surface tabular-nums transition-colors";

interface ReactionBarProps {
  reignId: string;
  initialCounts: ReactionCounts;
  // "player" can throw, "visitor" is sent to log in, "holder" only sees the totals.
  viewer: "player" | "visitor" | "holder";
  loginHref: string;
}

// 🍅 / 👏 totals of the current reign; players throw one per click (the RPC enforces the rate limit).
export function ReactionBar({ reignId, initialCounts, viewer, loginHref }: ReactionBarProps) {
  const [counts, setCounts] = useState(initialCounts);
  const [pop, setPop] = useState<{ kind: ReactionKind; key: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function react(kind: ReactionKind): void {
    startTransition(async () => {
      const result = await reaccionar(reignId, kind);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      setCounts(result.data);
      setPop((p) => ({ kind, key: (p?.key ?? 0) + 1 }));
    });
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <div className="flex gap-3">
        {REACTIONS.map((r) => {
          const count = counts[r.field].toLocaleString("es-AR");
          const content = (
            <>
              <span aria-hidden="true" className="text-xl">
                {r.emoji}
              </span>
              {count}
              {pop?.kind === r.kind && (
                <span key={pop.key} aria-hidden="true" className="reaction-pop">
                  {r.emoji}
                </span>
              )}
            </>
          );

          if (viewer === "visitor") {
            return (
              <Link key={r.kind} href={loginHref} aria-label={`${r.label} (${count})`} className={`${PILL} hover:border-primary/50`}>
                {content}
              </Link>
            );
          }
          return (
            <button
              key={r.kind}
              type="button"
              onClick={() => react(r.kind)}
              disabled={viewer === "holder" || pending}
              aria-label={`${r.label} (${count})`}
              title={viewer === "holder" ? "No podés reaccionar a tu propio reinado" : r.label}
              className={`${PILL} enabled:hover:border-primary/50 disabled:cursor-default`}
            >
              {content}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="text-body-sm font-body-sm text-error min-h-5">
        {error}
      </p>
    </div>
  );
}
