import type { Metadata, Viewport } from "next";
import { Carlito, Geist_Mono } from "next/font/google";
import { AppFrame } from "@/components/app-shell/app-frame";
import Script from "next/script";
import { THEME_SCRIPT } from "@/lib/theme";
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
  description: "Production and purchasing for Avatar Foods",
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
      <body className="min-h-full font-sans">
        <AppFrame>{children}</AppFrame>

        {/*
          The saved theme, applied before the browser paints.

          It has to run during HTML parsing rather than after hydration - a
          useEffect would flash the wrong theme on every load - and
          `beforeInteractive` is the supported way to say so: Next injects it
          into the initial HTML and runs it before any of its own modules.

          It sits here, literally in the root layout, because that is where
          the docs require a beforeInteractive script to be. A plain <script>
          element does the same job, but React warns about one rendered inside
          a component, and the usual trick for silencing that warning -
          flipping the type between server and client - made the two trees
          disagree, taking a hydration error to avoid a warning.
        */}
        <Script
          id="theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </body>
    </html>
  );
}
