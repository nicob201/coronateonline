"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Re-renders the current route whenever a reign starts (only for one title when titleId is set).
export function LiveRefresh({ titleId }: { titleId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let joined = false;

    // Unique topic per run: StrictMode re-runs this effect before the previous channel finishes leaving.
    const channel = supabase
      .channel(`reigns:${titleId ?? "all"}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reigns",
          ...(titleId ? { filter: `title_id=eq.${titleId}` } : {}),
        },
        () => router.refresh(),
      )
      .subscribe((status) => {
        if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) return;
        // A later SUBSCRIBED is a reconnect: catch up on what was missed while offline.
        if (joined) router.refresh();
        joined = true;
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, titleId]);

  return null;
}
