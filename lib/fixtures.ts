import { librarySchema } from "./invoices.ts";
// The challenge's own sample data (starter-code/data.json), converted to pence
// with stable item IDs. These are the brief's sample records, not real customers.
// Normalized: "2021-10-7" -> "2021-10-07" and a doubled space in one street.
// paymentDue and totals are derived, and match the original file exactly.
export const seedLibrary = librarySchema.parse({
  version: 2,
  revision: "11111111-1111-4111-8111-111111111111",
  theme: "light",
  filter: [],
  invoices: [
    {
      "id": "RT3080",
      "status": "paid",
      "createdAt": "2021-08-18",
      "paymentTerms": 1,
      "description": "Re-branding",
      "clientName": "Jensen Huang",
      "clientEmail": "jensenh@mail.com",
      "senderAddress": {
        "street": "19 Union Terrace",
        "city": "London",
        "postCode": "E1 3EZ",
        "country": "United Kingdom"
      },
      "clientAddress": {
        "street": "106 Kendell Street",
        "city": "Sharrington",
        "postCode": "NR24 5WQ",
        "country": "United Kingdom"
      },
      "items": [
        {
          "id": "00000000-0000-4000-8000-000000000001",
          "name": "Brand Guidelines",
          "quantity": 1,
          "priceMinor": 180090
        }
      ]
    },
    {
      "id": "XM9141",
      "status": "pending",
      "createdAt": "2021-08-21",
      "paymentTerms": 30,
      "description": "Graphic Design",
      "clientName": "Alex Grim",
      "clientEmail": "alexgrim@mail.com",
      "senderAddress": {
        "street": "19 Union Terrace",
        "city": "London",
        "postCode": "E1 3EZ",
        "country": "United Kingdom"
      },
      "clientAddress": {
        "street": "84 Church Way",
        "city": "Bradford",
        "postCode": "BD1 9PB",
        "country": "United Kingdom"
      },
      "items": [
        {
          "id": "00000000-0000-4000-8000-000000000002",
          "name": "Banner Design",
          "quantity": 1,
          "priceMinor": 15600
        },
        {
          "id": "00000000-0000-4000-8000-000000000003",
          "name": "Email Design",
          "quantity": 2,
          "priceMinor": 20000
        }
      ]
    },
    {
      "id": "RG0314",
      "status": "paid",
      "createdAt": "2021-09-24",
      "paymentTerms": 7,
      "description": "Website Redesign",
      "clientName": "John Morrison",
      "clientEmail": "jm@myco.com",
      "senderAddress": {
        "street": "19 Union Terrace",
        "city": "London",
        "postCode": "E1 3EZ",
        "country": "United Kingdom"
      },
      "clientAddress": {
        "street": "79 Dover Road",
        "city": "Westhall",
        "postCode": "IP19 3PF",
        "country": "United Kingdom"
      },
      "items": [
        {
          "id": "00000000-0000-4000-8000-000000000004",
          "name": "Website Redesign",
          "quantity": 1,
          "priceMinor": 1400233
        }
      ]
    },
    {
      "id": "RT2080",
      "status": "pending",
      "createdAt": "2021-10-11",
      "paymentTerms": 1,
      "description": "Logo Concept",
      "clientName": "Alysa Werner",
      "clientEmail": "alysa@email.co.uk",
      "senderAddress": {
        "street": "19 Union Terrace",
        "city": "London",
        "postCode": "E1 3EZ",
        "country": "United Kingdom"
      },
      "clientAddress": {
        "street": "63 Warwick Road",
        "city": "Carlisle",
        "postCode": "CA20 2TG",
        "country": "United Kingdom"
      },
      "items": [
        {
          "id": "00000000-0000-4000-8000-000000000005",
          "name": "Logo Sketches",
          "quantity": 1,
          "priceMinor": 10204
        }
      ]
    },
    {
      "id": "AA1449",
      "status": "pending",
      "createdAt": "2021-10-07",
      "paymentTerms": 7,
      "description": "Re-branding",
      "clientName": "Mellisa Clarke",
      "clientEmail": "mellisa.clarke@example.com",
      "senderAddress": {
        "street": "19 Union Terrace",
        "city": "London",
        "postCode": "E1 3EZ",
        "country": "United Kingdom"
      },
      "clientAddress": {
        "street": "46 Abbey Row",
        "city": "Cambridge",
        "postCode": "CB5 6EG",
        "country": "United Kingdom"
      },
      "items": [
        {
          "id": "00000000-0000-4000-8000-000000000006",
          "name": "New Logo",
          "quantity": 1,
          "priceMinor": 153233
        },
        {
          "id": "00000000-0000-4000-8000-000000000007",
          "name": "Brand Guidelines",
          "quantity": 1,
          "priceMinor": 250000
        }
      ]
    },
    {
      "id": "TY9141",
      "status": "pending",
      "createdAt": "2021-10-01",
      "paymentTerms": 30,
      "description": "Landing Page Design",
      "clientName": "Thomas Wayne",
      "clientEmail": "thomas@dc.com",
      "senderAddress": {
        "street": "19 Union Terrace",
        "city": "London",
        "postCode": "E1 3EZ",
        "country": "United Kingdom"
      },
      "clientAddress": {
        "street": "3964 Queens Lane",
        "city": "Gotham",
        "postCode": "60457",
        "country": "United States of America"
      },
      "items": [
        {
          "id": "00000000-0000-4000-8000-000000000008",
          "name": "Web Design",
          "quantity": 1,
          "priceMinor": 615591
        }
      ]
    },
    {
      "id": "FV2353",
      "status": "draft",
      "createdAt": "2021-11-05",
      "paymentTerms": 7,
      "description": "Logo Re-design",
      "clientName": "Anita Wainwright",
      "clientEmail": "",
      "senderAddress": {
        "street": "19 Union Terrace",
        "city": "London",
        "postCode": "E1 3EZ",
        "country": "United Kingdom"
      },
      "clientAddress": {
        "street": "",
        "city": "",
        "postCode": "",
        "country": ""
      },
      "items": [
        {
          "id": "00000000-0000-4000-8000-000000000009",
          "name": "Logo Re-design",
          "quantity": 1,
          "priceMinor": 310204
        }
      ]
    }
  ],
});
