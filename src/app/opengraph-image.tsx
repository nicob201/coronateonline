import { ImageResponse } from "next/og";

export const alt = "CoronaTeOnline — el estatus se paga y se defiende";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Default share card for the site.
export default function Image() {
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
            "radial-gradient(ellipse 80% 60% at 20% 30%, #3b1a63, transparent), radial-gradient(ellipse 70% 50% at 80% 75%, #5b2247, transparent), #0b0410",
          color: "#e5e2e1",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 120 }}>👑</div>
        <div
          style={{
            display: "flex",
            fontSize: 88,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            marginTop: 12,
            color: "#ddb7ff",
          }}
        >
          CoronaTeOnline
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            marginTop: 16,
            color: "#cfc2d6",
          }}
        >
          El estatus se paga y se defiende.
        </div>
      </div>
    ),
    size,
  );
}
