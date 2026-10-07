import { notFound } from "next/navigation";
import { idSchema } from "../../../lib/invoices.ts";
import { InvoiceDetail } from "../../../components/invoice-detail";
export const metadata = { title: "Invoice details" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  return <InvoiceDetail id={id} />;
}
