import type { MetadataRoute } from "next";

// Web app manifest that makes the site installable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CoronaTeOnline",
    short_name: "CoronaTe",
    description: "El under digital donde el estatus se paga y se defiende. Coronate.",
    lang: "es-AR",
    start_url: "/",
    display: "standalone",
    background_color: "#131313",
    theme_color: "#131313",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
