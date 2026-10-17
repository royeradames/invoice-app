import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { LibraryProvider } from "../components/library-provider";
import { STORAGE_KEY } from "../lib/storage.ts";
import { SITE_NAME, SITE_URL } from "../lib/site.ts";
import "./globals.css";

// League Spartan is the official design typeface (SIL OFL, see fonts/OFL.txt),
// self-hosted so the page makes no remote font request.
// Fonts aren't preloaded: text paints at once in next/font's size-matched fallback (display: swap), so the
// font files needn't compete with the first paint.
const spartan = localFont({
  preload: false,
  src: "./fonts/LeagueSpartan-Variable.woff2",
  variable: "--font-spartan",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Invoices | " + SITE_NAME,
    template: "%s | " + SITE_NAME,
  },
  description:
    "Create, edit, filter and mark invoices as paid. Drafts and invoices are saved in this browser only.",
  openGraph: { siteName: SITE_NAME, type: "website" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-96.png", type: "image/png", sizes: "96x96" },
    ],
    shortcut: "/favicon.ico",
    apple: {
      url: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
};
const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
};
const themeScript =
  "try{var t=JSON.parse(localStorage.getItem(" +
  JSON.stringify(STORAGE_KEY) +
  ")||'{}').theme;if(t==='dark'){document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark'}}catch(e){}";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={spartan.variable} suppressHydrationWarning>
      <head>
        <script
          // Apply the saved theme before first paint so dark mode never flashes light.
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          // Static constant; no user content is serialized here.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
        />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <LibraryProvider>{children}</LibraryProvider>
        <noscript>
          <p className="noscript">
            This invoice app needs JavaScript. Invoices are saved in this
            browser only; nothing is sent or charged.
          </p>
        </noscript>
      </body>
    </html>
  );
}
