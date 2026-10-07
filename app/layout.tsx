import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LibraryProvider } from "../components/library-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Invoices | Synthetic local demo",
    template: "%s | Invoice demo",
  },
  description:
    "Practice invoice draft, pending and paid workflows with fictional GBP records saved in this browser.",
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
    <html lang="en">
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
