import { librarySchema } from "./invoices.ts";
// Original fictional examples for this local foundation, not Frontend Mentor's missing data.json.
export const seedLibrary = librarySchema.parse({
  version: 1,
  revision: "11111111-1111-4111-8111-111111111111",
  theme: "light",
  filter: "all",
  invoices: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      createdAt: 0,
      updatedAt: 0,
      currency: "GBP",
      status: "draft",
      draft: {
        senderAddress: "Example Studio\n1 Example Lane",
        clientName: "Sample Client A",
        clientEmail: "",
        clientAddress: "",
        description: "Fictional draft",
        issueDate: "2026-10-07",
        terms: "30",
        items: [],
      },
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createdAt: 0,
      updatedAt: 0,
      currency: "GBP",
      status: "pending",
      details: {
        senderAddress: "Example Studio\n1 Example Lane",
        clientName: "Sample Client B",
        clientEmail: "client-b@example.com",
        clientAddress: "2 Example Road\nExample Town",
        description: "Synthetic layout exercise",
        issueDate: "2026-10-01",
        terms: 7,
        items: [
          {
            id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            name: "Fictional design item",
            quantity: 2,
            unitMinor: 12500,
          },
        ],
      },
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      createdAt: 0,
      updatedAt: 0,
      currency: "GBP",
      status: "paid",
      paidOn: "2026-10-05",
      details: {
        senderAddress: "Example Studio\n1 Example Lane",
        clientName: "Sample Client C",
        clientEmail: "client-c@example.com",
        clientAddress: "3 Example Road\nExample Town",
        description: "Synthetic completed example",
        issueDate: "2026-09-25",
        terms: 14,
        items: [
          {
            id: "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            name: "Fictional review item",
            quantity: 1,
            unitMinor: 4800,
          },
        ],
      },
    },
  ],
});
