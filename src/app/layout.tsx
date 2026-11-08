import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Background } from "@/components/background";
import { DemoBanner } from "@/components/demo-banner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { env } from "@/lib/env";
import "./globals.css";

// Self-hosted latin variable fonts (from Google Fonts): fetching them at build time made Vercel builds fail intermittently.
const montserrat = localFont({
  src: "./fonts/montserrat-latin.woff2",
  variable: "--font-montserrat",
  weight: "400 900",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "400 700",
  display: "swap",
});

const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  variable: "--font-jetbrains",
  weight: "400 700",
  display: "swap",
});

// Only the icons listed in scripts/build-icon-font.sh; any other icon name renders as plain text.
const materialSymbols = localFont({
  src: "./fonts/material-symbols-subset.woff2",
  variable: "--font-material-symbols",
  weight: "400",
  display: "block",
});

export const viewport: Viewport = { themeColor: "#131313" };

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: "CoronaTeOnline - ¿Qué querés ser?",
  description:
    "El under digital donde el estatus se paga y se defiende. Coronate.",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      className={`${montserrat.variable} ${inter.variable} ${jetbrains.variable} ${materialSymbols.variable} h-full antialiased overflow-x-hidden`}
    >
      <body className="bg-background text-on-background font-body-sm min-h-full flex flex-col cyber-grain overflow-x-clip">
        <Background />
        <SiteHeader />
        <div className="mt-20 flex-1 flex flex-col min-w-0 max-w-full"><DemoBanner />{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
