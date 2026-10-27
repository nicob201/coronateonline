import Link from "next/link";
import { BotBadge } from "@/components/bot-badge";
import { RANK_COLOR } from "@/components/hall-of-fame";
import type { RankingEntry } from "@/types";

interface RankingTableProps {
  icon: string;
  title: string;
  empty: string;
  entries: RankingEntry[];
}

// A titled top-10 list whose rows link to a title or a profile.
export function RankingTable({ icon, title, empty, entries }: RankingTableProps) {
  return (
    <section className="glass-panel rounded-2xl p-4 md:p-6 flex flex-col gap-4">
      <h2 className="text-title-md font-title-md text-on-surface flex items-center gap-2">
        <span aria-hidden="true" className="material-symbols-outlined text-tertiary">{icon}</span>
        {title}
      </h2>
      {entries.length === 0 ? (
        <p className="text-body-sm font-body-sm text-on-surface-variant">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <li key={entry.id}>
              <Link
                href={entry.href}
                className="flex items-center gap-3 rounded-lg border border-outline-variant/10 bg-surface-container-high/50 p-3 hover:border-primary/40 transition-colors"
              >
                <span className={`w-6 shrink-0 text-center text-title-md font-title-md ${RANK_COLOR[i] ?? "text-outline"}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-body-sm font-bold text-on-surface">{entry.name}</p>
                  {/* The badge sits outside the truncated text so a long name never hides it. */}
                  <p className="flex items-center text-label-caps font-label-caps text-on-surface-variant">
                    <span className="truncate">{entry.detail}</span>
                    {entry.detailIsBot && <BotBadge />}
                  </p>
                </div>
                <span className="shrink-0 text-body-sm font-body-sm font-bold text-tertiary">{entry.value}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
