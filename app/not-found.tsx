import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="page">
      <section className="empty">
        <h1>Page not found</h1>
        <p>Invoice links look like /invoices/XM9141.</p>
        <Link className="button primary" href="/">
          See all invoices
        </Link>
      </section>
    </main>
  );
}
