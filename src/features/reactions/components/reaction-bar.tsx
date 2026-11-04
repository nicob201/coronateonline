"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { reaccionar } from "@/actions/reactions";
import { createClient } from "@/lib/supabase/client";
import { reactionBroadcastSchema } from "@/features/reactions/schemas/reaction.schema";
import type { ReactionCounts, ReactionKind } from "@/types";

// The element over the title's crown where every throw lands.
export const REACTION_STAGE_ID = "reaction-stage";

const EMOJI: Record<ReactionKind, string> = { tomato: "🍅", applause: "👏" };

const REACTIONS: { kind: ReactionKind; field: keyof ReactionCounts; label: string }[] = [
  { kind: "tomato", field: "tomatoes", label: "Tirale un tomate" },
  { kind: "applause", field: "applause", label: "Aplaudilo" },
];

const PILL =
  "relative flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-high border border-outline-variant/30 text-label-caps font-label-caps text-on-surface tabular-nums transition-colors";

// Totals only grow, and a throw's own result can arrive before or after its broadcast: keep the higher of each.
const merge = (a: ReactionCounts, b: ReactionCounts): ReactionCounts => ({
  tomatoes: Math.max(a.tomatoes, b.tomatoes),
  applause: Math.max(a.applause, b.applause),
});

let splatSeq = 0;

interface ReactionBarProps {
  reignId: string;
  initialCounts: ReactionCounts;
  // "player" can throw, "visitor" is sent to log in, "holder" only sees the totals.
  viewer: "player" | "visitor" | "holder";
  loginHref: string;
}

// 🍅 / 👏 totals of the current reign, live for every viewer; players throw one per click (the RPC enforces the rate limit).
export function ReactionBar({ reignId, initialCounts, viewer, loginHref }: ReactionBarProps) {
  const [counts, setCounts] = useState(initialCounts);
  const [seen, setSeen] = useState(initialCounts);
  const [pop, setPop] = useState<{ kind: ReactionKind; key: number } | null>(null);
  const [splats, setSplats] = useState<{ id: number; kind: ReactionKind; dx: number }[]>([]);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A server re-render (e.g. LiveRefresh catching up after a reconnect) may bring totals this socket missed.
  if (initialCounts.tomatoes !== seen.tomatoes || initialCounts.applause !== seen.applause) {
    setSeen(initialCounts);
    setCounts(merge(counts, initialCounts));
  }

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // ponytail: deferred join so StrictMode's instant remount never reuses a channel that is still leaving (same topic); a ref-counted shared channel if real remounts ever race.
    const join = setTimeout(() => {
      channel = supabase
        .channel(`reign:${reignId}`, { config: { private: true } })
        .on("broadcast", { event: "reaction" }, ({ payload }) => {
          const parsed = reactionBroadcastSchema.safeParse(payload);
          if (!parsed.success) return;
          const { kind, ...totals } = parsed.data;
          setCounts((c) => merge(c, totals));
          setStage(document.getElementById(REACTION_STAGE_ID));
          // Capped so splats cannot pile up where animationend never fires (reduced motion).
          setSplats((s) => [...s.slice(-11), { id: ++splatSeq, kind, dx: Math.round(Math.random() * 48 - 24) }]);
        })
        .subscribe();
    }, 0);

    return () => {
      clearTimeout(join);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [reignId]);

  function react(kind: ReactionKind): void {
    startTransition(async () => {
      const result = await reaccionar(reignId, kind);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      setCounts((c) => merge(c, result.data));
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
                {EMOJI[r.kind]}
              </span>
              {count}
              {pop?.kind === r.kind && (
                <span key={pop.key} aria-hidden="true" className="reaction-pop">
                  {EMOJI[r.kind]}
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
      {stage &&
        createPortal(
          splats.map((s) => (
            <span
              key={s.id}
              className="reaction-splat"
              style={{ left: `calc(50% + ${s.dx}px)` }}
              onAnimationEnd={() => setSplats((all) => all.filter((x) => x.id !== s.id))}
            >
              {EMOJI[s.kind]}
            </span>
          )),
          stage,
        )}
    </div>
  );
}
