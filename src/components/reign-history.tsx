import { formatARS, formatReignDuration } from "@/lib/format";
import { BASE_PRICE } from "@/lib/titles";
import type { PastReign } from "@/types";

function initial(name: string): string {
  return name.charAt(0).toUpperCase() || "?";
}

// The throne history: past reigns newest-first, ending with the genesis (title creation) row.
export function ReignHistory({
  pastReigns,
}: {
  pastReigns: PastReign[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-title-md font-title-md text-on-surface border-b border-outline-variant/30 pb-2">
        HISTORIAL DEL TRONO
      </h3>
      <div className="glass-panel rounded-xl flex flex-col overflow-hidden">
        {pastReigns.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between p-4 border-b border-white/10"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant font-label-caps">
                {initial(r.holderName)}
              </div>
              <div>
                <div className="text-body-lg font-body-lg font-bold text-on-surface">
                  {r.holderName}
                </div>
                <div className="text-label-caps font-label-caps text-on-surface-variant">
                  Reinó por {formatReignDuration(r.startedAt, r.endedAt)}
                </div>
              </div>
            </div>
            <div className="text-body-lg font-body-lg text-outline">
              {formatARS(r.pricePaid)}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant font-label-caps text-xs">
              👑
            </div>
            <div>
              <div className="text-body-lg font-body-lg font-bold text-on-surface">
                Génesis
              </div>
              <div className="text-label-caps font-label-caps text-on-surface-variant">
                Título creado
              </div>
            </div>
          </div>
          <div className="text-body-lg font-body-lg text-outline">
            {formatARS(BASE_PRICE)}
          </div>
        </div>
      </div>
    </div>
  );
}
