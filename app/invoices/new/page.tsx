import { InvoiceEditor } from "../../../components/invoice-editor";
export const metadata = {
  title: "New invoice",
  description:
    "Start a fictional GBP invoice draft that is saved only in this browser.",
};
export default function Page() {
  return <InvoiceEditor />;
}
