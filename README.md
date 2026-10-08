# Invoice app

My solution to the Frontend Mentor **Invoice app** challenge, live at <https://invoice-app.royeradames.com/>.

Invoices are saved only in this browser (`localStorage`). Nothing is emailed, charged or sent anywhere; "Save & Send" marks an invoice pending.

## What it does

- Lists the brief's `data.json` invoices on first load, then whatever you saved.
- Creates invoices in a drawer that slides out from the sidebar (full screen on phones).
  - **Save as Draft** accepts blank fields; anything typed must still be valid.
  - **Save & Send** requires every field and at least one item, and sets the status to pending.
  - New IDs are two random uppercase letters and four random digits (`XM9141`).
- Edits invoices. **Cancel** discards unsaved changes. **Save Changes** requires every field and turns a draft into a pending invoice.
- Marks pending invoices as paid.
- Deletes invoices after a confirmation dialog.
- Filters by any mix of Draft, Pending and Paid; the filter is remembered.
- Light and dark themes, remembered and applied before first paint.
- Line items add, remove and total in pence, so totals never drift.
- Payment due is the invoice date plus the payment terms.

## Design

Layout, colours and League Spartan follow the official Figma frames at 375, 768 and 1440 px. The font is self-hosted (SIL OFL, see `app/fonts/OFL.txt`). Body text stays at 16 px or larger where the design uses 13 or 15 px. The date field is a small calendar that shows dates as "21 Aug 2021" in every locale. The payment terms field is a native select styled to the design.

## Stack

Next.js 16.3.6 (App Router), React 19.2.8, Tailwind 4.2.1, TypeScript 5.9.3, TanStack Form 1.33.5 for the form state, Zod 4.4.3 for validation and storage parsing, Playwright 1.58.2. Node 24.

## Storage

One versioned JSON document (`invoice-app-v2`) holds the invoices, theme and filter. Zod validates it on every read and write. Writes go through the Web Locks API and compare the bytes they last read, so a second tab cannot silently overwrite newer data. Unreadable data is never replaced without a backup download and an explicit reset.

## Scripts

```sh
npm ci
npm run lint
npm run typecheck
npm test               # domain and storage unit tests
npm run build && npm start -- -p 4395
npm run test:browser   # Playwright journeys against INVOICE_URL (default http://127.0.0.1:4395)
```

The browser journeys use the installed Google Chrome. They cover every flow in the brief by clicking from the list page, the keyboard paths, the empty state, form errors, the theme and the narrow-width layout.
