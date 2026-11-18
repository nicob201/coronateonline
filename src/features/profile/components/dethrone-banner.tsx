import Link from "next/link";
import { BotBadge } from "@/components/bot-badge";
import type { DethroneNotice } from "@/types";

// Prominent banner shown when the authenticated user was dethroned in the last 14 days.
export function DethroneBanner({ notice }: { notice: DethroneNotice }) {
  return (
    <Link
      href={`/t/${notice.titleSlug}`}
      className="glass-panel rounded-xl p-6 flex flex-col gap-2 border-l-4 border-l-error hover:bg-surface-container-high transition-colors"
    >
      <span className="text-title-md font-title-md text-on-surface">
        👑 Perdiste {notice.titleName}
      </span>
      <span className="text-body-sm font-body-sm text-on-surface-variant">
        {notice.byName}
        {notice.byBot && <BotBadge />} te destronó{notice.message ? `: «${notice.message}»` : ""}
      </span>
      <span className="text-label-caps font-label-caps text-tertiary mt-2">
        Recuperala
      </span>
    </Link>
  );
}
