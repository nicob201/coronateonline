import { formatARS } from "@/lib/format";
import type { RankedReign } from "@/types";

interface LongestReignsProps {
  reigns: RankedReign[];
}

// Ranked list of the longest reigns for a title, rendered in a glass panel.
export function LongestReigns({ reigns }: LongestReignsProps) {
  if (reigns.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-title-md font-title-md text-on-surface border-b border-outline-variant/30 pb-2">
        REINADOS MÁS LARGOS
      </h3>
      <div className="glass-panel rounded-xl flex flex-col overflow-hidden">
        {reigns.map((r, i) => (
          <div
            key={r.id}
            className="flex items-center justify-between p-4 border-b border-white/10"
          >
            <div className="flex items-center gap-4">
              <span className="text-label-caps font-label-caps text-on-surface-variant w-6 text-center">
                {i + 1}
              </span>
              <div>
                <div className="text-body-lg font-body-lg font-bold text-on-surface">
                  {r.holderName}
                </div>
                <div className="text-label-caps font-label-caps text-on-surface-variant">
                  {r.durationLabel}
                  {r.isActive && (
                    <span className="ml-2 inline-block bg-tertiary/20 text-tertiary text-xs px-2 py-0.5 rounded-full font-bold">
                      ACTUAL
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-body-lg font-body-lg text-outline">
              {formatARS(r.pricePaid)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
