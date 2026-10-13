"use client";

import Link from "next/link";
import { useTransition } from "react";
import { marcarNotificacionesLeidas } from "@/actions/notifications";
import { formatCoronas, formatDate } from "@/lib/format";
import type { Notifications } from "@/types";

// Header bell: unread badge plus a popover with the user's recent dethrones; opening it marks them read.
export function NotificationBell({ initialData }: { initialData: Notifications }) {
  const { items, unread } = initialData;
  const [, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        popoverTarget="notifications-panel"
        aria-label={unread > 0 ? `Avisos: ${unread} sin leer` : "Avisos"}
        className="relative p-2 text-on-surface-variant hover:text-primary transition-colors"
      >
        <span aria-hidden="true" className="material-symbols-outlined">notifications</span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-tertiary text-surface-container-lowest text-[10px] leading-4 font-bold text-center"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* No display utilities on the popover itself: they would override its closed state. */}
      <div
        id="notifications-panel"
        popover="auto"
        onToggle={(event) => {
          if (event.newState !== "open" || unread === 0) return;
          startTransition(async () => {
            await marcarNotificacionesLeidas();
          });
        }}
        className="fixed inset-auto top-[5.25rem] right-4 md:right-16 m-0 p-0 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-xl border border-outline-variant/40 bg-surface-container text-on-surface shadow-xl"
      >
        <div className="flex flex-col">
          <h2 className="px-4 py-3 text-label-caps font-label-caps text-on-surface-variant border-b border-outline-variant/30">
            Avisos
          </h2>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-body-sm font-body-sm text-on-surface-variant">
              Nadie te destronó todavía.
            </p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className="border-b border-outline-variant/20 last:border-b-0">
                  <Link
                    href={`/t/${item.titleSlug}`}
                    className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-container-high transition-colors"
                  >
                    <span className="text-body-sm font-body-sm text-on-surface">
                      {item.byName} te destronó en {item.titleEmoji} {item.titleName}
                    </span>
                    <span className="text-label-caps font-label-caps text-tertiary">
                      Te pagó {formatCoronas(item.pricePaid)} · {formatDate(item.at)}
                    </span>
                    {item.message && (
                      <span className="text-body-sm font-body-sm text-on-surface-variant">
                        «{item.message}»
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
