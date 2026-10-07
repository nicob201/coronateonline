import Link from "next/link";
import { formatCoronas } from "@/lib/format";
import { BASE_PRICE, RARITY_LABELS } from "@/lib/titles";
import type { TitleCard as TitleCardData } from "@/types";

const RARITY_BADGE: Record<TitleCardData["rarity"], string> = {
  legendario: "bg-tertiary/20 text-tertiary border-tertiary/50",
  epico: "bg-primary/10 text-primary border-primary/30",
  comun: "",
};

// A title tile: emoji, name, rarity, current holder and price. Links to the title detail page.
export function TitleCard({ title }: { title: TitleCardData }) {
  const isHeld = title.holder !== null;
  const holderName =
    title.holder?.display_name?.trim() || title.holder?.username || null;

  return (
    <Link
      href={`/t/${title.slug}`}
      className={`glass-panel rounded-2xl p-6 relative flex flex-col gap-4 transition-transform duration-300 hover:translate-x-1 ${
        title.rarity === "legendario" ? "legendary-glow border-tertiary/30" : ""
      }`}
    >
      {title.rarity !== "comun" && (
        <span
          className={`absolute top-4 right-4 px-3 py-1 rounded-full text-label-caps font-label-caps border ${RARITY_BADGE[title.rarity]}`}
        >
          {RARITY_LABELS[title.rarity]}
        </span>
      )}

      <h3 className="text-title-md font-title-md text-on-surface pr-24">
        {title.emoji} {title.name.toUpperCase()}
      </h3>

      <div className="flex flex-wrap gap-4 text-body-sm font-body-sm text-on-surface-variant">
        {isHeld ? (
          <>
            <span>Rey: {holderName}</span>
            <span>Valor: {formatCoronas(title.price ?? 0)}</span>
          </>
        ) : (
          <>
            <span className="text-primary">Disponible</span>
            <span>{formatCoronas(BASE_PRICE)}</span>
          </>
        )}
      </div>

      <span
        className={`self-start px-8 py-3 rounded-lg text-label-caps font-label-caps font-bold tracking-widest opacity-60 ${
          isHeld
            ? "btn-destronar text-on-surface border border-secondary-container/50"
            : "btn-gradient text-on-primary-fixed"
        }`}
      >
        {isHeld ? "DESTRONAR" : "CORONARME"}
      </span>
    </Link>
  );
}
