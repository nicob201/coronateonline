import Link from "next/link";
import { formatARS, formatReignDuration } from "@/lib/format";
import type { ProfileReign } from "@/types";

function ReignRow({ reign, ongoing }: { reign: ProfileReign; ongoing: boolean }) {
  return (
    <Link
      href={`/t/${reign.titleSlug}`}
      className="flex items-center justify-between p-4 border-b border-white/10 last:border-b-0 hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-4">
        <span className="text-2xl">{reign.titleEmoji}</span>
        <div>
          <div className="text-body-lg font-body-lg font-bold text-on-surface">
            {reign.titleName}
          </div>
          <div className="text-label-caps font-label-caps text-on-surface-variant">
            {ongoing
              ? `En curso · ${formatReignDuration(reign.startedAt)}`
              : `Reinó ${formatReignDuration(reign.startedAt, reign.endedAt)}`}
          </div>
          {reign.message && (
            <p className="text-body-sm font-body-sm italic text-on-surface-variant mt-1">
              «{reign.message}»
            </p>
          )}
        </div>
      </div>
      <span className="text-body-lg font-body-lg text-outline">
        {formatARS(reign.pricePaid)}
      </span>
    </Link>
  );
}

// Full reign history for a public profile: current reigns first, then past ones.
export function ProfileReignList({
  currentReigns,
  pastReigns,
}: {
  currentReigns: ProfileReign[];
  pastReigns: ProfileReign[];
}) {
  if (currentReigns.length === 0 && pastReigns.length === 0) {
    return (
      <p className="text-body-sm font-body-sm text-on-surface-variant">
        Todavía no reinó en ningún trono.
      </p>
    );
  }

  return (
    <div className="glass-panel rounded-xl flex flex-col overflow-hidden">
      {currentReigns.map((reign) => (
        <ReignRow key={`current-${reign.titleSlug}`} reign={reign} ongoing />
      ))}
      {pastReigns.map((reign, i) => (
        <ReignRow key={`past-${reign.titleSlug}-${i}`} reign={reign} ongoing={false} />
      ))}
    </div>
  );
}
