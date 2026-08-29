import type { Metadata } from "next";
import { Montserrat, Inter, JetBrains_Mono } from "next/font/google";
import { Background } from "@/components/background";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/lib/env";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "700", "800", "900"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

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
      className={`${montserrat.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-background font-body-sm min-h-full flex flex-col cyber-grain overflow-x-hidden">
        <Background />
        <SiteHeader />
        <div className="mt-20 flex-1 flex flex-col">{children}</div>
      </body>
    </html>
  );
}
