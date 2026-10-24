import type { HallOfFameEntry } from "@/types";

export const RANK_COLOR = [
  "text-tertiary",
  "text-outline",
  "text-secondary-fixed-dim",
] as const;

// Ranked list of users by all-time reign count. Renders nothing until there is history.
export function HallOfFame({ entries }: { entries: HallOfFameEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl p-6 border-t-2 border-t-tertiary flex flex-col gap-6">
      <h2 className="text-title-md font-title-md text-on-surface flex items-center gap-2">
        <span className="material-symbols-outlined text-tertiary">military_tech</span>
        HALL OF FAME
      </h2>
      <ul className="flex flex-col gap-4">
        {entries.map((entry, i) => {
          const color = RANK_COLOR[i] ?? "text-outline";
          return (
            <li
              key={entry.username}
              className="flex items-center gap-4 p-3 rounded-lg bg-surface-container-high/50 border border-outline-variant/10"
            >
              <span
                className={`text-headline-lg-mobile font-headline-lg-mobile w-8 text-center ${color}`}
              >
                {i + 1}
              </span>
              <div>
                <p className="text-body-lg font-body-lg text-on-surface font-bold">
                  {entry.name}
                </p>
                <p className={`text-label-caps font-label-caps ${color}`}>
                  {entry.reignCount}{" "}
                  {entry.reignCount === 1 ? "reinado" : "reinados"}
                  {entry.latestTitleName ? ` · ${entry.latestTitleName}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
