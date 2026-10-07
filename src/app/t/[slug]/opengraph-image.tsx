import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getTitleBySlug } from "@/services/titles.server";
import { formatCoronas } from "@/lib/format";
import { minClaimAmount } from "@/lib/titles";

export const alt = "Título en CoronaTeOnline";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card for a title: emoji, name and current throne state.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const title = await getTitleBySlug(supabase, slug);

  const heading = title ? title.name : "Título no encontrado";
  const emoji = title?.emoji ?? "👑";
  const line = !title
    ? ""
    : title.holder
      ? `${title.holderName} · ${formatCoronas(title.price ?? 0)}`
      : `Sin coronar · desde ${formatCoronas(minClaimAmount(null))}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse 80% 60% at 20% 25%, #3b1a63, transparent), radial-gradient(ellipse 70% 50% at 85% 80%, #5b2247, transparent), #0b0410",
          color: "#e5e2e1",
          fontFamily: "sans-serif",
          padding: 80,
        }}
      >
        <div style={{ display: "flex", fontSize: 160 }}>{emoji}</div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            marginTop: 24,
            color: "#ddb7ff",
            textAlign: "center",
          }}
        >
          {heading}
        </div>
        {line ? (
          <div
            style={{
              display: "flex",
              fontSize: 34,
              marginTop: 20,
              color: "#f9bd22",
            }}
          >
            {line}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            fontSize: 26,
            marginTop: 40,
            color: "#cfc2d6",
          }}
        >
          CoronaTeOnline
        </div>
      </div>
    ),
    size,
  );
}
