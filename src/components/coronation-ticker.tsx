import { formatARS } from "@/lib/format";
import type { Coronation } from "@/types";

// Scrolling marquee of the latest coronations. Renders nothing when there is no activity yet.
export function CoronationTicker({ coronations }: { coronations: Coronation[] }) {
  if (coronations.length === 0) return null;

  return (
    <div className="ticker-wrap h-8 flex items-center relative z-40">
      <div className="ticker text-label-caps font-label-caps text-tertiary">
        {coronations.map((c, i) => (
          <span key={c.id}>
            {i > 0 && <span className="mx-8 text-outline-variant">•</span>}
            🔥 {c.holderName.toUpperCase()} ACABA DE CORONARSE{" "}
            {c.titleName.toUpperCase()} — {formatARS(c.pricePaid)}
          </span>
        ))}
      </div>
    </div>
  );
}
