import type { Metadata, Viewport } from "next";
import { Carlito, Geist_Mono } from "next/font/google";
import { AppFrame } from "@/components/app-shell/app-frame";
import { ThemeScript } from "@/components/theme/theme-script";
import "./globals.css";

// Calibri is a Windows font, so it is not available to a browser on a Mac,
// an iPad or an iPhone - and the floor runs on iPads. Carlito is metric-
// compatible with Calibri (same widths, same line breaks), so it loads as the
// webfont and the stack in globals.css prefers real Calibri where it exists.
// The page therefore looks identical on the office PCs and the floor tablets.
const carlito = Carlito({
  variable: "--font-carlito",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Bettrbyus",
    template: "%s · Bettrbyus",
  },
  description: "Production, inventory and purchasing for Avatar Foods",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#1d232b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The inline script below sets data-theme before paint; without this,
      // React would flag the attribute it finds as a hydration mismatch.
      suppressHydrationWarning
      className={`${carlito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full font-sans">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
