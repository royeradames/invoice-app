# Invoice: synthetic local foundation

This new application practices draft, pending and paid invoice states using original fictional GBP examples. It is not a payment, email, accounting or authenticated service. Data lives only in this origin's browser storage. Layout, colors and League Spartan typography follow the official Frontend Mentor Figma design (self-hosted font, SIL OFL), with text kept at 16 px or larger. The official data.json is not used. Synthetic records must never be represented as official starter data or real customers.

## Accepted boundaries

Four routes: list, new, detail and edit. UUID invoice/item identities are independent of visible labels. Saved draft and unsaved form are separate. Incomplete bounded fields can be saved as draft. Pending/paid require complete details and at least one valid line. Draft may become pending; pending may become paid; repeated mark-paid is harmless. Paid is read-only in this demo, with named confirmed deletion. These local state rules are not production permissions.

GBP minor units are parsed from decimal strings without binary-money multiplication. Whole quantities 1-9999, unit prices 0-999999.99, up to 50 items. Totals are derived. No taxes, discounts, fractional quantities or currency conversion. Issue dates use calendar years 1900-9998; terms are 1/7/14/30 days. Mark-paid records today's UTC date, visibly labeled.

Zod validates version 1 storage, at most 100 invoices and 2 MB UTF-8. Web Locks serialize expected-raw compare-and-write, including theme/filter. Missing locks block unsafe persistence. Failed/corrupt/stale writes retain draft and saved bytes. Explicit backup/reset/reload handles recovery.

One TanStack Form owns the draft; explicit value resets retain the fixed defaults. App Back/Cancel/new and reload offer save/discard/cancel. Browser-level exit/reload/history uses the browser's native unsaved-change confirmation, which has leave/stay rather than an application Save option.

No auth package, database, API handlers, real financial data, remote fonts, analytics or environment variables.

## Verification status

Use Node 24.11.1. Verified on Mac2 for this branch: `npm ci` from the committed lock, `npm run lint` (0 errors), `npm run typecheck`, `npm test` (unit), `npm run build`, and both browser suites against `next start` on 127.0.0.1: `node tests/invoices.browser.mjs` (workflows) and `node tests/visual.browser.mjs` (design and layout regressions: centered modal, aligned list columns, 104 px badges, design red errors, select caret inset, busy-not-disabled actions, unclipped mobile line items, site name metadata). The browser helpers accept localhost only, use the pinned `playwright` package with the installed Chrome, and read `INVOICE_URL` (default http://127.0.0.1:4395). Hosted authentication needs a separate reviewed exact-origin wrapper.

An original receipt SVG and matching 32/96 px raster, 32 px ICO and 180 px Apple icon are prepared. Their source generator uses only the Python standard library. They still need served-artifact and visual inspection. No PWA/offline-installation claim. Titles are generic; no record content appears in metadata. Later central authentication remains a separate gate.
