import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { LibraryProvider } from "../components/library-provider";
import { SITE_NAME, SITE_URL } from "../lib/site.ts";
import "./globals.css";

// League Spartan is the official design typeface (SIL OFL, see fonts/OFL.txt),
// self-hosted so the page makes no remote font request.
const spartan = localFont({
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
    "Practice invoice draft, pending and paid workflows with fictional GBP records saved in this browser.",
  openGraph: { siteName: SITE_NAME, type: "website" },
  robots: { index: false, follow: false },
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
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={spartan.variable}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <LibraryProvider>{children}</LibraryProvider>
        <noscript>
          <p className="noscript">
            JavaScript is needed for this browser-local invoice demo. No
            accounts, payments or messages are processed.
          </p>
        </noscript>
      </body>
    </html>
  );
}
