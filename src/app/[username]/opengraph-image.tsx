import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getPublicProfile } from "@/services/profiles.server";

export const alt = "Perfil en CoronaTeOnline";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card for a public profile: name, handle and current crown.
export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const raw = decodeURIComponent((await params).username);
  const handle = raw.startsWith("@") ? raw.slice(1) : raw;
  const supabase = await createClient();
  const profile = await getPublicProfile(supabase, handle);

  const name = profile ? profile.displayName : "Perfil no encontrado";
  const crown = profile?.currentReigns[0];

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
            "radial-gradient(ellipse 80% 60% at 25% 30%, #3b1a63, transparent), radial-gradient(ellipse 70% 50% at 80% 78%, #5b2247, transparent), #0b0410",
          color: "#e5e2e1",
          fontFamily: "sans-serif",
          padding: 80,
        }}
      >
        <div style={{ display: "flex", fontSize: 120 }}>{crown?.titleEmoji ?? "👑"}</div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            marginTop: 20,
            color: "#ddb7ff",
            textAlign: "center",
          }}
        >
          {name}
        </div>
        {profile ? (
          <div style={{ display: "flex", fontSize: 32, marginTop: 12, color: "#cfc2d6" }}>
            @{profile.username}
          </div>
        ) : null}
        {crown ? (
          <div
            style={{
              display: "flex",
              fontSize: 34,
              marginTop: 28,
              color: "#f9bd22",
            }}
          >
            Reina en {crown.titleName}
          </div>
        ) : null}
      </div>
    ),
    size,
  );
}
