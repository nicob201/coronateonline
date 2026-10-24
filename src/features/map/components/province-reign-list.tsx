import { BotBadge } from "@/components/bot-badge";
import { RANK_COLOR } from "@/components/hall-of-fame";
import type { ProvinceReign } from "@/types";

// Ranked rows of a province's longest reigns; the active reign is badged ACTUAL.
export function ProvinceReignList({ reigns }: { reigns: ProvinceReign[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {reigns.map((reign, i) => (
        <li
          key={reign.id}
          className="flex items-center gap-3 rounded-lg border border-outline-variant/10 bg-surface-container-high/50 p-2"
        >
          <span className={`w-6 shrink-0 text-center text-title-md font-title-md ${RANK_COLOR[i] ?? "text-outline"}`}>
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-body-sm font-body-sm font-bold text-on-surface">
              <span className="truncate">
                {reign.holderName}
                {reign.holderIsBot && <BotBadge />}
              </span>
              {reign.isActive && (
                <span className="shrink-0 rounded-full border border-tertiary/40 bg-tertiary/10 px-2 py-0.5 text-label-caps font-label-caps font-bold text-tertiary">
                  ACTUAL
                </span>
              )}
            </p>
            <p className="flex gap-1 text-label-caps font-label-caps text-on-surface-variant">
              <span className="truncate">{reign.titleEmoji} {reign.titleName}</span>
              <span className="shrink-0">· {reign.durationLabel}</span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
