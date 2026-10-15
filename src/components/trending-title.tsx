import Link from "next/link";
import { formatCoronas } from "@/lib/format";
import { BotBadge } from "@/components/bot-badge";
import { LiveFlash } from "@/components/live-flash";
import { TitleMorph } from "@/components/title-morph";
import { BASE_PRICE, RARITY_LABELS } from "@/lib/titles";
import type { TitleCard as TitleCardData } from "@/types";

const RARITY_BADGE: Record<TitleCardData["rarity"], string> = {
  legendario: "bg-tertiary/20 text-tertiary border-tertiary/50",
  epico: "bg-primary/10 text-primary border-primary/30",
  comun: "",
};

// A wide spotlight card for a trending title: rarity badge, holder, value and a call to dethrone.
export function TrendingTitle({ title }: { title: TitleCardData }) {
  const isHeld = title.holder !== null;
  const isLegendary = title.rarity === "legendario";
  const holderName =
    title.holder?.display_name?.trim() || title.holder?.username || null;

  const headingClass = isLegendary
    ? "text-headline-lg-mobile font-headline-lg-mobile text-tertiary"
    : title.rarity === "epico"
      ? "text-title-md font-title-md text-primary"
      : "text-title-md font-title-md text-on-surface";

  return (
    <TitleMorph titleId={title.id} part="panel">
      <Link
        href={`/t/${title.slug}`}
        prefetch
        className={`reveal glass-panel rounded-2xl p-6 relative flex flex-col gap-3 transition-transform duration-300 hover:translate-x-1 ${
          isLegendary ? "shimmer legendary-glow border border-tertiary/30" : ""
        }`}
      >
        {title.rarity !== "comun" && (
          <span
            className={`self-start px-3 py-1 rounded-full text-label-caps font-label-caps border ${RARITY_BADGE[title.rarity]}`}
          >
            {RARITY_LABELS[title.rarity]}
          </span>
        )}

        <h3 className={`${headingClass} min-w-0 break-words`}>
          <TitleMorph titleId={title.id} part="emoji">
            <span className="inline-block">{title.emoji}</span>
          </TitleMorph>{" "}
          {title.name.toUpperCase()}
        </h3>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm font-body-sm text-on-surface-variant">
          {isHeld ? (
            <LiveFlash value={`${title.holderUserId}:${title.price}`} className="flex flex-wrap gap-x-4 gap-y-1">
              <span>Rey: {holderName}{title.holder?.is_bot && <BotBadge />}</span>
              <span>Valor: {formatCoronas(title.price ?? 0)}</span>
            </LiveFlash>
          ) : (
            <>
              <span className="text-primary">Disponible</span>
              <span>Desde {formatCoronas(BASE_PRICE)}</span>
            </>
          )}
        </div>

        <span
          className={`self-start px-8 py-3 rounded-lg text-label-caps font-label-caps font-bold tracking-widest ${
            isHeld
              ? "btn-destronar text-on-surface border border-secondary-container/50"
              : "btn-gradient text-on-primary-fixed"
          }`}
        >
          {isHeld ? "DESTRONAR" : "CORONARME"}
        </span>
      </Link>
    </TitleMorph>
  );
}
