"use client";

import { useEffect, useRef, useState } from "react";
import { ShareButton } from "@/components/share-button";
import { formatCoronas } from "@/lib/format";

interface CoronationCelebrationProps {
  holderUserId: string | null;
  viewerId: string | null;
  slug: string;
  emoji: string;
  name: string;
  paid: number | null;
}

const SPARKS = Array.from({ length: 12 }, (_, i) => i * 30);

// Full-screen celebration when the viewer becomes the title's holder while on its page; only the viewer closes it.
export function CoronationCelebration({
  holderUserId,
  viewerId,
  slug,
  emoji,
  name,
  paid,
}: CoronationCelebrationProps) {
  const [prev, setPrev] = useState(holderUserId);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (holderUserId !== prev) {
    setPrev(holderUserId);
    if (viewerId !== null && holderUserId === viewerId) setOpen(true);
  }

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setOpen(false)}
      aria-labelledby="coronation-heading"
      className="coronation-dialog m-auto bg-transparent p-0 overflow-visible text-on-surface"
    >
      <div className="relative flex flex-col items-center gap-3 px-6 py-10 text-center">
        <div aria-hidden="true" className="coronation-rays" />
        <div aria-hidden="true" className="coronation-sparks">
          {SPARKS.map((deg) => (
            <span key={deg} style={{ rotate: `${deg}deg` }}>
              ✦
            </span>
          ))}
        </div>

        <span className="coronation crown-stays relative text-[7rem] leading-none mb-4">
          {emoji}
        </span>
        <h2
          id="coronation-heading"
          className="celebrate-in text-headline-lg-mobile md:text-headline-lg font-headline-lg text-gradient-primary uppercase tracking-tighter"
        >
          ¡Te coronaste!
        </h2>
        <p className="celebrate-in text-title-md font-title-md text-on-surface">
          {emoji} {name}
        </p>
        {paid !== null && (
          <p className="celebrate-in text-body-lg font-body-lg text-tertiary font-bold">
            por {formatCoronas(paid)}
          </p>
        )}

        <div className="celebrate-in-late flex flex-wrap justify-center gap-3 mt-4">
          <ShareButton
            path={`/t/${slug}`}
            title={`${name} — CoronaTeOnline`}
            text={`Me coroné ${name} en CoronaTeOnline. ¿Te animás a destronarme?`}
            label="COMPARTÍ TU CORONA"
            className="btn-gradient text-on-primary-fixed px-6 py-3 rounded-lg text-label-caps font-label-caps font-bold tracking-widest"
          />
          <form method="dialog">
            <button
              type="submit"
              className="px-6 py-3 rounded-lg border border-outline-variant/40 text-label-caps font-label-caps font-bold tracking-widest hover:bg-surface-container-high transition-colors"
            >
              SEGUIR
            </button>
          </form>
        </div>
      </div>
    </dialog>
  );
}
