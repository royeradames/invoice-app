import { InvoiceBoard } from "../components/invoice-board";
import { SITE_NAME, SITE_URL } from "../lib/site.ts";

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
};
export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static constant; no user content is serialized here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <InvoiceBoard />
    </>
  );
}
