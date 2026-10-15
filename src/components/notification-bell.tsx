"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { marcarNotificacionesLeidas } from "@/actions/notifications";
import { LiveFlash } from "@/components/live-flash";
import { formatCoronas, formatDate } from "@/lib/format";
import type { DethroneNotice, Notifications } from "@/types";

const TOAST_MS = 6000;

// Header bell: unread badge plus a popover with the user's recent dethrones; opening it marks them read.
export function NotificationBell({ initialData }: { initialData: Notifications }) {
  const { items, unread } = initialData;
  const [, startTransition] = useTransition();
  const top = items[0] ?? null;
  const [lastTopId, setLastTopId] = useState(top?.id ?? null);
  const [toast, setToast] = useState<DethroneNotice | null>(null);

  // A different top item with unread dethrones is a fresh one: toast it (the first render only records the baseline).
  if ((top?.id ?? null) !== lastTopId) {
    setLastTopId(top?.id ?? null);
    if (top !== null && unread > 0) setToast(top);
  }

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <button
        type="button"
        popoverTarget="notifications-panel"
        aria-label={unread > 0 ? `Avisos: ${unread} sin leer` : "Avisos"}
        className="relative p-2 text-on-surface-variant hover:text-primary transition-colors"
      >
        <LiveFlash value={top?.id ?? null} className="block" flashClass="bell-ring">
          <span aria-hidden="true" className="material-symbols-outlined">notifications</span>
        </LiveFlash>
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
          // A failed call (offline, or a tab left open across a deploy) must not throw into the root layout; it just stays unread.
          startTransition(async () => {
            await marcarNotificacionesLeidas().catch(() => null);
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
                    onClick={(event) => event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover()}
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

      {/* Portaled: the header's backdrop-blur would otherwise anchor position: fixed to the nav. */}
      {toast !== null &&
        createPortal(
          <div
            id="notification-toast"
            role="status"
            className="toast-in fixed z-[60] bottom-4 left-4 right-4 md:left-auto md:right-8 md:w-96 glass-panel rounded-xl p-4 flex items-start gap-3 border-l-4 border-l-error"
          >
            <Link
              href={`/t/${toast.titleSlug}`}
              onClick={() => setToast(null)}
              className="flex-1 flex flex-col gap-1"
            >
              <span className="text-title-md font-title-md text-on-surface">¡Te destronaron!</span>
              <span className="text-body-sm font-body-sm text-on-surface-variant">
                {toast.byName} te sacó {toast.titleEmoji} {toast.titleName} y te pagó{" "}
                {formatCoronas(toast.pricePaid)}
              </span>
            </Link>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setToast(null)}
              className="p-1 text-on-surface-variant hover:text-primary transition-colors"
            >
              <span aria-hidden="true" className="material-symbols-outlined">close</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
