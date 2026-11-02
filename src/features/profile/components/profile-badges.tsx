import type { Badge } from "@/types";

// Achievement grid for a public profile: earned badges first and lit, locked ones dimmed.
export function ProfileBadges({ badges }: { badges: Badge[] }) {
  const sorted = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned));
  const earned = badges.filter((b) => b.earned).length;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-baseline justify-between text-title-md font-title-md text-on-surface border-b border-outline-variant/30 pb-2">
        LOGROS
        <span className="text-label-caps font-label-caps text-on-surface-variant">
          {earned}/{badges.length}
        </span>
      </h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {sorted.map((badge) => (
          <li
            key={badge.name}
            className={`glass-panel rounded-xl p-4 flex flex-col items-center text-center gap-1 ${
              badge.earned ? "border-tertiary/40" : "opacity-40 grayscale"
            }`}
          >
            <span aria-hidden="true" className="text-3xl">
              {badge.emoji}
            </span>
            <span className="text-body-sm font-body-sm font-bold text-on-surface">
              {badge.name}
              {!badge.earned && <span className="sr-only"> (bloqueado)</span>}
            </span>
            <span className="text-body-sm font-body-sm text-on-surface-variant">
              {badge.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
