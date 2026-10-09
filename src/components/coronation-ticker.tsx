import { formatCoronas } from "@/lib/format";
import type { Coronation } from "@/types";

function tickerName(name: string, isBot: boolean): string {
  return `${isBot ? "🤖 " : ""}${name.toUpperCase()}`;
}

// Scrolling marquee of the latest coronations. Renders nothing when there is no activity yet.
export function CoronationTicker({ coronations }: { coronations: Coronation[] }) {
  if (coronations.length === 0) return null;

  return (
    <div className="ticker-wrap h-8 flex items-center relative z-40">
      <div className="ticker text-label-caps font-label-caps text-tertiary">
        {coronations.map((c, i) => (
          <span key={c.id}>
            {i > 0 && <span className="mx-8 text-outline-variant">•</span>}
            🔥{" "}
            {c.dethronedName
              ? `${tickerName(c.holderName, c.holderIsBot)} DESTRONÓ A ${tickerName(c.dethronedName, c.dethronedIsBot)} — ${c.titleName.toUpperCase()} — ${formatCoronas(c.pricePaid)}`
              : `${tickerName(c.holderName, c.holderIsBot)} ACABA DE CORONARSE ${c.titleName.toUpperCase()} — ${formatCoronas(c.pricePaid)}`}
          </span>
        ))}
      </div>
    </div>
  );
}
