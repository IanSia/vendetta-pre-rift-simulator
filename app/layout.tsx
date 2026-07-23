import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const display = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const metadata: Metadata = {
  metadataBase: new URL(
    productionUrl ? `https://${productionUrl}` : "http://localhost:3000",
  ),
  title: {
    default: "Vendetta Pre-Rift Simulator",
    template: "%s · Vendetta Pre-Rift Simulator",
  },
  description:
    "A reproducible, unofficial Vendetta Pre-Rift opening and sealed deck-building simulator.",
  openGraph: {
    title: "Vendetta Pre-Rift Simulator",
    description: "Crack the kit. Read the rift. Build what survives.",
    type: "website",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vendetta Pre-Rift Simulator",
    description: "Open a seeded kit and forge a legal 25-card deck.",
    images: ["/opengraph-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#07090a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
