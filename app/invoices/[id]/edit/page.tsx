import { notFound } from "next/navigation";
import { idSchema } from "../../../../lib/invoices.ts";
import { InvoiceEditor } from "../../../../components/invoice-editor";
export const metadata = {
  title: "Edit invoice",
  description:
    "Change a saved synthetic invoice draft or pending record in this browser.",
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  return <InvoiceEditor id={id} />;
}
