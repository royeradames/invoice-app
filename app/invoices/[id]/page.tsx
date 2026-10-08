import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { invoiceIdSchema } from "../../../lib/invoices.ts";
import { InvoiceDetail } from "../../../components/invoice-detail";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Invoice #" + id,
    description: "Status, dates, client and line items for invoice #" + id + ", saved in this browser.",
  };
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  if (!invoiceIdSchema.safeParse(id).success) notFound();
  return <InvoiceDetail id={id} />;
}
